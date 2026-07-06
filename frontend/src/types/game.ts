export type Stage = "room" | "drawing" | "battle" | "result";

export interface Point {
  x: number;
  y: number;
  t: number;
}

export interface Stroke {
  id: string;
  tool: "pen" | "eraser";
  color: string;
  size: number;
  points: Point[];
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
  tool: "pen" | "eraser";
  color: string;
  size: number;
  points: WirePoint[];
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

export type ActionType = "attack" | "magicWeak" | "magicStrong" | "barrier" | "charge";
export type ActionCategory = "attack" | "magic" | "barrier" | "charge";

export interface PlayerBattleState {
  id: string;
  nickname: string;
  imageDataUrl: string;
  stats: CharacterStats;
  currentHp: number;
  currentPp: number;
  chargeMultiplier: number;
  lastActionCategory: ActionCategory | null;
  lastChargeHpRecover?: number;
  lastChargePpRecover?: number;
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

export interface TurnResult {
  turn: number;
  actions: Record<string, ActionType>;
  damageEvents: TurnDamageEvent[];
  chargeEvents: TurnChargeEvent[];
  logs: string[];
  nextStates: Record<string, PlayerBattleState>;
  winnerId: string | null;
}
