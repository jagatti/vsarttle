import type { ActionCategory, ActionType, PlayerBattleState, TurnChargeEvent, TurnDamageEvent, TurnResult } from "@/types/game";
import { actionCategory } from "@/lib/battleLogic";

export interface DisplayBattleResources {
  currentHp: number;
  currentPp: number;
}

/**
 * わざモーションの種別。フェーズごとにactorが実行する演出を表す。
 * - attackLunge: こうげき（突撃モーション）
 * - chargeConcentration: チャージ（集中線モーション）
 * - magicBlast: まほう（エネルギー弾発射）
 * - magicReflect: まほう → バリア反射（弾が返ってくる）
 * - barrierWall: バリア（光の壁を張る）
 * - barrierBreak: バリア（こうげきで割れる）
 * - barrierClash: バリア対バリア（壁同士の衝突）
 * - none: 専用モーションなし
 */
export type MoveMotionType =
  | "attackLunge"
  | "chargeConcentration"
  | "magicBlast"
  | "magicReflect"
  | "barrierWall"
  | "barrierBreak"
  | "barrierClash"
  | "none";

export interface TurnAnimationPhase {
  actorId: string;
  damageEvents: TurnDamageEvent[];
  chargeEvents: TurnChargeEvent[];
  /** actor が実行するわざモーション種別 */
  motionType?: MoveMotionType;
  /** actor がこのフェーズで実行した元のアクション */
  sourceActionType?: ActionType;
  /** actor 以外のプレイヤーに適用する追加モーション（例：バリア割れ） */
  targetMotionType?: MoveMotionType;
  /** まほうの消費 PP を着弾時に反映する */
  ppAfter?: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function buildDisplayBattleResources(players: PlayerBattleState[]): Record<string, DisplayBattleResources> {
  return Object.fromEntries(players.map((player) => [player.id, { currentHp: player.currentHp, currentPp: player.currentPp }]));
}

export function getTurnAnimationOrder(turnResult: TurnResult, me: PlayerBattleState, enemy: PlayerBattleState): [string, string] {
  if (turnResult.actionOrder && turnResult.actionOrder.length === 2) {
    return turnResult.actionOrder;
  }
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
  if (event.phaseHint === "counter") {
    return Object.keys(actions).find((playerId) => actions[playerId] === "charge") ?? event.to;
  }
  return event.from;
}

/**
 * アクションカテゴリからデフォルトのモーション種別を返すヘルパー。
 * 対戦相手のアクションによって上書きされる場合は getTurnAnimationPhases 内で上書く。
 */
function defaultMotionForAction(action: ActionType): MoveMotionType {
  const cat: ActionCategory = actionCategory(action);
  if (cat === "attack") return "attackLunge";
  if (cat === "magic") return "magicBlast";
  if (cat === "barrier") return "barrierWall";
  if (cat === "charge") return "chargeConcentration";
  return "none";
}

export function getTurnAnimationPhases(turnResult: TurnResult, me: PlayerBattleState, enemy: PlayerBattleState): TurnAnimationPhase[] {
  const [firstId, secondId] = getTurnAnimationOrder(turnResult, me, enemy);
  const phaseByActor: Record<string, TurnAnimationPhase> = {
    [firstId]: { actorId: firstId, damageEvents: [], chargeEvents: [] },
    [secondId]: { actorId: secondId, damageEvents: [], chargeEvents: [] },
  };
  const chargedActorIds = new Set((turnResult.chargeEvents ?? []).map((event) => event.playerId));

  for (const damageEvent of turnResult.damageEvents ?? []) {
    const actorId = getDamagePhaseActorId(damageEvent, turnResult.actions);
    phaseByActor[actorId]?.damageEvents.push(damageEvent);
  }

  // --- モーション種別の決定 ---
  const myAction = turnResult.actions[me.id];
  const enemyAction = turnResult.actions[enemy.id];
  if (myAction && enemyAction) {
    const myCategory = actionCategory(myAction);
    const enemyCategory = actionCategory(enemyAction);
    phaseByActor[me.id].sourceActionType = myAction;
    phaseByActor[enemy.id].sourceActionType = enemyAction;

    // バリア対まほう: まほう側は反射モーション、バリア側は通常バリア
    if (myCategory === "magic" && enemyCategory === "barrier") {
      phaseByActor[me.id].motionType = "magicReflect";
      phaseByActor[enemy.id].motionType = "barrierWall";
    } else if (enemyCategory === "magic" && myCategory === "barrier") {
      phaseByActor[enemy.id].motionType = "magicReflect";
      phaseByActor[me.id].motionType = "barrierWall";
    }
    // こうげき対バリア: こうげき側はattackLunge、バリア側はbarrierWall→barrierBreak
    else if (myCategory === "attack" && enemyCategory === "barrier") {
      phaseByActor[me.id].motionType = "attackLunge";
      phaseByActor[enemy.id].motionType = "barrierWall";
    } else if (enemyCategory === "attack" && myCategory === "barrier") {
      phaseByActor[enemy.id].motionType = "attackLunge";
      phaseByActor[me.id].motionType = "barrierWall";
    }
    // まほう対こうげき: まほう側のみ弾を放ち、こうげき側は専用モーションなし
    else if (myCategory === "magic" && enemyCategory === "attack") {
      phaseByActor[me.id].motionType = "magicBlast";
      phaseByActor[enemy.id].motionType = "none";
    } else if (enemyCategory === "magic" && myCategory === "attack") {
      phaseByActor[enemy.id].motionType = "magicBlast";
      phaseByActor[me.id].motionType = "none";
    }
    // バリア対バリア: 両者バリアを張り衝突
    else if (myCategory === "barrier" && enemyCategory === "barrier") {
      phaseByActor[me.id].motionType = "barrierClash";
      phaseByActor[enemy.id].motionType = "barrierClash";
    }
    // それ以外: デフォルトモーション
    else {
      phaseByActor[me.id].motionType = defaultMotionForAction(myAction);
      phaseByActor[enemy.id].motionType = defaultMotionForAction(enemyAction);
    }

    // Charge recoveries are animated in a dedicated first phase so they always
    // finish before any damage animation regardless of speed order.
    if (chargedActorIds.has(me.id)) phaseByActor[me.id].motionType = "none";
    if (chargedActorIds.has(enemy.id)) phaseByActor[enemy.id].motionType = "none";
  }

  const chargeEventsByActor = new Map<string, TurnChargeEvent[]>();
  const chargeActorOrder: string[] = [];
  for (const chargeEvent of turnResult.chargeEvents ?? []) {
    if (!chargeEventsByActor.has(chargeEvent.playerId)) {
      chargeEventsByActor.set(chargeEvent.playerId, []);
      chargeActorOrder.push(chargeEvent.playerId);
    }
    chargeEventsByActor.get(chargeEvent.playerId)!.push(chargeEvent);
  }
  const chargePhases: TurnAnimationPhase[] = chargeActorOrder.map((actorId) => {
    const action = turnResult.actions[actorId];
    return {
      actorId,
      damageEvents: [],
      chargeEvents: chargeEventsByActor.get(actorId) ?? [],
      motionType: action === "charge" ? "chargeConcentration" : "none",
      sourceActionType: action,
    };
  });

  const barrierId = actionCategory(myAction) === "barrier" ? me.id
    : actionCategory(enemyAction) === "barrier" ? enemy.id : null;
  const attackerId = barrierId === me.id ? enemy.id : me.id;
  const attackerCategory = actionCategory(turnResult.actions[attackerId]);
  if (barrierId && (attackerCategory === "attack" || attackerCategory === "magic")) {
    const barrierPhase = phaseByActor[barrierId];
    const attackPhase = phaseByActor[attackerId];
    const damageEvents = [...barrierPhase.damageEvents, ...attackPhase.damageEvents];
    barrierPhase.damageEvents = [];
    attackPhase.damageEvents = [];
    attackPhase.targetMotionType = "barrierWall";
    const impactPhase: TurnAnimationPhase = {
      actorId: attackerId,
      damageEvents: damageEvents.filter((event) => event.reason !== "ペインシェア"),
      chargeEvents: [],
      motionType: "none",
      targetMotionType: attackerCategory === "attack" ? "barrierBreak" : undefined,
      ppAfter: attackerCategory === "magic" && !turnResult.voidminationTriggered && !turnResult.voidminationStatusText
        ? turnResult.nextStates[attackerId]?.currentPp
        : undefined,
    };
    const additionalPhases: TurnAnimationPhase[] = damageEvents
      .filter((event) => event.reason === "ペインシェア")
      .map((event) => ({ actorId: event.from, damageEvents: [event], chargeEvents: [], motionType: "none" }));
    return [...chargePhases, barrierPhase, attackPhase, impactPhase, ...additionalPhases];
  }

  return [...chargePhases, phaseByActor[firstId], phaseByActor[secondId]];
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
    const ppCeiling = player.voidminationSourceFloor === 16 && player.voidminationActive
      ? player.stats.maxPp * 2
      : player.stats.maxPp;
    next[chargeEvent.playerId] = {
      currentHp: clamp(next[chargeEvent.playerId].currentHp + chargeEvent.hpRecover, 0, player.stats.maxHp),
      currentPp: clamp(next[chargeEvent.playerId].currentPp + chargeEvent.ppRecover, 0, ppCeiling),
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

  if (phase.ppAfter !== undefined) {
    next[phase.actorId] = { ...next[phase.actorId], currentPp: phase.ppAfter };
  }

  return next;
}
