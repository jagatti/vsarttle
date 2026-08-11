import assert from "node:assert/strict";
import test from "node:test";
import { ensurePlayerIdentity, loadPlayerIdentity, persistPlayerIdentity, updateStoredNickname } from "@/lib/playerIdentity";

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((key) => delete store[key]); },
  };
}

function setupEnv() {
  const ls = makeLocalStorageMock();
  // @ts-expect-error intentional test mock
  globalThis.window = { localStorage: ls };
  // @ts-expect-error intentional test mock
  globalThis.localStorage = ls;
  return ls;
}

test("ensurePlayerIdentity creates and reuses a persistent id", () => {
  setupEnv();
  const created = ensurePlayerIdentity("テスト", () => "uuid-1");
  const loaded = ensurePlayerIdentity("別名", () => "uuid-2");
  assert.equal(created.playerId, "uuid-1");
  assert.deepEqual(loaded, created);
});

test("persistPlayerIdentity and loadPlayerIdentity round-trip nickname", () => {
  setupEnv();
  persistPlayerIdentity({ playerId: "player-1", nickname: "プレイヤーA" });
  assert.deepEqual(loadPlayerIdentity(), { playerId: "player-1", nickname: "プレイヤーA" });
});

test("updateStoredNickname keeps player id and normalizes blank names", () => {
  setupEnv();
  persistPlayerIdentity({ playerId: "player-2", nickname: "初期名" });
  const updated = updateStoredNickname("   ");
  assert.deepEqual(updated, { playerId: "player-2", nickname: "プレイヤー" });
});
