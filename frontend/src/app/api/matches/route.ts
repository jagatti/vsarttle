import { NextResponse } from "next/server";
import { passesMatchSanity, validateMatchReasonString } from "@/lib/matchSanity";
import { applyMatchToPlayerRecords } from "@/lib/playerRecords";
import type { MatchRecord, PlayerRecord } from "@/lib/persistenceTypes";
import { createEmptyPlayerRecord } from "@/lib/persistenceTypes";
import {
  appendMatchIndexForPlayer,
  getStorageBackend,
  incrPlayerCounter,
  loadPlayer,
  matchExists,
  saveMatch,
  savePlayer,
  upsertGhostPool,
} from "@/lib/server/persistenceStore";
import { checkRateLimit } from "@/lib/server/rateLimit";
import type { MatchSubmissionPayload } from "@/lib/persistenceTypes";

export async function POST(request: Request) {
  const payload = await request.json() as MatchSubmissionPayload;
  const reporterId = payload.match.players.find((player) => player.playerId)?.playerId ?? "anonymous";
  if (!checkRateLimit(`matches:${reporterId}`, 12, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!passesMatchSanity(payload.match, payload.turnResults)) {
    const reason = validateMatchReasonString(payload.match, payload.turnResults);
    console.error(`[matches] sanity check failed: ${reason}`, { matchId: payload.match.matchId });
    return NextResponse.json({ error: "invalid_match", reason }, { status: 400 });
  }

  if (await matchExists(payload.match.matchId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await saveMatch(payload.match);

  // Update player indices and records
  const { match } = payload;
  await updatePlayersAndIndices(match);

  // Maintain ghost pool for archive ghosts (skip ghost opponent side)
  const ghostOpponentId = match.source === "ghostmatch" ? (match.ghostOpponentPlayerId ?? null) : null;
  for (const player of match.players) {
    if (!player.playerId) continue;
    if (player.playerId === ghostOpponentId) continue;
    await upsertGhostPool({
      ownerPlayerId: player.playerId,
      matchId: match.matchId,
      nickname: player.nickname,
      characterType: player.characterType,
      stats: player.stats,
      drawingThumbnail: player.drawingThumbnail,
    });
  }

  return NextResponse.json({ ok: true, storageBackend: getStorageBackend() });
}

async function updatePlayersAndIndices(match: MatchRecord): Promise<void> {
  const ghostOpponentId = match.source === "ghostmatch" ? (match.ghostOpponentPlayerId ?? null) : null;

  for (const player of match.players) {
    if (!player.playerId) continue;
    const playerId = player.playerId;

    // Update match index
    await appendMatchIndexForPlayer(playerId, match.matchId);

    // Load or create player record (for non-counter fields)
    const existing = (await loadPlayer(playerId)) ?? createEmptyPlayerRecord(playerId, player.nickname, match.playedAt);

    // Build updated record using applyMatchToPlayerRecords (handles streak, singlePlay, etc.)
    const updatedPlayers = applyMatchToPlayerRecords({ [playerId]: existing }, match);
    const updated = updatedPlayers[playerId];
    if (!updated) continue;

    // For multiplayer / ghostmatch counters use INCR for atomic increment, then patch
    if (match.source === "multiplayer") {
      let wins = updated.wins;
      let losses = updated.losses;
      let draws = updated.draws;
      if (match.winnerId === null) {
        draws = await incrPlayerCounter(playerId, "draws");
      } else if (match.winnerId === playerId) {
        wins = await incrPlayerCounter(playerId, "wins");
      } else {
        losses = await incrPlayerCounter(playerId, "losses");
      }
      const saved: PlayerRecord = { ...updated, wins, losses, draws };
      await savePlayer(saved);
    } else if (match.source === "ghostmatch") {
      const isGhostOpponent = ghostOpponentId !== null && playerId === ghostOpponentId;
      let asGhostBattles = updated.asGhostBattles;
      let asGhostWins = updated.asGhostWins;
      let ghostWins = updated.ghostWins;
      if (isGhostOpponent) {
        asGhostBattles = await incrPlayerCounter(playerId, "asGhostBattles");
        if (match.winnerId === playerId) {
          asGhostWins = await incrPlayerCounter(playerId, "asGhostWins");
        }
      } else if (match.winnerId === playerId) {
        ghostWins = await incrPlayerCounter(playerId, "ghostWins");
      }
      await savePlayer({ ...updated, asGhostBattles, asGhostWins, ghostWins });
    } else {
      await savePlayer(updated);
    }
  }
}
