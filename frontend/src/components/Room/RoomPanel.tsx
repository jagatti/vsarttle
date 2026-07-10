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
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-xl font-bold">ルーム</h2>
      <p className="text-sm text-gray-600">{props.status}</p>
      {props.roomCode && <p className="text-lg font-semibold">ルーム番号: {props.roomCode}</p>}
      <label className="flex flex-col gap-1">
        ニックネーム
        <input className="rounded border px-2 py-1" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={16} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-40"
          disabled={!props.canUseSignaling || !nickname.trim()}
          onClick={handleCreate}
        >
          ルーム作成
        </button>
        <input
          className="rounded border px-2 py-1"
          placeholder="6桁ルーム番号"
          value={joinCode}
          maxLength={6}
          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
        />
        <button
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-40"
          disabled={!props.canUseSignaling || !nickname.trim() || joinCode.length !== 6}
          onClick={handleJoin}
        >
          入室
        </button>
      </div>
    </section>
  );
}
