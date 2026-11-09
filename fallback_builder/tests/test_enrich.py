"""Offline enrichment tests: a fictional website served by a fake fetcher. No network."""

import csv
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from builder import extract as x  # noqa: E402
from builder.cli import load_config  # noqa: E402
from builder.enrich import Enricher, phone_with_default  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HOME = """<html><head><title>Brightline Contact Centers</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Brightline",
 "telephone":"(512) 555-0100","address":{"@type":"PostalAddress","addressLocality":"Austin","addressRegion":"TX","addressCountry":"US"},
 "sameAs":["https://www.linkedin.com/company/brightline-demo"]}</script></head>
<body><nav><a href="/about-us">About us</a><a href="/leadership">Leadership</a><a href="/contact">Contact</a>
<a href="https://www.linkedin.com/company/brightline-demo">LinkedIn</a></nav>
<p>640 seats across three delivery centres.</p></body></html>"""
LEADERSHIP = """<html><body><h1>Our leadership</h1>
<div><h3>Maya Santos</h3><p>Founder &amp; Chief Executive Officer</p><a href="https://www.linkedin.com/in/maya-santos-demo">in</a></div>
<div><h3>Dana Whitfield</h3><p>VP of Operations</p></div>
<div><h3>Read More</h3><p>Director of everything</p></div></body></html>"""
CONTACT = """<html><body><a href="mailto:sales@brightlinecx.com">Email sales</a>
<a href="tel:+1-512-555-0100">Call</a><p>Write to dana.whitfield@brightlinecx.com</p></body></html>"""
PAGES = {
    "https://brightlinecx.com/": HOME,
    "https://brightlinecx.com/leadership": LEADERSHIP,
    "https://brightlinecx.com/contact": CONTACT,
    "https://brightlinecx.com/about-us": "<html><body><p>Founded 2012.</p></body></html>",
}


class FakeFetcher:
    def __init__(self):
        self.calls = []

    def fetch(self, url):
        self.calls.append(url)
        url = url.rstrip("/") + ("/" if url.count("/") == 3 else "")
        html = PAGES.get(url) or PAGES.get(url.rstrip("/"))
        return (url, html, "") if html else (url, "", "http_404")


REVIEW_HEAD = ["Record ID", "Status", "Duplicate Of", "Decision Level", "ICP Fit", "Issues", "Company Name", "Company URL",
               "First Name", "Last Name", "Title/Role", "Email", "Phone Number", "LinkedIn Profile link",
               "Number of Seats", "Locations", "ARR"]


class Enrichment(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.base, "output"))
        with open(os.path.join(self.base, "output", "review.csv"), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=REVIEW_HEAD)
            w.writeheader()
            base = dict.fromkeys(REVIEW_HEAD, "")
            w.writerow({**base, "Record ID": "L1", "Status": "review", "Company Name": "Brightline Contact Centers",
                        "Company URL": "https://brightlinecx.com", "First Name": "Dana", "Last Name": "Whitfield",
                        "Title/Role": "VP of Operations", "Locations": "Austin, TX, US",
                        "LinkedIn Profile link": "https://www.linkedin.com/in/dana-demo"})
            w.writerow({**base, "Record ID": "L2", "Status": "ok", "Company Name": "Brightline Contact Centers",
                        "Company URL": "https://brightlinecx.com", "First Name": "Owen", "Last Name": "Calloway",
                        "Title/Role": "Director", "Email": "owen@brightlinecx.com", "Phone Number": "+15125550199",
                        "Locations": "Austin, TX, US"})
        cfg = load_config(os.path.join(ROOT, "config.toml"))
        self.en = Enricher(self.base, cfg)
        self.en.fetcher = FakeFetcher()

    def tearDown(self):
        shutil.rmtree(self.base, ignore_errors=True)

    def test_phone_default_country(self):
        self.assertEqual(phone_with_default("(512) 555-0100", "1"), "+15125550100")
        self.assertEqual(phone_with_default("0917 123 4567", "63"), "+639171234567")

    def test_trial_run_fixes(self):
        from builder import normalize as n
        # %20-encoded tel: links keep their real digits
        f = x.page_facts("https://ex.com/contact", '<a href="tel:+61%20878%20878%20987">Call</a>', "ex.com")
        self.assertEqual(phone_with_default(f["phones"][0], ""), "+61878878987")
        # US numbers whose area code starts with 1 are not real
        self.assertEqual(n.normalize_phone("+11228008808")[0], "")
        # testimonials and title-only "names" are not staff
        self.assertFalse(x.plausible_person({"name": "Ryan Hoover", "title": "Founder of Product Hunt"}))
        self.assertFalse(x.plausible_person({"name": "Jacob Tingen", "title": "Managing Partner, Tingen Law"}))
        self.assertFalse(x.plausible_person({"name": "Chief Executive Officer", "title": "President"}))
        self.assertFalse(x.plausible_person({"name": "OUR CLIENTS", "title": "Partner with us"}))
        self.assertTrue(x.plausible_person({"name": "Aleks Bogdanovski", "title": "Division Vice President, Business Development"}))
        self.assertTrue(x.plausible_person({"name": "Bryce Maddock", "title": "Chief Executive Officer and Co-Founder"}))
        # seat counts must describe the company's own capacity, not a sales offer
        self.assertEqual(x.capacity_seats("Start with 10+ seats today", "https://ex.com/about"), "")
        self.assertEqual(x.capacity_seats("Build a team of 120 seats", "https://ex.com/solutions/start"), "")
        self.assertEqual(x.capacity_seats("We operate 1,200 seats across four sites", "https://ex.com/about"), "1,200 seats")
        # job and sign-up pages are not visited
        links = [("/careers/manager", "Management roles"), ("/signup-match", "About"), ("/about-us", "About us"),
                 ("https://www.ex.com/about-us", "About")]
        self.assertEqual(x.candidate_links("https://ex.com/", links, "ex.com"), ["https://ex.com/about-us"])

    def test_text_people(self):
        people = x.text_people(x.parse(LEADERSHIP))
        self.assertEqual([p["name"] for p in people], ["Maya Santos", "Dana Whitfield"])  # "Read More" skipped

    def test_crawl_and_assemble(self):
        r = self.en.crawl()
        self.assertEqual((r["crawled_now"], r["remaining"]), (1, 0))
        res = json.load(open(os.path.join(self.base, "state", "companies", "brightlinecx.com.json"), encoding="utf-8"))
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["phones"][0]["value"], "+15125550100")
        self.assertEqual(res["seats"]["value"], "640 seats")

        a = self.en.assemble()
        rows = list(csv.DictReader(open(os.path.join(self.base, "output", "enriched_leads.csv"), encoding="utf-8-sig")))
        review = list(csv.DictReader(open(os.path.join(self.base, "output", "enriched_review.csv"), encoding="utf-8-sig")))
        dana, owen, new = rows
        self.assertEqual(dana["Email"], "dana.whitfield@brightlinecx.com")  # her own published address
        self.assertEqual(dana["Phone Number"], "+15125550100")  # main line filled into a blank
        self.assertEqual(dana["Number of Seats"], "640")
        self.assertIn("Listed on company website as VP of Operations", review[0]["Website Check"])
        self.assertEqual(owen["Phone Number"], "+15125550199")  # never overwritten
        self.assertEqual(owen["Email"], "owen@brightlinecx.com")
        self.assertEqual((new["First Name"], new["Last Name"]), ("Maya", "Santos"))
        self.assertEqual(new["LinkedIn Profile link"], "https://www.linkedin.com/in/maya-santos-demo")
        self.assertEqual(a["counts"]["new_decision_makers"], 1)
        srcs = list(csv.DictReader(open(os.path.join(self.base, "output", "sources.csv"), encoding="utf-8-sig")))
        self.assertTrue(all(s["Source URL"].startswith("https://brightlinecx.com") for s in srcs))

    def test_resume_skips_finished_companies(self):
        self.en.crawl()
        calls_before = len(self.en.fetcher.calls)
        r = self.en.crawl()
        self.assertEqual(r["crawled_now"], 0)
        self.assertEqual(len(self.en.fetcher.calls), calls_before)

    def test_changed_input_refuses_resume(self):
        self.en.crawl()
        with open(os.path.join(self.base, "output", "review.csv"), "a", encoding="utf-8") as f:
            f.write("L3,ok,,,,,Other Co,https://other.example,A,B,,,,,,,\n")
        with self.assertRaises(SystemExit):
            self.en.crawl()


if __name__ == "__main__":
    unittest.main()
