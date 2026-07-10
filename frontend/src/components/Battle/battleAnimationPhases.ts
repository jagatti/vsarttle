import type { ActionType, PlayerBattleState, TurnChargeEvent, TurnDamageEvent, TurnResult } from "@/types/game";

export interface DisplayBattleResources {
  currentHp: number;
  currentPp: number;
}

export interface TurnAnimationPhase {
  actorId: string;
  damageEvents: TurnDamageEvent[];
  chargeEvents: TurnChargeEvent[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function buildDisplayBattleResources(players: PlayerBattleState[]): Record<string, DisplayBattleResources> {
  return Object.fromEntries(players.map((player) => [player.id, { currentHp: player.currentHp, currentPp: player.currentPp }]));
}

export function getTurnAnimationOrder(turnResult: TurnResult, me: PlayerBattleState, enemy: PlayerBattleState): [string, string] {
  const myAction = turnResult.actions[me.id];
  const enemyAction = turnResult.actions[enemy.id];

  if (myAction === "charge" && enemyAction !== "charge") return [me.id, enemy.id];
  if (enemyAction === "charge" && myAction !== "charge") return [enemy.id, me.id];
  if (me.stats.speed >= enemy.stats.speed) return [me.id, enemy.id];
  return [enemy.id, me.id];
}

function getDamagePhaseActorId(event: TurnDamageEvent, actions: Record<string, ActionType>): string {
  if (event.reason === "バリア反射") {
    return Object.keys(actions).find((playerId) => actions[playerId] === "magicWeak" || actions[playerId] === "magicStrong") ?? event.to;
  }
  if (event.reason === "バリアカウンター") {
    return Object.keys(actions).find((playerId) => actions[playerId] === "charge") ?? event.to;
  }
  return event.from;
}

export function getTurnAnimationPhases(turnResult: TurnResult, me: PlayerBattleState, enemy: PlayerBattleState): TurnAnimationPhase[] {
  const [firstId, secondId] = getTurnAnimationOrder(turnResult, me, enemy);
  const phaseByActor: Record<string, TurnAnimationPhase> = {
    [firstId]: { actorId: firstId, damageEvents: [], chargeEvents: [] },
    [secondId]: { actorId: secondId, damageEvents: [], chargeEvents: [] },
  };

  for (const chargeEvent of turnResult.chargeEvents ?? []) {
    phaseByActor[chargeEvent.playerId]?.chargeEvents.push(chargeEvent);
  }

  for (const damageEvent of turnResult.damageEvents ?? []) {
    const actorId = getDamagePhaseActorId(damageEvent, turnResult.actions);
    phaseByActor[actorId]?.damageEvents.push(damageEvent);
  }

  return [phaseByActor[firstId], phaseByActor[secondId]];
}

export function applyAnimationPhaseToDisplayResources(
  displayResources: Record<string, DisplayBattleResources>,
  playersById: Record<string, PlayerBattleState>,
  phase: TurnAnimationPhase,
): Record<string, DisplayBattleResources> {
  const next = { ...displayResources };

  for (const playerId of Object.keys(playersById)) {
    if (!next[playerId]) {
      next[playerId] = {
        currentHp: playersById[playerId].currentHp,
        currentPp: playersById[playerId].currentPp,
      };
    }
  }

  for (const chargeEvent of phase.chargeEvents) {
    const player = playersById[chargeEvent.playerId];
    if (!player) continue;
    next[chargeEvent.playerId] = {
      currentHp: clamp(next[chargeEvent.playerId].currentHp + chargeEvent.hpRecover, 0, player.stats.maxHp),
      currentPp: clamp(next[chargeEvent.playerId].currentPp + chargeEvent.ppRecover, 0, player.stats.maxPp),
    };
  }

  for (const damageEvent of phase.damageEvents) {
    if (damageEvent.avoided || damageEvent.amount <= 0) continue;
    const player = playersById[damageEvent.to];
    if (!player) continue;
    next[damageEvent.to] = {
      ...next[damageEvent.to],
      currentHp: clamp(next[damageEvent.to].currentHp - damageEvent.amount, 0, player.stats.maxHp),
    };
  }

  return next;
}
