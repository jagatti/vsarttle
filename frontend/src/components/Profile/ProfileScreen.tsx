"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSlots, persistSlots, SLOT_COUNT } from "@/lib/drawingSlots";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { fetchPlayerProfile } from "@/lib/profileApi";
import { analyzeDrawing, deriveStatsFromBase, getDrawingStatDeltas } from "@/lib/statCalculator";
import { buildDrawingTags, getDrawingTagByLabel } from "@/lib/drawingTags";
import { EQUIPPABLE_SKILL_IDS, ROGUELIKE_SKILLS, type EquippableSkillId } from "@/lib/roguelikeSkills";
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
  deltas: ReturnType<typeof getDrawingStatDeltas>;
  drawingTags: string[];
  equippedSkillId: EquippableSkillId | null;
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
  const slotModalRef = useRef<HTMLDivElement | null>(null);
  const slotModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const slotModalLastFocusRef = useRef<HTMLElement | null>(null);

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

  const loadSlotPreviews = useCallback(async (): Promise<(ProfileSlotPreview | null)[]> => {
    const nickname = player?.nickname || props.fallbackNickname;
    const slots = loadSlots();
    return Promise.all(slots.map(async (slot, index) => {
      if (!slot) return null;
      const imageDataUrl = drawingToDataUrl(slot.drawingData);
      const imageData = await renderDrawingToImageData(slot.drawingData, imageDataUrl);
      if (!imageData) return null;
      const analysis = analyzeDrawing(slot.drawingData, imageData);
      const baseStats = deriveStatsFromBase(analysis.base, { sA: 0, sB: 0, sC: 0 });
      return {
        index,
        name: nickname,
        thumbnail: slot.thumbnail || imageDataUrl,
        imageDataUrl,
        characterType: analysis.trend,
        stats: analysis.stats,
        deltas: getDrawingStatDeltas(analysis.stats, baseStats),
        drawingTags: slot.drawingTags?.length ? slot.drawingTags : buildDrawingTags(analysis.features).map((tag) => tag.label),
        equippedSkillId: slot.equippedSkillId ?? null,
        drawingData: slot.drawingData,
      } satisfies ProfileSlotPreview;
    }));
  }, [player?.nickname, props.fallbackNickname]);

  const refreshSlotPreviews = useCallback(() => {
    void loadSlotPreviews().then((previews) => {
      setSlotPreviews(previews);
    });
  }, [loadSlotPreviews]);

  const setSlotEquippedSkill = (slotIndex: number, equippedSkillId: EquippableSkillId | null) => {
    const slots = loadSlots();
    const slot = slots[slotIndex];
    if (!slot) return;
    slots[slotIndex] = { ...slot, equippedSkillId };
    persistSlots(slots);
    setSlotPreviews((previews) => previews.map((preview, index) =>
      index === slotIndex && preview ? { ...preview, equippedSkillId } : preview,
    ));
    soundManager.playSe("/sounds/se/button.mp3");
  };

  useEffect(() => {
    refreshSlotPreviews();
    const handleRefresh = () => {
      refreshSlotPreviews();
    };
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("storage", handleRefresh);
    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("storage", handleRefresh);
    };
  }, [refreshSlotPreviews]);

  useEffect(() => {
    if (selectedSlotIndex === null) return;
    slotModalLastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    slotModalCloseButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedSlotIndex(null);
        return;
      }
      if (event.key !== "Tab") return;
      const container = slotModalRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        if (element.hasAttribute("disabled")) return false;
        if (element.getAttribute("aria-hidden") === "true") return false;
        if (element.hasAttribute("hidden")) return false;
        if (element.tabIndex < 0) return false;
        if (element.getClientRects().length === 0) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return true;
      });
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement) || !container.contains(activeElement)) {
        event.preventDefault();
        if (event.shiftKey) {
          last.focus();
        } else {
          first.focus();
        }
        return;
      }
      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      slotModalLastFocusRef.current?.focus();
    };
  }, [selectedSlotIndex]);

  return (
    <section className="app-panel space-y-4 p-4 text-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-50">プロフィール</h2>
          <p className="text-sm text-gray-400">{displayNickname} / ID: {props.playerId}</p>
          {profile && <p className="text-xs text-amber-200">保存先: {profile.storageBackend === "vercel-kv" ? "Vercel KV" : "ローカル開発ストレージ"}</p>}
        </div>
        <button
          className="title-menu-button"
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
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded border border-emerald-400/60 px-2 py-1 text-xs font-bold text-emerald-200"
                onClick={() => {
                  soundManager.playSe("/sounds/se/button.mp3");
                  refreshSlotPreviews();
                }}
              >
                再読み込み
              </button>
            </div>
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
                  disabled={!slot}
                  className="rounded-lg border border-emerald-400/30 bg-black/20 p-3 text-left disabled:cursor-default"
                  style={{ cursor: slot ? "pointer" : "default" }}
                >
                  <div className="mb-2 text-xs text-emerald-200">スロット {index + 1}</div>
                  {slot ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={slot.thumbnail} alt={`スロット${index + 1}`} className="mb-2 h-24 w-full rounded-md border border-gray-700 bg-black/40 object-contain" />
                      <div className="text-sm font-bold text-gray-50">{slot.name}</div>
                      <div className="text-xs text-gray-300">{TYPE_LABELS[slot.characterType]}</div>
                      <div className="text-[11px] text-amber-200">{slot.drawingTags.join(" / ")}</div>
                      <div className="text-[11px] text-cyan-200">{slot.equippedSkillId ? ROGUELIKE_SKILLS[slot.equippedSkillId].label : "スキルなし"}</div>
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-slot-detail-title"
            ref={slotModalRef}
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-emerald-400/40 bg-slate-900 p-4"
            tabIndex={-1}
          >
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 id="profile-slot-detail-title" className="text-lg font-bold text-emerald-200">スロット {selectedSlot.index + 1} の詳細</h4>
                <button
                  ref={slotModalCloseButtonRef}
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
                  {([
                    ["HP", selectedSlot.stats.maxHp, selectedSlot.deltas.hp, false],
                    ["PP", selectedSlot.stats.maxPp, selectedSlot.deltas.pp, false],
                    ["攻撃", selectedSlot.stats.attack, selectedSlot.deltas.attack, false],
                    ["防御", selectedSlot.stats.defense, selectedSlot.deltas.defense, false],
                    ["速度", selectedSlot.stats.speed, selectedSlot.deltas.speed, false],
                    ["回避", Math.round(selectedSlot.stats.evasion * 100), selectedSlot.deltas.evasion, true],
                  ] as const).map(([label, value, delta, percent]) => (
                    <div key={label} className="flex gap-1 pt-1">
                      <span>{label}: {value}{percent ? "%" : ""}</span>
                      {delta !== 0 && <span className={delta > 0 ? "text-sky-300" : "text-rose-300"}>
                        ({delta > 0 ? "+" : ""}{delta}{percent ? "%" : ""})
                      </span>}
                    </div>
                  ))}
                  <div className="pt-3 font-bold text-amber-200">絵のタグ</div>
                  {selectedSlot.drawingTags.map((label) => {
                    const tag = getDrawingTagByLabel(label);
                    return <div key={label}>{label}{tag ? `：${tag.effectText}` : ""}</div>;
                  })}
                  <div className="pt-3 font-bold text-cyan-200">装備中のスキル</div>
                  <div>{selectedSlot.equippedSkillId ? ROGUELIKE_SKILLS[selectedSlot.equippedSkillId].label : "なし"}</div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <h5 className="font-bold text-cyan-100">スキルを選択</h5>
                <button
                  type="button"
                  aria-pressed={!selectedSlot.equippedSkillId}
                  className={`w-full rounded-lg border p-3 text-left ${!selectedSlot.equippedSkillId ? "border-cyan-300 bg-cyan-950/60" : "border-gray-700 bg-black/20"}`}
                  onClick={() => setSlotEquippedSkill(selectedSlot.index, null)}
                >
                  <div className="font-bold">なし</div>
                  <div className="text-xs text-gray-400">装備スキルを解除する</div>
                </button>
                {EQUIPPABLE_SKILL_IDS.map((skillId) => {
                  const skill = ROGUELIKE_SKILLS[skillId];
                  const selected = selectedSlot.equippedSkillId === skillId;
                  return (
                    <button
                      key={skillId}
                      type="button"
                      aria-pressed={selected}
                      className={`w-full rounded-lg border p-3 text-left ${selected ? "border-cyan-300 bg-cyan-950/60" : "border-gray-700 bg-black/20"}`}
                      onClick={() => setSlotEquippedSkill(selectedSlot.index, skillId)}
                    >
                      <div className="font-bold text-cyan-100">{skill.label}{selected ? "　装備中" : ""}</div>
                      <div className="text-xs text-gray-300">{skill.description}</div>
                    </button>
                  );
                })}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <button key={index} type="button" disabled className="cursor-not-allowed rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-center text-gray-500">
                      ?????
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
