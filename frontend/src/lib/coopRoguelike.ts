import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import type { ActionCategory, ActionType, PlayerBattleState, TurnResult, WeakMagicEffectSelection } from "@/types/game";
import type { BossMultiplyKey, UpgradeStatKey } from "@/lib/roguelikeEnemyStats";

export const COOP_ROGUELIKE_DAMAGE_SCALING = { enemyHp: 1, enemyAttack: 1 } as const;

export type CoopPlayerId = string;

export type CoopUpgradeChoice =
  | { kind: "stat"; key: UpgradeStatKey; amount: number; label: string }
  | { kind: "boss-multiply"; key: BossMultiplyKey; multiplier: number; healRatio?: number; label: string }
  | { kind: "full-heal"; label: string }
  | { kind: "revival"; label: string };

export interface CoopSnapshot {
  runId: string;
  floor: number;
  turn: number;
  playerIds: readonly [CoopPlayerId, CoopPlayerId];
  activePlayerId: CoopPlayerId | null;
  players: Record<CoopPlayerId, PlayerBattleState>;
  enemy: PlayerBattleState | null;
  stage: "loading" | "battle" | "resolving" | "upgrading" | "result";
  turnResult: TurnResult | null;
  chargeMultiplier: number;
  deadline: number;
  excludedPlayerIds: CoopPlayerId[];
  pendingRevivalId: CoopPlayerId | null;
  rewardPlayerId: CoopPlayerId | null;
  upgradeChoices: CoopUpgradeChoice[];
  lastAttackerId?: CoopPlayerId | null;
  outcome: "cleared" | "game-over" | null;
  status: string;
}

export type CoopWireMessage =
  | { type: "coop_snapshot"; payload: CoopSnapshot }
  | { type: "coop_action"; payload: { runId: string; turn: number; playerId: CoopPlayerId; action: ActionType } }
  | { type: "coop_upgrade"; payload: { runId: string; floor: number; playerId: CoopPlayerId; choiceIndex: number } }
  | { type: "coop_restart"; payload: { runId: string } }
  | { type: "coop_redraw"; payload: { runId: string } };

export function getCoopAlivePlayerIds(
  players: Record<CoopPlayerId, PlayerBattleState>,
  excludedIds: readonly CoopPlayerId[] = [],
): CoopPlayerId[] {
  const excluded = new Set(excludedIds);
  return Object.values(players)
    .filter((player) => player.currentHp > 0 && !excluded.has(player.id))
    .map((player) => player.id);
}

export function getCoopStartingPlayerId(
  players: Record<CoopPlayerId, PlayerBattleState>,
  floor: number,
  playerIds: readonly [CoopPlayerId, CoopPlayerId],
  excludedIds: readonly CoopPlayerId[] = [],
): CoopPlayerId | null {
  const alive = getCoopAlivePlayerIds(players, excludedIds);
  if (alive.length === 0) return null;
  if (alive.length === 1) return alive[0]!;
  return playerIds[(floor - 1) % 2]!;
}

export function getCoopNextPlayerId(
  players: Record<CoopPlayerId, PlayerBattleState>,
  currentPlayerId: CoopPlayerId,
  wasParalyzed: boolean,
  excludedIds: readonly CoopPlayerId[] = [],
): CoopPlayerId | null {
  const alive = getCoopAlivePlayerIds(players, excludedIds);
  if (alive.length === 0) return null;
  if (wasParalyzed && alive.includes(currentPlayerId)) return currentPlayerId;
  const otherAlive = alive.find((id) => id !== currentPlayerId);
  return otherAlive ?? (alive.includes(currentPlayerId) ? currentPlayerId : alive[0]!);
}

export function getCoopAvailableActions(
  player: PlayerBattleState,
  turn: number,
  lastActionCategory: ActionCategory | null,
): ActionType[] {
  return getAvailableActions({ ...player, lastActionCategory }, turn === 1 ? 2 : turn);
}

export function getCoopChargeMultiplierAfterAction(
  multiplier: number,
  action: ActionType,
): number {
  // A non-charge action consumes or expires the shared multiplier on this handoff.
  return action === "charge" ? multiplier * 1.5 : 1;
}

export function getCoopTurnOutcome(
  players: Record<CoopPlayerId, PlayerBattleState>,
  enemyHp: number,
  excludedIds: readonly CoopPlayerId[] = [],
): "continue" | "floor-clear" | "game-over" {
  const hasLivingPlayer = getCoopAlivePlayerIds(players, excludedIds).length > 0;
  if (enemyHp <= 0) return hasLivingPlayer ? "floor-clear" : "game-over";
  return hasLivingPlayer ? "continue" : "game-over";
}

export function getCoopRewardPlayerId(
  players: Record<CoopPlayerId, PlayerBattleState>,
  clearedFloor: number,
  playerIds: readonly [CoopPlayerId, CoopPlayerId],
  options: {
    bossFloor: boolean;
    lastAttackerId: CoopPlayerId;
    excludedIds?: readonly CoopPlayerId[];
  },
): CoopPlayerId | null {
  const alive = getCoopAlivePlayerIds(players, options.excludedIds);
  if (alive.length === 0) return null;
  if (alive.length === 1) return alive[0]!;
  if (options.bossFloor && alive.includes(options.lastAttackerId)) return options.lastAttackerId;
  return playerIds[(clearedFloor - 1) % 2]!;
}

export function applyCoopRevivalCost(player: PlayerBattleState): PlayerBattleState {
  const cost = Math.min(Math.max(0, player.currentHp - 1), Math.ceil(player.currentHp * 0.33));
  return { ...player, currentHp: Math.max(1, player.currentHp - cost) };
}

export function reviveCoopPlayer(player: PlayerBattleState): PlayerBattleState {
  return {
    ...player,
    currentHp: Math.max(1, Math.ceil(player.stats.maxHp * 0.5)),
    currentPp: Math.max(0, Math.ceil(player.stats.maxPp * 0.5)),
    chargeMultiplier: 1,
    lastActionCategory: null,
    chargedPreviousTurn: false,
    paralyzedNextTurn: false,
    tieBanActive: false,
    attackBanTurns: 0,
    barrierBanTurns: 0,
    chargeBanTurns: 0,
    magicBanTurns: 0,
  };
}

export interface CoopTurnResolution {
  turnResult: TurnResult;
  players: Record<CoopPlayerId, PlayerBattleState>;
  enemy: PlayerBattleState;
  chargeMultiplier: number;
  nextPlayerId: CoopPlayerId | null;
}

export function resolveCoopTurn(params: {
  turn: number;
  players: Record<CoopPlayerId, PlayerBattleState>;
  enemy: PlayerBattleState;
  activePlayerId: CoopPlayerId;
  playerAction: ActionType;
  enemyAction: ActionType;
  chargeMultiplier: number;
  excludedIds?: readonly CoopPlayerId[];
  playerIds: readonly [CoopPlayerId, CoopPlayerId];
  rng?: () => number;
  weakMagicSelections?: Partial<Record<string, WeakMagicEffectSelection | ((caster: PlayerBattleState) => WeakMagicEffectSelection)>>;
  disableVoidmination?: boolean;
  damageCaps?: Record<string, number>;
  roguelikeBossBattle?: { floor: number; bossId: string; playerId: string };
}): CoopTurnResolution {
  const originalPlayer = params.players[params.activePlayerId];
  if (!originalPlayer) throw new Error(`Unknown co-op player: ${params.activePlayerId}`);
  const wasParalyzed = !!originalPlayer.paralyzedNextTurn;
  const playerAction = wasParalyzed ? "paralysis" : params.playerAction;
  const enemyId = params.enemy.id;
  const playerForTurn = {
    ...originalPlayer,
    chargeMultiplier: params.chargeMultiplier,
    chargedPreviousTurn: false,
  };
  const turnResult = resolveTurn({
    turn: params.turn,
    players: { [originalPlayer.id]: playerForTurn, [enemyId]: params.enemy },
    actions: { [originalPlayer.id]: playerAction, [enemyId]: params.enemyAction },
    rng: params.rng,
    weakMagicSelections: params.weakMagicSelections,
    disableVoidmination: params.disableVoidmination,
    damageCaps: params.damageCaps,
    roguelikeBossBattle: params.roguelikeBossBattle,
  });
  const nextPlayer = {
    ...turnResult.nextStates[originalPlayer.id]!,
    lastActionCategory: wasParalyzed ? originalPlayer.lastActionCategory : turnResult.nextStates[originalPlayer.id]!.lastActionCategory,
    chargeMultiplier: playerAction === "charge" ? params.chargeMultiplier * 1.5 : 1,
    chargedPreviousTurn: playerAction === "charge",
  };
  const nextEnemy = turnResult.nextStates[enemyId]!;
  const players = { ...params.players, [originalPlayer.id]: nextPlayer };
  const chargeMultiplier = getCoopChargeMultiplierAfterAction(params.chargeMultiplier, playerAction);
  const nextPlayerId = getCoopNextPlayerId(
    players,
    originalPlayer.id,
    !!nextPlayer.paralyzedNextTurn,
    params.excludedIds,
  );
  return {
    turnResult: { ...turnResult, nextStates: { ...players, [enemyId]: nextEnemy } },
    players,
    enemy: nextEnemy,
    chargeMultiplier,
    nextPlayerId,
  };
}
