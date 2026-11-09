"""Turn company web pages into facts. Standard library only (html.parser + json)."""

import json
import re
from html.parser import HTMLParser
from urllib.parse import unquote

from . import normalize as n

SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "head"}
BLOCK_TAGS = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "br", "section", "article",
              "header", "footer", "span", "strong", "b", "a", "figcaption", "dd", "dt"}


class Page(HTMLParser):
    """Collects visible text chunks (in order), links, tel/mailto targets and JSON-LD blocks."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks: list[str] = []
        self.links: list[tuple[str, str]] = []  # (href, anchor text)
        self.jsonld: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_jsonld = False
        self._in_title = False
        self._buf: list[str] = []
        self._a_href = None
        self._a_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and (a.get("type") or "").lower() == "application/ld+json":
            self._in_jsonld = True
            self._buf = []
            return
        if tag in SKIP_TAGS:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag in BLOCK_TAGS:
            self._flush()
        if tag == "a" and a.get("href"):
            self._a_href, self._a_text = a["href"], []

    def handle_endtag(self, tag):
        if tag == "script" and self._in_jsonld:
            self.jsonld.append("".join(self._buf))
            self._in_jsonld = False
            return
        if tag in SKIP_TAGS and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._a_href is not None:
            self.links.append((self._a_href, " ".join("".join(self._a_text).split())))
            self._a_href = None
        if tag in BLOCK_TAGS:
            self._flush()

    def handle_data(self, data):
        if self._in_jsonld:
            self._buf.append(data)
            return
        if self._in_title:
            self.title += data
        if self._skip:
            return
        self._cur = getattr(self, "_cur", []) + [data]
        if self._a_href is not None:
            self._a_text.append(data)

    def _flush(self):
        text = " ".join("".join(getattr(self, "_cur", [])).split())
        if text:
            self.chunks.append(text)
        self._cur = []

    def close(self):
        super().close()
        self._flush()


def parse(html: str) -> Page:
    p = Page()
    try:
        p.feed(html)
        p.close()
    except Exception:
        pass
    return p


# ------------------------------------------------------------------ JSON-LD

def _walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _types(node) -> set[str]:
    t = node.get("@type", [])
    return {x.lower() for x in (t if isinstance(t, list) else [t]) if isinstance(x, str)}


def _addr_text(addr) -> str:
    if isinstance(addr, str):
        return addr
    if not isinstance(addr, dict):
        return ""
    country = addr.get("addressCountry", "")
    if isinstance(country, dict):
        country = country.get("name", "")
    parts = [addr.get("addressLocality", ""), addr.get("addressRegion", ""), country]
    return ", ".join(p for p in (str(x).strip() for x in parts) if p)


def jsonld_facts(page: Page) -> dict:
    out = {"phones": [], "emails": [], "locations": [], "people": [], "employees": "", "linkedin": []}
    for raw in page.jsonld:
        try:
            data = json.loads(raw.strip())
        except Exception:
            continue
        for node in _walk(data):
            types = _types(node)
            if types & {"organization", "corporation", "localbusiness", "professionalservice"} or "address" in node:
                tel = node.get("telephone")
                for t in (tel if isinstance(tel, list) else [tel]):
                    if isinstance(t, str):
                        out["phones"].append(t)
                for addr in (node.get("address") if isinstance(node.get("address"), list) else [node.get("address")]):
                    txt = _addr_text(addr)
                    if txt:
                        out["locations"].append(txt)
                emp = node.get("numberOfEmployees")
                if isinstance(emp, dict):
                    emp = emp.get("value") or emp.get("maxValue") or emp.get("minValue")
                if emp and not out["employees"]:
                    out["employees"] = str(emp)
                same = node.get("sameAs", [])
                for s in (same if isinstance(same, list) else [same]):
                    if isinstance(s, str) and "linkedin.com/company" in s:
                        out["linkedin"].append(s)
                for key in ("founder", "founders", "employee", "employees", "member"):
                    for p in (node.get(key) if isinstance(node.get(key), list) else [node.get(key)]):
                        if isinstance(p, dict) and p.get("name"):
                            out["people"].append(_person(p, default_title="Founder" if "founder" in key else ""))
            if "person" in types and node.get("name"):
                out["people"].append(_person(node))
            if isinstance(node.get("email"), str):
                out["emails"].append(node["email"].replace("mailto:", ""))
    return out


def _person(p: dict, default_title: str = "") -> dict:
    same = p.get("sameAs", [])
    links = [s for s in (same if isinstance(same, list) else [same]) if isinstance(s, str)]
    if isinstance(p.get("url"), str):
        links.append(p["url"])
    li = next((s for s in links if "linkedin.com/in/" in s), "")
    return {"name": str(p.get("name", "")).strip(), "title": str(p.get("jobTitle") or default_title).strip(),
            "linkedin": li, "email": str(p.get("email", "")).replace("mailto:", "")}


# ------------------------------------------------------------------ text heuristics

NAME_LINE = re.compile(r"^[A-Z][a-zA-Z'’.-]+(?:\s+(?:[A-Z][a-zA-Z'’.-]+|de|del|dela|van|von|da|di)){1,3}$")
TITLE_HINT = re.compile(
    r"\b(ceo|cfo|coo|cto|cio|cro|chief|founder|co-?founder|owner|president|vice president|vp|director|head|"
    r"managing director|general manager|partner|principal|chairman|managing partner)\b", re.I)
NOT_NAMES = {"Contact Us", "About Us", "Our Team", "Read More", "Learn More", "Privacy Policy", "Get Started",
             "Book A Demo", "Our Story", "Case Studies", "Terms Of Use", "Cookie Policy", "Our Services"}

SEATS_RE = re.compile(r"\b(\d{1,3}(?:,\d{3})+|\d{2,6})\s*\+?\s*(?:seats?|workstations?|agents?)\b", re.I)
REVENUE_RE = re.compile(
    r"(?:annual revenue|revenue of|revenues? (?:of|exceeding|over)|\bARR\b)[^.$]{0,40}"
    r"(\$\s?\d[\d.,]*\s?(?:million|billion|bn|m|k)?)", re.I)
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")


TEAM_PAGE = re.compile(r"team|leadership|management|our-people|people|founder|about|board|executive", re.I)


def plausible_person(p: dict) -> bool:
    """Reject non-names ('Chief Executive Officer', 'OUR CLIENTS') and testimonial titles from other companies."""
    name, title = p["name"].strip(), p["title"].strip()
    if not name or name.isupper() or TITLE_HINT.search(name) or name.title() in NOT_NAMES:
        return False
    m = re.search(r",\s*(.+)$|\b(?:of|at)\s+([A-Z].+)$", title)
    if m:
        tail = (m.group(1) or m.group(2) or "").strip()
        words = re.findall(r"[a-z]+", tail.lower())
        if words and not all(w in DEPARTMENT_WORDS for w in words):
            return False  # "Founder of Product Hunt", "Managing Partner, Tingen Law": another company
    return True


DEPARTMENT_WORDS = {
    "sales", "operations", "operation", "business", "development", "marketing", "finance", "financial", "human",
    "resources", "hr", "people", "technology", "technologies", "information", "it", "product", "products",
    "global", "americas", "emea", "apac", "asia", "pacific", "europe", "north", "america", "latam", "strategy",
    "growth", "customer", "customers", "client", "clients", "delivery", "legal", "engineering", "culture",
    "talent", "partnerships", "philippines", "india", "australia", "us", "uk", "and", "of", "the", "for",
    "experience", "success", "services", "solutions", "workforce", "management", "quality", "training",
    "learning", "revenue", "accounts", "account", "enterprise", "digital", "transformation", "innovation",
    "compliance", "risk", "security", "data", "analytics", "recruitment", "acquisition", "communications",
}


def text_people(page: Page) -> list[dict]:
    """Name line followed (within two chunks) by a leadership title line, as on team pages."""
    people, c = [], page.chunks
    for i, line in enumerate(c):
        if len(line) > 40 or line in NOT_NAMES or not NAME_LINE.match(line):
            continue
        for j in (i + 1, i + 2):
            if j < len(c) and len(c[j]) <= 90 and TITLE_HINT.search(c[j]) and not NAME_LINE.match(c[j]):
                people.append({"name": line, "title": c[j], "linkedin": "", "email": ""})
                break
    return people


def page_facts(url: str, html: str, site_host: str) -> dict:
    page = parse(html)
    ld = jsonld_facts(page)
    text = "\n".join(page.chunks)
    facts = {
        "url": url,
        "title": page.title.strip(),
        "phones": ld["phones"] + [unquote(h[4:]) for h, _ in page.links if h.lower().startswith("tel:")],
        "emails": ld["emails"] + [unquote(h[7:].split("?")[0]) for h, _ in page.links if h.lower().startswith("mailto:")],
        "locations": ld["locations"],
        # Any visited page may list leaders (KMC shows its founders on the home page); testimonials and
        # title-only "names" are removed by plausible_person.
        "people": [p for p in ld["people"] + text_people(page) if plausible_person(p)],
        "employees": ld["employees"],
        "seats": "",
        "revenue": "",
        "company_linkedin": ld["linkedin"] + [h for h, _ in page.links if "linkedin.com/company/" in h],
        "person_linkedin": [(h, t) for h, t in page.links if "linkedin.com/in/" in h],
        "links": page.links,
    }
    # Emails printed as text, kept only when on the company's own domain (skips image names like x@2x.png).
    for e in EMAIL_RE.findall(text):
        if n.domains_match(n.email_domain(e), site_host, {}):
            facts["emails"].append(e)
    facts["seats"] = capacity_seats(text, url)
    if not SALES_PAGE.search(url):
        # Phrase and amount must sit in one line of text: amounts stitched across separate page
        # elements are usually marketing stats ("$4.8M saved"), not company revenue.
        for chunk in page.chunks:
            m = REVENUE_RE.search(chunk)
            if m:
                facts["revenue"] = m.group(1).strip()
                break
    return facts


SALES_PAGE = re.compile(r"solution|pricing|price|plans?\b|services?/|get-started|/start", re.I)
CAPACITY_WORDS = re.compile(r"\b(over|more than|across|capacity|facilit|sites?|centres?|centers?|delivery|operat|"
                            r"houses?|campus|floors?|buildings?|offices?|workforce of|team of over)\b", re.I)


def capacity_seats(text: str, url: str) -> str:
    """A seat count describing the company's own capacity ('640 seats across three delivery centres').
    Ignores sales-page offers like 'start with 10+ seats'."""
    if SALES_PAGE.search(url):
        return ""
    for m in SEATS_RE.finditer(text):
        number = int(re.sub(r"\D", "", m.group(1)))
        window = text[max(0, m.start() - 60): m.end() + 60]
        if number >= 50 and CAPACITY_WORDS.search(window) and not re.search(r"\b(start|from|up to|minimum)\b", window, re.I):
            return m.group(0).strip()
    return ""


SKIP_PAGES = re.compile(r"career|job|vacanc|hiring|apply|blog|news|article|insight|resource|case-stud|podcast|"
                        r"event|webinar|privacy|terms|cookie|legal|signup|sign-up|login|register|former-employee|verification|"
                        r"glossary|faq|support|help|%20|"
                        r"build-your-team|/tag/|/category/|\?", re.I)
PAGE_HINTS = re.compile(r"contact|about|team|leadership|management|our-people|people|founder|locations?|offices?|"
                        r"who-we-are|company", re.I)


def candidate_links(base_url: str, links: list[tuple[str, str]], site_host: str) -> list[str]:
    """Same-site links whose URL or anchor text suggests contact/about/team/location pages, best first."""
    from .fetch import absolute

    scored = {}
    for href, text in links:
        if href.lower().startswith(("mailto:", "tel:", "javascript:")):
            continue
        url = absolute(base_url, href)
        h = n.host_of(url)
        if not h or not n.domains_match(h, site_host, {}) or re.search(r"\.(pdf|jpe?g|png|zip|docx?)$", url, re.I):
            continue
        hay = f"{url} {text}"
        if not PAGE_HINTS.search(hay) or SKIP_PAGES.search(url):
            continue
        score = 0
        for word, pts in (("leadership", 5), ("team", 4), ("management", 4), ("about", 3), ("contact", 3),
                          ("location", 2), ("office", 2), ("people", 2), ("company", 1)):
            if word in hay.lower():
                score += pts
        score -= url.count("/") * 0.1  # prefer shallow pages
        k = url.rstrip("/").replace("://www.", "://")
        if k not in scored or score > scored[k][0]:
            scored[k] = (score, url.rstrip("/"))
    return [u for _, (sc, u) in sorted(scored.items(), key=lambda kv: -kv[1][0])]
