import assert from "node:assert/strict";
import test from "node:test";
import { applyPlayerStats, carryOverPlayerState, healPlayerByRatio, healPlayerFully } from "@/lib/roguelikeTransition";
import { applyBossMultiplyUpgrade, applyBossUpgrade, applyPerfectVictoryBuff, applyUpgrade } from "@/lib/roguelikeEnemyStats";
import { applyColorDrain } from "@/lib/roguelikeVoidDomination";
import { calculateFinalHpRatio } from "@/lib/matchBuilders";
import type { PlayerBattleState } from "@/types/game";

function makePlayer(overrides: Partial<PlayerBattleState> = {}): PlayerBattleState {
  return {
    id: "test-player",
    nickname: "テスト",
    imageDataUrl: "",
    characterType: "balanced",
    stats: { hp: 100, maxHp: 100, pp: 50, maxPp: 50, attack: 80, defense: 80, speed: 8, evasion: 0 },
    currentHp: 30,
    currentPp: 10,
    chargeMultiplier: 2,
    lastActionCategory: "attack",
    chargedPreviousTurn: true,
    paralyzedNextTurn: true,
    tieBanActive: true,
    attackBanTurns: 2,
    barrierBanTurns: 1,
    chargeBanTurns: 3,
    magicBanTurns: 1,
    limitBreakUsed: false,
    limitBreakActive: false,
    forceMagicStrongAction: false,
    ...overrides,
  };
}

test("healPlayerFully restores HP and PP to max", () => {
  const player = makePlayer();
  const healed = healPlayerFully(player);
  assert.equal(healed.currentHp, player.stats.maxHp);
  assert.equal(healed.currentPp, player.stats.maxPp);
});

test("healPlayerFully resets charge and status effects", () => {
  const player = makePlayer();
  const healed = healPlayerFully(player);
  assert.equal(healed.chargeMultiplier, 1);
  assert.equal(healed.lastActionCategory, null);
  assert.equal(healed.chargedPreviousTurn, false);
  assert.equal(healed.paralyzedNextTurn, false);
  assert.equal(healed.tieBanActive, false);
  assert.equal(healed.attackBanTurns, 0);
  assert.equal(healed.barrierBanTurns, 0);
  assert.equal(healed.chargeBanTurns, 0);
  assert.equal(healed.magicBanTurns, 0);
});

test("healPlayerFully preserves identity fields", () => {
  const player = makePlayer();
  const healed = healPlayerFully(player);
  assert.equal(healed.id, player.id);
  assert.equal(healed.nickname, player.nickname);
  assert.equal(healed.characterType, player.characterType);
  assert.deepEqual(healed.stats, player.stats);
});

test("healPlayerFully with already-full HP still returns max", () => {
  const player = makePlayer({ currentHp: 100, currentPp: 50 });
  const healed = healPlayerFully(player);
  assert.equal(healed.currentHp, 100);
  assert.equal(healed.currentPp, 50);
});

test("healPlayerByRatio restores half of max HP and PP without exceeding their maxima", () => {
  const player = makePlayer({ currentHp: 30, currentPp: 10 });
  const healed = healPlayerByRatio(player, 0.5);
  assert.equal(healed.currentHp, 80);
  assert.equal(healed.currentPp, 35);
  const full = healPlayerByRatio(makePlayer({ currentHp: 95, currentPp: 45 }), 0.5);
  assert.equal(full.currentHp, 100);
  assert.equal(full.currentPp, 50);
});

test("carryOverPlayerState 18→19 transition preserves HP/PP", () => {
  // Simulate 18→19 transition: player took damage during floor 18 battle
  const player = makePlayer({ currentHp: 12, currentPp: 3 });
  const carried = carryOverPlayerState(player);
  assert.equal(carried.currentHp, 12);
  assert.equal(carried.currentPp, 3);
});

test("carryOverPlayerState 19→20 transition preserves HP/PP", () => {
  // Simulate 19→20 (limit break) transition
  const player = makePlayer({
    currentHp: 45,
    currentPp: 0,
    stats: { hp: 200, maxHp: 200, pp: 80, maxPp: 80, attack: 120, defense: 100, speed: 10, evasion: 0 },
  });
  const carried = carryOverPlayerState(player);
  assert.equal(carried.currentHp, 45);
  assert.equal(carried.currentPp, 0);
});

test("carryOverPlayerState resets battle effects without changing stats or resources", () => {
  const player = makePlayer();
  const snapshot = structuredClone(player);
  const carried = carryOverPlayerState(player);
  assert.deepEqual(carried, { ...healPlayerFully(player), currentHp: 30, currentPp: 10 });
  assert.deepEqual(player, snapshot);
  assert.equal(calculateFinalHpRatio(player.id, { [player.id]: carried }), 0.3);
  assert.equal(carryOverPlayerState(makePlayer({ currentHp: 0 })).currentHp, 0);
});

test("carryOverPlayerState preserves the once-per-run Guts usage flag", () => {
  const carried = carryOverPlayerState(makePlayer({ roguelikeGutsUsed: true }));
  assert.equal(carried.roguelikeGutsUsed, true);
});

test("perfect victory restores only the increase in maximum HP/PP", () => {
  const player = makePlayer({
    stats: { ...makePlayer().stats, hp: 250, maxHp: 250 },
  });
  const buffed = applyPlayerStats(player, applyPerfectVictoryBuff(player.stats));
  assert.equal(buffed.currentHp, 55);
  assert.equal(buffed.currentPp, 15);
  assert.equal(buffed.stats.maxHp, 275);
  assert.equal(buffed.stats.maxPp, 55);
  assert.equal(buffed.chargeMultiplier, player.chargeMultiplier);
});

test("normal HP/PP upgrades restore the maximum increase on the next floor", () => {
  const player = makePlayer();
  const hp = carryOverPlayerState(player, applyUpgrade(player.stats, "hp", 35));
  assert.equal(hp.currentHp, 65);
  assert.equal(hp.currentPp, 10);
  const pp = carryOverPlayerState(player, applyUpgrade(player.stats, "pp", 9));
  assert.equal(pp.currentHp, 30);
  assert.equal(pp.currentPp, 19);
  const attack = carryOverPlayerState(player, applyUpgrade(player.stats, "attack", 14));
  assert.equal(attack.currentHp, 30);
  assert.equal(attack.currentPp, 10);
});

test("boss HP/PP multipliers restore the maximum increase, not all missing resources", () => {
  const player = makePlayer();
  for (const stats of [applyBossUpgrade(player.stats, 16), applyBossMultiplyUpgrade(player.stats, "hp")]) {
    const carried = carryOverPlayerState(player, stats);
    assert.equal(carried.currentHp, 130);
    assert.equal(carried.currentPp, 10);
  }
  const pp = carryOverPlayerState(player, applyBossUpgrade(player.stats, 10));
  assert.equal(pp.currentHp, 30);
  assert.equal(pp.currentPp, 60);
});

test("maximum reductions clamp resources without subtracting from already-low values", () => {
  const player = makePlayer();
  const stats = { ...player.stats, hp: 20, maxHp: 20, pp: 5, maxPp: 5 };
  const clamped = applyPlayerStats(player, stats);
  assert.equal(clamped.currentHp, 20);
  assert.equal(clamped.currentPp, 5);
  const low = applyPlayerStats(makePlayer({ currentHp: 12, currentPp: 3 }), stats);
  assert.equal(low.currentHp, 12);
  assert.equal(low.currentPp, 3);
  const full = carryOverPlayerState(makePlayer({ currentHp: 100, currentPp: 50 }), applyPerfectVictoryBuff(player.stats));
  assert.equal(full.currentHp, full.stats.maxHp);
  assert.equal(full.currentPp, full.stats.maxPp);
});

test("color drain reductions persist across floors without restoring drained maxima", () => {
  const player = makePlayer({ currentHp: 100, currentPp: 50 });
  const drained = applyColorDrain(player, makePlayer({ id: "boss" })).player;
  const carried = carryOverPlayerState(drained);
  assert.equal(carried.stats.maxHp, 85);
  assert.equal(carried.currentHp, 85);
  assert.equal(carried.stats.maxPp, 43);
  assert.equal(carried.currentPp, 43);
  const damaged = carryOverPlayerState({ ...drained, currentHp: 12, currentPp: 3 });
  assert.equal(damaged.currentHp, 12);
  assert.equal(damaged.currentPp, 3);
});
