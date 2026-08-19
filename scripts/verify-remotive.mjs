import assert from "node:assert/strict";

const response = await fetch("https://remotive.com/api/remote-jobs?category=software-dev&limit=3", { signal: AbortSignal.timeout(15_000) });
assert.equal(response.ok, true, `Remotive returned ${response.status}`);
const body = await response.json();
assert.ok(Array.isArray(body.jobs) && body.jobs.length > 0, "Expected live Remotive jobs");
for (const job of body.jobs) assert.ok(job.id && job.title && job.company_name && job.url, "Expected stable job identity and display fields");
console.log(`Verified ${body.jobs.length} live Remotive listings.`);
