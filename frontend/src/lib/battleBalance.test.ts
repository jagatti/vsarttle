import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { BASE_STATS } from "@/lib/statCalculator";
import type { ActionType, CharacterType, PlayerBattleState } from "@/types/game";

const CHARACTER_TYPES = ["balanced", "attack", "magic", "defense"] as const satisfies CharacterType[];
const MATCHES_PER_ORDER = 2000;
const MAX_TURNS = 40;

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePlayer(id: string, characterType: CharacterType): PlayerBattleState {
  const base = BASE_STATS[characterType];
  const stats = {
    hp: base.hp,
    maxHp: base.hp,
    pp: base.pp,
    maxPp: base.pp,
    attack: base.attack,
    defense: base.defense,
    speed: base.speed,
    evasion: base.evasion,
  };
  return {
    id,
    nickname: `${characterType}-${id}`,
    imageDataUrl: "",
    characterType,
    stats,
    currentHp: stats.maxHp,
    currentPp: stats.maxPp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

function pickAction(player: PlayerBattleState, turn: number, rng: () => number): ActionType {
  const actions = getAvailableActions(player, turn);
  return actions[Math.floor(rng() * actions.length)];
}

function simulateBattle(leftType: CharacterType, rightType: CharacterType, seed: number): CharacterType | null {
  const rng = mulberry32(seed);
  let players: Record<string, PlayerBattleState> = {
    left: makePlayer("left", leftType),
    right: makePlayer("right", rightType),
  };

  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const result = resolveTurn({
      turn,
      players,
      actions: {
        left: pickAction(players.left, turn, rng),
        right: pickAction(players.right, turn, rng),
      },
      rng,
      disableVoidmination: true,
    });

    players = result.nextStates;
    if (result.winnerId) {
      return players[result.winnerId].characterType;
    }
    if (players.left.currentHp <= 0 && players.right.currentHp <= 0) {
      return null;
    }
  }

  return null;
}

test("battle balance stays within the Step 1 win-rate bands", () => {
  const pairWins = new Map<string, { leftWins: number; rightWins: number; draws: number }>();
  const overall = new Map<CharacterType, { wins: number; games: number }>(
    CHARACTER_TYPES.map((type) => [type, { wins: 0, games: 0 }]),
  );

  let seed = 1;
  for (let leftIndex = 0; leftIndex < CHARACTER_TYPES.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < CHARACTER_TYPES.length; rightIndex += 1) {
      const leftType = CHARACTER_TYPES[leftIndex];
      const rightType = CHARACTER_TYPES[rightIndex];
      const key = `${leftType}-vs-${rightType}`;
      const totals = { leftWins: 0, rightWins: 0, draws: 0 };

      for (const [firstType, secondType, swapSides] of [
        [leftType, rightType, false],
        [rightType, leftType, true],
      ] as const) {
        for (let match = 0; match < MATCHES_PER_ORDER; match += 1) {
          const winner = simulateBattle(firstType, secondType, seed);
          seed += 1;

          if (winner === null) {
            totals.draws += 1;
            continue;
          }

          const leftWins = swapSides ? winner === rightType : winner === leftType;
          if (leftWins) {
            totals.leftWins += 1;
          } else {
            totals.rightWins += 1;
          }

          overall.get(winner)!.wins += 1;
          overall.get(firstType)!.games += 1;
          overall.get(secondType)!.games += 1;
        }
      }

      pairWins.set(key, totals);
    }
  }

  for (const [key, totals] of pairWins) {
    const [leftType, rightType] = key.split("-vs-") as [CharacterType, CharacterType];
    const decisiveGames = totals.leftWins + totals.rightWins;
    if (leftType === rightType) {
      assert.ok(decisiveGames > 0, `${key} should produce at least one decisive result`);
      continue;
    }

    assert.ok(decisiveGames > 0, `${key} should produce decisive results`);
    const leftWinRate = totals.leftWins / decisiveGames;
    const rightWinRate = totals.rightWins / decisiveGames;
    assert.ok(leftWinRate >= 0.35 && leftWinRate <= 0.65, `${key} left win rate ${leftWinRate.toFixed(3)} out of range`);
    assert.ok(rightWinRate >= 0.35 && rightWinRate <= 0.65, `${key} right win rate ${rightWinRate.toFixed(3)} out of range`);
  }

  for (const type of CHARACTER_TYPES) {
    const totals = overall.get(type)!;
    const winRate = totals.wins / totals.games;
    assert.ok(winRate >= 0.4 && winRate <= 0.6, `${type} overall win rate ${winRate.toFixed(3)} out of range`);
  }
});
