"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchPlayerProfile } from "@/lib/profileApi";
import type { MatchRecord, PlayerProfileResponse } from "@/lib/persistenceTypes";
import { soundManager } from "@/lib/soundManager";

function getMatchOutcome(match: MatchRecord, playerId: string): { label: string; color: string } {
  if (match.winnerId === null) return { label: "引き分け", color: "#cbd5e1" };
  if (match.winnerId === playerId) return { label: "勝利", color: "#86efac" };
  return { label: "敗北", color: "#fca5a5" };
}

export function ProfileScreen(props: {
  playerId: string;
  fallbackNickname: string;
  onBack: () => void;
}) {
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
              { label: "シングルプレイ", value: `最高 ${player.singlePlay.bestFloorCleared}層 / ${player.singlePlay.bestScoreRank ?? "-"}` },
              { label: "使用タイプ", value: `攻${player.typeUsageCount.attack} 魔${player.typeUsageCount.magic} 防${player.typeUsageCount.defense} 均${player.typeUsageCount.balanced}` },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-amber-500/30 bg-black/20 p-3">
                <div className="text-sm text-amber-200">{item.label}</div>
                <div className="mt-1 text-lg font-bold text-gray-50">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
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
    </section>
  );
}
