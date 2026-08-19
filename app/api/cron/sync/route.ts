import { processQueuedRetries, syncJobSpy, syncLinkedIn, syncRemotive, syncWellfound } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = process.env.CRON_SECRET;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return new Response("Unauthorized", { status: 401 });
  const [retries, results] = await Promise.all([processQueuedRetries(), Promise.all([syncRemotive(), syncLinkedIn(), syncWellfound(), syncJobSpy("indeed"), syncJobSpy("glassdoor"), syncJobSpy("google")])]);
  return Response.json({ retries, results }, { status: results.every((result) => result.status === "completed") ? 200 : 502 });
}
