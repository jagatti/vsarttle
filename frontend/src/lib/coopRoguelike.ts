import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import type { ActionCategory, ActionType, PlayerBattleState, TurnResult, WeakMagicEffectKind, WeakMagicEffectSelection } from "@/types/game";
import { applyBossMultiplyUpgrade, applyUpgrade, isWeakFloor } from "@/lib/roguelikeEnemyStats";
import { applyPlayerStats, healPlayerByRatio, healPlayerFully } from "@/lib/roguelikeTransition";
import { getRoguelikeBossUpgradeChoices, pickRoguelikeWeakFloorUpgradeSlots, type RoguelikeBossUpgradeChoice, type RoguelikeSkillUpgradeSlot } from "@/lib/roguelikeUpgrades";
import { applyRoguelikeSkillReward, buildRoguelikeSkillEffects, getRoguelikeSkillDisabledReason, ROGUELIKE_SKILLS, type AcquiredSkills, type RoguelikeSkillEffects } from "@/lib/roguelikeSkills";
import { getRoguelikeTurnSeconds } from "@/lib/roguelikeTiming";
import type { UpgradeStatKey } from "@/lib/roguelikeEnemyStats";

export const COOP_ROGUELIKE_DAMAGE_SCALING = { enemyHp: 1, enemyAttack: 1 } as const;

export type CoopPlayerId = string;

export type CoopUpgradeChoice =
  | { kind: "weak-stat"; rarity: 1 | 2; key: UpgradeStatKey; amount: number }
  | { kind: "weak-magic"; rarity: 3; effectKind: WeakMagicEffectKind; effectName: string }
  | RoguelikeSkillUpgradeSlot
  | RoguelikeBossUpgradeChoice
  | { kind: "revival"; label: string };

export interface CoopSnapshot {
  runId: string;
  floor: number;
  turn: number;
  floorTurn: number;
  totalTurn: number;
  actedPlayerIds: CoopPlayerId[];
  playerIds: readonly [CoopPlayerId, CoopPlayerId];
  activePlayerId: CoopPlayerId | null;
  players: Record<CoopPlayerId, PlayerBattleState>;
  enemy: PlayerBattleState | null;
  stage: "loading" | "transition" | "vs" | "speech" | "battle" | "resolving" | "switching" | "upgrading" | "result";
  turnResult: TurnResult | null;
  chargeMultiplier: number;
  deadline: number;
  excludedPlayerIds: CoopPlayerId[];
  pendingRevivalId: CoopPlayerId | null;
  rewardPlayerId: CoopPlayerId | null;
  rewardPhase: 1 | 2;
  pickedChoiceIndex: number | null;
  upgradeChoices: CoopUpgradeChoice[];
  lastAttackerId?: CoopPlayerId | null;
  outcome: "cleared" | "game-over" | null;
  status: string;
  acquiredWeakMagicKinds: Record<CoopPlayerId, WeakMagicEffectKind[]>;
  acquiredSkills: Record<CoopPlayerId, AcquiredSkills>;
  acquiredHealingSkills: Record<CoopPlayerId, AcquiredSkills>;
  floorDamageTaken: number;
  perfectVictoryFloor: number | null;
}

export type CoopWireMessage =
  | { type: "coop_snapshot"; payload: CoopSnapshot }
  | { type: "coop_action"; payload: { runId: string; turn: number; playerId: CoopPlayerId; action: ActionType } }
  | { type: "coop_upgrade"; payload: { runId: string; floor: number; rewardPhase: 1 | 2; playerId: CoopPlayerId; choiceIndex: number } }
  | { type: "coop_presentation_complete"; payload: { runId: string; floor: number; turn: number; playerId: CoopPlayerId; stage: "vs" | "resolving" } }
  | { type: "coop_restart"; payload: { runId: string } }
  | { type: "coop_redraw"; payload: { runId: string } };

export type CoopChargeAuraStage = "none" | "charged" | "overcharged";

export function getCoopChargeAuraStage(multiplier: number): CoopChargeAuraStage {
  if (multiplier >= 2.25) return "overcharged";
  return multiplier > 1 ? "charged" : "none";
}

export function advanceCoopTurnCounters(counters: Pick<CoopSnapshot, "turn" | "floorTurn" | "totalTurn">) {
  return {
    turn: counters.turn + 1,
    floorTurn: counters.floorTurn + 1,
    totalTurn: counters.totalTurn + 1,
  };
}

export function resetCoopFloorTurn(counters: Pick<CoopSnapshot, "turn" | "floorTurn" | "totalTurn">) {
  return { ...counters, floorTurn: 1 };
}

export function getCoopResultData(snapshot: Pick<CoopSnapshot, "floor" | "totalTurn">) {
  return { floorReached: snapshot.floor, totalTurn: snapshot.totalTurn };
}

export function buildCoopSkillEffects(
  acquiredSkills: Record<CoopPlayerId, AcquiredSkills>,
  playerId: CoopPlayerId,
): RoguelikeSkillEffects {
  const effects = buildRoguelikeSkillEffects(acquiredSkills[playerId] ?? {});
  if (Object.values(acquiredSkills).some((skills) => buildRoguelikeSkillEffects(skills).shortBattle)) {
    effects.shortBattle = true;
  }
  return effects;
}

export function buildCoopUpgradeChoices(
  snapshot: CoopSnapshot,
  playerId: CoopPlayerId,
  needsRevival: boolean,
  random: () => number = Math.random,
  count = 3,
): CoopUpgradeChoice[] {
  const player = snapshot.players[playerId]!;
  const choices: CoopUpgradeChoice[] = isWeakFloor(snapshot.floor)
    ? pickRoguelikeWeakFloorUpgradeSlots(
        snapshot.floor, snapshot.acquiredWeakMagicKinds[playerId] ?? [], count, random,
        {
          acquiredSkills: {
            ...snapshot.acquiredSkills[playerId],
            ...(buildCoopSkillEffects(snapshot.acquiredSkills, playerId).shortBattle ? { shortBattle: 1 } : {}),
          },
          currentHp: player.currentHp, maxHp: player.stats.maxHp,
        },
      ).map((slot) => slot.kind === "stat" ? { ...slot, kind: "weak-stat" } : slot)
    : getRoguelikeBossUpgradeChoices(snapshot.floor);
  if (!needsRevival || !choices.length) return choices;
  const fullHealIndex = choices.findIndex((choice) => choice.kind === "full-heal");
  choices[fullHealIndex >= 0 ? fullHealIndex : choices.length - 1] = {
    kind: "revival", label: "蘇生の儀式",
  };
  return choices;
}

export function getCoopChoiceDisabledReason(snapshot: CoopSnapshot, playerId: CoopPlayerId, index: number): string | null {
  if (!Number.isInteger(index) || !snapshot.upgradeChoices[index]) return "無効な枠";
  if (index === snapshot.pickedChoiceIndex) return "相手が選んだ枠";
  if (snapshot.stage !== "upgrading" || snapshot.rewardPlayerId !== playerId
    || !getCoopAlivePlayerIds(snapshot.players, snapshot.excludedPlayerIds).includes(playerId)) {
    return "選択する順番ではありません";
  }
  const choice = snapshot.upgradeChoices[index]!;
  if (choice.kind === "weak-magic" && (snapshot.acquiredWeakMagicKinds[playerId] ?? []).includes(choice.effectKind)) {
    return "取得済み";
  }
  if (choice.kind === "skill") {
    const skills = {
      ...snapshot.acquiredSkills[playerId],
      ...(buildCoopSkillEffects(snapshot.acquiredSkills, playerId).shortBattle ? { shortBattle: 1 } : {}),
    };
    return getRoguelikeSkillDisabledReason(skills, choice.skillId);
  }
  return null;
}

export function isCoopChoiceDisabled(snapshot: CoopSnapshot, playerId: CoopPlayerId, index: number): boolean {
  return getCoopChoiceDisabledReason(snapshot, playerId, index) !== null;
}

export function getCoopFirstSelectableChoiceIndex(snapshot: CoopSnapshot): number {
  return snapshot.upgradeChoices.findIndex((_, index) =>
    snapshot.rewardPlayerId !== null && !isCoopChoiceDisabled(snapshot, snapshot.rewardPlayerId, index),
  );
}

export function advanceCoopRewardPhase(
  upgraded: CoopSnapshot,
  pickedChoiceIndex: number,
  random: () => number = Math.random,
): CoopSnapshot | null {
  if (upgraded.stage !== "upgrading" || upgraded.rewardPhase !== 1 || !isWeakFloor(upgraded.floor)
    || upgraded.pendingRevivalId || !upgraded.upgradeChoices[pickedChoiceIndex]
    || getCoopAlivePlayerIds(upgraded.players, upgraded.excludedPlayerIds).length !== 2) return null;
  const rewardPlayerId = upgraded.playerIds.find((id) => id !== upgraded.rewardPlayerId)!;
  const next: CoopSnapshot = { ...upgraded, rewardPlayerId, rewardPhase: 2, pickedChoiceIndex };
  const remainingIndices = next.upgradeChoices.map((_, index) => index).filter((index) => index !== pickedChoiceIndex);
  if (remainingIndices.every((index) => isCoopChoiceDisabled(next, rewardPlayerId, index))) {
    const replacements = buildCoopUpgradeChoices(next, rewardPlayerId, false, random, remainingIndices.length);
    next.upgradeChoices = next.upgradeChoices.map((choice, index) =>
      index === pickedChoiceIndex ? choice : replacements[remainingIndices.indexOf(index)]!,
    );
  }
  return next;
}

export function applyCoopUpgrade(snapshot: CoopSnapshot, playerId: CoopPlayerId, choice: CoopUpgradeChoice): CoopSnapshot {
  const player = snapshot.players[playerId]!;
  let nextPlayer = player;
  let acquiredSkills = snapshot.acquiredSkills;
  let acquiredHealingSkills = snapshot.acquiredHealingSkills;
  let acquiredWeakMagicKinds = snapshot.acquiredWeakMagicKinds;
  if (choice.kind === "weak-stat") {
    nextPlayer = applyPlayerStats(player, applyUpgrade(player.stats, choice.key, choice.amount));
  } else if (choice.kind === "boss-multiply") {
    nextPlayer = applyPlayerStats(player, applyBossMultiplyUpgrade(player.stats, choice.key, choice.multiplier));
    if (choice.healRatio) nextPlayer = healPlayerByRatio(nextPlayer, choice.healRatio);
  } else if (choice.kind === "full-heal") {
    nextPlayer = healPlayerFully(player);
  } else if (choice.kind === "weak-magic") {
    const kinds = acquiredWeakMagicKinds[playerId] ?? [];
    acquiredWeakMagicKinds = { ...acquiredWeakMagicKinds, [playerId]: [...new Set([...kinds, choice.effectKind])] };
  } else if (choice.kind === "skill") {
    const reward = applyRoguelikeSkillReward(player, choice.skillId, acquiredSkills[playerId] ?? {});
    nextPlayer = reward.player;
    acquiredSkills = { ...acquiredSkills, [playerId]: reward.acquiredSkills };
    if (ROGUELIKE_SKILLS[choice.skillId].consumable) {
      const healing = acquiredHealingSkills[playerId] ?? {};
      acquiredHealingSkills = { ...acquiredHealingSkills, [playerId]: { ...healing, [choice.skillId]: (healing[choice.skillId] ?? 0) + 1 } };
    }
  } else if (snapshot.pendingRevivalId && !snapshot.excludedPlayerIds.includes(snapshot.pendingRevivalId)) {
    nextPlayer = applyCoopRevivalCost(player);
  }
  return { ...snapshot, players: { ...snapshot.players, [playerId]: nextPlayer }, acquiredSkills, acquiredHealingSkills, acquiredWeakMagicKinds };
}

export function startCoopBattle(snapshot: CoopSnapshot, now: number): CoopSnapshot {
  if ((snapshot.stage !== "vs" && snapshot.stage !== "switching" && snapshot.stage !== "speech")
    || !snapshot.activePlayerId || !snapshot.enemy) return snapshot;
  return {
    ...snapshot, stage: "battle", turnResult: null,
    deadline: now + getRoguelikeTurnSeconds(snapshot.players[snapshot.activePlayerId]!) * 1000,
  };
}

export function isCoopPresentationComplete(snapshot: CoopSnapshot, readyPlayerIds: ReadonlySet<string>): boolean {
  return (snapshot.stage === "vs" || snapshot.stage === "resolving")
    && snapshot.playerIds.filter((id) => !snapshot.excludedPlayerIds.includes(id)).every((id) => readyPlayerIds.has(id));
}

export function getCoopSkillTurn(snapshot: CoopSnapshot, playerId: CoopPlayerId): number {
  return snapshot.actedPlayerIds.includes(playerId) ? 2 : 1;
}

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
  skillEffects?: RoguelikeSkillEffects,
): ActionType[] {
  return getAvailableActions({ ...player, lastActionCategory }, turn === 1 ? 2 : turn, skillEffects);
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
  skillEffects?: Parameters<typeof resolveTurn>[0]["skillEffects"];
  skillTurn?: number;
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
    skillEffects: params.skillEffects,
    skillTurn: params.skillTurn,
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
