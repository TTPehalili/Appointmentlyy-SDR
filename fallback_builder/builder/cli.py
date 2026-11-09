"""Command line: python -m builder.cli audit "path/to/leads.csv"

Run from the fallback_builder folder.
"""

import argparse
import os
import sys
import tomllib

from .audit import audit_file
from .enrich import Enricher
from .verify import verify
from . import leadocean as lo

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_config(path: str) -> dict:
    with open(path, "rb") as f:
        return tomllib.load(f)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="builder", description="Lead list fallback builder")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("audit", help="Check and clean a lead file you already hold (offline)")
    a.add_argument("source", help="CSV export to audit")
    a.add_argument("--out", default=os.path.join(HERE, "output"), help="Output folder (default: output/)")
    a.add_argument("--config", default=os.path.join(HERE, "config.toml"))
    e = sub.add_parser("enrich", help="Check each company's own website and fill blank cells (resumable)")
    e.add_argument("--limit", type=int, default=0, help="Only check this many new companies (trial run)")
    e.add_argument("--workers", type=int, default=0)
    e.add_argument("--reset", action="store_true", help="Forget progress and start over")
    e.add_argument("--force", action="store_true", help="Resume even though the lead file changed")
    e.add_argument("--config", default=os.path.join(HERE, "config.toml"))
    s = sub.add_parser("status", help="Show enrichment progress")
    s.add_argument("--config", default=os.path.join(HERE, "config.toml"))
    b = sub.add_parser("assemble", help="Rebuild the enriched files from saved results (no network)")
    b.add_argument("--config", default=os.path.join(HERE, "config.toml"))
    v = sub.add_parser("verify", help="Check emails (mail servers, company format, website) and LinkedIn URLs")
    v.add_argument("--config", default=os.path.join(HERE, "config.toml"))
    lo_p = sub.add_parser("leadocean", help="Verify BPO decision-makers through LeadOcean /v1/enrich (uses credits)")
    lo_p.add_argument("--limit", type=int, default=0, help="Only this many leads (e.g. 5 for a test)")
    lo_p.add_argument("--delay", type=float, default=1.0, help="Seconds between calls")
    args = p.parse_args(argv)

    if args.cmd == "leadocean":
        import csv as _csv
        src = os.path.join(HERE, "output", "enriched_review.csv")
        rows = list(_csv.DictReader(open(src, encoding="utf-8-sig")))
        sel = [r for r in rows if r["ICP Fit"] == "BPO / outsourcing" and r["Decision Level"] == "decision-maker"
               and r["LinkedIn Profile link"]]
        if args.limit:
            sel = sel[:args.limit]
        try:
            key = lo.load_key(os.path.dirname(HERE))
            r = lo.run(os.path.join(HERE, "state"), key, sel, args.delay,
                       lambda i, t, rid, http: print(f"  [{i}/{t}] {rid}: HTTP {http}", flush=True))
        except lo.LeadOceanError as e:
            print(f"Stopped: {e}", file=sys.stderr)
            return 1
        print(f"{r['done']} of {len(sel)} selected leads have a LeadOcean result ({r['called']} new calls this run)")
        return 0

    if args.cmd == "verify":
        r = verify(HERE)
        c = r["counts"]
        total = r["rows"]
        print(f"Checked {total} rows ({r['formats']} company email formats learned)")
        print(f"  emails verified: {c['email:verified_by_leadocean'] + c['email:published_on_website']}"
              f"  (LeadOcean mailbox {c['email:verified_by_leadocean']}, on company website {c['email:published_on_website']})"
              f"; likely (format match) {c['email:domain_and_format']}"
              f"; unconfirmed {c['email:domain_ok'] + c['email:domain_unknown']}; invalid {c['email:domain_rejects_mail']};"
              f" none {c['email:none']}")
        print(f"  LinkedIn verified: {c['linkedin:verified_by_leadocean'] + c['linkedin:linked_from_website'] + c['linkedin:name_match']}"
              f"  (from website {c['linkedin:linked_from_website']}, name match {c['linkedin:name_match']})"
              f"; partial {c['linkedin:partial_match']}; internal ID {c['linkedin:internal_id']};"
              f" custom URL (no name) {c['linkedin:no_name_match']}")
        if c["leadocean_checked"]:
            print(f"  LeadOcean-checked leads: {c['leadocean_checked']}  (verified mailbox: {c['email:verified_by_leadocean']},"
                  f" not verified: {c['email:leadocean_not_verified']}, current employer differs: {c['employer_changed']})")
        print(f"  rows with BOTH a verified email and a verified LinkedIn: {c['both_verified']}")
        print("Wrote verified_leads.csv and verification_report.csv")
        return 0

    if args.cmd == "audit":
        if not os.path.isfile(args.source):
            print(f"Source file not found: {args.source}", file=sys.stderr)
            return 2
        result = audit_file(args.source, args.out, load_config(args.config))
        c = result["counts"]
        print(f"Read {result['rows_in']} rows -> {result['rows_out']} unique leads")
        print(f"  ok: {c['status:ok']}   review: {c['status:review']}   duplicates removed: {c['status:remove (duplicate)']}")
        print(f"Wrote leads.csv, review.csv and audit_summary.md to {args.out}")
    if args.cmd in ("enrich", "status", "assemble"):
        en = Enricher(HERE, load_config(args.config))
        if args.cmd == "enrich":
            def show(i, total, key, status):
                print(f"  [{i}/{total}] {key}: {status}", flush=True)
            try:
                r = en.crawl(args.limit, args.workers, args.reset, args.force, show)
            except KeyboardInterrupt:
                print("Stopped. Run the same command again to resume.")
                return 130
            print(f"Checked {r['crawled_now']} companies; {r['remaining']} of {r['companies']} still to check.")
        if args.cmd == "status":
            leads = en.load_leads()
            comps = en.companies(leads)
            import json as _j
            prog = _j.load(open(en.progress_path, encoding="utf-8")) if os.path.exists(en.progress_path) else {"done": {}}
            from collections import Counter as _C
            print(f"{len(prog['done'])} of {len(comps)} companies checked")
            for k, v in _C(prog["done"].values()).most_common():
                print(f"  {k}: {v}")
            return 0
        a = en.assemble()
        c = a["counts"]
        print(f"Wrote enriched_leads.csv ({a['rows']} rows), enriched_review.csv and sources.csv")
        print(f"  websites checked: {a['checked']} of {a['companies']}  " + ", ".join(f"{k}: {v}" for k, v in a["statuses"].most_common()))
        print("  filled: " + ", ".join(f"{k[7:]} {v}" for k, v in sorted(c.items()) if k.startswith("filled:")))
        print(f"  contacts confirmed on their company website: {c['verified_on_site']}")
        print(f"  new decision-makers found: {c['new_decision_makers']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
