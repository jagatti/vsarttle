import assert from "node:assert/strict";
import test from "node:test";
import { resolveTurn } from "@/lib/battleLogic";
import type { RoguelikeSkillEffects } from "@/lib/roguelikeSkills";
import type { ActionType, PlayerBattleState } from "@/types/game";

const player = (id: string): PlayerBattleState => ({
  id, nickname: id, imageDataUrl: "", characterType: "balanced",
  stats: { hp: 1000, maxHp: 1000, pp: 100, maxPp: 100, attack: 100, defense: 100, speed: id === "a" ? 10 : 5, evasion: 0 },
  currentHp: 1000, currentPp: 100, chargeMultiplier: 1, lastActionCategory: null,
});

const battle = (
  actions: Record<string, ActionType>,
  skillEffects?: Partial<Record<string, RoguelikeSkillEffects>>,
  extra: Partial<Parameters<typeof resolveTurn>[0]> = {},
) => resolveTurn({ turn: 2, players: { a: player("a"), b: player("b") }, actions, rng: () => 0.99, disableVoidmination: true, skillEffects, ...extra });

test("missing, empty, and unrelated skills preserve complete old results and RNG usage", () => {
  for (const actions of [
    { a: "attack", b: "attack" }, { a: "magicWeak", b: "barrier" },
    { a: "magicWeak", b: "attack" }, { a: "barrier", b: "paralysis" },
    { a: "charge", b: "charge" },
  ] satisfies Record<string, ActionType>[]) {
    const run = (skills?: Partial<Record<string, RoguelikeSkillEffects>>) => {
      let calls = 0;
      const result = battle(actions, skills, { rng: () => { calls++; return 0.99; } });
      return { result, calls };
    };
    assert.deepEqual(run({}), run());
    assert.deepEqual(run({ a: {} }), run());
    assert.deepEqual(run({ absent: { filter: true, tieBoost: true, hpRegen: true } }), run());
  }
});

test("attack resistance applies after defense, caps at three stacks, and never reduces hits below one", () => {
  const actions = { a: "attack", b: "paralysis" } satisfies Record<string, ActionType>;
  assert.equal(battle(actions, { b: { attackResistance: 1 } }).damageEvents[0].amount, 68);
  assert.equal(battle(actions, { b: { attackResistance: 2 } }).damageEvents[0].amount, 60);
  assert.equal(battle(actions, { b: { attackResistance: 3 } }).damageEvents[0].amount, 53);
  assert.equal(battle(actions, { b: { attackResistance: 99 } }).damageEvents[0].amount, 53);
  const a = player("a");
  a.stats.attack = 1;
  assert.equal(battle(actions, { b: { attackResistance: 3 } }, { players: { a, b: player("b") } }).damageEvents[0].amount, 1);
  assert.equal(battle(actions, { b: { attackResistance: 3 } }, { turn: 21 }).damageEvents[0].amount, 159);
});

test("pursuit adds 50 damage against a paralyzed or charging target only", () => {
  const paralyzed = player("b");
  paralyzed.paralyzedNextTurn = true;
  paralyzed.characterType = "attack";
  const pursuitHit = battle(
    { a: "attack", b: "paralysis" },
    { a: { pursuit: true } },
    { players: { a: player("a"), b: paralyzed } },
  );
  assert.equal(pursuitHit.damageEvents[0].amount, 125);
  assert.equal(pursuitHit.damageEvents[0].pursuitDamage, 50);
  assert.equal(pursuitHit.nextStates.b.currentHp, 875);
  assert.ok(pursuitHit.logs.includes("[スキル] a の追撃！50ダメージ！"));

  const charging = player("b");
  charging.characterType = "attack";
  const chargingHit = battle({ a: "attack", b: "charge" }, { a: { pursuit: true } }, {
    players: { a: player("a"), b: charging },
  });
  assert.equal(chargingHit.damageEvents.find((event) => event.to === "b")?.amount, 125);
  assert.equal(chargingHit.damageEvents.find((event) => event.to === "b")?.pursuitDamage, 50);
  const inactive = battle({ a: "attack", b: "paralysis" }, { a: { pursuit: true } });
  assert.equal(inactive.damageEvents[0].amount, 75);
  assert.equal(inactive.damageEvents[0].pursuitDamage, undefined);
  assert.ok(!inactive.logs.some((log) => log.includes("追撃")));
});

test("pursuit preserves barrier hits and does not display on avoided, filtered or absent hits", () => {
  const b = player("b");
  b.paralyzedNextTurn = true;
  const actions = { a: "attack", b: "barrier" } satisfies Record<string, ActionType>;
  const extra = { players: { a: player("a"), b } };
  const hit = battle(actions, { a: { pursuit: true } }, extra);
  assert.equal(hit.damageEvents[0].amount, 125);
  assert.equal(hit.damageEvents[0].pursuitDamage, 50);
  assert.equal(hit.nextStates.b.currentHp, 875);

  const filtered = battle(actions, { a: { pursuit: true }, b: { filter: true } }, { ...extra, turn: 1 });
  assert.equal(filtered.damageEvents[0].amount, 0);
  assert.equal(filtered.nextStates.b.currentHp, 1000);
  b.stats.evasion = 1;
  const avoided = battle(actions, { a: { pursuit: true } }, extra);
  assert.equal(avoided.damageEvents[0].avoided, true);
  assert.equal(avoided.nextStates.b.currentHp, 1000);
  const absent = battle({ a: "attack", b: "magicStrong" }, { a: { pursuit: true } }, extra);
  for (const result of [filtered, avoided, absent]) {
    assert.ok(result.damageEvents.every((event) => event.pursuitDamage === undefined));
    assert.ok(!result.logs.some((log) => log.includes("追撃")));
  }
});

test("pursuit display respects caps, Guts, boss thresholds and magic damping without changing total damage", () => {
  const b = player("b");
  b.paralyzedNextTurn = true;
  const actions = { a: "attack", b: "paralysis" } satisfies Record<string, ActionType>;
  for (const [cap, pursuitDamage] of [[100, 25], [50, undefined]] as const) {
    const result = battle(actions, { a: { pursuit: true } }, { players: { a: player("a"), b }, damageCaps: { b: cap } });
    assert.equal(result.damageEvents[0].amount, cap);
    assert.equal(result.damageEvents[0].pursuitDamage, pursuitDamage);
    assert.equal(result.nextStates.b.currentHp, 1000 - cap);
  }
  b.currentHp = 90;
  const guts = battle(actions, { a: { pursuit: true }, b: { guts: true } }, { players: { a: player("a"), b } });
  assert.equal(guts.nextStates.b.currentHp, 1);
  assert.equal(guts.damageEvents[0].amount, 89);
  assert.equal(guts.damageEvents[0].pursuitDamage, 14);

  b.currentHp = 710;
  const threshold = battle(actions, { a: { pursuit: true } }, {
    players: { a: player("a"), b }, roguelikeBossBattle: { floor: 5, bossId: "b", playerId: "a" },
  });
  assert.equal(threshold.damageEvents[0].amount, 50);
  assert.equal(threshold.damageEvents[0].pursuitDamage, undefined);
  assert.ok(!threshold.logs.some((log) => log.includes("追撃")));

  b.currentHp = 1000;
  b.voidminationActive = true;
  b.voidminationUsed = true;
  const damped = battle({ a: "magicStrong", b: "paralysis" }, { a: { pursuit: true } }, {
    players: { a: player("a"), b }, roguelikeBossBattle: { floor: 5, bossId: "b", playerId: "a" },
  });
  assert.equal(damped.damageEvents[0].amount, 150);
  assert.equal(damped.damageEvents[0].pursuitDamage, 38);
  assert.equal(damped.nextStates.b.currentHp, 850);
});

test("pursuit stays at 50 with fight spirit and late-turn damage multipliers", () => {
  const b = player("b");
  b.paralyzedNextTurn = true;
  const result = battle({ a: "attack", b: "paralysis" }, { a: { pursuit: true, fightSpirit: true } }, {
    turn: 21, players: { a: player("a"), b },
  });
  assert.equal(result.damageEvents[0].amount, 320);
  assert.equal(result.damageEvents[0].pursuitDamage, 50);
  assert.equal(result.nextStates.b.currentHp, 680);
});

test("fight spirit raises damage by 20% without lowering the opponent's defense", () => {
  const result = battle({ a: "attack", b: "paralysis" }, { a: { fightSpirit: true } });
  assert.equal(result.damageEvents[0].amount, 90);
  assert.ok(result.logs.includes("[スキル] a の闘争心がダメージを増やした！"));
  const unaffected = player("b");
  unaffected.characterType = "attack";
  assert.equal(battle({ a: "attack", b: "paralysis" }, { a: { fightSpirit: true } }, {
    players: { a: player("a"), b: unaffected },
  }).damageEvents[0].amount, 75);
});

test("fight spirit lowers only the owner's defense against balanced attackers for every damage source", () => {
  for (const actions of [
    { a: "paralysis", b: "attack" },
    { a: "attack", b: "magicStrong" },
    { a: "charge", b: "barrier" },
    { a: "magicStrong", b: "barrier" },
  ] satisfies Record<string, ActionType>[]) {
    const a = player("a");
    const b = player("b");
    const expectedA = player("a");
    expectedA.stats.defense = 80;
    const expected = battle(actions, undefined, { players: { a: expectedA, b } });
    const result = battle(actions, { a: { fightSpirit: true } }, { players: { a, b } });
    assert.deepEqual(result.damageEvents, expected.damageEvents);
    assert.equal(result.nextStates.a.stats.defense, 100);
    assert.equal(result.nextStates.b.stats.defense, 100);
    assert.equal(a.stats.defense, 100);

    b.characterType = "attack";
    assert.deepEqual(
      battle(actions, { a: { fightSpirit: true } }, { players: { a, b } }),
      battle(actions, undefined, { players: { a, b } }),
    );
  }
});

test("fight spirit rounds defense and bonus damage upward", () => {
  const a = player("a");
  a.stats.defense = 103;
  a.stats.attack = 101;
  const expectedA = player("a");
  expectedA.stats.defense = 83;
  expectedA.stats.attack = 101;
  const actions = { a: "attack", b: "attack" } satisfies Record<string, ActionType>;
  const baseline = battle(actions, undefined, { players: { a: expectedA, b: player("b") } });
  const result = battle(actions, { a: { fightSpirit: true } }, { players: { a, b: player("b") } });
  assert.equal(result.damageEvents.find((event) => event.from === "a")?.amount, 92);
  assert.equal(result.damageEvents.find((event) => event.from === "b")?.amount,
    baseline.damageEvents.find((event) => event.from === "b")?.amount);
});

test("Guts saves a player from lethal damage only once and records the use across battles", () => {
  const b = player("b");
  b.currentHp = 75;
  const first = battle({ a: "attack", b: "paralysis" }, { b: { guts: true } }, {
    players: { a: player("a"), b },
  });
  assert.equal(first.nextStates.b.currentHp, 1);
  assert.equal(first.nextStates.b.roguelikeGutsUsed, true);
  assert.ok(first.logs.includes("[スキル] b は根性でHP1で耐えた！"));

  const second = battle({ a: "attack", b: "paralysis" }, { b: { guts: true } }, {
    players: { a: player("a"), b: first.nextStates.b },
  });
  assert.equal(second.nextStates.b.currentHp, 0);
});

test("direct magic uses only magic resistance", () => {
  const actions = { a: "magicStrong", b: "attack" } satisfies Record<string, ActionType>;
  assert.equal(battle(actions, { b: { magicResistance: 2, barrierResistance: 3, attackResistance: 3 } }).damageEvents[0].amount, 120);
  assert.equal(battle(actions, { b: { barrierResistance: 3, attackResistance: 3 } }).damageEvents[0].amount, 150);
});

test("barrier collisions, one-sided hits, and reflections use only barrier resistance", () => {
  for (const b of ["barrier", "charge", "paralysis"] as const) {
    const result = battle({ a: "barrier", b }, { b: { barrierResistance: 2, attackResistance: 3 } });
    assert.equal(result.damageEvents.find((event) => event.to === "b")?.amount, 60);
  }
  const result = battle({ a: "magicStrong", b: "barrier" }, { a: { barrierResistance: 2, magicResistance: 3 } });
  assert.equal(result.damageEvents[0].amount, 120);
  assert.equal(result.damageEvents[0].reason, "バリア反射");
});

test("tie boost strengthens only the owner's attack, magic, and barrier tie damage", () => {
  for (const action of ["attack", "magicStrong", "barrier"] as const) {
    const actions = { a: action, b: action };
    const baseline = battle(actions);
    const result = battle(actions, { a: { tieBoost: true } });
    assert.equal(result.damageEvents.find((event) => event.from === "a")?.amount,
      Math.round(baseline.damageEvents.find((event) => event.from === "a")!.amount * 1.1));
    assert.equal(result.damageEvents.find((event) => event.from === "b")?.amount,
      baseline.damageEvents.find((event) => event.from === "b")!.amount);
  }
  assert.deepEqual(battle({ a: "attack", b: "barrier" }, { a: { tieBoost: true } }), battle({ a: "attack", b: "barrier" }));
});

test("charge ties recover 35 percent only for the tie boost owner, with normal caps", () => {
  const a = player("a");
  const b = player("b");
  a.currentHp = b.currentHp = 100;
  a.currentPp = b.currentPp = 0;
  const result = battle({ a: "charge", b: "charge" }, { a: { tieBoost: true } }, { players: { a, b } });
  assert.equal(result.nextStates.a.currentHp, 450);
  assert.equal(result.nextStates.a.currentPp, 35);
  assert.equal(result.nextStates.b.currentHp, 350);
  assert.equal(result.nextStates.b.currentPp, 25);
  assert.equal(battle({ a: "charge", b: "charge" }, { a: { tieBoost: true } }).nextStates.a.currentHp, 1000);
  const nonTie = battle({ a: "charge", b: "paralysis" }, { a: { tieBoost: true } }, { players: { a, b } });
  assert.equal(nonTie.nextStates.a.currentHp, 350);
});

test("filter blocks first-turn hits and reflected damage, expires, and does not block statuses", () => {
  const skills = { b: { filter: true } };
  const blocked = battle({ a: "attack", b: "paralysis" }, skills, { turn: 1 });
  assert.equal(blocked.nextStates.b.currentHp, 1000);
  assert.deepEqual(blocked.logs, ["[スキル] b のフィルターがダメージを防いだ！"]);
  assert.equal(battle({ a: "attack", b: "paralysis" }, skills, { turn: 2 }).nextStates.b.currentHp, 925);
  const hit = battle({ a: "magicWeak", b: "attack" }, skills, {
    turn: 1, weakMagicSelections: { a: { kinds: ["paralysis"] } },
  });
  assert.equal(hit.nextStates.b.currentHp, 1000);
  assert.equal(hit.nextStates.b.paralyzedNextTurn, true);
  assert.equal(hit.damageEvents[0].avoided, false);
  const reflected = battle({ a: "magicWeak", b: "barrier" }, { a: { filter: true } }, {
    turn: 1, weakMagicSelections: { a: { kinds: ["paralysis"] } },
  });
  assert.equal(reflected.nextStates.a.currentHp, 1000);
  assert.equal(reflected.nextStates.a.paralyzedNextTurn, true);
  assert.equal(reflected.magicEffectEvents[0].reflected, true);
  const barrier = battle({ a: "barrier", b: "barrier" }, skills, { turn: 1 });
  assert.equal(barrier.nextStates.b.currentHp, 1000);
  assert.equal(barrier.nextStates.a.currentHp, 925);
});

test("status resistance cancels direct and reflected weak effects at the 50 percent boundary without changing damage", () => {
  for (const reflected of [false, true]) {
    const actions = { a: "magicWeak", b: reflected ? "barrier" : "attack" } satisfies Record<string, ActionType>;
    const affectedId = reflected ? "a" : "b";
    for (const roll of [0.49, 0.5]) {
      let calls = 0;
      const result = battle(actions, { [affectedId]: { statusResistance: true } }, {
        weakMagicSelections: { a: { kinds: ["paralysis"] } },
        rng: () => ++calls === 3 ? roll : 0.99,
      });
      assert.equal(result.nextStates[affectedId].currentHp, 925);
      assert.equal(result.nextStates[affectedId].paralyzedNextTurn, roll >= 0.5);
      assert.equal(result.magicEffectEvents.length, roll >= 0.5 ? 1 : 0);
      assert.equal(result.logs.some((log) => log.includes("防いだ")), roll < 0.5);
    }
  }
});

test("PP absorb uses actual paid PP, caps recovery, and requires a real barrier reflection", () => {
  const a = player("a");
  const b = player("b");
  b.currentPp = 0;
  const result = battle({ a: "magicStrong", b: "barrier" }, { b: { ppAbsorb: true } }, { players: { a, b } });
  assert.equal(result.nextStates.a.currentPp, 60);
  assert.equal(result.nextStates.b.currentPp, 8);
  assert.deepEqual(result.chargeEvents, []);
  assert.ok(result.logs.includes("[スキル] b はPPを8吸収した！"));
  a.currentPp = 5;
  b.currentPp = 99;
  const limited = battle({ a: "magicStrong", b: "barrier" }, { b: { ppAbsorb: true } }, { players: { a, b } });
  assert.equal(limited.nextStates.b.currentPp, 100);
  assert.equal(limited.chargeEvents.length, 0);
  assert.ok(limited.logs.includes("[スキル] b はPPを1吸収した！"));
  b.currentPp = 0;
  b.tieBanActive = true;
  const suppressed = battle({ a: "barrier", b: "barrier" }, { b: { ppAbsorb: true } }, { players: { a, b } });
  assert.equal(suppressed.nextStates.b.currentPp, 0);
  assert.equal(suppressed.chargeEvents.length, 0);
  a.currentPp = 40;
  a.stats.evasion = 1;
  b.tieBanActive = false;
  const avoided = battle({ a: "magicStrong", b: "barrier" }, { b: { ppAbsorb: true } }, { players: { a, b } });
  assert.equal(avoided.damageEvents[0].avoided, true);
  assert.equal(avoided.nextStates.b.currentPp, 8);
  const filtered = battle({ a: "magicStrong", b: "barrier" }, { a: { filter: true }, b: { ppAbsorb: true } }, {
    turn: 1, players: { a: { ...a, stats: { ...a.stats, evasion: 0 } }, b },
  });
  assert.equal(filtered.damageEvents[0].amount, 0);
  assert.equal(filtered.nextStates.b.currentPp, 8);
  assert.deepEqual(battle({ a: "magicStrong", b: "attack" }, { b: { ppAbsorb: true } }), battle({ a: "magicStrong", b: "attack" }));
});

test("PP absorb respects boss overcharge costs and PP availability", () => {
  const boss = player("a");
  const defender = player("b");
  boss.voidminationActive = true;
  boss.voidminationUsed = true;
  boss.currentPp = 200;
  defender.currentPp = 0;
  const extra = { players: { a: boss, b: defender }, roguelikeBossBattle: { floor: 16, bossId: "a", playerId: "b" } };
  const result = battle({ a: "magicStrong", b: "barrier" }, { b: { ppAbsorb: true } }, extra);
  assert.equal(result.nextStates.a.currentPp, 150);
  assert.equal(result.nextStates.b.currentPp, 10);
  boss.currentPp = 10;
  const limited = battle({ a: "magicStrong", b: "barrier" }, { b: { ppAbsorb: true } }, extra);
  assert.equal(limited.nextStates.b.currentPp, 2);
});

test("pain share is not reduced by normal resistances or boosted by tie boost; first-turn filter blocks it", () => {
  const boss = player("b");
  boss.voidminationActive = true;
  boss.voidminationUsed = true;
  const extra = { players: { a: player("a"), b: boss }, roguelikeBossBattle: { floor: 10, bossId: "b", playerId: "a" } };
  const result = battle({ a: "attack", b: "paralysis" }, { a: { attackResistance: 3, magicResistance: 3, barrierResistance: 3, tieBoost: true } }, extra);
  assert.equal(result.damageEvents.find((event) => event.reason === "ペインシェア")?.amount, 15);
  const filtered = battle({ a: "attack", b: "paralysis" }, { a: { filter: true } }, { ...extra, turn: 1 });
  assert.equal(filtered.nextStates.a.currentHp, 1000);
  assert.equal(filtered.nextStates.b.currentHp, 925);
  assert.deepEqual(filtered.logs, ["[スキル] a のフィルターがダメージを防いだ！"]);
  const multipleBlocks = battle({ a: "attack", b: "attack" }, { a: { filter: true } }, { ...extra, turn: 1 });
  assert.deepEqual(multipleBlocks.logs, ["[スキル] a のフィルターがダメージを防いだ！"]);
  const tied = battle({ a: "attack", b: "attack" }, { a: { tieBoost: true, barrierResistance: 3 } }, extra);
  assert.equal(tied.damageEvents[0].amount, 83);
  assert.equal(tied.damageEvents[1].reason, "ペインシェア");
  assert.equal(tied.damageEvents[1].amount, 16);
});

test("filter does not log without a landed positive hit or positive pain-share damage", () => {
  const a = player("a");
  const b = player("b");
  b.stats.evasion = 1;
  const avoided = battle({ a: "attack", b: "paralysis" }, { b: { filter: true } }, { turn: 1, players: { a, b } });
  assert.deepEqual(avoided.logs, []);
  assert.deepEqual(battle({ a: "paralysis", b: "paralysis" }, { a: { filter: true } }, { turn: 1 }).logs, []);
  a.stats.attack = 1;
  b.stats.evasion = 0;
  b.voidminationActive = true;
  b.voidminationUsed = true;
  const zeroPainShare = battle({ a: "attack", b: "paralysis" }, { a: { filter: true } }, {
    turn: 1, players: { a, b }, roguelikeBossBattle: { floor: 10, bossId: "b", playerId: "a" },
  });
  assert.deepEqual(zeroPainShare.logs, []);
});

test("auto HP and PP recovery runs after combat, reports actual gains, and caps resources", () => {
  const a = player("a");
  a.currentHp = 990;
  a.currentPp = 98;
  const result = battle({ a: "paralysis", b: "paralysis" }, { a: { hpRegen: true, ppRegen: true } }, { players: { a, b: player("b") } });
  assert.equal(result.nextStates.a.currentHp, 1000);
  assert.equal(result.nextStates.a.currentPp, 100);
  assert.deepEqual(result.chargeEvents, []);
  assert.ok(result.logs.includes("[スキル] a はHPを10、PPを2自動回復した！"));
  const afterHit = battle({ a: "paralysis", b: "attack" }, { a: { hpRegen: true } });
  assert.equal(afterHit.nextStates.a.currentHp, 975);
});

test("auto recovery does not resurrect a defeated player or alter the winner", () => {
  const a = player("a");
  a.currentHp = 1;
  a.currentPp = 0;
  const result = battle({ a: "paralysis", b: "attack" }, { a: { hpRegen: true, ppRegen: true } }, { players: { a, b: player("b") } });
  assert.equal(result.nextStates.a.currentHp, 0);
  assert.equal(result.nextStates.a.currentPp, 0);
  assert.equal(result.winnerId, "b");
  assert.equal(result.chargeEvents.length, 0);
});

test("auto recovery skips capped resources and applies only to the skill owner", () => {
  const result = battle({ a: "paralysis", b: "paralysis" }, { a: { hpRegen: true, ppRegen: true } });
  assert.equal(result.logs.length, 0);
  assert.equal(result.chargeEvents.length, 0);
  const a = player("a");
  const b = player("b");
  a.currentHp = b.currentHp = 500;
  a.currentPp = b.currentPp = 0;
  const recovered = battle({ a: "paralysis", b: "paralysis" }, { a: { hpRegen: true, ppRegen: true } }, { players: { a, b } });
  assert.equal(recovered.nextStates.a.currentHp, 550);
  assert.equal(recovered.nextStates.a.currentPp, 5);
  assert.equal(recovered.nextStates.b.currentHp, 500);
  assert.equal(recovered.nextStates.b.currentPp, 0);
});
