import assert from "node:assert/strict";
import test from "node:test";
import { getBossData } from "@/data/bosses";

test("getBossData normal mode floor 1", () => {
  const boss = getBossData(1, 1, "normal");
  assert.equal(boss.stats.maxHp, 315);
  assert.equal(boss.stats.maxPp, 55);
  assert.equal(boss.stats.attack, 170);
  assert.equal(boss.stats.defense, 100);
  assert.equal(boss.stats.speed, 6);
  assert.ok(Math.abs(boss.stats.evasion - 0.01) < 1e-9);
});

test("getBossData normal mode floor 2", () => {
  const boss = getBossData(2, 1, "normal");
  assert.equal(boss.stats.maxHp, 456);
  assert.equal(boss.stats.maxPp, 80);
  assert.equal(boss.stats.attack, 110);
  assert.equal(boss.stats.defense, 100);
  assert.equal(boss.stats.speed, 7);
  assert.ok(Math.abs(boss.stats.evasion - 0.03) < 1e-9);
});

test("getBossData normal mode floor 3", () => {
  const boss = getBossData(3, 1, "normal");
  assert.equal(boss.stats.maxHp, 256);
  assert.equal(boss.stats.attack, 128);
  assert.equal(boss.stats.defense, 160);
  assert.equal(boss.stats.speed, 1);
  assert.ok(Math.abs(boss.stats.evasion - 0.20) < 1e-9);
});

test("getBossData normal mode floor 4", () => {
  const boss = getBossData(4, 1, "normal");
  assert.equal(boss.stats.maxHp, 666);
  assert.equal(boss.stats.attack, 128);
  assert.equal(boss.stats.defense, 128);
  assert.equal(boss.stats.speed, 7);
  assert.ok(Math.abs(boss.stats.evasion - 0.06) < 1e-9);
});

test("getBossData normal mode floor 5 phase 1", () => {
  const boss = getBossData(5, 1, "normal");
  assert.equal(boss.stats.maxHp, 444);
  assert.equal(boss.stats.maxPp, 44);
  assert.equal(boss.stats.attack, 144);
  assert.equal(boss.stats.defense, 144);
  assert.equal(boss.stats.speed, 4);
  assert.ok(Math.abs(boss.stats.evasion - 0.04) < 1e-9);
});

test("getBossData normal mode floor 5 phase 2", () => {
  const boss = getBossData(5, 2, "normal");
  assert.equal(boss.stats.maxHp, 777);
  assert.equal(boss.stats.maxPp, 77);
  assert.equal(boss.stats.attack, 166);
  assert.equal(boss.stats.defense, 166);
  assert.equal(boss.stats.speed, 5);
  assert.ok(Math.abs(boss.stats.evasion - 0.05) < 1e-9);
});

test("getBossData hard mode floor 1", () => {
  const boss = getBossData(1, 1, "hard");
  assert.equal(boss.stats.maxHp, 355);
  assert.equal(boss.stats.maxPp, 55);
  assert.equal(boss.stats.attack, 199);
  assert.equal(boss.stats.defense, 100);
  assert.equal(boss.stats.speed, 7);
  assert.ok(Math.abs(boss.stats.evasion - 0.03) < 1e-9);
});

test("getBossData hard mode floor 2", () => {
  const boss = getBossData(2, 1, "hard");
  assert.equal(boss.stats.maxHp, 499);
  assert.equal(boss.stats.maxPp, 80);
  assert.equal(boss.stats.attack, 125);
  assert.equal(boss.stats.defense, 115);
  assert.equal(boss.stats.speed, 9);
  assert.ok(Math.abs(boss.stats.evasion - 0.05) < 1e-9);
});

test("getBossData hard mode floor 3", () => {
  const boss = getBossData(3, 1, "hard");
  assert.equal(boss.stats.maxHp, 256);
  assert.equal(boss.stats.attack, 128);
  assert.equal(boss.stats.defense, 200);
  assert.equal(boss.stats.speed, 1);
  assert.ok(Math.abs(boss.stats.evasion - 0.25) < 1e-9);
});

test("getBossData hard mode floor 4", () => {
  const boss = getBossData(4, 1, "hard");
  assert.equal(boss.stats.maxHp, 666);
  assert.equal(boss.stats.attack, 140);
  assert.equal(boss.stats.defense, 130);
  assert.equal(boss.stats.speed, 9);
  assert.ok(Math.abs(boss.stats.evasion - 0.06) < 1e-9);
});

test("getBossData hard mode floor 5 phase 1", () => {
  const boss = getBossData(5, 1, "hard");
  assert.equal(boss.stats.maxHp, 444);
  assert.equal(boss.stats.maxPp, 44);
  assert.equal(boss.stats.attack, 144);
  assert.equal(boss.stats.defense, 144);
  assert.equal(boss.stats.speed, 4);
  assert.ok(Math.abs(boss.stats.evasion - 0.04) < 1e-9);
});

test("getBossData hard mode floor 5 phase 2", () => {
  const boss = getBossData(5, 2, "hard");
  assert.equal(boss.stats.maxHp, 999);
  assert.equal(boss.stats.maxPp, 99);
  assert.equal(boss.stats.attack, 177);
  assert.equal(boss.stats.defense, 177);
  assert.equal(boss.stats.speed, 6);
  assert.ok(Math.abs(boss.stats.evasion - 0.05) < 1e-9);
});

test("getBossData defaults to normal when difficulty is omitted", () => {
  const boss = getBossData(1, 1);
  assert.equal(boss.stats.maxHp, 315);
});

test("getBossData same typeName/characterType/imageUrl for both difficulties on floor 1", () => {
  const normal = getBossData(1, 1, "normal");
  const hard = getBossData(1, 1, "hard");
  assert.equal(normal.typeName, hard.typeName);
  assert.equal(normal.characterType, hard.characterType);
  assert.equal(normal.imageUrl, hard.imageUrl);
});

test("getBossData throws for invalid floor", () => {
  assert.throws(() => getBossData(99, 1, "normal"));
  assert.throws(() => getBossData(99, 1, "hard"));
});
