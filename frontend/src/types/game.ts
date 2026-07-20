export type Stage = "room" | "drawing" | "battle" | "result" | "title" | "singleplay";

export interface Point {
  x: number;
  y: number;
  t: number;
}

export interface FillSpan {
  y: number;
  x1: number;
  x2: number;
}

export interface Stroke {
  id: string;
  tool: "pen" | "eraser" | "fill";
  color: string;
  size: number;
  points: Point[];
  fillSpans?: FillSpan[];
}

export interface DrawingLayer {
  id: string;
  name: string;
  strokes: Stroke[];
}

export interface DrawingData {
  version: 1;
  canvas: { width: number; height: number };
  layers: DrawingLayer[];
}

export interface WirePoint {
  x: number;
  y: number;
}

export interface WireStroke {
  id: string;
  tool: "pen" | "eraser" | "fill";
  color: string;
  size: number;
  points: WirePoint[];
  fillSpans?: FillSpan[];
}

export interface WireDrawingLayer {
  id: string;
  name: string;
  strokes: WireStroke[];
}

export interface WireDrawingData {
  version: 1;
  canvas: { width: number; height: number };
  layers: WireDrawingLayer[];
}

export interface CharacterStats {
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
}

export type EnhancementSlot = "pp" | "speed" | "evasion";

export type ActionType = "attack" | "magicWeak" | "magicStrong" | "barrier" | "charge" | "paralysis";
export type ActionCategory = "attack" | "magic" | "barrier" | "charge" | "paralysis";

export type CharacterType = "attack" | "magic" | "defense" | "balanced";

export interface PlayerBattleState {
  id: string;
  nickname: string;
  imageDataUrl: string;
  stats: CharacterStats;
  characterType: CharacterType;
  enhancementSlot?: EnhancementSlot | null;
  currentHp: number;
  currentPp: number;
  chargeMultiplier: number;
  lastActionCategory: ActionCategory | null;
  lastChargeHpRecover?: number;
  lastChargePpRecover?: number;
  /** Remaining turns during which this player cannot use バリア (barrier), inflicted by 弱まほう「バリア禁止」. */
  barrierBanTurns?: number;
  /** Remaining turns during which this player cannot use チャージ (charge), inflicted by 弱まほう「チャージ禁止」. */
  chargeBanTurns?: number;
  /** When true, this player is まひ (paralyzed) for the upcoming turn and cannot select any action. */
  paralyzedNextTurn?: boolean;
  /** When true, this player has already triggered its limit break and cannot trigger it again. */
  limitBreakUsed?: boolean;
  /** When true, this player is in limit break mode and must always use magicStrong, ignoring all restrictions. */
  limitBreakActive?: boolean;
  /** When true, this player used チャージ on the previous turn; the 1.5x chargeMultiplier is active for this turn only and will be reset at the end of this turn regardless of what action is taken. */
  chargedPreviousTurn?: boolean;
}

export interface TurnDamageEvent {
  from: string;
  to: string;
  amount: number;
  avoided: boolean;
  reason: string;
}

export interface TurnChargeEvent {
  playerId: string;
  hpRecover: number;
  ppRecover: number;
}

export interface TurnMagicEffectEvent {
  casterId: string;
  affectedId: string;
  effectName: string;
  reflected: boolean;
}

export interface TurnResult {
  turn: number;
  actions: Record<string, ActionType>;
  damageEvents: TurnDamageEvent[];
  chargeEvents: TurnChargeEvent[];
  magicEffectEvents: TurnMagicEffectEvent[];
  logs: string[];
  nextStates: Record<string, PlayerBattleState>;
  winnerId: string | null;
}
