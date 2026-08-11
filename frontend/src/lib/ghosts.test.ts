import assert from "node:assert/strict";
import test from "node:test";
import { listArchiveGhosts, pickRandomGhost } from "@/lib/ghosts";
import type { MatchRecord } from "@/lib/persistenceTypes";

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
    rating: null,
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
