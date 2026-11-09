"""Stage 1: audit and clean a lead file you already hold. Offline: no network calls.

Every output value is either trustworthy or blank. Anything blanked keeps its original
value in review.csv with the reason, so nothing is lost.
"""

import csv
import os
from collections import Counter, defaultdict

from . import normalize as n
from .schema import OUTPUT_COLUMNS, empty_row, validate_row

# Human-readable labels for review.csv and the summary.
LABELS = {
    "duplicate": "Duplicate of an earlier row",
    "email_domain_mismatch": "Email domain doesn't match the company website (likely a past employer) - email blanked",
    "email_personal": "Personal email address (Gmail, Yahoo...) - email blanked",
    "email_invalid": "Email is not a valid address - email blanked",
    "missing_email": "No email",
    "phone_shared_placeholder": "Same phone used for several companies (placeholder) - phone blanked",
    "phone_invalid_length": "Phone has the wrong number of digits for its country - phone blanked",
    "phone_no_country_code": "Phone has no country code - phone blanked",
    "phone_trunk_zero_removed": "Removed an extra 0 after the country code (fixed)",
    "missing_phone": "No phone",
    "location_conflict": "Location contradicts itself (e.g. 'Egypt, US') - location blanked",
    "location_placeholder_removed": "Removed 'None'/'nan' from location (fixed)",
    "missing_location": "No location",
    "linkedin_internal_id": "LinkedIn link uses an internal ID; may not open for everyone",
    "linkedin_not_profile_url": "LinkedIn value is not a profile link - blanked",
    "missing_linkedin": "No LinkedIn link",
    "company_website_mismatch": "Company name doesn't match its website - check which is right",
    "website_parked": "Website looks like a parked domain - blanked",
    "missing_website": "No company website",
    "name_capitalised": "Name was all lowercase (fixed)",
    "partial_last_name": "Last name is only an initial",
    "single_name": "Only one name given",
    "missing_name": "No contact name",
    "name_is_company": "Contact name is the company name",
    "headcount_is_employee_range": "Only an employee range is known, not a seat count - seats left blank",
}

# Flags that mean a person should look at the row before outreach.
REVIEW_FLAGS = {
    "email_domain_mismatch", "email_personal", "email_invalid", "phone_shared_placeholder",
    "phone_invalid_length", "phone_no_country_code", "location_conflict", "linkedin_not_profile_url",
    "company_website_mismatch", "website_parked", "partial_last_name", "single_name", "missing_name",
    "name_is_company", "missing_website",
}


def _get(rec: dict, smap: dict, key: str) -> str:
    col = smap.get(key, "")
    return rec.get(col, "") if col else ""


def audit_file(source_path: str, out_dir: str, config: dict) -> dict:
    smap = config.get("source_map", {})
    aud = config.get("audit", {})
    aliases: dict[str, set[str]] = defaultdict(set)
    for group in config.get("domain_aliases", {}).get("groups", []):
        for d in group:
            aliases[d] |= set(group) - {d}

    with open(source_path, encoding="utf-8-sig", newline="") as f:
        records = list(csv.DictReader(f))

    # Pass 1: phones reused across several companies are placeholders, not real lines.
    phone_companies: dict[str, set[str]] = defaultdict(set)
    for rec in records:
        e164, _, _ = n.normalize_phone(_get(rec, smap, "phone"))
        if e164:
            phone_companies[e164].add(n.company_key(_get(rec, smap, "company_name")))
    min_cos = int(aud.get("shared_phone_min_companies", 3))
    shared_phones = {p for p, cos in phone_companies.items() if len(cos) >= min_cos}

    seen_email: dict[str, str] = {}
    seen_person: dict[tuple, str] = {}
    out_rows, review_rows = [], []
    counts: Counter = Counter()

    for idx, rec in enumerate(records):
        flags: list[str] = []
        originals: dict[str, str] = {}
        rid = _get(rec, smap, "record_id") or f"row {idx + 2}"
        row = empty_row()

        company = n.clean(_get(rec, smap, "company_name"))
        row["Company Name"] = company

        # Website
        site_raw = _get(rec, smap, "website")
        host = n.host_of(site_raw)
        if host.startswith("ww25.") or host.startswith("ww1."):
            flags.append("website_parked")
            originals["Company URL"] = site_raw
            host = ""
        elif not host:
            flags.append("missing_website")
        row["Company URL"] = n.canonical_website(host)
        if host and not n.company_matches_website(company, host):
            flags.append("company_website_mismatch")

        # Name
        if smap.get("first_name") and smap.get("last_name"):
            first, last = n.clean(_get(rec, smap, "first_name")), n.clean(_get(rec, smap, "last_name"))
            name_notes = [] if first else ["missing_name"]
        else:
            first, last, name_notes = n.split_name(_get(rec, smap, "contact_name"))
        flags += name_notes
        if company and f"{first} {last}".strip().lower() == company.lower():
            flags.append("name_is_company")
        row["First Name"], row["Last Name"] = first, last

        row["Title/Role"] = n.clean(_get(rec, smap, "title"))

        # Email
        email = n.clean(_get(rec, smap, "email")).lower()
        if not email:
            flags.append("missing_email")
        elif not n.EMAIL_RE.match(email):
            flags.append("email_invalid")
            originals["Email"], email = email, ""
        else:
            dom = n.email_domain(email)
            if dom in n.FREE_MAIL:
                flags.append("email_personal")
                originals["Email"], email = email, ""
            elif host and not n.domains_match(dom, host, aliases):
                flags.append("email_domain_mismatch")
                originals["Email"], email = email, ""
        row["Email"] = email

        # Phone
        phone_raw = _get(rec, smap, "phone")
        e164, code, phone_notes = n.normalize_phone(phone_raw)
        flags += phone_notes
        if e164 and e164 in shared_phones:
            flags.append("phone_shared_placeholder")
            e164 = ""
        if not e164 and n.clean(phone_raw):
            originals["Phone Number"] = phone_raw
        row["Phone Number"] = e164

        # LinkedIn
        li_raw = _get(rec, smap, "linkedin")
        li, li_notes = n.normalize_linkedin(li_raw)
        flags += li_notes
        if not li and n.clean(li_raw):
            originals["LinkedIn Profile link"] = li_raw
        row["LinkedIn Profile link"] = li

        # Seats, locations, ARR (source values only; never inferred)
        seats, seat_notes = n.seats_from(_get(rec, smap, "seats"), _get(rec, smap, "headcount"))
        flags += seat_notes
        row["Number of Seats"] = seats
        loc_raw = _get(rec, smap, "locations")
        loc, loc_notes = n.normalize_location(loc_raw)
        flags += loc_notes
        if not loc and n.clean(loc_raw):
            originals["Locations"] = loc_raw
        row["Locations"] = loc
        row["ARR"] = n.clean(_get(rec, smap, "revenue"))

        # Duplicates: same email, or same person at the same company.
        person_key = (f"{first} {last}".lower(), n.company_key(company))
        raw_email = n.clean(_get(rec, smap, "email")).lower()
        dup_of = seen_email.get(raw_email) if raw_email else None
        dup_of = dup_of or seen_person.get(person_key)
        if dup_of:
            flags.insert(0, "duplicate")
        else:
            if raw_email:
                seen_email[raw_email] = rid
            seen_person[person_key] = rid

        counts.update(flags)
        status = "remove (duplicate)" if dup_of else ("review" if REVIEW_FLAGS & set(flags) else "ok")
        counts[f"status:{status}"] += 1

        validate_row(row)
        if not dup_of:
            out_rows.append(row)
        review_rows.append({
            "Record ID": rid,
            "Status": status,
            "Duplicate Of": dup_of or "",
            "Decision Level": n.decision_level(row["Title/Role"]),
            "ICP Fit": n.icp_fit(_get(rec, smap, "industry"), company),
            "Issues": "; ".join(LABELS[fl] for fl in flags if fl in LABELS),
            **row,
            "Original Email": originals.get("Email", ""),
            "Original Phone": originals.get("Phone Number", ""),
            "Original Location": originals.get("Locations", ""),
            "Original LinkedIn": originals.get("LinkedIn Profile link", ""),
            "Original Website": originals.get("Company URL", ""),
        })
        counts[f"level:{n.decision_level(row['Title/Role'])}"] += 1
        counts[f"icp:{n.icp_fit(_get(rec, smap, 'industry'), company)}"] += 1

    os.makedirs(out_dir, exist_ok=True)
    _write(os.path.join(out_dir, "leads.csv"), OUTPUT_COLUMNS, out_rows)
    _write(os.path.join(out_dir, "review.csv"), list(review_rows[0].keys()) if review_rows else OUTPUT_COLUMNS, review_rows)
    summary = _summary(source_path, len(records), out_rows, counts, shared_phones)
    with open(os.path.join(out_dir, "audit_summary.md"), "w", encoding="utf-8") as f:
        f.write(summary)
    return {"rows_in": len(records), "rows_out": len(out_rows), "counts": counts, "summary": summary}


def _write(path: str, columns: list[str], rows: list[dict]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:  # BOM so Excel opens accents correctly
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)


def _summary(source: str, rows_in: int, out_rows: list[dict], c: Counter, shared_phones: set) -> str:
    filled = {col: sum(1 for r in out_rows if r[col]) for col in OUTPUT_COLUMNS}
    lines = [
        "# Lead file audit",
        "",
        f"Source: `{os.path.basename(source)}`  ",
        f"Rows read: **{rows_in}**  ",
        f"Unique leads written to `leads.csv`: **{len(out_rows)}**",
        "",
        "## Status",
        f"- OK, ready to use: **{c['status:ok']}**",
        f"- Needs a quick review before outreach: **{c['status:review']}**",
        f"- Duplicates removed: **{c['status:remove (duplicate)']}**",
        "",
        "## What was found",
        "| Issue | Rows |",
        "|---|---|",
    ]
    for key, label in LABELS.items():
        if c[key]:
            lines.append(f"| {label} | {c[key]} |")
    if shared_phones:
        lines += ["", "Placeholder phone numbers (shared by several companies): " + ", ".join(sorted(shared_phones))]
    lines += [
        "",
        "## Who is on the list",
        f"- Decision-makers (Director, VP, Head, C-level, Founder, Owner): **{c['level:decision-maker']}**",
        f"- Managers / team leads: **{c['level:manager']}**",
        f"- Individual contributors: **{c['level:individual contributor']}**",
        f"- BPO / outsourcing companies: **{c['icp:BPO / outsourcing']}**; other industries: **{c['icp:other industry']}**",
        "",
        "## Fields filled in `leads.csv` (trusted values only)",
        "| Column | Filled | Of |",
        "|---|---|---|",
    ]
    for col in OUTPUT_COLUMNS:
        lines.append(f"| {col} | {filled[col]} | {len(out_rows)} |")
    lines += ["", "Blank means unknown or not trustworthy. Original values are kept in `review.csv`.", ""]
    return "\n".join(lines)
