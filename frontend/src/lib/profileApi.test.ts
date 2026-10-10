import assert from "node:assert/strict";
import test from "node:test";
import { fetchPlayerProfile, savePlayerNickname, submitMatchRecord, syncPlayerNickname } from "@/lib/profileApi";
import { loadPlayerIdentity, persistPlayerIdentity } from "@/lib/playerIdentity";
import type { MatchSubmissionPayload, PlayerProfileResponse, PlayerRecord } from "@/lib/persistenceTypes";

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockIdentityStorage(t: test.TestContext) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
  });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
}

test("savePlayerNickname normalizes, syncs once, and persists the same identity", async (t) => {
  mockIdentityStorage(t);
  const identity = persistPlayerIdentity({ playerId: "player/1", nickname: "元の名前" });

  for (const [input, expected] of [
    ["  新しい名前  ", "新しい名前"],
    ["   ", "プレイヤー"],
    ["abcdefghijklmnopq", "abcdefghijklmnop"],
  ]) {
    let requests = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      requests++;
      assert.equal(url, "/api/players/player%2F1");
      assert.equal(init?.method, "PATCH");
      assert.deepEqual(JSON.parse(init?.body as string), { nickname: expected });
      return makeResponse({ player: { playerId: identity.playerId, nickname: expected } });
    };
    const updated = await savePlayerNickname(identity, input, { fetchImpl });
    assert.equal(requests, 1);
    assert.deepEqual(updated, { playerId: identity.playerId, nickname: expected });
    assert.deepEqual(loadPlayerIdentity(), updated);
  }
});

test("failed profile saves preserve the stored name; room saves still allow offline play", async (t) => {
  mockIdentityStorage(t);
  const identity = persistPlayerIdentity({ playerId: "player-1", nickname: "元の名前" });
  const fetchImpl: typeof fetch = async () => makeResponse({}, 500);

  await assert.rejects(savePlayerNickname(identity, "新しい名前", { fetchImpl }), /nickname sync failed/);
  assert.deepEqual(loadPlayerIdentity(), identity);

  const updated = await savePlayerNickname(identity, " 新しい名前 ", { fetchImpl, allowOffline: true });
  assert.deepEqual(updated, { playerId: identity.playerId, nickname: "新しい名前" });
  assert.deepEqual(loadPlayerIdentity(), updated);
});

test("submitMatchRecord posts to matches api", async () => {
  let called = "";
  const payload = {
    match: {
      matchId: "match-1",
      playedAt: "2026-08-11T00:00:00.000Z",
      battleMode: "simple",
      source: "singleplay",
      players: [
        {
          playerId: "player-1",
          nickname: "A",
          characterType: "balanced",
          stats: { hp: 1, maxHp: 1, pp: 1, maxPp: 1, attack: 1, defense: 1, speed: 1, evasion: 0 },
          drawingThumbnail: "data:image/png;base64,abc",
        },
      ],
      winnerId: "player-1",
      turnCount: 1,
      finalHpRatio: 1,
      singlePlayResult: { floor: 1, scoreRank: "S", difficulty: "normal" },
      rating: null,
    },
  } satisfies MatchSubmissionPayload;

  await submitMatchRecord(payload, async (input, init) => {
    called = `${String(input)}:${init?.method}`;
    return makeResponse({ ok: true });
  });

  assert.equal(called, "/api/matches:POST");
});

test("fetchPlayerProfile reads player endpoint", async () => {
  const expected = {
    player: {
      playerId: "player-1",
      nickname: "A",
      wins: 1,
      losses: 0,
      draws: 0,
      currentStreak: 1,
      bestStreak: 1,
      typeUsageCount: { attack: 1, magic: 0, defense: 0, balanced: 0 },
      singlePlay: {
        normal: { bestFloorCleared: 0, bestScoreRank: null },
        hard: { bestFloorCleared: 0, bestScoreRank: null },
      },
      rating: null,
      updatedAt: "2026-08-11T00:00:00.000Z",
    },
    recentMatches: [],
    storageBackend: "local-file",
  } satisfies PlayerProfileResponse;

  const profile = await fetchPlayerProfile("player-1", async () => makeResponse(expected));
  assert.deepEqual(profile, expected);
});

test("syncPlayerNickname patches player endpoint", async () => {
  const expectedPlayer = {
    playerId: "player-1",
    nickname: "新しい名前",
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
    typeUsageCount: { attack: 0, magic: 0, defense: 0, balanced: 0 },
    singlePlay: {
      normal: { bestFloorCleared: 0, bestScoreRank: null },
      hard: { bestFloorCleared: 0, bestScoreRank: null },
    },
    rating: null,
    updatedAt: "2026-08-11T00:00:00.000Z",
  } satisfies PlayerRecord;

  const player = await syncPlayerNickname("player-1", "新しい名前", async (input, init) => {
    assert.equal(String(input), "/api/players/player-1");
    assert.equal(init?.method, "PATCH");
    return makeResponse({ player: expectedPlayer });
  });

  assert.deepEqual(player, expectedPlayer);
});
