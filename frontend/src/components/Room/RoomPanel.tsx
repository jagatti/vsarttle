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
      <h2 className="text-xl font-bold text-gray-50">ルーム</h2>
      <p className="text-sm text-gray-300">{props.status}</p>
      {props.roomCode && <p className="text-lg font-semibold text-gray-50">ルーム番号: {props.roomCode}</p>}
      <label className="flex flex-col gap-1 text-gray-200">
        ニックネーム
        <input
          className="rounded border border-gray-600 bg-gray-900/70 px-2 py-1 text-gray-50 placeholder-gray-500"
          value={props.nickname}
          onChange={(e) => props.onNicknameChange(e.target.value)}
          maxLength={16}
        />
      </label>
      <div className="space-y-2 text-gray-200">
        <div>対戦方式</div>
        <div className="flex flex-wrap gap-2">
          {([
            { mode: "simple", label: "シンプル対戦", description: "従来どおりの対戦です" },
            { mode: "custom", label: "カスタム対戦", description: "強化スロット後に弱まほう効果を選択します" },
            { mode: "coop-roguelike", label: "協力ローグライク", description: "2人で協力して最深部を目指す" },
          ] as const).map(({ mode, label, description }) => {
            const selected = battleMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className="title-menu-button room-mode-button"
                aria-pressed={selected}
                style={{
                  ["--menu-accent" as string]: selected ? "#a66b13" : "#787b82",
                }}
                onClick={() => {
                  soundManager.playSe("/sounds/se/button.mp3");
                  setBattleMode(mode);
                }}
              >
                <div className="font-semibold">{label}</div>
                <div className="text-sm">{description}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="title-menu-button"
          onClick={handleBackToTitle}
        >
          タイトルへ戻る
        </button>
        <button
          className="title-menu-button"
          style={{ ["--menu-accent" as string]: "#5261b0" }}
          disabled={!props.canUseSignaling || !props.nickname.trim()}
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
          className="title-menu-button"
          style={{ ["--menu-accent" as string]: "#3276a0" }}
          disabled={!props.canUseSignaling || !props.nickname.trim() || joinCode.length !== 6}
          onClick={handleJoin}
        >
          入室
        </button>
      </div>
    </section>
  );
}
