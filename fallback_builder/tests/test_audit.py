"""Run from fallback_builder/:  python -m unittest discover -s tests -v
Fixtures are invented; no real lead data in tests."""

import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from builder import normalize as n  # noqa: E402
from builder.audit import audit_file  # noqa: E402
from builder.cli import load_config  # noqa: E402
from builder.schema import OUTPUT_COLUMNS  # noqa: E402

CONFIG = load_config(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.toml"))
HEAD = ["Lead ID", "Contact Name", "Company", "Title", "Email", "Phone", "Headcount", "Industry", "Location", "Website", "LinkedIn URL"]


def run(rows):
    d = tempfile.mkdtemp()
    src = os.path.join(d, "in.csv")
    with open(src, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEAD)
        w.writerows(rows)
    audit_file(src, os.path.join(d, "out"), CONFIG)
    read = lambda name: list(csv.DictReader(open(os.path.join(d, "out", name), encoding="utf-8-sig")))  # noqa: E731
    return read("leads.csv"), read("review.csv")


class Normalizers(unittest.TestCase):
    def test_names(self):
        self.assertEqual(n.split_name("jose de soto garcia")[:2], ("Jose", "de Soto Garcia"))
        self.assertEqual(n.split_name("Mary Ann Cruz")[:2], ("Mary Ann", "Cruz"))
        self.assertEqual(n.split_name("Eduardo Reyes III")[:2], ("Eduardo", "Reyes"))
        self.assertIn("partial_last_name", n.split_name("Raymond B.")[2])

    def test_phones(self):
        self.assertEqual(n.normalize_phone("+1 (512) 555-0147")[0], "+15125550147")
        self.assertEqual(n.normalize_phone("+639171234567")[0], "+639171234567")
        self.assertEqual(n.normalize_phone("+6391712345678")[0], "")  # 11 digits after +63
        self.assertEqual(n.normalize_phone("+4407700900123")[0], "+447700900123")  # trunk 0 removed
        self.assertEqual(n.normalize_phone("5125550147")[2], ["phone_no_country_code"])

    def test_domains(self):
        self.assertTrue(n.domains_match("taskus.ph", "taskus.com", {}))
        self.assertTrue(n.domains_match("ibexglobal.com", "ibex.co", {}))
        self.assertTrue(n.domains_match("aero.example.com", "example.com", {}))
        self.assertFalse(n.domains_match("othercorp.com", "example.com", {}))
        self.assertEqual(n.registrable("www.shop.example.com.au"), "example.com.au")

    def test_locations(self):
        self.assertEqual(n.normalize_location("None, NCR, PH")[0], "NCR, PH")
        self.assertEqual(n.normalize_location("manila, PH")[0], "Manila, PH")
        self.assertEqual(n.normalize_location("Egypt, US")[0], "")

    def test_company_vs_website(self):
        self.assertTrue(n.company_matches_website("Bristol Myers Squibb", "bms.com"))
        self.assertTrue(n.company_matches_website("TP", "teleperformance.com"))
        self.assertTrue(n.company_matches_website("[24]7.ai", "247-inc.com"))
        self.assertTrue(n.company_matches_website("Brightline Contact Centers", "brightlinecx.com"))
        self.assertFalse(n.company_matches_website("Private Duty Nurses", "kmc.solutions"))
        self.assertFalse(n.company_matches_website("Smart Group", "acquirebpo.com"))

    def test_linkedin(self):
        self.assertEqual(n.normalize_linkedin("linkedin.com/in/jane-doe/")[0], "https://www.linkedin.com/in/jane-doe")
        self.assertIn("linkedin_internal_id", n.normalize_linkedin("https://www.linkedin.com/in/acoaaabcdef")[1])

    def test_levels(self):
        self.assertEqual(n.decision_level("VP of Operations"), "decision-maker")
        self.assertEqual(n.decision_level("Team Lead"), "manager")
        self.assertEqual(n.decision_level("Data Entry Executive"), "individual contributor")


class Pipeline(unittest.TestCase):
    def test_schema_and_cleaning(self):
        leads, review = run([
            ["L1", "Dana Whitfield", "Brightline CX", "VP of Operations", "dana@brightlinecx.com", "+1 (512) 555-0147", "501-1000", "Outsourcing", "Austin, TX, US", "https://brightlinecx.com", "https://www.linkedin.com/in/dana-demo"],
            ["L2", "Dana Whitfield", "Brightline CX", "VP of Operations", "dana@brightlinecx.com", "+1 (512) 555-0147", "501-1000", "Outsourcing", "Austin, TX, US", "https://brightlinecx.com", ""],
            ["L3", "Owen Calloway", "Lumen Bay", "Director", "owen@oldemployer.com", "+1 (415) 555-0100", "65 seats", "BPO", "Egypt, US", "https://lumenbay.com", ""],
            ["L4", "Rhea Marchetti", "Northgate", "COO", "rhea@gmail.com", "+1 (415) 555-0100", "", "Staffing", "Chicago, IL, US", "https://northgate.com", ""],
            ["L5", "Theo Ash", "Tidewater", "CEO", "theo@tidewater.com", "+1 (415) 555-0100", "", "BPO", "Norfolk, VA, US", "https://tidewater.com", ""],
        ])
        self.assertEqual(list(leads[0].keys()), OUTPUT_COLUMNS)
        self.assertEqual(len(leads), 4)  # L2 duplicate removed
        self.assertEqual(review[1]["Status"], "remove (duplicate)")
        owen = next(r for r in leads if r["First Name"] == "Owen")
        self.assertEqual(owen["Email"], "")  # past-employer email blanked
        self.assertEqual(owen["Phone Number"], "")  # shared by 3 companies
        self.assertEqual(owen["Locations"], "")  # Egypt, US conflict
        self.assertEqual(owen["Number of Seats"], "65")
        rhea = next(r for r in review if r["Record ID"] == "L4")
        self.assertEqual(rhea["Original Email"], "rhea@gmail.com")
        dana = leads[0]
        self.assertEqual((dana["Email"], dana["Phone Number"], dana["Number of Seats"]), ("dana@brightlinecx.com", "+15125550147", ""))


if __name__ == "__main__":
    unittest.main()
