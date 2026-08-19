import json
import math
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from jobspy import scrape_jobs


def value(row, name):
    raw = row.get(name, "")
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return ""
    if isinstance(raw, (datetime, date)):
        return raw.isoformat()
    return str(raw).strip()


def fetch(source, term, location, hours_old):
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
        if not url or not title:
            continue
        jobs.append({
            "url": url,
            "title": title,
            "company": value(row, "company") or "Unknown",
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
    return jobs


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        source = query.get("source", ["indeed"])[0]
        if source not in {"indeed", "glassdoor", "google"}:
            self._send(400, {"error": "Unsupported JobSpy source."})
            return
        try:
            jobs = fetch(
                source,
                query.get("keywords", ["software engineer"])[0],
                query.get("location", ["India"])[0],
                max(1, int(query.get("hoursOld", ["24"])[0])),
            )
            self._send(200, jobs)
        except Exception as error:
            self._send(502, {"error": str(error)})

    def do_POST(self):
        self.do_GET()

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
