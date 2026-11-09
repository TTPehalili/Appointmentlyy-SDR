"""Stage 4: verify selected leads through LeadOcean /v1/enrich (your licensed provider).

One call per lead, by LinkedIn URL. Each response is saved under state/leadocean/ so a re-run never
spends a credit twice on the same lead. The API key is read from the environment or the app's
.env.local and is never printed or written anywhere.
"""

import json
import os
import re
import time
import urllib.error
import urllib.request

from . import normalize as n

API = "https://api.leadocean.io/v1/enrich"
KEY_NAMES = ("LEADOCEAN_API_KEY", "APLY_DATA_ENGINE_KEY")


class LeadOceanError(Exception):
    pass


def load_key(app_root: str) -> str:
    for name in KEY_NAMES:
        if os.environ.get(name, "").strip():
            return os.environ[name].strip()
    for fname in (".env.local", ".env"):
        path = os.path.join(app_root, fname)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    m = re.match(r"\s*(LEADOCEAN_API_KEY|APLY_DATA_ENGINE_KEY)\s*=\s*['\"]?([^'\"\s#]+)", line)
                    if m and len(m.group(2)) > 10:
                        return m.group(2)
    raise LeadOceanError("No LeadOcean key found (LEADOCEAN_API_KEY in the environment or the app's .env.local).")


def _cache_path(state_dir: str, record_id: str) -> str:
    return os.path.join(state_dir, "leadocean", re.sub(r"[^A-Za-z0-9._-]", "_", record_id) + ".json")


def cached(state_dir: str, record_id: str):
    p = _cache_path(state_dir, record_id)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return None


def enrich_one(key: str, linkedin_url: str, timeout: float = 30) -> dict:
    body = json.dumps({"linkedin_url": linkedin_url, "reveal_email": True}).encode()
    req = urllib.request.Request(API, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "x-api-key": key,
                                          "User-Agent": "AppointmentlyyLeadBuilder/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return {"http": r.status, "body": json.loads(r.read().decode("utf-8", "replace"))}
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            payload = {}
        return {"http": e.code, "body": payload}


def run(state_dir: str, key: str, leads: list[dict], delay: float = 1.0, on_progress=None) -> dict:
    """leads: dicts with 'Record ID' and 'LinkedIn Profile link'. Stops on auth/credit errors."""
    os.makedirs(os.path.join(state_dir, "leadocean"), exist_ok=True)
    done = called = 0
    for lead in leads:
        rid = lead["Record ID"]
        if cached(state_dir, rid) is not None:
            done += 1
            continue
        resp = enrich_one(key, lead["LinkedIn Profile link"])
        called += 1
        status = resp["http"]
        if status in (401, 403):
            raise LeadOceanError("LeadOcean rejected the API key (HTTP %d). Nothing more was spent." % status)
        if status == 402 or re.search(r"credit|quota|insufficient", json.dumps(resp["body"]).lower()) and status >= 400:
            raise LeadOceanError("LeadOcean reports no credits left (HTTP %d). Stopped; finished leads are saved." % status)
        if status == 429:
            time.sleep(30)
            resp = enrich_one(key, lead["LinkedIn Profile link"])
        p = _cache_path(state_dir, rid)
        with open(p + ".tmp", "w", encoding="utf-8") as f:
            json.dump({"record_id": rid, "requested": lead["LinkedIn Profile link"], **resp}, f, ensure_ascii=False)
        os.replace(p + ".tmp", p)
        done += 1
        if on_progress:
            on_progress(done, len(leads), rid, resp["http"])
        time.sleep(delay)
    return {"done": done, "called": called}


# ------------------------------------------------------------------ interpret a response

def interpret(saved: dict, company_url: str) -> dict:
    """What LeadOcean says about this person, using only verified work emails at the current employer."""
    out = {"ok": False, "email": "", "email_note": "", "linkedin": "", "phone": "", "current_company": "",
           "current_domain": "", "employer_changed": False}
    body = saved.get("body") or {}
    if saved.get("http") != 200 or not body.get("success") or not body.get("data"):
        out["email_note"] = "LeadOcean had no record for this profile"
        return out
    data = body["data"]
    out["ok"] = True
    profile = data.get("profile_data") or {}
    contact = data.get("contact_data") or {}
    exps = contact.get("contact_current_experiences") or []
    exp = exps[0] if exps else {}
    cur_domain = n.host_of(exp.get("company_domain") or "")
    out["current_company"] = exp.get("company_name") or ""
    out["current_domain"] = cur_domain
    li, _ = n.normalize_linkedin(profile.get("profile_url") or "")
    out["linkedin"] = li
    our_host = n.host_of(company_url)
    if cur_domain and our_host and not n.domains_match(cur_domain, our_host, {}):
        out["employer_changed"] = True

    emails = contact.get("contact_emails") or []
    good = [e for e in emails if e.get("status") == "verified" and e.get("email")
            and e.get("type") in ("work", "work_other", None)
            and cur_domain and n.domains_match(n.email_domain(e["email"]), cur_domain, {})]
    if good:
        out["email"] = good[0]["email"].lower()
        out["email_note"] = "Verified by LeadOcean (work email at current employer)"
    elif any(e.get("status") == "catch_all" and cur_domain and
             n.domains_match(n.email_domain(e.get("email", "")), cur_domain, {}) for e in emails):
        out["email_note"] = "Company mail server accepts all addresses (catch-all); mailbox can't be confirmed"
    elif any(e.get("status") == "verified" for e in emails):
        out["email_note"] = "LeadOcean's verified email is personal or at a past employer; not used"
    elif emails:
        out["email_note"] = "LeadOcean has emails but none verified"
    else:
        out["email_note"] = "LeadOcean has no email for this person"

    phones = contact.get("contact_phones") or []
    best = next((p for p in phones if p.get("type") == "mobile"), None) or \
        next((p for p in phones if p.get("type") == "office" or p.get("ddi")), None)
    if best and best.get("phone"):
        e164, _, _ = n.normalize_phone(best["phone"] if str(best["phone"]).startswith("+") else "+" + str(best["phone"]))
        out["phone"] = e164
    return out
