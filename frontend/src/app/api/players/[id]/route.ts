import { NextResponse } from "next/server";
import { createEmptyPlayerRecord, normalizeNickname } from "@/lib/persistenceTypes";
import { loadPersistenceSnapshot, savePersistenceSnapshot, getStorageBackend } from "@/lib/server/persistenceStore";
import { checkRateLimit } from "@/lib/server/rateLimit";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!checkRateLimit(`players:get:${id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const snapshot = await loadPersistenceSnapshot();
  const player = snapshot.players[id] ?? createEmptyPlayerRecord(id, "プレイヤー", new Date().toISOString());
  const recentMatches = snapshot.matches
    .filter((match) => match.source === "multiplayer" && match.players.some((entry) => entry.playerId === id))
    .slice(0, 10);

  return NextResponse.json({
    player,
    recentMatches,
    storageBackend: getStorageBackend(),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!checkRateLimit(`players:patch:${id}`, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json() as { nickname?: string };
  if (typeof body.nickname !== "string") {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }

  const snapshot = await loadPersistenceSnapshot();
  const now = new Date().toISOString();
  const player = {
    ...(snapshot.players[id] ?? createEmptyPlayerRecord(id, body.nickname, now)),
    nickname: normalizeNickname(body.nickname),
    updatedAt: now,
  };

  await savePersistenceSnapshot({
    ...snapshot,
    players: {
      ...snapshot.players,
      [id]: player,
    },
  });

  return NextResponse.json({ player, storageBackend: getStorageBackend() });
}
