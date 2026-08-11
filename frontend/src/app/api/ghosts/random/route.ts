import { NextResponse } from "next/server";
import { pickRandomGhost } from "@/lib/ghosts";
import { loadPersistenceSnapshot } from "@/lib/server/persistenceStore";
import { checkRateLimit } from "@/lib/server/rateLimit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const excludePlayerId = searchParams.get("excludePlayerId")?.trim() || undefined;
  const rateLimitKey = `ghosts:${excludePlayerId ?? "anonymous"}`;
  if (!checkRateLimit(rateLimitKey, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const snapshot = await loadPersistenceSnapshot();
  const ghost = pickRandomGhost(snapshot.matches, { excludePlayerId });
  return NextResponse.json({ ghost });
}
