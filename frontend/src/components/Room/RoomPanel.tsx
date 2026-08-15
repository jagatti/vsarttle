"use client";

import { useState } from "react";
import { soundManager } from "@/lib/soundManager";
import type { BattleMode } from "@/types/game";

export function RoomPanel(props: {
  status: string;
  roomCode: string;
  nickname: string;
  canUseSignaling: boolean;
  onNicknameChange: (nickname: string) => void;
  onCreate: (nickname: string, battleMode: BattleMode) => void;
  onJoin: (roomCode: string, nickname: string) => void;
  onBackToTitle: () => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [battleMode, setBattleMode] = useState<BattleMode>("simple");

  const handleCreate = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onCreate(props.nickname.trim(), battleMode);
  };

  const handleJoin = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onJoin(joinCode, props.nickname.trim());
  };

  const handleBackToTitle = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onBackToTitle();
  };

  return (
    <section className="app-panel space-y-4 p-4 text-gray-100">
      <h2 className="font-heading text-xl font-bold" style={{ color: "var(--text-primary)" }}>ルーム</h2>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{props.status}</p>
      {props.roomCode && <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>ルーム番号: {props.roomCode}</p>}
      <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>
        ニックネーム
        <input
          className="ink-input"
          value={props.nickname}
          onChange={(e) => props.onNicknameChange(e.target.value)}
          maxLength={16}
        />
      </label>
      <div className="space-y-2" style={{ color: "var(--text-muted)" }}>
        <div>対戦方式</div>
        <div className="flex flex-wrap gap-2">
          {([
            { mode: "simple", label: "シンプル対戦", description: "従来どおりの対戦です" },
            { mode: "custom", label: "カスタム対戦", description: "強化スロット後に弱まほう効果を選択します" },
          ] as const).map(({ mode, label, description }) => {
            const selected = battleMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className="min-w-[180px] rounded border-2 px-3 py-2 text-left transition"
                style={{
                  borderColor: selected ? "var(--accent)" : "var(--border-glow)",
                  background: selected ? "rgba(200,169,106,0.15)" : "rgba(42,34,28,0.5)",
                  color: selected ? "var(--text-primary)" : "var(--text-muted)",
                }}
                onClick={() => {
                  soundManager.playSe("/sounds/se/button.mp3");
                  setBattleMode(mode);
                }}
              >
                <div className="font-semibold">{label}</div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>{description}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost"
          onClick={handleBackToTitle}
        >
          タイトルへ戻る
        </button>
        <button
          className="btn-primary"
          disabled={!props.canUseSignaling || !props.nickname.trim()}
          onClick={handleCreate}
        >
          ルーム作成
        </button>
        <input
          className="ink-input"
          placeholder="6桁ルーム番号"
          value={joinCode}
          maxLength={6}
          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
        />
        <button
          className="btn-primary"
          disabled={!props.canUseSignaling || !props.nickname.trim() || joinCode.length !== 6}
          onClick={handleJoin}
        >
          入室
        </button>
      </div>
    </section>
  );
}
