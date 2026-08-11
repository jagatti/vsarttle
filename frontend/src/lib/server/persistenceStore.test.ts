/**
 * Unit tests for the individual-key persistence store.
 * Uses the /tmp file backend (REDIS_URL not set).
 */
import assert from "node:assert/strict";
import test from "node:test";

// Ensure REDIS_URL is not set so file backend is used
delete process.env.REDIS_URL;

import {
  appendMatchIndexForPlayer,
  ghostPoolEntryToGhostRecord,
  incrPlayerCounter,
  loadGhostPool,
  loadMatch,
  loadMatchIdsByPlayer,
  matchExists,
  saveMatch,
  savePlayer,
  loadPlayer,
  upsertGhostPool,
} from "./persistenceStore.js";

// Unique run prefix to avoid cross-test contamination
const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function pid(suffix: string) { return `${RUN}-${suffix}`; }
function mid(suffix: string) { return `${RUN}-${suffix}`; }

function makeMatch(matchId: string, playerId: string) {
  return {
    matchId,
    playedAt: "2026-08-11T00:00:00.000Z",
    battleMode: "simple" as const,
    source: "multiplayer" as const,
    players: [
      {
        playerId,
        nickname: "Alice",
        characterType: "attack" as const,
        stats: { hp: 100, maxHp: 100, pp: 20, maxPp: 20, attack: 10, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,aaa",
      },
    ],
    winnerId: playerId,
    turnCount: 1,
    finalHpRatio: 0.5,
    singlePlayResult: null,
    rating: null,
  };
}

test("saveMatch and loadMatch round-trip", async () => {
  const mId = mid("save-load");
  const pId = pid("save-load");
  const match = makeMatch(mId, pId);
  await saveMatch(match);
  const loaded = await loadMatch(mId);
  assert.equal(loaded?.matchId, mId);
  assert.equal(loaded?.players[0]?.playerId, pId);
});

test("matchExists returns false when not saved", async () => {
  assert.equal(await matchExists(mid("nonexistent-x9z")), false);
});

test("matchExists returns true after saving", async () => {
  const mId = mid("exists-true");
  await saveMatch(makeMatch(mId, pid("exists-true")));
  assert.equal(await matchExists(mId), true);
});

test("appendMatchIndexForPlayer keeps newest-first and caps at limit", async () => {
  const pId = pid("idx-cap");
  for (let i = 0; i < 55; i++) {
    await appendMatchIndexForPlayer(pId, `${pId}-match-${i}`);
  }
  const ids = await loadMatchIdsByPlayer(pId);
  assert.equal(ids.length, 50);
  assert.equal(ids[0], `${pId}-match-54`); // newest first
});

test("savePlayer and loadPlayer round-trip", async () => {
  const pId = pid("player-rt");
  const player = {
    playerId: pId, nickname: "Test", wins: 3, losses: 1, draws: 0,
    currentStreak: 2, bestStreak: 3,
    typeUsageCount: { attack: 1, magic: 0, defense: 0, balanced: 0 },
    singlePlay: {
      normal: { bestFloorCleared: 2, bestScoreRank: "B" as const },
      hard: { bestFloorCleared: 0, bestScoreRank: null },
    },
    ghostWins: 0, asGhostBattles: 0, asGhostWins: 0,
    rating: null, updatedAt: "2026-08-11T00:00:00.000Z",
  };
  await savePlayer(player);
  const loaded = await loadPlayer(pId);
  assert.equal(loaded?.wins, 3);
  assert.equal(loaded?.nickname, "Test");
});

test("incrPlayerCounter increments correctly", async () => {
  const pId = pid("incr-basic");
  const v1 = await incrPlayerCounter(pId, "wins");
  const v2 = await incrPlayerCounter(pId, "wins");
  assert.equal(v1, 1);
  assert.equal(v2, 2);
});

test("upsertGhostPool keeps at most 2 entries per player", async () => {
  const stats = { hp: 100, maxHp: 100, pp: 20, maxPp: 20, attack: 10, defense: 10, speed: 5, evasion: 0.1 };
  const pA = pid("ghost-capa");

  for (let i = 0; i < 3; i++) {
    await upsertGhostPool({
      ownerPlayerId: pA,
      matchId: `${pA}-m${i}`,
      nickname: "A",
      characterType: "attack",
      stats,
      drawingThumbnail: "data:image/png;base64,x",
    });
  }
  const pool = await loadGhostPool();
  const forA = pool.filter((e) => e.ownerPlayerId === pA);
  assert.ok(forA.length <= 2, `Expected ≤2 entries for player-a, got ${forA.length}`);
});

test("ghostPoolEntryToGhostRecord maps source=archive", () => {
  const stats = { hp: 100, maxHp: 100, pp: 20, maxPp: 20, attack: 10, defense: 10, speed: 5, evasion: 0.1 };
  const entry = {
    ownerPlayerId: "p1", matchId: "m1", nickname: "X",
    characterType: "magic", stats, drawingThumbnail: "data:image/png;base64,z",
  };
  const record = ghostPoolEntryToGhostRecord(entry);
  assert.equal(record.source, "archive");
  assert.equal(record.ownerPlayerId, "p1");
  assert.equal(record.characterType, "magic");
});

