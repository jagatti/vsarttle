import assert from "node:assert/strict";
import test from "node:test";
import { listArchiveGhosts, pickRandomGhost, pickRandomGhostFromPool } from "@/lib/ghosts";
import type { MatchRecord } from "@/lib/persistenceTypes";
import type { GhostPoolEntry } from "@/lib/server/persistenceStore";

function makeMatch(playerId: string, nickname: string): MatchRecord {
  return {
    matchId: `match-${playerId}`,
    playedAt: "2026-08-11T00:00:00.000Z",
    battleMode: "simple",
    source: "multiplayer",
    players: [
      {
        playerId,
        nickname,
        characterType: "attack",
        stats: { hp: 100, maxHp: 100, pp: 20, maxPp: 20, attack: 10, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,aaa",
      },
    ],
    winnerId: playerId,
    turnCount: 1,
    finalHpRatio: 0.5,
    singlePlayResult: null,
    roguelikeResult: null,
    rating: null,
  };
}

function makePoolEntry(ownerPlayerId: string, matchId: string): GhostPoolEntry {
  return {
    ownerPlayerId,
    matchId,
    nickname: ownerPlayerId,
    characterType: "attack",
    stats: { hp: 100, maxHp: 100, pp: 20, maxPp: 20, attack: 10, defense: 10, speed: 5, evasion: 0.1 },
    drawingThumbnail: "data:image/png;base64,aaa",
  };
}

test("listArchiveGhosts excludes the specified player", () => {
  const ghosts = listArchiveGhosts([makeMatch("me", "Me"), makeMatch("other", "Other")], "me");
  assert.equal(ghosts.length, 1);
  assert.equal(ghosts[0]?.ownerPlayerId, "other");
});

test("pickRandomGhost falls back to seed ghosts when archive is sparse", () => {
  const ghost = pickRandomGhost([makeMatch("other", "Other")], { random: () => 0 });
  assert.equal(ghost.source, "seed");
});

test("pickRandomGhost uses archive ghosts when enough records exist", () => {
  const ghost = pickRandomGhost(
    [makeMatch("a", "A"), makeMatch("b", "B"), makeMatch("c", "C")],
    { random: () => 0.5 },
  );
  assert.equal(ghost.source, "archive");
  assert.ok(["a", "b", "c"].includes(ghost.ownerPlayerId ?? ""));
});

test("pickRandomGhostFromPool falls back to seed when pool is sparse", () => {
  const ghost = pickRandomGhostFromPool([makePoolEntry("a", "m1"), makePoolEntry("b", "m2")], { random: () => 0 });
  assert.equal(ghost.source, "seed");
});

test("pickRandomGhostFromPool uses pool when enough entries", () => {
  const pool = [makePoolEntry("a", "m1"), makePoolEntry("b", "m2"), makePoolEntry("c", "m3")];
  const ghost = pickRandomGhostFromPool(pool, { random: () => 0 });
  assert.equal(ghost.source, "archive");
  assert.ok(["a", "b", "c"].includes(ghost.ownerPlayerId ?? ""));
});

test("pickRandomGhostFromPool excludes specified player", () => {
  const pool = [makePoolEntry("me", "m1"), makePoolEntry("other", "m2"), makePoolEntry("another", "m3")];
  const ghost = pickRandomGhostFromPool(pool, { excludePlayerId: "me", random: () => 0 });
  assert.notEqual(ghost.ownerPlayerId, "me");
});


