import { listJobs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json({ jobs: await listJobs({ source: searchParams.get("source") || undefined, search: searchParams.get("search") || undefined, country: searchParams.get("country") || undefined }) });
}
