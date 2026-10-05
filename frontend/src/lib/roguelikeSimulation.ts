import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { getGhostCpuActionWeights, pickGhostCpuAction, FLOOR5_BOSS_CHARGE_HP_THRESHOLD } from "@/lib/ghostCpuAction";
import {
  ROGUELIKE_PLAYER_INITIAL_STATS,
  applyBossMultiplyUpgrade,
  applyBossUpgrade,
  applyPerfectVictoryBuff,
  applyUpgrade,
  buildWeakEnemyStats,
  getEnemyWeakMagicKindsByType,
  isWeakFloor,
} from "@/lib/roguelikeEnemyStats";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";
import { applyPlayerStats, carryOverPlayerState, healPlayerFully } from "@/lib/roguelikeTransition";
import { buildRoguelikeSkillEffects, applyRoguelikeSkillReward, ROGUELIKE_SKILLS, type AcquiredSkills } from "@/lib/roguelikeSkills";
import { getRoguelikeBossUpgradeChoices, pickRoguelikeWeakFloorUpgradeSlots, type RoguelikeBossUpgradeChoice, type RoguelikeWeakFloorUpgradeSlot } from "@/lib/roguelikeUpgrades";
import type { ActionCategory, ActionType, CharacterStats, CharacterType, PlayerBattleState, WeakMagicEffectKind } from "@/types/game";

export const ROGUELIKE_BATTLE_AIS = ["random", "steady", "tactical"] as const;
export type RoguelikeBattleAi = typeof ROGUELIKE_BATTLE_AIS[number];

export const ROGUELIKE_REWARD_POLICIES = [
  "random",
  "stat-hp-attack",
  "stat-only",
  "skill-first",
  "no-stat",
  "heal-aware",
  "baseline",
] as const;
export type RoguelikeRewardPolicy = typeof ROGUELIKE_REWARD_POLICIES[number];

export interface RoguelikeSimulationVariant {
  name: string;
  enemyAttackMultiplier?: number;
  bossHealRatio?: number;
  hpRegenRatio?: number;
  statUpgradeMultiplier?: number;
  lowHpRewardHealThreshold?: number;
}

export interface RoguelikeSimulationOptions {
  seed: number;
  battleAi: RoguelikeBattleAi;
  rewardPolicy: RoguelikeRewardPolicy;
  variant?: RoguelikeSimulationVariant;
}

export interface RoguelikeRunResult {
  seed: number;
  cleared: boolean;
  floorReached: number;
  floorsCleared: number;
  bossFloorsReached: number[];
  bossFloorsCleared: number[];
  finalStats: CharacterStats;
  finalHpRatio: number;
  finalPpRatio: number;
  acquiredSkills: AcquiredSkills;
  acquiredWeakMagicKinds: WeakMagicEffectKind[];
  fullHealUses: number;
  consumableHealUses: number;
  perfectVictories: number;
  floorStartStates: Array<{ floor: number; currentHp: number; currentPp: number; maxHp: number; maxPp: number }>;
  floorEndStates: Array<{ floor: number; currentHp: number; currentPp: number; maxHp: number; maxPp: number }>;
  rewardsTaken: Array<{ floor: number; kind: string; rewardId: string }>;
}

const PLAYER_ID = "rl-player";
const BOSS_FLOORS = [5, 10, 13, 16, 17, 18, 19, 20];
const WEAK_ENEMY_TYPES: CharacterType[] = ["attack", "magic", "defense", "balanced"];

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomItem<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]!;
}

function actionCategory(action: ActionType): ActionCategory {
  if (action === "magicWeak" || action === "magicStrong") return "magic";
  return action === "paralysis" ? "charge" : action;
}

function choosePlayerAction(
  player: PlayerBattleState,
  enemy: PlayerBattleState,
  turn: number,
  ai: RoguelikeBattleAi,
  rng: () => number,
): ActionType {
  if (player.paralyzedNextTurn) return "paralysis";
  const actions = getAvailableActions(player, turn);
  if (actions.length === 0) return "paralysis";
  if (ai === "random") return randomItem(actions, rng);

  const enemyCategory = enemy.lastActionCategory;
  const counter: Partial<Record<ActionCategory, ActionCategory>> = {
    attack: "magic",
    magic: "barrier",
    barrier: "attack",
  };
  const preferredCategory = enemyCategory ? counter[enemyCategory] : undefined;
  const preferredActions = actions.filter((action) => actionCategory(action) === preferredCategory);
  const hpRatio = player.currentHp / Math.max(1, player.stats.maxHp);
  const ppRatio = player.currentPp / Math.max(1, player.stats.maxPp);
  const charge = actions.includes("charge");

  if (ai === "steady") {
    if (hpRatio < 0.65 && charge && enemyCategory !== "barrier") return "charge";
    if (preferredActions.length) return preferredActions[0]!;
    if (ppRatio < 0.5 && charge && enemyCategory !== "barrier") return "charge";
    return actions.includes("attack") ? "attack" : randomItem(actions, rng);
  }

  if ((hpRatio < 0.7 || ppRatio < 0.5) && charge && enemyCategory !== "barrier") return "charge";
  if (preferredActions.includes("magicStrong")) {
    const damageMultiplier = turn > 20 ? 3 : turn > 15 ? 2 : 1;
    const rawDamage = Math.ceil(player.stats.maxPp * 0.4) * 5 * player.chargeMultiplier;
    const expectedDamage = Math.max(1, Math.round(rawDamage * 300 / (300 + Math.max(0, enemy.stats.defense)))) * damageMultiplier;
    if (enemy.currentHp <= expectedDamage) return "magicStrong";
  }
  if (preferredActions.includes("magicWeak") && ppRatio > 0.55) return "magicWeak";
  if (preferredActions.length) return preferredActions[0]!;
  if (actions.includes("attack")) return "attack";
  return randomItem(actions, rng);
}

function chooseWeakFloorReward(
  slots: RoguelikeWeakFloorUpgradeSlot[],
  policy: RoguelikeRewardPolicy,
  player: PlayerBattleState,
  rng: () => number,
): RoguelikeWeakFloorUpgradeSlot | null {
  if (policy === "baseline" || slots.length === 0) return null;
  if (policy === "random") return randomItem(slots, rng);
  const stats = slots.filter((slot) => slot.kind === "stat");
  const nonStats = slots.filter((slot) => slot.kind !== "stat");
  if (policy === "stat-only") return stats.length ? randomItem(stats, rng) : null;
  if (policy === "skill-first") {
    const skill = nonStats.filter((slot) => slot.kind === "skill");
    return skill[0] ?? nonStats[0] ?? null;
  }
  if (policy === "no-stat") {
    if (player.currentHp / player.stats.maxHp < 0.4) {
      const heals = nonStats.filter((slot) => slot.kind === "skill" && ROGUELIKE_SKILLS[slot.skillId].consumable);
      if (heals.length) return randomItem(heals, rng);
    }
    return nonStats.length ? randomItem(nonStats, rng) : (stats[0] ?? null);
  }

  if (policy === "stat-hp-attack") {
    const rank = (key: string) => key === "hp" ? 6 : key === "attack" ? 5 : key === "pp" ? 4 : key === "defense" ? 3 : key === "speed" ? 2 : 1;
    return stats.sort((left, right) => {
      if (left.kind !== "stat" || right.kind !== "stat") return 0;
      return rank(right.key) - rank(left.key) || right.rarity - left.rarity;
    })[0] ?? randomItem(slots, rng);
  }

  const hpRatio = player.currentHp / Math.max(1, player.stats.maxHp);
  const ppRatio = player.currentPp / Math.max(1, player.stats.maxPp);
  if (hpRatio < 0.4) {
    const heals = slots.filter((slot) => slot.kind === "skill" && ROGUELIKE_SKILLS[slot.skillId].consumable);
    if (heals.length) return heals.sort((a, b) => (b.kind === "skill" ? ROGUELIKE_SKILLS[b.skillId].rarity : 0) - (a.kind === "skill" ? ROGUELIKE_SKILLS[a.skillId].rarity : 0))[0]!;
  }
  if (ppRatio < 0.35) {
    const ppHeal = slots.find((slot) => slot.kind === "skill" && ROGUELIKE_SKILLS[slot.skillId].consumable);
    if (ppHeal) return ppHeal;
  }
  const hpUpgrade = stats.find((slot) => slot.kind === "stat" && slot.key === "hp");
  if (hpUpgrade) return hpUpgrade;
  const usefulSkill = slots.find((slot) => slot.kind === "skill" && ["hpRegen", "ppRegen", "attackResistance", "magicResistance", "barrierResistance", "filter", "statusResistance"].includes(slot.skillId));
  if (usefulSkill) return usefulSkill;
  return nonStats[0]
    ?? stats[0]
    ?? null;
}

function chooseBossReward(
  choices: RoguelikeBossUpgradeChoice[],
  policy: RoguelikeRewardPolicy,
  player: PlayerBattleState,
  rng: () => number,
  bossHealRatio: number | undefined,
): RoguelikeBossUpgradeChoice | null {
  if (policy === "baseline" || choices.length === 0) return null;
  const heal = choices.find((choice) => choice.kind === "full-heal");
  if (policy === "random") return randomItem(choices, rng);
  if (policy === "heal-aware" && heal && player.currentHp / player.stats.maxHp < 0.4) return heal;
  if (policy === "stat-only") return choices.find((choice) => choice.kind !== "full-heal") ?? null;
  if (policy === "no-stat" && heal && player.currentHp / player.stats.maxHp < 0.4) return heal;
  if ((policy === "skill-first" || policy === "no-stat") && heal) return null;
  if (policy === "stat-hp-attack" && heal && player.currentHp / player.stats.maxHp < 0.4) return heal;
  if (bossHealRatio !== undefined && heal && player.currentHp / player.stats.maxHp < bossHealRatio) return heal;
  return choices.find((choice) => choice.kind !== "full-heal") ?? heal ?? null;
}

function makePlayer(): PlayerBattleState {
  return {
    id: PLAYER_ID,
    nickname: "Simulator",
    imageDataUrl: "",
    characterType: "balanced",
    stats: { ...ROGUELIKE_PLAYER_INITIAL_STATS },
    currentHp: ROGUELIKE_PLAYER_INITIAL_STATS.maxHp,
    currentPp: ROGUELIKE_PLAYER_INITIAL_STATS.maxPp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

function makeEnemy(floor: number, rng: () => number, attackMultiplier = 1): PlayerBattleState {
  if (isWeakFloor(floor)) {
    const characterType = randomItem(WEAK_ENEMY_TYPES, rng);
    const stats = buildWeakEnemyStats(floor, characterType);
    if (attackMultiplier !== 1) stats.attack = Math.ceil(stats.attack * attackMultiplier);
    return {
      id: `rl-enemy-${floor}`,
      nickname: `第${floor}層の敵`,
      imageDataUrl: "",
      characterType,
      stats,
      currentHp: stats.maxHp,
      currentPp: stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
  }
  const boss = buildRoguelikeBossState(floor);
  if (attackMultiplier !== 1) boss.stats.attack = Math.ceil(boss.stats.attack * attackMultiplier);
  return boss;
}

function applyReward(
  player: PlayerBattleState,
  choice: RoguelikeWeakFloorUpgradeSlot | RoguelikeBossUpgradeChoice,
  acquiredSkills: AcquiredSkills,
  weakMagic: WeakMagicEffectKind[],
  variant: RoguelikeSimulationVariant | undefined,
): { player: PlayerBattleState; stats: CharacterStats; acquiredSkills: AcquiredSkills; weakMagic: WeakMagicEffectKind[]; fullHeal: boolean; consumableHeal: boolean } {
  let nextPlayer = player;
  let stats = player.stats;
  let nextSkills = acquiredSkills;
  let nextWeak = weakMagic;
  let fullHeal = false;
  let consumableHeal = false;
  if (choice.kind === "stat") {
    stats = applyUpgrade(stats, choice.key, Math.ceil(choice.amount * (variant?.statUpgradeMultiplier ?? 1)));
    nextPlayer = applyPlayerStats(player, stats);
  } else if (choice.kind === "weak-magic") {
    nextWeak = [...weakMagic, choice.effectKind];
  } else if (choice.kind === "skill") {
    const result = applyRoguelikeSkillReward(player, choice.skillId, acquiredSkills);
    nextPlayer = result.player;
    nextSkills = result.acquiredSkills;
    consumableHeal = ROGUELIKE_SKILLS[choice.skillId].consumable;
  } else if (choice.kind === "boss") {
    stats = applyBossUpgrade(stats, choice.floor);
    nextPlayer = applyPlayerStats(player, stats);
  } else if (choice.kind === "boss-multiply") {
    stats = applyBossMultiplyUpgrade(stats, choice.key);
    nextPlayer = applyPlayerStats(player, stats);
  } else if (choice.kind === "full-heal") {
    const healingRatio = variant?.bossHealRatio ?? 1;
    nextPlayer = healPlayerFully(player);
    if (healingRatio < 1) {
      nextPlayer.currentHp = Math.min(player.stats.maxHp, Math.ceil(player.stats.maxHp * healingRatio));
    }
    fullHeal = true;
  }
  return { player: nextPlayer, stats, acquiredSkills: nextSkills, weakMagic: nextWeak, fullHeal, consumableHeal };
}

export function simulateRoguelikeRun(options: RoguelikeSimulationOptions): RoguelikeRunResult {
  const rng = mulberry32(options.seed);
  const variant = options.variant;
  let player = makePlayer();
  let stats = player.stats;
  let acquiredSkills: AcquiredSkills = {};
  let acquiredWeakMagicKinds: WeakMagicEffectKind[] = [];
  let floorsCleared = 0;
  let floorReached = 0;
  let perfectVictories = 0;
  let fullHealUses = 0;
  let consumableHealUses = 0;
  const bossFloorsReached: number[] = [];
  const bossFloorsCleared: number[] = [];
  const floorStartStates: RoguelikeRunResult["floorStartStates"] = [];
  const floorEndStates: RoguelikeRunResult["floorEndStates"] = [];
  const rewardsTaken: RoguelikeRunResult["rewardsTaken"] = [];
  let previousBoss: PlayerBattleState | undefined;

  // Mirrors RoguelikeManager.prepareFloor and its seamless 18→19→20 transitions.
  for (let floor = 1; floor <= 20; floor += 1) {
    if (floor > 1) player = carryOverPlayerState(player, stats);
    floorReached = floor;
    floorStartStates.push({
      floor,
      currentHp: player.currentHp,
      currentPp: player.currentPp,
      maxHp: player.stats.maxHp,
      maxPp: player.stats.maxPp,
    });
    if (BOSS_FLOORS.includes(floor)) bossFloorsReached.push(floor);
    const enemy = makeEnemy(floor, rng, variant?.enemyAttackMultiplier);
    if (floor === 20 && previousBoss) {
      // RoguelikeManager.startSeamlessNextBoss carries the floor 19 aura/form into floor 20.
      enemy.voidminationActive = previousBoss.voidminationActive;
      enemy.voidminationUsed = previousBoss.voidminationUsed;
      enemy.voidminationSourceFloor = previousBoss.voidminationSourceFloor;
      enemy.voidminationBaseStats = previousBoss.voidminationBaseStats;
      enemy.voidminationForm = previousBoss.voidminationForm;
      enemy.voidminationFormTurnsRemaining = previousBoss.voidminationFormTurnsRemaining;
    }
    let players: Record<string, PlayerBattleState> = { [PLAYER_ID]: player, [enemy.id]: enemy };
    let floorDamageTaken = 0;

    for (let turn = 1; turn <= 80; turn += 1) {
      const me = players[PLAYER_ID]!;
      const opponent = players[enemy.id]!;
      const playerAction = me.paralyzedNextTurn
        ? "paralysis"
        : choosePlayerAction(me, opponent, turn, options.battleAi, rng);
      const enemyAction = opponent.paralyzedNextTurn
        ? "paralysis"
        : pickGhostCpuAction(opponent, turn, {
            chargeAllowedHpRatio: floor === 5 ? FLOOR5_BOSS_CHARGE_HP_THRESHOLD : undefined,
            weights: getGhostCpuActionWeights(opponent.characterType),
            random: rng,
          });
      const skillEffects = buildRoguelikeSkillEffects(acquiredSkills);
      let resolutionEffects = skillEffects;
      if (variant?.hpRegenRatio !== undefined && skillEffects.hpRegen) {
        resolutionEffects = { ...skillEffects, hpRegen: undefined };
      }
      const result = resolveTurn({
        turn,
        players,
        actions: { [PLAYER_ID]: playerAction, [enemy.id]: enemyAction },
        rng,
        weakMagicSelections: {
          [PLAYER_ID]: { kinds: acquiredWeakMagicKinds },
          [enemy.id]: (caster) => ({ kinds: getEnemyWeakMagicKindsByType(caster.characterType) }),
        },
        skillEffects: { [PLAYER_ID]: resolutionEffects },
        disableVoidmination: true,
        ...(floor === 20 ? { damageCaps: { [PLAYER_ID]: 999, [enemy.id]: 499 } } : {}),
        roguelikeBossBattle: !isWeakFloor(floor) ? { floor, bossId: enemy.id, playerId: PLAYER_ID } : undefined,
      });
      players = result.nextStates;
      player = players[PLAYER_ID]!;
      floorDamageTaken += result.damageEvents.reduce((sum, event) => sum + (event.to === PLAYER_ID ? event.amount : 0), 0);
      if (variant?.hpRegenRatio !== undefined && skillEffects.hpRegen && player.currentHp > 0) {
        player.currentHp = Math.min(player.stats.maxHp, player.currentHp + Math.ceil(player.stats.maxHp * variant.hpRegenRatio));
      }

      const currentEnemy = players[enemy.id]!;
      if (currentEnemy.currentHp <= 0) {
        floorsCleared += 1;
        if (BOSS_FLOORS.includes(floor)) bossFloorsCleared.push(floor);
        if (floorDamageTaken === 0) {
          // Mirrors RoguelikeManager.finalizeTurn: perfect victories apply the buff and recover added max HP/PP.
          player = applyPlayerStats(player, applyPerfectVictoryBuff(player.stats));
          stats = player.stats;
          perfectVictories += 1;
        } else {
          stats = player.stats;
        }
        floorEndStates.push({
          floor,
          currentHp: player.currentHp,
          currentPp: player.currentPp,
          maxHp: player.stats.maxHp,
          maxPp: player.stats.maxPp,
        });
        break;
      }
      if (player.currentHp <= 0 || turn === 80) {
        stats = player.stats;
        return {
          seed: options.seed,
          cleared: false,
          floorReached,
          floorsCleared,
          bossFloorsReached,
          bossFloorsCleared,
          finalStats: stats,
          finalHpRatio: Math.max(0, player.currentHp / Math.max(1, stats.maxHp)),
          finalPpRatio: Math.max(0, player.currentPp / Math.max(1, stats.maxPp)),
          acquiredSkills,
          acquiredWeakMagicKinds,
          fullHealUses,
          consumableHealUses,
          perfectVictories,
          floorStartStates,
          floorEndStates,
          rewardsTaken,
        };
      }
    }

    if (floor === 20) break;
    const rewardPlayer = player;
    let choice: RoguelikeWeakFloorUpgradeSlot | RoguelikeBossUpgradeChoice | null = null;
    if (isWeakFloor(floor)) {
      const rewardHp = variant?.lowHpRewardHealThreshold !== undefined
        && player.currentHp / Math.max(1, player.stats.maxHp) < variant.lowHpRewardHealThreshold
        ? Math.min(player.currentHp, Math.floor(player.stats.maxHp * 0.39))
        : player.currentHp;
      const slots = pickRoguelikeWeakFloorUpgradeSlots(floor, acquiredWeakMagicKinds, 3, rng, {
        acquiredSkills,
        currentHp: rewardHp,
        maxHp: player.stats.maxHp,
      });
      choice = chooseWeakFloorReward(slots, options.rewardPolicy, player, rng);
    } else {
      choice = chooseBossReward(getRoguelikeBossUpgradeChoices(floor), options.rewardPolicy, player, rng, variant?.bossHealRatio);
    }
    if (choice) {
    rewardsTaken.push({
      floor,
      kind: choice.kind,
      rewardId: choice.kind === "stat" ? choice.key
        : choice.kind === "weak-magic" ? choice.effectKind
        : choice.kind === "skill" ? choice.skillId
        : choice.kind === "boss" ? `boss-${choice.floor}`
        : choice.kind === "boss-multiply" ? `boss-${choice.key}`
        : "full-heal",
    });
    const applied = applyReward(rewardPlayer, choice, acquiredSkills, acquiredWeakMagicKinds, variant);
      player = applied.player;
      stats = applied.stats;
      acquiredSkills = applied.acquiredSkills;
      acquiredWeakMagicKinds = applied.weakMagic;
      if (applied.fullHeal) fullHealUses += 1;
      if (applied.consumableHeal) consumableHealUses += 1;
    }
    previousBoss = players[enemy.id];
  }

  return {
    seed: options.seed,
    cleared: floorsCleared === 20,
    floorReached,
    floorsCleared,
    bossFloorsReached,
    bossFloorsCleared,
    finalStats: player.stats,
    finalHpRatio: Math.max(0, player.currentHp / Math.max(1, player.stats.maxHp)),
    finalPpRatio: Math.max(0, player.currentPp / Math.max(1, player.stats.maxPp)),
    acquiredSkills,
    acquiredWeakMagicKinds,
    fullHealUses,
    consumableHealUses,
    perfectVictories,
    floorStartStates,
    floorEndStates,
    rewardsTaken,
  };
}
