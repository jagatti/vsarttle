import assert from "node:assert/strict";
import test from "node:test";
import { applyMatchToPlayerRecords } from "@/lib/playerRecords";
import type { MatchRecord } from "@/lib/persistenceTypes";

const basePlayers = [
  {
    playerId: "player-a",
    nickname: "Alice",
    characterType: "attack",
    stats: { hp: 100, maxHp: 100, pp: 10, maxPp: 10, attack: 10, defense: 10, speed: 5, evasion: 0.1 },
    drawingThumbnail: "data:image/png;base64,aaa",
  },
  {
    playerId: "player-b",
    nickname: "Bob",
    characterType: "magic",
    stats: { hp: 100, maxHp: 100, pp: 10, maxPp: 10, attack: 10, defense: 10, speed: 5, evasion: 0.1 },
    drawingThumbnail: "data:image/png;base64,bbb",
  },
] as const;

function makeMatch(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    matchId: "match-1",
    playedAt: "2026-08-11T00:00:00.000Z",
    battleMode: "simple",
    source: "multiplayer",
    players: [...basePlayers],
    winnerId: "player-a",
    turnCount: 3,
    finalHpRatio: 0.2,
    singlePlayResult: null,
    rating: null,
    ...overrides,
  };
}

test("applyMatchToPlayerRecords updates wins losses and streaks", () => {
  const players = applyMatchToPlayerRecords({}, makeMatch());
  assert.equal(players["player-a"].wins, 1);
  assert.equal(players["player-a"].currentStreak, 1);
  assert.equal(players["player-a"].bestStreak, 1);
  assert.equal(players["player-b"].losses, 1);
  assert.equal(players["player-b"].currentStreak, 0);
});

test("applyMatchToPlayerRecords records singleplay best floor and rank", () => {
  const players = applyMatchToPlayerRecords({}, makeMatch({
    source: "singleplay",
    players: [basePlayers[0]],
    winnerId: "player-a",
    singlePlayResult: { floor: 4, scoreRank: "S" },
  }));
  assert.equal(players["player-a"].singlePlay.bestFloorCleared, 4);
  assert.equal(players["player-a"].singlePlay.bestScoreRank, "S");
});
