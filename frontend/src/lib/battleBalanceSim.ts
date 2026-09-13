import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { BASE_STATS, deriveStatsFromBase } from "@/lib/statCalculator";
import type { DrawingAxes } from "@/lib/statCalculator";
import type { ActionType, CharacterStats, CharacterType, PlayerBattleState } from "@/types/game";

export const CHARACTER_TYPES = ["balanced", "attack", "magic", "defense"] as const satisfies CharacterType[];
export const DEFAULT_MATCHES_PER_ORDER = 2000;
export const DEFAULT_MAX_TURNS = 40;

export interface SimulationProfile {
  name: string;
  characterType: CharacterType;
  stats: CharacterStats;
}

export interface PairBalanceResult {
  left: string;
  right: string;
  leftWins: number;
  rightWins: number;
  draws: number;
  totalGames: number;
  leftWinRate: number;
  rightWinRate: number;
  drawRate: number;
}

export interface OverallBalanceResult {
  name: string;
  characterType: CharacterType;
  matchupCount: number;
  winRate: number;
}

export interface BalanceMatrixResult {
  pairResults: PairBalanceResult[];
  overallResults: OverallBalanceResult[];
}

function isMirrorProfile(left: SimulationProfile, right: SimulationProfile) {
  return left.name === right.name && left.characterType === right.characterType;
}

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function toCharacterStats(base: CharacterStats | (typeof BASE_STATS)[CharacterType]): CharacterStats {
  return {
    hp: base.hp,
    maxHp: "maxHp" in base ? base.maxHp : base.hp,
    pp: base.pp,
    maxPp: "maxPp" in base ? base.maxPp : base.pp,
    attack: base.attack,
    defense: base.defense,
    speed: base.speed,
    evasion: base.evasion,
  };
}

export function createBaseProfile(characterType: CharacterType, name = characterType): SimulationProfile {
  return {
    name,
    characterType,
    stats: toCharacterStats(BASE_STATS[characterType]),
  };
}

export function createAxisProfile(
  characterType: CharacterType,
  axes: DrawingAxes,
  name = `${characterType}[${axes.sA},${axes.sB},${axes.sC}]`,
): SimulationProfile {
  return {
    name,
    characterType,
    stats: deriveStatsFromBase(BASE_STATS[characterType], axes),
  };
}

function makePlayer(id: string, profile: SimulationProfile): PlayerBattleState {
  const stats = toCharacterStats(profile.stats);
  return {
    id,
    nickname: `${profile.name}-${id}`,
    imageDataUrl: "",
    characterType: profile.characterType,
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

export function simulateBattle(
  leftProfile: SimulationProfile,
  rightProfile: SimulationProfile,
  seed: number,
  maxTurns = DEFAULT_MAX_TURNS,
): "left" | "right" | null {
  const rng = mulberry32(seed);
  let players: Record<string, PlayerBattleState> = {
    left: makePlayer("left", leftProfile),
    right: makePlayer("right", rightProfile),
  };

  for (let turn = 1; turn <= maxTurns; turn += 1) {
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
    if (result.winnerId === "left" || result.winnerId === "right") return result.winnerId;
    if (players.left.currentHp <= 0 && players.right.currentHp <= 0) return null;
  }

  return null;
}

export function simulateBalanceMatrix(
  profiles: SimulationProfile[],
  options?: { matchesPerOrder?: number; maxTurns?: number; seedStart?: number },
): BalanceMatrixResult {
  const matchesPerOrder = options?.matchesPerOrder ?? DEFAULT_MATCHES_PER_ORDER;
  const maxTurns = options?.maxTurns ?? DEFAULT_MAX_TURNS;
  let seed = options?.seedStart ?? 1;
  const pairResults: PairBalanceResult[] = [];

  for (let leftIndex = 0; leftIndex < profiles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < profiles.length; rightIndex += 1) {
      const leftProfile = profiles[leftIndex];
      const rightProfile = profiles[rightIndex];
      const totals = { leftWins: 0, rightWins: 0, draws: 0 };

      const orders = isMirrorProfile(leftProfile, rightProfile)
        ? [[leftProfile, rightProfile, false]] as const
        : [
            [leftProfile, rightProfile, false],
            [rightProfile, leftProfile, true],
          ] as const;

      for (const [firstProfile, secondProfile, swapped] of orders) {
        for (let match = 0; match < matchesPerOrder; match += 1) {
          const winner = simulateBattle(firstProfile, secondProfile, seed, maxTurns);
          seed += 1;

          if (winner === null) {
            totals.draws += 1;
            continue;
          }

          const originalLeftWon = swapped ? winner === "right" : winner === "left";
          if (originalLeftWon) {
            totals.leftWins += 1;
          } else {
            totals.rightWins += 1;
          }
        }
      }

      const totalGames = totals.leftWins + totals.rightWins + totals.draws;
      pairResults.push({
        left: leftProfile.name,
        right: rightProfile.name,
        leftWins: totals.leftWins,
        rightWins: totals.rightWins,
        draws: totals.draws,
        totalGames,
        leftWinRate: totalGames === 0 ? 0 : totals.leftWins / totalGames,
        rightWinRate: totalGames === 0 ? 0 : totals.rightWins / totalGames,
        drawRate: totalGames === 0 ? 0 : totals.draws / totalGames,
      });
    }
  }

  const overallResults = profiles.map((profile) => {
    const matchupRates = pairResults.flatMap((pair) => {
      if (pair.left === profile.name) return [pair.leftWinRate];
      if (pair.right === profile.name) return [pair.rightWinRate];
      return [];
    });
    return {
      name: profile.name,
      characterType: profile.characterType,
      matchupCount: matchupRates.length,
      winRate: matchupRates.reduce((sum, rate) => sum + rate, 0) / Math.max(1, matchupRates.length),
    };
  });

  return {
    pairResults,
    overallResults,
  };
}
