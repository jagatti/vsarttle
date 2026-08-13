/**
 * One-time maintenance script:
 * - Removes blank drawingThumbnail entries from `ghostPool`
 * - Scans `match:*` records with Redis SCAN and reports blank player thumbnails
 *
 * Usage:
 *   REDIS_URL="redis://..." npx tsx scripts/cleanup-blank-thumbnails.ts
 */
import type { MatchRecord } from "@/lib/persistenceTypes";
import { isBlankThumbnail } from "@/lib/imageThumbnail";
import { createClient } from "redis";

interface GhostPoolEntryLike {
  drawingThumbnail?: unknown;
}

interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  scan(cursor: string, options: { MATCH: string; COUNT: number }): Promise<{ cursor: string; keys: string[] }>;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function cleanupGhostPool(client: RedisClientLike) {
  const pool = parseJson<GhostPoolEntryLike[]>(await client.get("ghostPool")) ?? [];
  const next = pool.filter((entry) => {
    const thumbnail = typeof entry.drawingThumbnail === "string" ? entry.drawingThumbnail : "";
    return !isBlankThumbnail(thumbnail);
  });
  const removed = pool.length - next.length;
  if (removed > 0) {
    await client.set("ghostPool", JSON.stringify(next));
  }
  return { scanned: pool.length, removed };
}

async function inspectMatchThumbnails(client: RedisClientLike) {
  let cursor = "0";
  let scannedMatches = 0;
  let blankThumbnailPlayers = 0;
  const affectedMatchIds = new Set<string>();

  do {
    const result = await client.scan(cursor, { MATCH: "match:*", COUNT: 200 });
    cursor = result.cursor;
    for (const key of result.keys) {
      const match = parseJson<MatchRecord>(await client.get(key));
      if (!match || !Array.isArray(match.players)) continue;
      scannedMatches += 1;

      const blankPlayers = match.players
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => isBlankThumbnail(player.drawingThumbnail))
        .map(({ player, index }) => player.playerId ?? `index:${index}`);

      if (blankPlayers.length > 0) {
        blankThumbnailPlayers += blankPlayers.length;
        affectedMatchIds.add(match.matchId);
        console.log(`[cleanup-blank-thumbnails] match=${match.matchId} blankPlayers=${blankPlayers.join(",")}`);
      }
    }
  } while (cursor !== "0");

  return {
    scannedMatches,
    blankThumbnailPlayers,
    affectedMatchIds: [...affectedMatchIds],
  };
}

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required.");
  }

  const client = createClient({ url: redisUrl });
  await client.connect();
  try {
    const ghostPool = await cleanupGhostPool(client);
    const matches = await inspectMatchThumbnails(client);
    const summary = {
      ghostPool,
      matches,
    };
    console.log("[cleanup-blank-thumbnails] summary", JSON.stringify(summary, null, 2));
  } finally {
    await client.quit();
  }
}

void main().catch((error) => {
  console.error("[cleanup-blank-thumbnails] failed", error);
  process.exitCode = 1;
});
