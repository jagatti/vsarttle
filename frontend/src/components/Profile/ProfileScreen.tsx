"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSlots, SLOT_COUNT } from "@/lib/drawingSlots";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { fetchPlayerProfile } from "@/lib/profileApi";
import { analyzeDrawing } from "@/lib/statCalculator";
import type { MatchRecord, PlayerProfileResponse } from "@/lib/persistenceTypes";
import type { CharacterStats, CharacterType, DrawingData } from "@/types/game";
import { soundManager } from "@/lib/soundManager";

function getMatchOutcome(match: MatchRecord, playerId: string): { label: string; color: string } {
  if (match.winnerId === null) return { label: "引き分け", color: "#cbd5e1" };
  if (match.winnerId === playerId) return { label: "勝利", color: "#86efac" };
  return { label: "敗北", color: "#fca5a5" };
}

const TYPE_LABELS: Record<CharacterType, string> = {
  attack: "こうげき型",
  magic: "まほう型",
  defense: "バリア型",
  balanced: "バランス型",
};

interface ProfileSlotPreview {
  index: number;
  name: string;
  thumbnail: string;
  imageDataUrl: string;
  characterType: CharacterType;
  stats: CharacterStats;
  drawingData: DrawingData;
}

function renderDrawingToImageData(drawing: DrawingData, dataUrl: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = drawing.canvas?.width || 400;
      const height = drawing.canvas?.height || 400;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(context.getImageData(0, 0, width, height));
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

export function ProfileScreen(props: {
  playerId: string;
  fallbackNickname: string;
  onBack: () => void;
}) {
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [slotPreviews, setSlotPreviews] = useState<(ProfileSlotPreview | null)[]>(() => Array.from({ length: SLOT_COUNT }, () => null));
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void fetchPlayerProfile(props.playerId)
      .then((result) => {
        if (!active) return;
        setProfile(result);
      })
      .catch(() => {
        if (!active) return;
        setError("プロフィールの取得に失敗しました");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.playerId]);

  const player = profile?.player;
  const displayNickname = player?.nickname || props.fallbackNickname;

  const recentMatches = useMemo(() => profile?.recentMatches ?? [], [profile]);
  const selectedSlot = selectedSlotIndex !== null ? slotPreviews[selectedSlotIndex] ?? null : null;

  useEffect(() => {
    let active = true;
    const nickname = player?.nickname || props.fallbackNickname;
    void (async () => {
      const slots = loadSlots();
      const previews = await Promise.all(slots.map(async (slot, index) => {
        if (!slot) return null;
        const imageDataUrl = drawingToDataUrl(slot.drawingData);
        const imageData = await renderDrawingToImageData(slot.drawingData, imageDataUrl);
        if (!imageData) return null;
        const analysis = analyzeDrawing(slot.drawingData, imageData);
        return {
          index,
          name: nickname,
          thumbnail: slot.thumbnail || imageDataUrl,
          imageDataUrl,
          characterType: analysis.trend,
          stats: analysis.stats,
          drawingData: slot.drawingData,
        } satisfies ProfileSlotPreview;
      }));
      if (!active) return;
      setSlotPreviews(previews);
    })();
    return () => {
      active = false;
    };
  }, [player?.nickname, props.fallbackNickname]);

  return (
    <section className="app-panel space-y-4 p-4 text-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-50">プロフィール</h2>
          <p className="text-sm text-gray-400">{displayNickname} / ID: {props.playerId}</p>
          {profile && <p className="text-xs text-amber-200">保存先: {profile.storageBackend === "vercel-kv" ? "Vercel KV" : "ローカル開発ストレージ"}</p>}
        </div>
        <button
          className="rounded border-2 px-3 py-2 font-semibold"
          style={{ borderColor: "#6b7280", background: "rgba(30,30,30,0.9)", color: "#9ca3af" }}
          onClick={() => {
            soundManager.playSe("/sounds/se/button.mp3");
            props.onBack();
          }}
        >
          タイトルへ戻る
        </button>
      </div>

      {loading && <p className="text-sm text-gray-300">読み込み中...</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}

      {player && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "勝敗", value: `${player.wins}勝 ${player.losses}敗 ${player.draws}分` },
              { label: "連勝", value: `現在 ${player.currentStreak} / 最高 ${player.bestStreak}` },
              { label: "シングルプレイ(ノーマル)", value: `最高 ${player.singlePlay.normal.bestFloorCleared}層 / ${player.singlePlay.normal.bestScoreRank ?? "-"}` },
              { label: "シングルプレイ(ハード)", value: `最高 ${player.singlePlay.hard.bestFloorCleared}層 / ${player.singlePlay.hard.bestScoreRank ?? "-"}` },
              { label: "使用タイプ", value: `攻${player.typeUsageCount.attack} 魔${player.typeUsageCount.magic} 防${player.typeUsageCount.defense} 均${player.typeUsageCount.balanced}` },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-amber-500/30 bg-black/20 p-3">
                <div className="text-sm text-amber-200">{item.label}</div>
                <div className="mt-1 text-lg font-bold text-gray-50">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-violet-500/30 bg-black/20 p-3">
            <div className="mb-2 text-sm font-bold text-violet-200">ローグライクモード実績</div>
            <div className="flex flex-wrap gap-4">
              <div>
                <div className="text-xs text-gray-400">自己ベスト到達層</div>
                <div className="mt-1 text-lg font-bold text-gray-50">第{player.roguelike.bestFloorReached}層</div>
              </div>
              {player.roguelike.clearedAllFloors && (
                <div className="flex items-center gap-1 rounded-md border border-yellow-400/60 bg-yellow-900/30 px-3 py-1">
                  <span className="text-xl">🏆</span>
                  <span className="text-sm font-bold text-yellow-200">全20層制覇</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-50">保存スロットのラクガキ</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {slotPreviews.map((slot, index) => (
                <button
                  key={`slot-${index}`}
                  type="button"
                  onClick={() => {
                    if (!slot) return;
                    soundManager.playSe("/sounds/se/button.mp3");
                    setSelectedSlotIndex(index);
                  }}
                  className="rounded-lg border border-emerald-400/30 bg-black/20 p-3 text-left"
                  style={{ cursor: slot ? "pointer" : "default" }}
                >
                  <div className="mb-2 text-xs text-emerald-200">スロット {index + 1}</div>
                  {slot ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={slot.thumbnail} alt={`スロット${index + 1}`} className="mb-2 h-24 w-full rounded-md border border-gray-700 bg-black/40 object-contain" />
                      <div className="text-sm font-bold text-gray-50">{slot.name}</div>
                      <div className="text-xs text-gray-300">{TYPE_LABELS[slot.characterType]}</div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-gray-300">
                        <div>HP {slot.stats.maxHp}</div>
                        <div>PP {slot.stats.maxPp}</div>
                        <div>攻 {slot.stats.attack}</div>
                        <div>防 {slot.stats.defense}</div>
                        <div>速 {slot.stats.speed}</div>
                        <div>回 {Math.round(slot.stats.evasion * 100)}%</div>
                      </div>
                    </>
                  ) : (
                    <div className="py-10 text-center text-sm text-gray-500">空き</div>
                  )}
                </button>
              ))}
            </div>

            <h3 className="text-lg font-bold text-gray-50">直近の対戦履歴</h3>
            {recentMatches.length === 0 ? (
              <p className="text-sm text-gray-400">まだ対戦履歴がありません。</p>
            ) : (
              recentMatches.map((match) => {
                const selfEntry = match.players.find((entry) => entry.playerId === props.playerId) ?? match.players[0];
                const opponentEntry = match.players.find((entry) => entry.playerId !== props.playerId) ?? null;
                const outcome = getMatchOutcome(match, props.playerId);
                return (
                  <div key={match.matchId} className="rounded-lg border border-indigo-400/30 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm text-gray-400">{new Date(match.playedAt).toLocaleString("ja-JP")}</div>
                      <div style={{ color: outcome.color, fontWeight: 700 }}>{outcome.label}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      {[selfEntry, opponentEntry].filter((entry): entry is NonNullable<typeof entry> => !!entry).map((entry, index) => (
                        <div key={`${match.matchId}-${entry.nickname}-${index}`} className="flex items-center gap-3 rounded-md border border-gray-700/60 bg-gray-900/50 p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={entry.drawingThumbnail} alt={entry.nickname} width={72} height={72} className="h-[72px] w-[72px] rounded-md border border-gray-700 bg-black/40 object-contain" />
                          <div>
                            <div className="text-sm font-bold text-gray-50">{index === 0 ? "自分" : "相手"}: {entry.nickname}</div>
                            <div className="text-xs text-gray-400">{entry.characterType}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-emerald-400/40 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-bold text-emerald-200">スロット {selectedSlot.index + 1} の詳細</h4>
              <button
                type="button"
                className="rounded border border-gray-500 px-2 py-1 text-sm text-gray-300"
                onClick={() => setSelectedSlotIndex(null)}
              >
                閉じる
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedSlot.imageDataUrl} alt="保存ラクガキ" className="h-[320px] w-full rounded-md border border-gray-700 bg-white object-contain" />
              <div className="space-y-1 text-sm text-gray-100">
                <div className="font-bold">{selectedSlot.name}</div>
                <div className="text-emerald-200">{TYPE_LABELS[selectedSlot.characterType]}</div>
                <div className="pt-2">HP: {selectedSlot.stats.maxHp}</div>
                <div>PP: {selectedSlot.stats.maxPp}</div>
                <div>攻撃: {selectedSlot.stats.attack}</div>
                <div>防御: {selectedSlot.stats.defense}</div>
                <div>速度: {selectedSlot.stats.speed}</div>
                <div>回避: {Math.round(selectedSlot.stats.evasion * 100)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
