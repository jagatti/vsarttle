import { NextResponse } from "next/server";
import { createEmptyPlayerRecord, normalizeNickname } from "@/lib/persistenceTypes";
import {
  getStorageBackend,
  loadPlayer,
  loadRecentMatchesByPlayer,
  savePlayer,
} from "@/lib/server/persistenceStore";
import { checkRateLimit } from "@/lib/server/rateLimit";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!checkRateLimit(`players:get:${id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const player = (await loadPlayer(id)) ?? createEmptyPlayerRecord(id, "プレイヤー", new Date().toISOString());
  const recentMatches = (await loadRecentMatchesByPlayer(id, 10)).filter(
    (match) => match.source === "multiplayer",
  );

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

  const now = new Date().toISOString();
  const existing = await loadPlayer(id);
  const player = {
    ...(existing ?? createEmptyPlayerRecord(id, body.nickname, now)),
    nickname: normalizeNickname(body.nickname),
    updatedAt: now,
  };

  await savePlayer(player);
  return NextResponse.json({ player, storageBackend: getStorageBackend() });
}
