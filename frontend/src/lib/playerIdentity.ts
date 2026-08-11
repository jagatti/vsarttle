export interface PlayerIdentity {
  playerId: string;
  nickname: string;
}

const PLAYER_IDENTITY_KEY = "arttle_player_identity";

function defaultIdentity(nickname = "プレイヤー", createId: () => string = createPlayerUuid): PlayerIdentity {
  return {
    playerId: createId(),
    nickname: nickname.trim() || "プレイヤー",
  };
}

export function createPlayerUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `player-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function loadPlayerIdentity(): PlayerIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PLAYER_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.playerId !== "string" || typeof value.nickname !== "string") return null;
    return {
      playerId: value.playerId,
      nickname: value.nickname.trim() || "プレイヤー",
    };
  } catch {
    return null;
  }
}

export function persistPlayerIdentity(identity: PlayerIdentity): PlayerIdentity {
  const normalized: PlayerIdentity = {
    playerId: identity.playerId,
    nickname: identity.nickname.trim() || "プレイヤー",
  };
  if (typeof window === "undefined") return normalized;
  try {
    localStorage.setItem(PLAYER_IDENTITY_KEY, JSON.stringify(normalized));
  } catch {
    // localStorage unavailable or full — ignore.
  }
  return normalized;
}

export function ensurePlayerIdentity(
  nickname = "プレイヤー",
  createId: () => string = createPlayerUuid,
): PlayerIdentity {
  const existing = loadPlayerIdentity();
  if (existing) return existing;
  return persistPlayerIdentity(defaultIdentity(nickname, createId));
}

export function updateStoredNickname(nickname: string): PlayerIdentity | null {
  const existing = loadPlayerIdentity();
  if (!existing) return null;
  return persistPlayerIdentity({
    ...existing,
    nickname,
  });
}
