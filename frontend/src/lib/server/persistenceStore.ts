/**
 * Individual-key persistence store.
 *
 * Key layout:
 *   match:{matchId}                  – MatchRecord JSON
 *   player:{playerId}                – PlayerRecord JSON
 *   matchIndex:byPlayer:{playerId}   – JSON array of matchId strings (newest-first, max 50)
 *   ghostPool                        – JSON array of GhostPoolEntry (max 200)
 *
 * NOTE: The /tmp fallback is for local development only.
 * In production (NODE_ENV=production + Vercel environment) KV_REST_API_URL must be set.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GhostRecord, MatchRecord, PlayerRecord, StorageBackend } from "@/lib/persistenceTypes";

const FALLBACK_DIR = path.join(process.env.TMPDIR ?? "/tmp", "vsarttle-kv");
const MATCH_INDEX_LIMIT = 50;
const GHOST_POOL_LIMIT = 200;

// Lightweight record stored in the ghost pool index
export interface GhostPoolEntry {
  ownerPlayerId: string;
  matchId: string;
  nickname: string;
  characterType: string;
  stats: MatchRecord["players"][0]["stats"];
  drawingThumbnail: string;
}

// ---- KV configured check & warning ----

function isKvConfigured(): boolean {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
}

let _kvWarnedOnce = false;
function warnIfKvMissing(): void {
  if (_kvWarnedOnce) return;
  const isVercel = !!process.env.VERCEL;
  if (process.env.NODE_ENV === "production" && isVercel && !isKvConfigured()) {
    _kvWarnedOnce = true;
    console.warn(
      "[vsarttle] WARNING: KV_REST_API_URL / KV_REST_API_TOKEN are not set in this Vercel production environment. " +
        "Falling back to /tmp which is NOT shared across serverless instances — data will NOT persist reliably. " +
        "Please configure Vercel KV.",
    );
  }
}

// ---- Low-level KV helpers ----

async function kvCommand<T>(...command: (string | number)[]): Promise<T | null> {
  const response = await fetch(process.env.KV_REST_API_URL!, {
    method: "POST",
    headers: {
      Authorization: ["Bearer", process.env.KV_REST_API_TOKEN!].join(" "),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`KV command failed: ${response.status}`);
  }
  const data = (await response.json()) as { result?: T | null };
  return data.result ?? null;
}

async function kvGet<T>(key: string): Promise<T | null> {
  const raw = await kvCommand<string>("GET", key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  await kvCommand("SET", key, JSON.stringify(value));
}

async function kvIncr(key: string): Promise<number> {
  const result = await kvCommand<number>("INCR", key);
  return result ?? 1;
}

// ---- File-based fallback helpers (dev only) ----

function fileKey(key: string): string {
  // Replace characters that are unsafe in filenames
  return path.join(FALLBACK_DIR, key.replace(/[:/]/g, "_") + ".json");
}

async function fileGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(fileKey(key), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fileSet(key: string, value: unknown): Promise<void> {
  const p = fileKey(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(value), "utf8");
}

// Atomic-ish increment via read-modify-write (file backend, dev only)
async function fileIncr(key: string): Promise<number> {
  const current = (await fileGet<number>(key)) ?? 0;
  const next = current + 1;
  await fileSet(key, next);
  return next;
}

// ---- Generic get/set/incr dispatch ----

async function kget<T>(key: string): Promise<T | null> {
  warnIfKvMissing();
  return isKvConfigured() ? kvGet<T>(key) : fileGet<T>(key);
}

async function kset(key: string, value: unknown): Promise<void> {
  warnIfKvMissing();
  return isKvConfigured() ? kvSet(key, value) : fileSet(key, value);
}

async function kincr(key: string): Promise<number> {
  warnIfKvMissing();
  return isKvConfigured() ? kvIncr(key) : fileIncr(key);
}

// ---- Public persistence API ----

export function getStorageBackend(): StorageBackend {
  return isKvConfigured() ? "vercel-kv" : "local-file";
}

// --- Match ---

export async function saveMatch(match: MatchRecord): Promise<void> {
  await kset(`match:${match.matchId}`, match);
}

export async function loadMatch(matchId: string): Promise<MatchRecord | null> {
  return kget<MatchRecord>(`match:${matchId}`);
}

export async function matchExists(matchId: string): Promise<boolean> {
  return (await loadMatch(matchId)) !== null;
}

// --- Player ---

export async function savePlayer(player: PlayerRecord): Promise<void> {
  await kset(`player:${player.playerId}`, player);
}

export async function loadPlayer(playerId: string): Promise<PlayerRecord | null> {
  return kget<PlayerRecord>(`player:${playerId}`);
}

/**
 * Increment a numeric counter on a player record atomically.
 * Uses KV INCR when available; falls back to read-modify-write on the counter-only key.
 */
export async function incrPlayerCounter(
  playerId: string,
  field: "wins" | "losses" | "draws" | "ghostWins" | "asGhostBattles" | "asGhostWins",
): Promise<number> {
  return kincr(`player:${playerId}:${field}`);
}

export async function loadPlayerCounters(
  playerId: string,
): Promise<Record<"wins" | "losses" | "draws" | "ghostWins" | "asGhostBattles" | "asGhostWins", number>> {
  const fields = ["wins", "losses", "draws", "ghostWins", "asGhostBattles", "asGhostWins"] as const;
  const values = await Promise.all(fields.map((f) => kget<number>(`player:${playerId}:${f}`)));
  return Object.fromEntries(fields.map((f, i) => [f, values[i] ?? 0])) as Record<(typeof fields)[number], number>;
}

// --- Match index per player ---

export async function appendMatchIndexForPlayer(playerId: string, matchId: string): Promise<void> {
  const key = `matchIndex:byPlayer:${playerId}`;
  const current = (await kget<string[]>(key)) ?? [];
  // Prepend newest, cap at MATCH_INDEX_LIMIT
  const next = [matchId, ...current.filter((id) => id !== matchId)].slice(0, MATCH_INDEX_LIMIT);
  await kset(key, next);
}

export async function loadMatchIdsByPlayer(playerId: string): Promise<string[]> {
  return (await kget<string[]>(`matchIndex:byPlayer:${playerId}`)) ?? [];
}

export async function loadRecentMatchesByPlayer(playerId: string, limit = 10): Promise<MatchRecord[]> {
  const ids = (await loadMatchIdsByPlayer(playerId)).slice(0, limit);
  const records = await Promise.all(ids.map((id) => loadMatch(id)));
  return records.filter((r): r is MatchRecord => r !== null);
}

// --- Ghost pool ---

export async function loadGhostPool(): Promise<GhostPoolEntry[]> {
  return (await kget<GhostPoolEntry[]>("ghostPool")) ?? [];
}

export async function upsertGhostPool(entry: GhostPoolEntry): Promise<void> {
  const pool = await loadGhostPool();
  // Replace existing entry for same owner to keep at most 2 per player (keep newest)
  const filtered = pool.filter((e) => !(e.ownerPlayerId === entry.ownerPlayerId && e.matchId === entry.matchId));
  // Keep the 2 most recent per player
  const perPlayer = filtered.filter((e) => e.ownerPlayerId === entry.ownerPlayerId);
  if (perPlayer.length >= 2) {
    // Remove the oldest for this player (last in list since we prepend)
    const oldestIdx = filtered.map((e, i) => (e.ownerPlayerId === entry.ownerPlayerId ? i : -1)).filter((i) => i >= 0).at(-1)!;
    filtered.splice(oldestIdx, 1);
  }
  const next = [entry, ...filtered].slice(0, GHOST_POOL_LIMIT);
  await kset("ghostPool", next);
}

export function ghostPoolEntryToGhostRecord(entry: GhostPoolEntry): GhostRecord {
  return {
    source: "archive",
    seedId: null,
    ownerPlayerId: entry.ownerPlayerId,
    nickname: entry.nickname,
    characterType: entry.characterType as GhostRecord["characterType"],
    stats: entry.stats,
    drawingThumbnail: entry.drawingThumbnail,
  };
}

// ---- Legacy snapshot API (kept for compatibility) ----
// Routes have been migrated away from this; these are thin wrappers kept
// so that any remaining call-sites continue to compile.

export interface PersistenceSnapshot {
  matches: MatchRecord[];
  players: Record<string, PlayerRecord>;
}

/** @deprecated Use individual load/save functions instead. */
export async function loadPersistenceSnapshot(): Promise<PersistenceSnapshot> {
  return { matches: [], players: {} };
}

/** @deprecated Use individual load/save functions instead. */
export async function savePersistenceSnapshot(_snapshot: PersistenceSnapshot): Promise<void> {
  // no-op: callers have been migrated to individual key functions
}
