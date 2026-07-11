"use client";

import { useState } from "react";
import { soundManager } from "@/lib/soundManager";

export function RoomPanel(props: {
  status: string;
  roomCode: string;
  canUseSignaling: boolean;
  onCreate: (nickname: string) => void;
  onJoin: (roomCode: string, nickname: string) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const handleCreate = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onCreate(nickname.trim());
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
