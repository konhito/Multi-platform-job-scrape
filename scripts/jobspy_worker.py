"""Direct JobSpy adapter for the dashboard's India software-engineer search."""

import json
import math
import sys
from datetime import date, datetime

from jobspy import scrape_jobs


def value(row, name):
    raw = row.get(name, "")
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return ""
    if isinstance(raw, (datetime, date)):
        return raw.isoformat()
    return str(raw).strip()


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else "indeed"
    term = sys.argv[2] if len(sys.argv) > 2 else "software engineer"
    location = sys.argv[3] if len(sys.argv) > 3 else "India"
    hours_old = int(sys.argv[4]) if len(sys.argv) > 4 else 24
    if source not in {"indeed", "glassdoor", "google"}:
        raise SystemExit("Unsupported JobSpy source")

    if source == "google":
        listings = scrape_jobs(
            site_name=["google"],
            google_search_term=f"{term} jobs in {location} posted in the last day",
            results_wanted=25,
            verbose=0,
        )
    else:
        listings = scrape_jobs(
            site_name=[source],
            search_term=term,
            location=location,
            country_indeed="India",
            hours_old=hours_old,
            results_wanted=25,
            verbose=0,
        )

    jobs = []
    for _, row in listings.fillna("").iterrows():
        url = value(row, "job_url")
        title = value(row, "title")
        company = value(row, "company") or "Unknown"
        if not url or not title:
            continue
        jobs.append({
            "url": url,
            "title": title,
            "company": company,
            "company_logo": value(row, "company_logo"),
            "location": value(row, "location"),
            "description": value(row, "description"),
            "job_type": value(row, "job_type"),
            "date_posted": value(row, "date_posted"),
            "min_amount": value(row, "min_amount"),
            "max_amount": value(row, "max_amount"),
            "currency": value(row, "currency"),
            "interval": value(row, "interval"),
        })
    print(json.dumps(jobs))


if __name__ == "__main__":
    main()
