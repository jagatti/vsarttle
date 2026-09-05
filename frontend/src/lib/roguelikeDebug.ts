import type { CharacterStats, CharacterType, WeakMagicEffectKind } from "@/types/game";
import { ROGUELIKE_PLAYER_INITIAL_STATS, ROGUELIKE_TOTAL_FLOORS } from "@/lib/roguelikeEnemyStats";

/** Query parameter that reveals the hidden debug-start entry point. Never shown without it. */
export const ROGUELIKE_DEBUG_QUERY_PARAM = "rlDebug";

/** 1x1 transparent PNG used as a stand-in for the player's drawing when skipping the drawing part. */
export const ROGUELIKE_DEBUG_PLACEHOLDER_DRAWING_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export const ROGUELIKE_DEBUG_PLACEHOLDER_CHARACTER_TYPE: CharacterType = "balanced";

export const ROGUELIKE_DEBUG_WEAK_MAGIC_OPTIONS: { kind: WeakMagicEffectKind; label: string }[] = [
  { kind: "attackBan", label: "こうげき禁止" },
  { kind: "barrierBan", label: "バリア禁止" },
  { kind: "magicBan", label: "まほう禁止" },
  { kind: "chargeBan", label: "チャージ禁止" },
  { kind: "paralysis", label: "まひ" },
  { kind: "tieBan", label: "あいこ禁止" },
];

export interface RoguelikeDebugConfig {
  floor: number;
  hp: number;
  pp: number;
  attack: number;
  defense: number;
  speed: number;
  /** Evasion expressed as a whole-number percent (e.g. 1 for 1%), matching the on-screen input. */
  evasionPercent: number;
  acquiredWeakMagicKinds: WeakMagicEffectKind[];
}

export const ROGUELIKE_DEBUG_DEFAULT_CONFIG: RoguelikeDebugConfig = {
  floor: 1,
  hp: ROGUELIKE_PLAYER_INITIAL_STATS.hp,
  pp: ROGUELIKE_PLAYER_INITIAL_STATS.pp,
  attack: ROGUELIKE_PLAYER_INITIAL_STATS.attack,
  defense: ROGUELIKE_PLAYER_INITIAL_STATS.defense,
  speed: ROGUELIKE_PLAYER_INITIAL_STATS.speed,
  evasionPercent: Math.round(ROGUELIKE_PLAYER_INITIAL_STATS.evasion * 100),
  acquiredWeakMagicKinds: [],
};

export function clampRoguelikeDebugFloor(floor: number): number {
  if (!Number.isFinite(floor)) return 1;
  return Math.min(ROGUELIKE_TOTAL_FLOORS, Math.max(1, Math.round(floor)));
}

export interface RoguelikeDebugRunInit {
  floor: number;
  playerStats: CharacterStats;
  acquiredWeakMagicKinds: WeakMagicEffectKind[];
  playerDrawingDataUrl: string;
  playerCharacterType: CharacterType;
  /** Marks the run as debug-originated so its result is excluded from match records. */
  isDebugRun: true;
}

/** Builds the initial roguelike run state (skipping the drawing part) from debug-screen settings. */
export function buildRoguelikeDebugRunInit(config: RoguelikeDebugConfig): RoguelikeDebugRunInit {
  const floor = clampRoguelikeDebugFloor(config.floor);
  const hp = Math.max(1, Math.round(config.hp));
  const pp = Math.max(0, Math.round(config.pp));
  const attack = Math.max(0, Math.round(config.attack));
  const defense = Math.max(0, Math.round(config.defense));
  const speed = Math.max(0, Math.round(config.speed));
  const evasion = Math.min(0.95, Math.max(0, config.evasionPercent / 100));

  const playerStats: CharacterStats = {
    hp,
    maxHp: hp,
    pp,
    maxPp: pp,
    attack,
    defense,
    speed,
    evasion,
  };

  return {
    floor,
    playerStats,
    acquiredWeakMagicKinds: Array.from(new Set(config.acquiredWeakMagicKinds)),
    playerDrawingDataUrl: ROGUELIKE_DEBUG_PLACEHOLDER_DRAWING_DATA_URL,
    playerCharacterType: ROGUELIKE_DEBUG_PLACEHOLDER_CHARACTER_TYPE,
    isDebugRun: true,
  };
}

/** Returns true only when the URL search string carries the hidden debug entry-point flag. */
export function isRoguelikeDebugQueryEnabled(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(ROGUELIKE_DEBUG_QUERY_PARAM) === "1";
}
