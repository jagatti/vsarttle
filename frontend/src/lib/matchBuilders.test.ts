import assert from "node:assert/strict";
import test from "node:test";
import { remapTurnResultsToPersistentIds } from "@/lib/matchBuilders";
import { passesMatchSanity } from "@/lib/matchSanity";
import type { MatchRecord } from "@/lib/persistenceTypes";
import type { TurnResult } from "@/types/game";

function makeState(hp: number) {
  return {
    currentHp: hp,
    characterType: "attack" as const,
    stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
    imageDataUrl: "data:image/png;base64,aaa",
    actions: [],
    currentPp: 40,
    buffs: {},
    tieBanIds: [],
    voidmination: false,
  };
}

const SESSION_A = "peer-session-aaa";
const SESSION_B = "peer-session-bbb";
const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

const idMap: Record<string, string> = { [SESSION_A]: UUID_A, [SESSION_B]: UUID_B };

function makeTurnResult(turn: number, winnerId: string | null): Pick<TurnResult, "turn" | "winnerId" | "nextStates"> {
  return {
    turn,
    winnerId,
    nextStates: {
      [SESSION_A]: makeState(80),
      [SESSION_B]: makeState(winnerId === null ? 40 : 0),
    },
  };
}

test("remapTurnResultsToPersistentIds: remaps winnerId from session to persistent ID", () => {
  const turns = [makeTurnResult(1, SESSION_A)];
  const remapped = remapTurnResultsToPersistentIds(turns, idMap);
  assert.equal(remapped[0].winnerId, UUID_A);
});

test("remapTurnResultsToPersistentIds: remaps null winnerId unchanged", () => {
  const turns = [makeTurnResult(1, null)];
  const remapped = remapTurnResultsToPersistentIds(turns, idMap);
  assert.equal(remapped[0].winnerId, null);
});

test("remapTurnResultsToPersistentIds: remaps nextStates keys", () => {
  const turns = [makeTurnResult(1, SESSION_A)];
  const remapped = remapTurnResultsToPersistentIds(turns, idMap);
  assert.ok(UUID_A in remapped[0].nextStates);
  assert.ok(UUID_B in remapped[0].nextStates);
  assert.ok(!(SESSION_A in remapped[0].nextStates));
  assert.ok(!(SESSION_B in remapped[0].nextStates));
});

test("remapTurnResultsToPersistentIds: does not mutate original turn results", () => {
  const turns = [makeTurnResult(1, SESSION_A)];
  remapTurnResultsToPersistentIds(turns, idMap);
  assert.equal(turns[0].winnerId, SESSION_A);
  assert.ok(SESSION_A in turns[0].nextStates);
});

test("remapTurnResultsToPersistentIds: remaps multiple turns", () => {
  const turns = [makeTurnResult(1, null), makeTurnResult(2, SESSION_A)];
  const remapped = remapTurnResultsToPersistentIds(turns, idMap);
  assert.equal(remapped[0].winnerId, null);
  assert.equal(remapped[1].winnerId, UUID_A);
  assert.ok(UUID_A in remapped[1].nextStates);
});

test("remapped turnResults pass passesMatchSanity (winner_mismatch regression)", () => {
  const turns = [makeTurnResult(1, SESSION_A), makeTurnResult(2, SESSION_A)];
  const remapped = remapTurnResultsToPersistentIds(turns, idMap);

  const match: MatchRecord = {
    matchId: "match-test-1",
    playedAt: "2026-08-11T00:00:00.000Z",
    battleMode: "simple",
    source: "multiplayer",
    players: [
      {
        playerId: UUID_A,
        nickname: "Alice",
        characterType: "attack",
        stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,aaa",
      },
      {
        playerId: UUID_B,
        nickname: "Bob",
        characterType: "magic",
        stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,bbb",
      },
    ],
    winnerId: UUID_A,
    turnCount: 2,
    finalHpRatio: 0.8,
    singlePlayResult: null,
    roguelikeResult: null,
    rating: null,
  };

  assert.equal(passesMatchSanity(match, remapped), true);
});

test("un-remapped turnResults (session IDs) fail passesMatchSanity with winner_mismatch", () => {
  const turns = [makeTurnResult(1, SESSION_A), makeTurnResult(2, SESSION_A)];

  const match: MatchRecord = {
    matchId: "match-test-2",
    playedAt: "2026-08-11T00:00:00.000Z",
    battleMode: "simple",
    source: "multiplayer",
    players: [
      {
        playerId: UUID_A,
        nickname: "Alice",
        characterType: "attack",
        stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,aaa",
      },
      {
        playerId: UUID_B,
        nickname: "Bob",
        characterType: "magic",
        stats: { hp: 100, maxHp: 100, pp: 40, maxPp: 40, attack: 20, defense: 10, speed: 5, evasion: 0.1 },
        drawingThumbnail: "data:image/png;base64,bbb",
      },
    ],
    winnerId: UUID_A,
    turnCount: 2,
    finalHpRatio: 0.8,
    singlePlayResult: null,
    roguelikeResult: null,
    rating: null,
  };

  // Should fail because lastTurn.winnerId is SESSION_A but match.winnerId is UUID_A
  assert.equal(passesMatchSanity(match, turns), false);
});
