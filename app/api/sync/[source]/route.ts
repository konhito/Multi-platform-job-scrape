import { syncJobSpy, syncLinkedIn, syncRemotive, syncWellfound } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const query = new URL(request.url).searchParams;
  const lookback = Number(query.get("lookback"));
  const keywords = query.get("keywords") || undefined;
  const location = query.get("location") || undefined;
  const validLookback = [86_400, 604_800, 2_592_000].includes(lookback) ? lookback : 86_400;
  const workerUrl = new URL("/api/jobspy", request.url).toString();
  const sync = source === "remotive" ? () => syncRemotive(keywords) : source === "linkedin" ? () => syncLinkedIn(keywords, location, validLookback) : source === "wellfound" ? () => syncWellfound(keywords) : source === "indeed" || source === "glassdoor" || source === "google" ? () => syncJobSpy(source, keywords, validLookback, workerUrl) : null;
  if (!sync) return Response.json({ error: "Unknown source." }, { status: 404 });
  const result = await sync();
  return Response.json(result, { status: result.status === "completed" ? 200 : 502 });
}
