"""Stage 2: enrich audited leads from each company's own website.

Phase A (crawl, resumable): one visit per company domain, at most `max_pages` pages, polite and cached.
  Each finished company is saved to state/companies/<domain>.json and recorded in state/progress.json
  with an atomic write, so a stopped run resumes with the next unfinished company.
Phase B (assemble, instant): fills only BLANK cells of your 11 columns from those results; values from
  your file are never overwritten. Every filled value is cited in output/sources.csv.
"""

import csv
import hashlib
import json
import os
import re
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import extract as x
from . import normalize as n
from .fetch import Fetcher
from .schema import OUTPUT_COLUMNS, validate_row

COUNTRY_TO_CODE = {"US": "1", "CA": "1"}
COUNTRY_TO_CODE.update({cc: code for code, cc in n.CODE_COUNTRY.items() if len(cc) == 2})
FALLBACK_PATHS = ["/about", "/about-us", "/contact", "/contact-us", "/leadership", "/our-team", "/team"]
ROLE_LOCALPARTS = ("info", "sales", "contact", "hello", "enquiries", "inquiries", "business", "partnerships")
TOP_TITLES = [  # rank for choosing one decision-maker per company
    (re.compile(r"\b(co-?founder|founder)\b", re.I), 0), (re.compile(r"\b(ceo|chief executive)\b", re.I), 0),
    (re.compile(r"\bpresident\b", re.I), 1), (re.compile(r"\bmanaging director\b|\bcountry manager\b", re.I), 1),
    (re.compile(r"\b(coo|chief operating)\b", re.I), 2), (re.compile(r"\bchief\b|\bc[a-z]o\b", re.I), 3),
    (re.compile(r"\b(vp|vice president)\b.*\b(sales|operations|business development|growth)\b", re.I), 4),
    (re.compile(r"\bhead of (sales|operations|growth)\b", re.I), 5),
]


def _rank(title: str) -> int:
    for rx, r in TOP_TITLES:
        if rx.search(title or ""):
            return r
    return 99


def _atomic_json(path: str, data) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def phone_with_default(raw: str, default_code: str) -> str:
    v = (raw or "").strip()
    digits = re.sub(r"\D", "", v)
    if not digits:
        return ""
    if not v.startswith("+") and not v.startswith("00") and default_code:
        if digits.startswith("0"):
            digits = digits[1:]
        if not digits.startswith(default_code) or len(digits) <= 10:
            digits = default_code + digits
        v = "+" + digits
    e164, _, _ = n.normalize_phone(v)
    return e164


class Enricher:
    def __init__(self, base_dir: str, config: dict):
        self.base = base_dir
        self.cfg = config.get("enrich", {})
        self.aliases = defaultdict(set)
        for group in config.get("domain_aliases", {}).get("groups", []):
            for d in group:
                self.aliases[d] |= set(group) - {d}
        self.state = os.path.join(base_dir, "state")
        self.companies_dir = os.path.join(self.state, "companies")
        self.progress_path = os.path.join(self.state, "progress.json")
        self.review_path = os.path.join(base_dir, "output", "review.csv")
        os.makedirs(self.companies_dir, exist_ok=True)
        contact = self.cfg.get("contact_email", "").strip()
        ua = "AppointmentlyyLeadBuilder/1.0 (company-website contact lookup; obeys robots.txt"
        ua += f"; contact: {contact})" if contact else ")"
        self.fetcher = Fetcher(os.path.join(self.state, "cache"), ua,
                               (float(self.cfg.get("min_delay", 3)), float(self.cfg.get("max_delay", 5))),
                               float(self.cfg.get("timeout", 15)))
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ input
    def load_leads(self) -> list[dict]:
        if not os.path.exists(self.review_path):
            raise SystemExit("Run the audit first: python -m builder.cli audit <your file>")
        with open(self.review_path, encoding="utf-8-sig", newline="") as f:
            return [r for r in csv.DictReader(f) if not r["Status"].startswith("remove")]

    def companies(self, leads: list[dict]) -> dict[str, dict]:
        """domain -> {host, names, default_code}. Leads without a website get a domain guessed later."""
        out: dict[str, dict] = {}
        countries: dict[str, Counter] = defaultdict(Counter)
        for r in leads:
            host = n.host_of(r["Company URL"])
            key = n.registrable(host) if host else "?" + n.company_key(r["Company Name"])
            entry = out.setdefault(key, {"host": host, "names": set()})
            entry["names"].add(r["Company Name"])
            cc = n.location_country(r["Locations"])
            if cc:
                countries[key][cc] += 1
        for key, e in out.items():
            top = countries[key].most_common(1)
            e["default_code"] = COUNTRY_TO_CODE.get(top[0][0], "") if top else ""
            e["names"] = sorted(e["names"])
        return out

    # ------------------------------------------------------------------ progress
    def load_progress(self, input_hash: str, reset: bool, force: bool) -> dict:
        if reset or not os.path.exists(self.progress_path):
            prog = {"input_sha256": input_hash, "done": {}, "updated_at": ""}
            _atomic_json(self.progress_path, prog)
            return prog
        with open(self.progress_path, encoding="utf-8") as f:
            prog = json.load(f)
        if prog.get("input_sha256") != input_hash and not force:
            raise SystemExit("Your lead file changed since the last enrichment run. "
                             "Use --reset to start over, or --force to keep finished companies.")
        prog["input_sha256"] = input_hash
        return prog

    def _mark(self, prog: dict, key: str, status: str) -> None:
        with self._lock:
            prog["done"][key] = status
            prog["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            _atomic_json(self.progress_path, prog)

    # ------------------------------------------------------------------ crawl one company
    def _resolve(self, names: list[str], default_code: str) -> str:
        """Guess a website for a company with none: brand.com / brand + country TLD, confirmed by its homepage."""
        name = names[0]
        words = [w for w in re.findall(r"[a-z0-9]+", name.lower()) if w not in n.COMPANY_STOPWORDS]
        if not words:
            return ""
        joined = "".join(words)
        tlds = ["com"] + {"63": ["ph", "com.ph"], "61": ["com.au"], "44": ["co.uk"], "64": ["co.nz"]}.get(default_code, [])
        for stem in dict.fromkeys([joined, words[0]]):
            for tld in tlds:
                host = f"{stem}.{tld}"
                final, html, err = self.fetcher.fetch(f"https://{host}/")
                if err or not html:
                    continue
                title = x.parse(html).title.lower()
                if all(w in (title + " " + host) for w in words[:2]):
                    return n.host_of(final)
        return ""

    def crawl_company(self, key: str, info: dict) -> dict:
        host = info["host"] or self._resolve(info["names"], info["default_code"])
        result = {"domain": key, "host": host, "names": info["names"], "status": "", "pages": [],
                  "phones": [], "emails": [], "locations": [], "people": [], "seats": None, "revenue": None,
                  "company_linkedin": "", "resolved_website": "" if info["host"] else host}
        if not host:
            result["status"] = "no_website_found"
            return result
        max_pages = int(self.cfg.get("max_pages", 6))
        queue, seen, facts = [], set(), []
        home = None
        for start in (f"https://{host}/", f"https://www.{host}/", f"http://{host}/"):
            final, html, err = self.fetcher.fetch(start)
            if html:
                home = (final, html)
                break
            result["pages"].append({"url": start, "error": err})
        if not home:
            errs = {p["error"] for p in result["pages"]}
            result["status"] = ("skipped_blocked_site" if "blocked_host" in errs else
                                "robots_disallowed" if "robots_disallowed" in errs else "unreachable")
            return result
        site_host = n.host_of(home[0]) or host
        f0 = x.page_facts(home[0], home[1], site_host)
        facts.append(f0)
        seen.add(home[0].rstrip("/"))
        queue = x.candidate_links(home[0], f0["links"], site_host)
        root = f"{home[0].split('/', 3)[0]}//{n.host_of(home[0]) and home[0].split('/')[2]}"
        queue += [root + p for p in FALLBACK_PATHS if (root + p) not in queue]
        norm = lambda u: u.rstrip("/").replace("://www.", "://")
        seen = {norm(u) for u in seen}
        for url in queue:
            if len(facts) >= max_pages:
                break
            if norm(url) in seen:
                continue
            seen.add(norm(url))
            final, html, err = self.fetcher.fetch(url)
            result["pages"].append({"url": url, "error": err})
            if html and n.domains_match(n.host_of(final), site_host, self.aliases):
                facts.append(x.page_facts(final, html, site_host))
        result["pages"].insert(0, {"url": home[0], "error": ""})
        self._merge(result, facts, site_host, info["default_code"])
        result["status"] = "ok" if any(result[k] for k in ("phones", "emails", "locations", "people")) else "no_data"
        return result

    def _merge(self, result: dict, facts: list[dict], site_host: str, default_code: str) -> None:
        seen_phone, seen_mail, seen_loc, seen_person = set(), set(), set(), {}
        for f in facts:
            src = f["url"]
            for p in f["phones"]:
                e = phone_with_default(p, default_code)
                if e and e not in seen_phone:
                    seen_phone.add(e)
                    result["phones"].append({"value": e, "source": src})
            for m in f["emails"]:
                m = m.strip().lower()
                if n.EMAIL_RE.match(m) and n.domains_match(n.email_domain(m), site_host, self.aliases) and m not in seen_mail:
                    seen_mail.add(m)
                    result["emails"].append({"value": m, "source": src})
            for loc in f["locations"]:
                k = loc.lower()
                if k not in seen_loc:
                    seen_loc.add(k)
                    result["locations"].append({"value": loc, "source": src})
            for p in f["people"]:
                nm = " ".join(p["name"].split())
                if not nm or len(nm.split()) < 2:
                    continue
                prev = seen_person.get(nm.lower())
                if prev:
                    prev["title"] = prev["title"] or p["title"]
                    prev["linkedin"] = prev["linkedin"] or p["linkedin"]
                    continue
                person = {"name": nm, "title": p["title"], "linkedin": p["linkedin"], "email": p["email"], "source": src}
                seen_person[nm.lower()] = person
                result["people"].append(person)
            # Match LinkedIn profile links on the page to people by surname in the URL slug.
            for href, text in f["person_linkedin"]:
                for person in result["people"]:
                    last = person["name"].split()[-1].lower()
                    if not person["linkedin"] and (last in href.lower() or person["name"].lower() in text.lower()):
                        person["linkedin"] = href
            if not result["seats"] and f["seats"]:
                result["seats"] = {"value": f["seats"], "source": src}
            if not result["revenue"] and f["revenue"]:
                result["revenue"] = {"value": f["revenue"], "source": src}
            if not result["company_linkedin"] and f["company_linkedin"]:
                result["company_linkedin"] = f["company_linkedin"][0]

    # ------------------------------------------------------------------ phase A
    def crawl(self, limit: int = 0, workers: int = 0, reset: bool = False, force: bool = False, on_progress=None) -> dict:
        leads = self.load_leads()
        prog = self.load_progress(_sha256(self.review_path), reset, force)
        comps = self.companies(leads)
        todo = [(k, v) for k, v in comps.items() if k not in prog["done"]]
        if limit:
            todo = todo[:limit]
        workers = workers or int(self.cfg.get("workers", 6))
        done_now = 0
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = {pool.submit(self.crawl_company, k, v): k for k, v in todo}
        try:
            for fut in as_completed(futures):
                key = futures[fut]
                try:
                    res = fut.result()
                except Exception as e:  # never let one site stop the run
                    res = {"domain": key, "status": f"error: {type(e).__name__}"}
                _atomic_json(os.path.join(self.companies_dir, _safe(key) + ".json"), res)
                self._mark(prog, key, res["status"])
                done_now += 1
                if on_progress:
                    on_progress(done_now, len(todo), key, res["status"])
        except KeyboardInterrupt:
            print("\nStopping: finishing the companies already in progress, then saving...")
            pool.shutdown(wait=True, cancel_futures=True)
            raise
        pool.shutdown(wait=True)
        return {"companies": len(comps), "crawled_now": done_now, "remaining": len(comps) - len(prog["done"])}

    # ------------------------------------------------------------------ phase B
    def assemble(self) -> dict:
        leads = self.load_leads()
        comps = self.companies(leads)
        fill_role = bool(self.cfg.get("fill_role_email", True))
        results = {}
        for key in comps:
            p = os.path.join(self.companies_dir, _safe(key) + ".json")
            if os.path.exists(p):
                with open(p, encoding="utf-8") as f:
                    results[key] = json.load(f)

        out, review, sources = [], [], []
        c = Counter()
        people_in_list: dict[str, set] = defaultdict(set)
        for r in leads:
            host = n.host_of(r["Company URL"])
            key = n.registrable(host) if host else "?" + n.company_key(r["Company Name"])
            people_in_list[key].add(f"{r['First Name']} {r['Last Name']}".lower().strip())

        def cite(row_id, col, value, src):
            sources.append({"Record ID": row_id, "Company Name": row["Company Name"], "Column": col, "Value": value, "Source URL": src})

        for r in leads:
            row = {col: r[col] for col in OUTPUT_COLUMNS}
            host = n.host_of(r["Company URL"])
            key = n.registrable(host) if host else "?" + n.company_key(r["Company Name"])
            res = results.get(key)
            notes = []
            if not res:
                notes.append("Website not checked yet")
            elif res["status"] != "ok":
                notes.append({"unreachable": "Company website could not be reached",
                              "robots_disallowed": "Company website asks robots not to visit; skipped",
                              "no_website_found": "No company website found",
                              "no_data": "Website checked; no contact details published",
                              "skipped_blocked_site": "Directory or social site; not visited by design"}.get(res["status"], res["status"]))
            else:
                if not row["Company URL"] and res.get("resolved_website"):
                    row["Company URL"] = n.canonical_website(res["resolved_website"])
                    cite(r["Record ID"], "Company URL", row["Company URL"], row["Company URL"])
                    c["filled:Company URL"] += 1
                full = f"{row['First Name']} {row['Last Name']}".strip()
                listed = next((p for p in res["people"] if p["name"].lower() == full.lower()), None)
                if listed:
                    notes.append(f"Listed on company website as {listed['title'] or 'team member'}")
                    c["verified_on_site"] += 1
                if not row["Email"]:
                    mail = _person_email(row, res["emails"], listed)
                    if not mail and fill_role:
                        mail = next((e for e in res["emails"] if e["value"].split("@")[0] in ROLE_LOCALPARTS), None)
                        if mail:
                            notes.append("Email is the company's general address")
                    if mail:
                        row["Email"] = mail["value"]
                        cite(r["Record ID"], "Email", mail["value"], mail["source"])
                        c["filled:Email"] += 1
                if not row["Phone Number"] and res["phones"]:
                    # Only an office line in the contact's own country (or any line if their country is unknown):
                    # a Texas rep shouldn't be handed the India office number.
                    want = COUNTRY_TO_CODE.get(n.location_country(row["Locations"]), "")
                    ph = next((p for p in res["phones"] if not want or p["value"].startswith("+" + want)), None)
                    if ph:
                        row["Phone Number"] = ph["value"]
                        notes.append("Phone is the company's main line")
                        cite(r["Record ID"], "Phone Number", row["Phone Number"], ph["source"])
                        c["filled:Phone Number"] += 1
                    else:
                        notes.append("Company publishes no phone for this contact's country")
                if not row["Locations"] and res["locations"]:
                    row["Locations"] = "; ".join(l["value"] for l in res["locations"][:3])
                    cite(r["Record ID"], "Locations", row["Locations"], res["locations"][0]["source"])
                    c["filled:Locations"] += 1
                if not row["Number of Seats"] and res.get("seats"):
                    m = re.search(r"\d[\d,]*\+?", res["seats"]["value"])
                    if m:
                        row["Number of Seats"] = m.group(0).replace(",", "")
                        cite(r["Record ID"], "Number of Seats", res["seats"]["value"], res["seats"]["source"])
                        c["filled:Number of Seats"] += 1
                if not row["ARR"] and res.get("revenue") and chr(10) not in res["revenue"]["value"]:
                    row["ARR"] = res["revenue"]["value"]
                    cite(r["Record ID"], "ARR", row["ARR"], res["revenue"]["source"])
                    c["filled:ARR"] += 1
            validate_row(row)
            out.append(row)
            review.append({"Record ID": r["Record ID"], "Status": r["Status"], "Decision Level": r["Decision Level"],
                           "ICP Fit": r["ICP Fit"], "Audit Issues": r["Issues"], "Website Check": "; ".join(notes), **row})

        # One new decision-maker per company, when the website names one who isn't already on the list.
        for key, res in results.items():
            if res.get("status") != "ok":
                continue
            ranked = sorted((p for p in res["people"] if _rank(p["title"]) < 99), key=lambda p: _rank(p["title"]))
            pick = next((p for p in ranked if p["name"].lower() not in people_in_list[key]), None)
            if not pick:
                continue
            first, last, _ = n.split_name(pick["name"])
            comp = res["names"][0]
            row = {col: "" for col in OUTPUT_COLUMNS}
            row.update({"Company Name": comp, "Company URL": n.canonical_website(res["host"]), "First Name": first,
                        "Last Name": last, "Title/Role": pick["title"]})
            li, _ = n.normalize_linkedin(pick["linkedin"])
            row["LinkedIn Profile link"] = li
            mail = _person_email(row, res["emails"], pick)
            if mail:
                row["Email"] = mail["value"]
            if res["phones"]:
                row["Phone Number"] = res["phones"][0]["value"]
            if res["locations"]:
                row["Locations"] = "; ".join(l["value"] for l in res["locations"][:3])
            rid = f"NEW-{_safe(key)}"
            for col in ("First Name", "Title/Role", "LinkedIn Profile link", "Email", "Phone Number", "Locations"):
                if row[col]:
                    src = pick["source"] if col in ("First Name", "Title/Role", "LinkedIn Profile link") else \
                        (mail["source"] if col == "Email" else
                         res["phones"][0]["source"] if col == "Phone Number" else res["locations"][0]["source"])
                    sources.append({"Record ID": rid, "Company Name": comp, "Column": col, "Value": row[col], "Source URL": src})
            validate_row(row)
            out.append(row)
            review.append({"Record ID": rid, "Status": "new from website", "Decision Level": n.decision_level(pick["title"]),
                           "ICP Fit": "", "Audit Issues": "", "Website Check": f"Found on company website: {pick['source']}", **row})
            c["new_decision_makers"] += 1

        out_dir = os.path.join(self.base, "output")
        _write(os.path.join(out_dir, "enriched_leads.csv"), OUTPUT_COLUMNS, out)
        _write(os.path.join(out_dir, "enriched_review.csv"), list(review[0].keys()), review)
        _write(os.path.join(out_dir, "sources.csv"), ["Record ID", "Company Name", "Column", "Value", "Source URL"], sources)
        statuses = Counter(res.get("status", "?") for res in results.values())
        return {"rows": len(out), "counts": c, "statuses": statuses, "companies": len(comps), "checked": len(results)}


def _person_email(row: dict, emails: list[dict], person) -> dict | None:
    """A published address that clearly belongs to this person (first.last@, flast@, first@...)."""
    if person and person.get("email"):
        return {"value": person["email"].lower(), "source": person.get("source", "")}
    first = re.sub(r"[^a-z]", "", row["First Name"].lower().split(" ")[0] if row["First Name"] else "")
    last = re.sub(r"[^a-z]", "", row["Last Name"].lower().split(" ")[-1] if row["Last Name"] else "")
    if not first or not last:
        return None
    patterns = {f"{first}.{last}", f"{first}{last}", f"{first[0]}{last}", f"{first}_{last}", f"{first}.{last[0]}"}
    return next((e for e in emails if e["value"].split("@")[0] in patterns), None)


def _safe(key: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", key)


def _write(path: str, columns: list[str], rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)
