"use client";

import { useMemo, useState } from "react";
import { ONE_TURN_WEAK_MAGIC_EFFECTS, TWO_TURN_WEAK_MAGIC_EFFECTS } from "@/lib/battleLogic";
import { soundManager } from "@/lib/soundManager";
import type { OneTurnWeakMagicEffectKind, TwoTurnWeakMagicEffectKind, WeakMagicEffectSelection } from "@/types/game";

const EFFECT_DESCRIPTIONS: Record<OneTurnWeakMagicEffectKind | TwoTurnWeakMagicEffectKind, string> = {
  paralysis: "次のターン、相手は行動できない",
  tieBan: "次のターン、同じ種類のわざなら相手の行動を無効化",
  attackBan: "2ターン、こうげきを使えない",
  barrierBan: "2ターン、バリアを使えない",
  magicBan: "2ターン、まほうを使えない",
  chargeBan: "2ターン、チャージを使えない",
};

export function WeakMagicSelectPanel(props: {
  initialSelection?: WeakMagicEffectSelection;
  onConfirm: (selection: WeakMagicEffectSelection) => void;
}) {
  const [oneTurn, setOneTurn] = useState<OneTurnWeakMagicEffectKind | null>(props.initialSelection?.oneTurn ?? null);
  const [twoTurn, setTwoTurn] = useState<TwoTurnWeakMagicEffectKind[]>(props.initialSelection?.twoTurn ?? []);

  const isComplete = oneTurn !== null && twoTurn.length === 2;
  const selection = useMemo<WeakMagicEffectSelection | null>(() => {
    if (!oneTurn || twoTurn.length !== 2) return null;
    return { oneTurn, twoTurn: [twoTurn[0], twoTurn[1]] };
  }, [oneTurn, twoTurn]);

  const toggleTwoTurn = (kind: TwoTurnWeakMagicEffectKind) => {
    setTwoTurn((current) => {
      if (current.includes(kind)) return current.filter((value) => value !== kind);
      if (current.length >= 2) return [...current.slice(1), kind];
      return [...current, kind];
    });
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>弱まほう効果を選択</h2>
        <p style={{ fontSize: 14, color: "#fbbf24" }}>1ターン制限から1つ、2ターン制限から2つ選んでください。</p>
      </div>

      <div className="space-y-3">
        <div style={{ fontSize: 16, fontWeight: "bold" }}>1ターン制限効果（1つ）</div>
        <div style={{ display: "grid", gap: 12 }}>
          {ONE_TURN_WEAK_MAGIC_EFFECTS.map((effect) => {
            const selected = oneTurn === effect.kind;
            return (
              <button
                key={effect.kind}
                type="button"
                style={{
                  borderRadius: 10,
                  border: `2px solid ${selected ? "#fbbf24" : "#d97706"}`,
                  background: selected ? "rgba(251,191,36,0.2)" : "rgba(120,50,0,0.4)",
                  padding: "12px 16px",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "#fef3c7",
                }}
                onClick={() => {
                  soundManager.playSe("/sounds/se/button.mp3");
                  setOneTurn(effect.kind as OneTurnWeakMagicEffectKind);
                }}
              >
                <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>{effect.name}</div>
                <div style={{ fontSize: 13, color: "#fbbf24" }}>{EFFECT_DESCRIPTIONS[effect.kind]}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div style={{ fontSize: 16, fontWeight: "bold" }}>2ターン制限効果（2つ）</div>
        <div style={{ display: "grid", gap: 12 }}>
          {TWO_TURN_WEAK_MAGIC_EFFECTS.map((effect) => {
            const selected = twoTurn.includes(effect.kind as TwoTurnWeakMagicEffectKind);
            return (
              <button
                key={effect.kind}
                type="button"
                style={{
                  borderRadius: 10,
                  border: `2px solid ${selected ? "#fbbf24" : "#d97706"}`,
                  background: selected ? "rgba(251,191,36,0.2)" : "rgba(120,50,0,0.4)",
                  padding: "12px 16px",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "#fef3c7",
                }}
                onClick={() => {
                  soundManager.playSe("/sounds/se/button.mp3");
                  toggleTwoTurn(effect.kind as TwoTurnWeakMagicEffectKind);
                }}
              >
                <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>{effect.name}</div>
                <div style={{ fontSize: 13, color: "#fbbf24" }}>{EFFECT_DESCRIPTIONS[effect.kind]}</div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="rounded bg-amber-500 px-4 py-2 font-semibold text-white shadow-[0_0_12px_rgba(251,191,36,0.45)] transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 disabled:opacity-70 disabled:shadow-none"
        disabled={!isComplete || !selection}
        onClick={() => {
          if (!selection) return;
          soundManager.playSe("/sounds/se/button.mp3");
          props.onConfirm(selection);
        }}
      >
        この内容で決定
      </button>
    </section>
  );
}
