import type { GhostRecord } from "@/lib/persistenceTypes";

const stats = (hp: number, pp: number, attack: number, defense: number, speed: number, evasionPct: number) => ({
  hp,
  maxHp: hp,
  pp,
  maxPp: pp,
  attack,
  defense,
  speed,
  evasion: evasionPct / 100,
});

export const SEED_GHOSTS: GhostRecord[] = [
  {
    source: "seed",
    seedId: "seed-ember",
    ownerPlayerId: null,
    nickname: "エンバー",
    characterType: "attack",
    stats: stats(320, 44, 170, 100, 6, 2),
    drawingThumbnail: "/arttle_boss/boss1.png",
  },
  {
    source: "seed",
    seedId: "seed-mistral",
    ownerPlayerId: null,
    nickname: "ミストラル",
    characterType: "magic",
    stats: stats(360, 72, 118, 102, 8, 4),
    drawingThumbnail: "/arttle_boss/boss2.png",
  },
  {
    source: "seed",
    seedId: "seed-bulwark",
    ownerPlayerId: null,
    nickname: "ブルワーク",
    characterType: "defense",
    stats: stats(390, 52, 122, 170, 2, 16),
    drawingThumbnail: "/arttle_boss/boss3.png",
  },
  {
    source: "seed",
    seedId: "seed-lumen",
    ownerPlayerId: null,
    nickname: "ルーメン",
    characterType: "magic",
    stats: stats(340, 86, 128, 112, 7, 6),
    drawingThumbnail: "/arttle_boss/boss4.png",
  },
  {
    source: "seed",
    seedId: "seed-cobalt",
    ownerPlayerId: null,
    nickname: "コバルト",
    characterType: "balanced",
    stats: stats(350, 58, 134, 136, 4, 5),
    drawingThumbnail: "/arttle_boss/boss5-1.png",
  },
  {
    source: "seed",
    seedId: "seed-nova",
    ownerPlayerId: null,
    nickname: "ノヴァ",
    characterType: "balanced",
    stats: stats(410, 70, 148, 144, 5, 5),
    drawingThumbnail: "/arttle_boss/boss5-2.png",
  },
];
