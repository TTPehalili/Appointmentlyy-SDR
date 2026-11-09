"""Field normalisers and validators. Pure functions, no network, no third-party packages."""

import re
from urllib.parse import urlparse

# ---------------------------------------------------------------- text / names

PLACEHOLDERS = {"", "none", "nan", "null", "n/a", "na", "-", "undefined"}
NAME_SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "cpa", "pmp", "mba", "phd", "md"}
NAME_PARTICLES = {"de", "del", "della", "dela", "van", "von", "der", "da", "di", "du", "la", "le", "st", "st."}


def clean(value) -> str:
    v = (value or "").strip()
    return "" if v.lower() in PLACEHOLDERS else v


def smart_title(word: str) -> str:
    """Capitalise an all-lowercase word, keeping hyphen and apostrophe parts ('o'neil-ray' -> "O'Neil-Ray")."""
    if not word.islower():
        return word
    out = re.sub(r"(^|[-'])([a-z])", lambda m: m.group(1) + m.group(2).upper(), word)
    return out


def split_name(full: str) -> tuple[str, str, list[str]]:
    """Return (first, last, notes). Handles particles (de Soto Garcia) and suffixes (III, CPA)."""
    notes = []
    tokens = [t for t in clean(full).split() if t]
    if not tokens:
        return "", "", ["missing_name"]
    if all(t.islower() for t in tokens if t.isalpha()):
        notes.append("name_capitalised")
    tokens = [t if (i > 0 and t in NAME_PARTICLES) else smart_title(t) for i, t in enumerate(tokens)]
    while len(tokens) > 2 and tokens[-1].lower().strip(",") in NAME_SUFFIXES:
        tokens.pop()
    if len(tokens) == 1:
        return tokens[0], "", notes + ["single_name"]
    last_start = len(tokens) - 1
    for i in range(1, len(tokens) - 1):
        if tokens[i].lower() in NAME_PARTICLES:
            last_start = i
            break
    first, last = " ".join(tokens[:last_start]), " ".join(tokens[last_start:])
    if re.fullmatch(r"[A-Za-z]\.?", last):
        notes.append("partial_last_name")
    return first, last, notes


# ---------------------------------------------------------------- domains / URLs

SECOND_LEVEL = {"co", "com", "org", "net", "gov", "ac", "edu"}


def host_of(url_or_domain: str) -> str:
    v = clean(url_or_domain).lower()
    if not v:
        return ""
    if "://" not in v:
        v = "http://" + v
    host = urlparse(v).hostname or ""
    return host[4:] if host.startswith("www.") else host


def registrable(host: str) -> str:
    """Approximate registrable domain: taskus.com, rsm.com.au, kmc.solutions."""
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in SECOND_LEVEL and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def base_label(host: str) -> str:
    return registrable(host).split(".")[0] if host else ""


def canonical_website(url: str) -> str:
    h = host_of(url)
    return f"https://{h}" if h else ""


def domains_match(a: str, b: str, aliases: dict[str, set[str]]) -> bool:
    """True when two hosts plausibly belong to the same organisation."""
    if not a or not b:
        return False
    ra, rb = registrable(a), registrable(b)
    if ra == rb or rb in aliases.get(ra, set()) or ra in aliases.get(rb, set()):
        return True
    la, lb = base_label(a), base_label(b)
    if la == lb:
        return True  # taskus.com vs taskus.ph, amazon.com vs amazon.ae
    short, long_ = sorted((la, lb), key=len)
    return len(short) >= 3 and long_.startswith(short)  # ibex.co vs ibexglobal.com


# ---------------------------------------------------------------- email

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
FREE_MAIL = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com",
    "msn.com", "aol.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.com", "mail.com",
    "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "surewest.net", "sympatico.ca", "mailnew.com",
}


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower() if "@" in email else ""


# ---------------------------------------------------------------- phone

# Valid national-number lengths (digits after the country code) for codes seen in BPO lead lists.
NATIONAL_LENGTHS = {
    "1": {10}, "7": {10}, "20": {9, 10}, "27": {9}, "31": {9}, "32": {8, 9}, "33": {9}, "34": {9},
    "39": {9, 10}, "44": {9, 10}, "46": {7, 8, 9}, "49": {10, 11}, "52": {10}, "54": {10, 11},
    "55": {10, 11}, "57": {10}, "60": {9, 10}, "61": {9}, "63": {9, 10}, "64": {8, 9, 10}, "65": {8},
    "81": {9, 10}, "86": {11}, "90": {10}, "91": {10}, "92": {9, 10}, "212": {9}, "221": {9},
    "353": {9}, "372": {7, 8}, "502": {8}, "503": {8}, "505": {8}, "506": {8}, "598": {8},
    "886": {9}, "966": {9}, "971": {9}, "974": {8}, "995": {9},
}
CODE_COUNTRY = {
    "1": "US/CA", "7": "RU", "20": "EG", "27": "ZA", "31": "NL", "32": "BE", "33": "FR", "34": "ES",
    "39": "IT", "44": "GB", "46": "SE", "49": "DE", "52": "MX", "54": "AR", "55": "BR", "57": "CO",
    "60": "MY", "61": "AU", "63": "PH", "64": "NZ", "65": "SG", "81": "JP", "86": "CN", "90": "TR",
    "91": "IN", "92": "PK", "212": "MA", "221": "SN", "353": "IE", "372": "EE", "502": "GT",
    "503": "SV", "505": "NI", "506": "CR", "598": "UY", "886": "TW", "966": "SA", "971": "AE",
    "974": "QA", "995": "GE",
}


def normalize_phone(raw: str) -> tuple[str, str, list[str]]:
    """Return (e164 or "", country_code, notes). Blank when the number cannot be valid."""
    v = clean(raw)
    if not v:
        return "", "", ["missing_phone"]
    digits = re.sub(r"\D", "", v)
    if not v.lstrip().startswith("+") and not v.startswith("00"):
        return "", "", ["phone_no_country_code"]
    if v.startswith("00"):
        digits = digits[2:]
    code = next((c for c in sorted(NATIONAL_LENGTHS, key=len, reverse=True) if digits.startswith(c)), "")
    if not code:
        ok = 8 <= len(digits) <= 15
        return (f"+{digits}" if ok else ""), "", ([] if ok else ["phone_invalid_length"])
    national = digits[len(code):]
    if code == "1" and len(national) == 10 and (national[0] in "01" or national[3] in "01"):
        return "", code, ["phone_invalid_length"]  # US/Canada area code and exchange never start with 0 or 1
    if len(national) in NATIONAL_LENGTHS[code]:
        return f"+{code}{national}", code, []
    if national.startswith("0") and len(national) - 1 in NATIONAL_LENGTHS[code]:
        return f"+{code}{national[1:]}", code, ["phone_trunk_zero_removed"]
    return "", code, ["phone_invalid_length"]


# ---------------------------------------------------------------- LinkedIn

def normalize_linkedin(raw: str) -> tuple[str, list[str]]:
    v = clean(raw)
    if not v:
        return "", ["missing_linkedin"]
    host = host_of(v)
    path = urlparse(v if "://" in v else "https://" + v).path
    m = re.match(r"^/in/([^/?#]+)", path)
    if not host.endswith("linkedin.com") or not m:
        return "", ["linkedin_not_profile_url"]
    slug = m.group(1)
    notes = ["linkedin_internal_id"] if slug.lower().startswith("acoaa") else []
    return f"https://www.linkedin.com/in/{slug}", notes


# ---------------------------------------------------------------- locations

COUNTRY_NAMES = {
    "egypt": "EG", "philippines": "PH", "mexico": "MX", "united states": "US", "usa": "US",
    "canada": "CA", "india": "IN", "australia": "AU", "jamaica": "JM", "belgium": "BE",
    "estonia": "EE", "pakistan": "PK", "united kingdom": "GB", "nicaragua": "NI",
    "singapore": "SG", "malaysia": "MY", "colombia": "CO", "brazil": "BR", "spain": "ES",
    "france": "FR", "turkey": "TR", "south africa": "ZA", "new zealand": "NZ",
}


def normalize_location(raw: str) -> tuple[str, list[str]]:
    tokens = [clean(t) for t in (raw or "").split(",")]
    had_placeholder = any(not t for t in tokens) and any(tokens)
    tokens = [t for t in tokens if t]
    if not tokens:
        return "", ["missing_location"]
    notes = ["location_placeholder_removed"] if had_placeholder else []
    tokens = [t if (len(t) <= 3 and t.isupper()) else " ".join(smart_title(w) for w in t.split()) for t in tokens]
    country = tokens[-1] if re.fullmatch(r"[A-Z]{2}", tokens[-1]) else ""
    if country:
        for t in tokens[:-1]:
            named = COUNTRY_NAMES.get(t.lower())
            if named and named != country:
                return "", notes + ["location_conflict"]
    return ", ".join(tokens), notes


def location_country(location: str) -> str:
    last = location.rsplit(",", 1)[-1].strip() if location else ""
    return last if re.fullmatch(r"[A-Z]{2}", last) else ""


# ---------------------------------------------------------------- seats / title / industry

def seats_from(seats_raw: str, headcount_raw: str) -> tuple[str, list[str]]:
    s = clean(seats_raw)
    if s:
        return s, []
    h = clean(headcount_raw)
    m = re.search(r"(\d[\d,]*\+?)\s*seats?\b", h, re.I)
    if m:
        return m.group(1).replace(",", ""), []
    return "", (["headcount_is_employee_range"] if h else [])


DM_STRONG = re.compile(
    r"\b(ceo|cfo|coo|cto|cio|cro|cmo|chief|founder|co-?founder|owner|president|vp|svp|evp|avp|"
    r"vice president|director|head|managing director|general manager|country manager|executive director)\b",
    re.I,
)
DM_WEAK = re.compile(r"\b(partner|principal)\b", re.I)
MID = re.compile(r"\b(manager|lead|leader|supervisor)\b", re.I)


def decision_level(title: str) -> str:
    t = clean(title)
    if not t:
        return "unknown"
    if DM_STRONG.search(t):
        return "decision-maker"
    if MID.search(t):
        return "manager"
    if DM_WEAK.search(t):
        return "decision-maker"
    return "individual contributor"


ICP_INDUSTRY = re.compile(r"outsourc|offshor|\bbpo\b|call cent|contact cent|staffing", re.I)


def icp_fit(industry: str, company: str) -> str:
    return "BPO / outsourcing" if ICP_INDUSTRY.search(f"{industry} {company}") else "other industry"


# ---------------------------------------------------------------- company vs website

COMPANY_STOPWORDS = {
    "inc", "llc", "ltd", "llp", "pllc", "pty", "corp", "corporation", "company", "co", "group", "global",
    "solutions", "services", "the", "and", "limited", "international", "holdings", "partners", "pvt",
}


def company_matches_website(company: str, host: str) -> bool:
    if not company or not host:
        return True  # nothing to compare
    base = base_label(host).replace("-", "")
    joined = re.sub(r"[^a-z0-9]", "", company.lower())
    if base and (base in joined or joined.startswith(base) or (len(joined) >= 3 and joined in base)):
        return True
    # Shared opening ("247ai" vs "247inc", "tuperware" vs "tupperware").
    common = 0
    for x, y in zip(joined, base):
        if x != y:
            break
        common += 1
    if common >= 3:
        return True
    words = [t for t in re.findall(r"[a-z0-9]+", company.lower()) if t not in COMPANY_STOPWORDS]
    # Initials: Bristol Myers Squibb -> bms.com, Hewlett Packard Enterprise -> hpe.com.
    initials = "".join(w[0] for w in words)
    if len(initials) >= 2 and base.startswith(initials[:3]):
        return True
    # Short brand whose letters appear in order in the domain: TP -> teleperformance.com.
    if 2 <= len(joined) <= 3 and base.startswith(joined[0]):
        it = iter(base)
        if all(ch in it for ch in joined):
            return True
    return any(t in base for t in words if len(t) >= 3)


def company_key(company: str) -> str:
    tokens = [t for t in re.findall(r"[a-z0-9]+", company.lower()) if t not in COMPANY_STOPWORDS]
    return " ".join(tokens)
