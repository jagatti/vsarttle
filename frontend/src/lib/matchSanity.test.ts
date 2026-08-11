import assert from "node:assert/strict";
import test from "node:test";
import { passesMatchSanity } from "@/lib/matchSanity";
import type { MatchRecord } from "@/lib/persistenceTypes";
import type { TurnResult } from "@/types/game";

function makeMatch(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    matchId: "match-1",
    playedAt: "2026-08-11T00:00:00.000Z",
    battleMode: "simple",
    source: "multiplayer",
    players: [
      {
        playerId: "player-a",
        nickname: "Alice",
        characterType: "attack",
        stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,aaa",
      },
      {
        playerId: "player-b",
        nickname: "Bob",
        characterType: "magic",
        stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,bbb",
      },
    ],
    winnerId: "player-a",
    turnCount: 2,
    finalHpRatio: 0.4,
    singlePlayResult: null,
    rating: null,
    ...overrides,
  };
}

function makeTurnResults(): Pick<TurnResult, "turn" | "winnerId" | "nextStates">[] {
  return [
    {
      turn: 1,
      winnerId: null,
      nextStates: {
        "player-a": {
          id: "player-a",
          nickname: "Alice",
          imageDataUrl: "",
          stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
          characterType: "attack",
          currentHp: 90,
          currentPp: 30,
          chargeMultiplier: 1,
          lastActionCategory: null,
        },
        "player-b": {
          id: "player-b",
          nickname: "Bob",
          imageDataUrl: "",
          stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
          characterType: "magic",
          currentHp: 30,
          currentPp: 20,
          chargeMultiplier: 1,
          lastActionCategory: null,
        },
      },
    },
    {
      turn: 2,
      winnerId: "player-a",
      nextStates: {
        "player-a": {
          id: "player-a",
          nickname: "Alice",
          imageDataUrl: "",
          stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
          characterType: "attack",
          currentHp: 40,
          currentPp: 20,
          chargeMultiplier: 1,
          lastActionCategory: null,
        },
        "player-b": {
          id: "player-b",
          nickname: "Bob",
          imageDataUrl: "",
          stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
          characterType: "magic",
          currentHp: 0,
          currentPp: 10,
          chargeMultiplier: 1,
          lastActionCategory: null,
        },
      },
    },
  ];
}

test("passesMatchSanity accepts consistent multiplayer results", () => {
  assert.equal(passesMatchSanity(makeMatch(), makeTurnResults()), true);
});

test("passesMatchSanity rejects mismatched final hp ratio", () => {
  assert.equal(passesMatchSanity(makeMatch({ finalHpRatio: 0.9 }), makeTurnResults()), false);
});

test("passesMatchSanity accepts singleplay records with a real player", () => {
  const match = makeMatch({
    source: "singleplay",
    players: [makeMatch().players[0]],
    singlePlayResult: { floor: 2, scoreRank: "A", difficulty: "normal" },
    winnerId: "player-a",
    turnCount: 5,
  });
  assert.equal(passesMatchSanity(match), true);
});

test("passesMatchSanity accepts ghostmatch record with seed thumbnail path", () => {
  const match = makeMatch({
    source: "ghostmatch",
    players: [
      makeMatch().players[0],
      {
        ...makeMatch().players[1],
        playerId: null,
        drawingThumbnail: "/arttle_boss/boss1.png",
      },
    ],
    winnerId: "player-a",
    singlePlayResult: null,
  });
  assert.equal(passesMatchSanity(match), true);
});

test("passesMatchSanity rejects ghostmatch with unknown ghost opponent id", () => {
  const match = makeMatch({
    source: "ghostmatch",
    ghostOpponentPlayerId: "missing-player",
    singlePlayResult: null,
  });
  assert.equal(passesMatchSanity(match), false);
});
