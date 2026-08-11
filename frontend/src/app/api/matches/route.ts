import { NextResponse } from "next/server";
import { passesMatchSanity } from "@/lib/matchSanity";
import { applyMatchToPlayerRecords } from "@/lib/playerRecords";
import type { MatchSubmissionPayload } from "@/lib/persistenceTypes";
import { loadPersistenceSnapshot, savePersistenceSnapshot } from "@/lib/server/persistenceStore";
import { checkRateLimit } from "@/lib/server/rateLimit";

export async function POST(request: Request) {
  const payload = await request.json() as MatchSubmissionPayload;
  const reporterId = payload.match.players.find((player) => player.playerId)?.playerId ?? "anonymous";
  if (!checkRateLimit(`matches:${reporterId}`, 12, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!passesMatchSanity(payload.match, payload.turnResults)) {
    return NextResponse.json({ error: "invalid_match" }, { status: 400 });
  }

  const snapshot = await loadPersistenceSnapshot();
  if (snapshot.matches.some((match) => match.matchId === payload.match.matchId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const matches = [...snapshot.matches, payload.match].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const players = applyMatchToPlayerRecords(snapshot.players, payload.match);
  await savePersistenceSnapshot({ matches, players });
  return NextResponse.json({ ok: true });
}
