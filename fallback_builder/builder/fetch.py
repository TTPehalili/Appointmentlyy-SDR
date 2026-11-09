"""Polite fetcher: obeys robots.txt, waits between requests to the same host, caches pages.

Only fetches company websites listed in your own lead file. Never fetches search engines,
LinkedIn or directory sites (see BLOCKED_HOSTS).
"""

import hashlib
import os
import random
import threading
import time
import urllib.error
import urllib.request
import urllib.robotparser
from urllib.parse import urljoin, urlparse

from . import normalize as n

BLOCKED_HOSTS = (
    "linkedin.com", "google.", "bing.com", "duckduckgo.com", "yahoo.com", "outsourceaccelerator.com",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "glassdoor.", "indeed.", "crunchbase.com",
    "zoominfo.com", "apollo.io",
)
MAX_BYTES = 2_000_000


def host_blocked(host: str) -> bool:
    return any(b in host for b in BLOCKED_HOSTS)


class Fetcher:
    def __init__(self, cache_dir: str, user_agent: str, delay: tuple[float, float], timeout: float):
        self.cache_dir = cache_dir
        self.ua = user_agent
        self.delay = delay
        self.timeout = timeout
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._last: dict[str, float] = {}
        self._lock = threading.Lock()
        os.makedirs(cache_dir, exist_ok=True)

    # ------------------------------------------------------------ cache
    def _cache_path(self, url: str) -> str:
        return os.path.join(self.cache_dir, hashlib.sha1(url.encode()).hexdigest() + ".html")

    def _from_cache(self, url: str):
        p = self._cache_path(url)
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="replace") as f:
                first, _, body = f.read().partition("\n")
            return first, body  # first line holds the final URL after redirects
        return None

    def _to_cache(self, url: str, final_url: str, body: str) -> None:
        p = self._cache_path(url)
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(final_url + "\n" + body)
        os.replace(tmp, p)

    # ------------------------------------------------------------ robots + pacing
    def _robots_for(self, scheme_host: str):
        if scheme_host not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                req = urllib.request.Request(scheme_host + "/robots.txt", headers={"User-Agent": self.ua})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    rp.parse(r.read(200_000).decode("utf-8", "replace").splitlines())
            except urllib.error.HTTPError as e:
                rp.disallow_all = e.code in (401, 403)
                if not rp.disallow_all:
                    rp.allow_all = True
            except Exception:
                rp = None  # unreachable: fetch() will fail on its own
            self._robots[scheme_host] = rp
        return self._robots[scheme_host]

    def allowed(self, url: str) -> bool:
        u = urlparse(url)
        rp = self._robots_for(f"{u.scheme}://{u.netloc}")
        return True if rp is None else rp.can_fetch(self.ua, url)

    def _wait_turn(self, host: str, url: str) -> None:
        u = urlparse(url)
        rp = self._robots.get(f"{u.scheme}://{u.netloc}")
        crawl_delay = (rp.crawl_delay(self.ua) if rp else None) or 0
        gap = max(random.uniform(*self.delay), float(crawl_delay))
        with self._lock:
            wait = self._last.get(host, 0) + gap - time.monotonic()
            self._last[host] = time.monotonic() + max(wait, 0)
        if wait > 0:
            time.sleep(wait)

    # ------------------------------------------------------------ fetch
    def fetch(self, url: str) -> tuple[str, str, str]:
        """Return (final_url, html, error). error is '' on success."""
        cached = self._from_cache(url)
        if cached:
            return cached[0], cached[1], ""
        host = n.host_of(url)
        if host_blocked(host):
            return url, "", "blocked_host"
        if not self.allowed(url):
            return url, "", "robots_disallowed"
        self._wait_turn(host, url)
        req = urllib.request.Request(url, headers={
            "User-Agent": self.ua, "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en",
        })
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                ctype = r.headers.get("Content-Type", "")
                if "html" not in ctype and ctype:
                    return r.geturl(), "", "not_html"
                raw = r.read(MAX_BYTES)
                charset = r.headers.get_content_charset() or "utf-8"
                body = raw.decode(charset, "replace")
                final = r.geturl()
        except urllib.error.HTTPError as e:
            return url, "", f"http_{e.code}"
        except Exception as e:  # DNS, TLS, timeout, reset
            return url, "", type(e).__name__
        self._to_cache(url, final, body)
        return final, body, ""


def absolute(base: str, href: str) -> str:
    return urljoin(base, href.split("#")[0].strip())
