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
    roguelikeResult: null,
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

test("applyMatchToPlayerRecords records singleplay best floor only after clearing all floors", () => {
  let players = applyMatchToPlayerRecords({}, makeMatch({
    source: "singleplay",
    players: [basePlayers[0]],
    winnerId: "player-a",
    singlePlayResult: { floor: 4, scoreRank: "S", difficulty: "normal" },
  }));
  assert.equal(players["player-a"].singlePlay.normal.bestFloorCleared, 4);
  assert.equal(players["player-a"].singlePlay.normal.bestScoreRank, null);

  players = applyMatchToPlayerRecords(players, makeMatch({
    source: "singleplay",
    players: [basePlayers[0]],
    winnerId: "player-a",
    singlePlayResult: { floor: 5, scoreRank: "S", difficulty: "normal" },
  }));
  assert.equal(players["player-a"].singlePlay.normal.bestFloorCleared, 5);
  assert.equal(players["player-a"].singlePlay.normal.bestScoreRank, "S");
  assert.equal(players["player-a"].singlePlay.hard.bestFloorCleared, 0);
  assert.equal(players["player-a"].singlePlay.hard.bestScoreRank, null);
});

test("applyMatchToPlayerRecords tracks ghost counters separately from multiplayer record", () => {
  const players = applyMatchToPlayerRecords({}, makeMatch({
    source: "ghostmatch",
    winnerId: "player-b",
    ghostOpponentPlayerId: "player-b",
  }));
  assert.equal(players["player-a"].wins, 0);
  assert.equal(players["player-a"].losses, 0);
  assert.equal(players["player-a"].ghostWins, 0);
  assert.equal(players["player-b"].asGhostBattles, 1);
  assert.equal(players["player-b"].asGhostWins, 1);
});


test("applyMatchToPlayerRecords tracks roguelike best floor reached", () => {
  let players = applyMatchToPlayerRecords({}, makeMatch({
    source: "roguelike",
    players: [basePlayers[0]],
    winnerId: "rl-enemy-8",
    roguelikeResult: { floorReached: 8, cleared: false },
  }));
  assert.equal(players["player-a"].roguelike.bestFloorReached, 8);

  players = applyMatchToPlayerRecords(players, makeMatch({
    source: "roguelike",
    players: [basePlayers[0]],
    winnerId: "player-a",
    roguelikeResult: { floorReached: 20, cleared: true },
  }));
  assert.equal(players["player-a"].roguelike.bestFloorReached, 20);
});
