import { listRetryQueue, queueSourceFailure } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  if (source !== "linkedin") return Response.json({ error: "Unknown source." }, { status: 404 });
  return Response.json({ retries: await listRetryQueue(source) });
}

export async function POST(request: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const { statusCode } = await request.json().catch(() => ({})) as { statusCode?: number };
  if (source !== "linkedin" || statusCode !== 403 && statusCode !== 404 && statusCode !== 429) return Response.json({ error: "Choose 403, 404, or 429." }, { status: 400 });
  return Response.json({ retry: await queueSourceFailure(source, statusCode) });
}
