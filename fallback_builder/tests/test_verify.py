"""Verification rules. Fictional names only."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from builder.verify import email_pattern, linkedin_level, name_parts  # noqa: E402


class Verify(unittest.TestCase):
    def test_email_patterns(self):
        f, l_ = name_parts("Dana", "Whitfield")
        self.assertEqual(email_pattern("dana.whitfield", f, l_), "first.last")
        self.assertEqual(email_pattern("dwhitfield", f, l_), "flast")
        self.assertEqual(email_pattern("dana", f, l_), "first")
        self.assertEqual(email_pattern("sales", f, l_), "")

    def test_linkedin_levels(self):
        f, l_ = name_parts("Dana", "Whitfield")
        self.assertEqual(linkedin_level("https://www.linkedin.com/in/dana-whitfield-12ab", f, l_), "name_match")
        self.assertEqual(linkedin_level("https://www.linkedin.com/in/dwhitfield", f, l_), "name_match")
        self.assertEqual(linkedin_level("https://www.linkedin.com/in/danwhi", f, l_), "partial_match")
        self.assertEqual(linkedin_level("https://www.linkedin.com/in/hammock20", f, l_), "no_name_match")
        self.assertEqual(linkedin_level("https://www.linkedin.com/in/acoaaabcdef", f, l_), "internal_id")
        f, l_ = name_parts("José", "Núñez")
        self.assertEqual(linkedin_level("https://www.linkedin.com/in/jose-nunez", f, l_), "name_match")


if __name__ == "__main__":
    unittest.main()
