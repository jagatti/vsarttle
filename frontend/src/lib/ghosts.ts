import { SEED_GHOSTS } from "@/data/seed-ghosts";
import type { GhostRecord, MatchRecord } from "@/lib/persistenceTypes";

const MIN_ARCHIVE_GHOST_CANDIDATES = 3;

export function listArchiveGhosts(matches: MatchRecord[], excludePlayerId?: string): GhostRecord[] {
  const candidates: GhostRecord[] = [];
  for (const match of matches) {
    for (const player of match.players) {
      if (!player.playerId) continue;
      if (excludePlayerId && player.playerId === excludePlayerId) continue;
      candidates.push({
        source: "archive",
        seedId: null,
        ownerPlayerId: player.playerId,
        nickname: player.nickname,
        characterType: player.characterType,
        stats: player.stats,
        drawingThumbnail: player.drawingThumbnail,
      });
    }
  }
  return candidates;
}

export function pickRandomGhost(
  matches: MatchRecord[],
  options: {
    excludePlayerId?: string;
    random?: () => number;
  } = {},
): GhostRecord {
  const random = options.random ?? Math.random;
  const archive = listArchiveGhosts(matches, options.excludePlayerId);
  const pool = archive.length >= MIN_ARCHIVE_GHOST_CANDIDATES ? archive : SEED_GHOSTS;
  return pool[Math.floor(random() * pool.length)] ?? SEED_GHOSTS[0];
}
