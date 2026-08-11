import { promises as fs } from "node:fs";
import path from "node:path";
import type { MatchRecord, PlayerRecord, StorageBackend } from "@/lib/persistenceTypes";

const STORAGE_KEY = "vsarttle:persistence";
const FALLBACK_FILE = path.join(process.env.TMPDIR ?? "/tmp", "vsarttle-persistence.json");

export interface PersistenceSnapshot {
  matches: MatchRecord[];
  players: Record<string, PlayerRecord>;
}

const EMPTY_SNAPSHOT: PersistenceSnapshot = {
  matches: [],
  players: {},
};

function isKvConfigured(): boolean {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
}

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
  const data = await response.json() as { result?: T | null };
  return data.result ?? null;
}

async function loadFromKv(): Promise<PersistenceSnapshot> {
  const raw = await kvCommand<string>("GET", STORAGE_KEY);
  if (!raw) return structuredClone(EMPTY_SNAPSHOT);
  try {
    return JSON.parse(raw) as PersistenceSnapshot;
  } catch {
    return structuredClone(EMPTY_SNAPSHOT);
  }
}

async function saveToKv(snapshot: PersistenceSnapshot): Promise<void> {
  await kvCommand("SET", STORAGE_KEY, JSON.stringify(snapshot));
}

async function loadFromFile(): Promise<PersistenceSnapshot> {
  try {
    const raw = await fs.readFile(FALLBACK_FILE, "utf8");
    return JSON.parse(raw) as PersistenceSnapshot;
  } catch {
    return structuredClone(EMPTY_SNAPSHOT);
  }
}

async function saveToFile(snapshot: PersistenceSnapshot): Promise<void> {
  await fs.mkdir(path.dirname(FALLBACK_FILE), { recursive: true });
  await fs.writeFile(FALLBACK_FILE, JSON.stringify(snapshot), "utf8");
}

export function getStorageBackend(): StorageBackend {
  return isKvConfigured() ? "vercel-kv" : "local-file";
}

export async function loadPersistenceSnapshot(): Promise<PersistenceSnapshot> {
  return isKvConfigured() ? loadFromKv() : loadFromFile();
}

export async function savePersistenceSnapshot(snapshot: PersistenceSnapshot): Promise<void> {
  if (isKvConfigured()) {
    await saveToKv(snapshot);
    return;
  }
  await saveToFile(snapshot);
}
