"use client";

import { useState } from "react";
import { soundManager } from "@/lib/soundManager";
import type { BattleMode } from "@/types/game";

export function RoomPanel(props: {
  status: string;
  roomCode: string;
  canUseSignaling: boolean;
  onCreate: (nickname: string, battleMode: BattleMode) => void;
  onJoin: (roomCode: string, nickname: string) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [battleMode, setBattleMode] = useState<BattleMode>("simple");

  const handleCreate = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onCreate(nickname.trim(), battleMode);
  };

  const handleJoin = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onJoin(joinCode, nickname.trim());
  };

  return (
    <section className="app-panel space-y-4 p-4 text-gray-100">
      <h2 className="text-xl font-bold text-gray-50">ルーム</h2>
      <p className="text-sm text-gray-300">{props.status}</p>
      {props.roomCode && <p className="text-lg font-semibold text-gray-50">ルーム番号: {props.roomCode}</p>}
      <label className="flex flex-col gap-1 text-gray-200">
        ニックネーム
        <input
          className="rounded border border-gray-600 bg-gray-900/70 px-2 py-1 text-gray-50 placeholder-gray-500"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
        />
      </label>
      <div className="space-y-2 text-gray-200">
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
                className="min-w-[180px] rounded border px-3 py-2 text-left transition"
                style={{
                  borderColor: selected ? "#fbbf24" : "#4b5563",
                  background: selected ? "rgba(251,191,36,0.15)" : "rgba(17,24,39,0.7)",
                  color: selected ? "#fef3c7" : "#e5e7eb",
                }}
                onClick={() => {
                  soundManager.playSe("/sounds/se/button.mp3");
                  setBattleMode(mode);
                }}
              >
                <div className="font-semibold">{label}</div>
                <div className="text-sm text-gray-300">{description}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-indigo-500 px-3 py-2 font-semibold text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 disabled:opacity-70 disabled:shadow-none"
          disabled={!props.canUseSignaling || !nickname.trim()}
          onClick={handleCreate}
        >
          ルーム作成
        </button>
        <input
          className="rounded border border-gray-600 bg-gray-900/70 px-2 py-1 text-gray-50 placeholder-gray-500"
          placeholder="6桁ルーム番号"
          value={joinCode}
          maxLength={6}
          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
        />
        <button
          className="rounded bg-sky-500 px-3 py-2 font-semibold text-white shadow-[0_0_12px_rgba(14,165,233,0.5)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 disabled:opacity-70 disabled:shadow-none"
          disabled={!props.canUseSignaling || !nickname.trim() || joinCode.length !== 6}
          onClick={handleJoin}
        >
          入室
        </button>
      </div>
    </section>
  );
}
