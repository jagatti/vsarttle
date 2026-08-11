import assert from "node:assert/strict";
import test from "node:test";
import { fetchPlayerProfile, submitMatchRecord, syncPlayerNickname } from "@/lib/profileApi";
import type { MatchSubmissionPayload, PlayerProfileResponse, PlayerRecord } from "@/lib/persistenceTypes";

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
      singlePlayResult: { floor: 1, scoreRank: "S" },
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
      singlePlay: { bestFloorCleared: 0, bestScoreRank: null },
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
    singlePlay: { bestFloorCleared: 0, bestScoreRank: null },
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
