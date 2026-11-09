"""Stage 3: verification evidence for emails and LinkedIn profiles.

Email levels (strongest first):
  published_on_website   the address appears on the company's own site
  domain_and_format      domain accepts mail (MX) AND matches the format used by other contacts there
  domain_ok              domain accepts mail, format unknown or different
  domain_rejects_mail    domain has no mail servers: the address cannot work (blanked)
Mailbox-level checks are NOT done here: probing other companies' mail servers is unreliable and gets
your IP blocklisted. Use a verification service on the final file for that.

LinkedIn levels (LinkedIn itself is never visited):
  linked_from_website    the company's own site links to this profile
  name_match             profile URL contains the person's first and last name
  partial_match          profile URL contains parts of the name (e.g. 'andwil' for Andrew Wilson)
  no_name_match          URL doesn't match the name: likely someone else (blanked in verified file)
  internal_id            Sales Navigator-style ID; can't be checked from the URL
"""

import csv
import json
import os
import re
import subprocess
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

from . import leadocean as lo
from . import normalize as n
from .schema import OUTPUT_COLUMNS, validate_row

EMAIL_OK = {"verified_by_leadocean", "published_on_website"}
# domain_and_format is "likely", not verified: in a LeadOcean sample most such addresses were
# catch-all or unknown at mailbox level.
LINKEDIN_OK = {"verified_by_leadocean", "linked_from_website", "name_match"}


def _ascii(s: str) -> str:
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode())


def name_parts(first: str, last: str) -> tuple[str, str]:
    f = _ascii(first.split()[0]) if first.split() else ""
    l_ = _ascii(last.split()[-1]) if last.split() else ""
    return f, l_


# ------------------------------------------------------------------ MX lookup

def mx_lookup(domain: str) -> bool | None:
    """True: domain has mail servers. False: none (or a 'null MX'). None: lookup failed (unknown)."""
    try:
        out = subprocess.run(["nslookup", "-type=mx", domain], capture_output=True, text=True, timeout=15).stdout
    except Exception:
        return None
    hosts = re.findall(r"mail exchanger = (\S+)", out)
    if hosts:
        return any(h.strip(".") for h in hosts)  # "mail exchanger = ." is a null MX: accepts no mail
    # No MX lines but the domain answered (SOA "primary name server"), or the domain doesn't exist:
    # nothing will accept mail for it.
    if re.search(r"Non-existent domain|NXDOMAIN|No answer|can't find|primary name server|responsible mail addr", out, re.I):
        return False
    return None


def mx_results(domains: set[str], cache_path: str) -> dict[str, bool | None]:
    cache = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    todo = [d for d in domains if d not in cache or cache[d] is None]
    with ThreadPoolExecutor(max_workers=12) as pool:
        for d, ok in zip(todo, pool.map(mx_lookup, todo)):
            cache[d] = ok
    tmp = cache_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=1, sort_keys=True)
    os.replace(tmp, cache_path)
    return cache


# ------------------------------------------------------------------ email format

def email_pattern(local: str, first: str, last: str) -> str:
    f, l_ = first, last
    if not f or not l_:
        return ""
    candidates = {
        f"{f}.{l_}": "first.last", f"{f}{l_}": "firstlast", f"{f[0]}{l_}": "flast", f"{f}_{l_}": "first_last",
        f"{f[0]}.{l_}": "f.last", f"{l_}.{f}": "last.first", f"{f}{l_[0]}": "firstl", f"{f}.{l_[0]}": "first.l",
        f: "first", l_: "last",
    }
    return candidates.get(re.sub(r"[^a-z._]", "", local.lower()), "")


# ------------------------------------------------------------------ LinkedIn

def linkedin_level(url: str, first: str, last: str, others: tuple = ()) -> str:
    m = re.search(r"/in/([^/?#]+)", url or "")
    if not m:
        return ""
    slug = _ascii(re.sub(r"%[0-9a-f]{2}", "", m.group(1).lower()))
    if slug.startswith("acoaa"):
        return "internal_id"
    f, l_ = first, last
    if not f or not l_:
        return "partial_match" if (f and f in slug) or (l_ and l_ in slug) else "no_name_match"
    if l_ in slug and (f in slug or slug.startswith(f[0]) or f[0] + l_ in slug):
        return "name_match"
    if (f[:3] in slug and l_[:3] in slug) or l_ in slug or (len(f) >= 4 and f in slug):
        return "partial_match"
    if any(len(t) >= 4 and t in slug for t in others):  # middle names: 'Amy Alegre Sta' -> /in/amelynalegre
        return "partial_match"
    return "no_name_match"


# ------------------------------------------------------------------ main

def verify(base: str) -> dict:
    out_dir = os.path.join(base, "output")
    src = os.path.join(out_dir, "enriched_review.csv")
    if not os.path.exists(src):
        raise SystemExit("Run enrichment first (python -m builder.cli enrich, then assemble).")
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    # Website evidence: published emails and profile links per company.
    site_emails: dict[str, set] = defaultdict(set)
    site_profiles: dict[tuple, str] = {}
    comp_dir = os.path.join(base, "state", "companies")
    for name in os.listdir(comp_dir) if os.path.isdir(comp_dir) else []:
        with open(os.path.join(comp_dir, name), encoding="utf-8") as f:
            res = json.load(f)
        key = res.get("domain", "")
        site_emails[key] |= {e["value"].lower() for e in res.get("emails", [])}
        for p in res.get("people", []):
            if p.get("linkedin"):
                li, _ = n.normalize_linkedin(p["linkedin"])
                if li:
                    site_profiles[(key, p["name"].lower())] = li

    # Company email formats from the contacts themselves.
    formats: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        e = r["Email"].lower()
        if "@" in e:
            f, l_ = name_parts(r["First Name"], r["Last Name"])
            pat = email_pattern(e.split("@")[0], f, l_)
            if pat:
                formats[n.registrable(n.email_domain(e))][pat] += 1
    dominant = {}
    for dom, c in formats.items():
        pat, k = c.most_common(1)[0]
        if k >= 2 and k / sum(c.values()) >= 0.6:
            dominant[dom] = pat

    mx = mx_results({n.email_domain(r["Email"]) for r in rows if "@" in r["Email"]},
                    os.path.join(base, "state", "mx_cache.json"))

    verified, report = [], []
    counts = Counter()
    for r in rows:
        f, l_ = name_parts(r["First Name"], r["Last Name"])
        host = n.host_of(r["Company URL"])
        key = n.registrable(host) if host else ""
        row = {c: r[c] for c in OUTPUT_COLUMNS}
        notes = []

        # ---- email
        e = r["Email"].lower()
        e_level = ""
        if "@" in e:
            dom = n.email_domain(e)
            local = e.split("@")[0]
            is_role = local in ("info", "sales", "contact", "hello", "enquiries", "inquiries", "business", "partnerships")
            if e in site_emails.get(key, set()):
                e_level = "published_on_website"
            elif mx.get(dom) is False:
                e_level = "domain_rejects_mail"
            elif mx.get(dom) and dominant.get(n.registrable(dom)) and \
                    email_pattern(local, f, l_) == dominant[n.registrable(dom)]:
                e_level = "domain_and_format"
            elif mx.get(dom):
                e_level = "domain_ok"
            else:
                e_level = "domain_unknown"
            if is_role:
                notes.append("general company address, not personal")
            if e_level not in EMAIL_OK:
                row["Email"] = ""
        counts[f"email:{e_level or 'none'}"] += 1

        # ---- LinkedIn
        li = r["LinkedIn Profile link"]
        site_li = site_profiles.get((key, f"{r['First Name']} {r['Last Name']}".lower().strip()))
        if site_li:
            if li and li.rstrip("/").lower() != site_li.rstrip("/").lower():
                notes.append(f"company website links a different profile; using it (was {li})")
            li_level = "linked_from_website"
            row["LinkedIn Profile link"] = site_li
        else:
            others = tuple(_ascii(t) for t in f"{r['First Name']} {r['Last Name']}".split())
            li_level = linkedin_level(li, f, l_, others) if li else ""
            if li_level not in LINKEDIN_OK:
                row["LinkedIn Profile link"] = ""
        counts[f"linkedin:{li_level or 'none'}"] += 1

        # ---- LeadOcean: mailbox-level verdict from your licensed provider outranks the checks above.
        lo_note = ""
        saved = lo.cached(os.path.join(base, "state"), r["Record ID"])
        if saved is not None:
            info = lo.interpret(saved, r["Company URL"])
            counts[f"email:{e_level or 'none'}"] -= 1
            counts[f"linkedin:{li_level or 'none'}"] -= 1
            if info["ok"]:
                if info["email"]:
                    row["Email"], e_level = info["email"], "verified_by_leadocean"
                elif e_level != "published_on_website":
                    row["Email"], e_level = "", "leadocean_not_verified"
                lo_note = info["email_note"]
                if info["linkedin"]:
                    if row["LinkedIn Profile link"] and info["linkedin"].lower() != row["LinkedIn Profile link"].lower():
                        notes.append(f"LeadOcean's profile URL differs; using it (was {row['LinkedIn Profile link']})")
                    row["LinkedIn Profile link"], li_level = info["linkedin"], "verified_by_leadocean"
                if info["phone"] and not row["Phone Number"]:
                    row["Phone Number"] = info["phone"]
                    notes.append("phone from LeadOcean")
                if info["employer_changed"]:
                    notes.append(f"LeadOcean shows a different current employer: {info['current_company']} "
                                 f"({info['current_domain']})")
                    counts["employer_changed"] += 1
            else:
                lo_note = info["email_note"]
            counts[f"email:{e_level or 'none'}"] += 1
            counts[f"linkedin:{li_level or 'none'}"] += 1
            counts["leadocean_checked"] += 1

        validate_row(row)
        both = bool(row["Email"]) and bool(row["LinkedIn Profile link"])
        counts["both_verified"] += both
        verified.append(row)
        manual = li_level in ("partial_match", "internal_id", "no_name_match")
        report.append({
            "Record ID": r["Record ID"], "First Name": r["First Name"], "Last Name": r["Last Name"],
            "Company Name": r["Company Name"], "Title/Role": r["Title/Role"],
            "Email": r["Email"], "Email Check": LABEL_EMAIL.get(e_level, ""),
            "LinkedIn": r["LinkedIn Profile link"], "LinkedIn Check": LABEL_LI.get(li_level, ""),
            "Needs Manual LinkedIn Check": "yes" if manual else "",
            "LeadOcean": lo_note,
            "Notes": "; ".join(notes),
        })

    _write(os.path.join(out_dir, "verified_leads.csv"), OUTPUT_COLUMNS, verified)
    _write(os.path.join(out_dir, "verification_report.csv"), list(report[0].keys()), report)
    return {"rows": len(rows), "counts": counts, "formats": len(dominant)}


LABEL_EMAIL = {
    "verified_by_leadocean": "Verified: LeadOcean verified mailbox at current employer",
    "leadocean_not_verified": "Not verified by LeadOcean (see LeadOcean column)",
    "published_on_website": "Verified: published on company website",
    "domain_and_format": "Likely: matches company email format (mailbox not checked)",
    "domain_ok": "Unconfirmed: domain accepts mail, format not confirmed",
    "domain_unknown": "Unconfirmed: mail servers could not be looked up",
    "domain_rejects_mail": "Invalid: domain has no mail servers",
}
LABEL_LI = {
    "verified_by_leadocean": "Verified: LeadOcean profile",
    "linked_from_website": "Verified: linked from company website",
    "name_match": "Verified: profile URL matches name",
    "partial_match": "Unconfirmed: URL partly matches name",
    "internal_id": "Unconfirmed: internal LinkedIn ID",
    "no_name_match": "Unconfirmed: custom URL doesn't contain the name",
}


def _write(path: str, columns: list[str], rows: list[dict]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)
