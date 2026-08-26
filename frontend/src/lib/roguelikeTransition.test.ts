import assert from "node:assert/strict";
import test from "node:test";
import { healPlayerFully } from "@/lib/roguelikeTransition";
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

test("healPlayerFully 18→19 transition: player HP/PP restored to maxHp/maxPp", () => {
  // Simulate 18→19 transition: player took damage during floor 18 battle
  const player = makePlayer({ currentHp: 12, currentPp: 3 });
  const healed = healPlayerFully(player);
  assert.equal(healed.currentHp, player.stats.maxHp, "HP should be fully restored");
  assert.equal(healed.currentPp, player.stats.maxPp, "PP should be fully restored");
});

test("healPlayerFully 19→20 transition: player HP/PP restored to maxHp/maxPp", () => {
  // Simulate 19→20 (limit break) transition
  const player = makePlayer({
    currentHp: 45,
    currentPp: 0,
    stats: { hp: 200, maxHp: 200, pp: 80, maxPp: 80, attack: 120, defense: 100, speed: 10, evasion: 0 },
  });
  const healed = healPlayerFully(player);
  assert.equal(healed.currentHp, 200);
  assert.equal(healed.currentPp, 80);
});
