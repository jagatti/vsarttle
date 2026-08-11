import type { MatchSubmissionPayload, PlayerProfileResponse, PlayerRecord } from "@/lib/persistenceTypes";

export async function submitMatchRecord(
  payload: MatchSubmissionPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; duplicate?: boolean }> {
  const response = await fetchImpl("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`match submit failed: ${response.status}`);
  }
  return response.json() as Promise<{ ok: true; duplicate?: boolean }>;
}

export async function fetchPlayerProfile(
  playerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlayerProfileResponse> {
  const response = await fetchImpl(`/api/players/${encodeURIComponent(playerId)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`profile fetch failed: ${response.status}`);
  }
  return response.json() as Promise<PlayerProfileResponse>;
}

export async function syncPlayerNickname(
  playerId: string,
  nickname: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlayerRecord> {
  const response = await fetchImpl(`/api/players/${encodeURIComponent(playerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok) {
    throw new Error(`nickname sync failed: ${response.status}`);
  }
  const data = await response.json() as { player: PlayerRecord };
  return data.player;
}
