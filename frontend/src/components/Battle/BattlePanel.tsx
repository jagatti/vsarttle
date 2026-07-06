"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAvailableActions } from "@/lib/battleLogic";
import type { ActionType, PlayerBattleState, TurnResult } from "@/types/game";

const ACTION_LABELS: Record<ActionType, string> = {
  attack: "こうげき",
  magicWeak: "弱まほう",
  magicStrong: "強まほう",
  barrier: "バリア",
  charge: "チャージ",
};

const ACTION_COLORS: Record<ActionType, string> = {
  attack: "#dc2626",
  magicWeak: "#2563eb",
  magicStrong: "#7c3aed",
  barrier: "#ea580c",
  charge: "#16a34a",
};

const safeImageUrl = (value: string) => (value.startsWith("data:image/") ? value : "");

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ height: 12, background: "#111", borderRadius: 6, border: "2px solid #4b5563", overflow: "hidden", marginTop: 3 }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: `linear-gradient(to right, ${color}99, ${color})`,
          transition: "width 0.6s ease-in-out, background 0.3s",
          borderRadius: 6,
          boxShadow: `0 0 6px ${color}88`,
        }}
      />
    </div>
  );
}

function PpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div style={{ height: 7, background: "#111", borderRadius: 4, border: "1px solid #374151", overflow: "hidden", marginTop: 2 }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "linear-gradient(to right, #06b6d499, #06b6d4)",
          transition: "width 0.6s ease-in-out",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

interface DamageFloater {
  id: number;
  amount: number;
  avoided: boolean;
  toMe: boolean;
}

function PlayerCard({ player, label, floaters }: { player: PlayerBattleState; label: string; floaters: DamageFloater[] }) {
  return (
    <div style={{ flex: 1, position: "relative" }}>
      {floaters.map((f) => (
        <div
          key={f.id}
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            zIndex: 5,
            color: f.avoided ? "#60a5fa" : "#f87171",
            fontWeight: "bold",
            fontSize: 22,
            textShadow: f.avoided ? "0 0 8px #60a5fa" : "0 0 8px #f87171",
            animation: "floatUp 1.4s ease-out forwards",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {f.avoided ? "かいひ！" : `-${f.amount}`}
        </div>
      ))}
      <div
        style={{
          background: "rgba(0,0,0,0.55)",
          borderRadius: 8,
          border: "2px solid #92400e",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
        }}
      >
        <div style={{ color: "#fbbf24", fontWeight: "bold", fontSize: 11 }}>{label}</div>
        <div style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>{player.nickname}</div>
        <img
          src={safeImageUrl(player.imageDataUrl)}
          alt={`${player.nickname} のキャラクター`}
          style={{
            width: 88,
            height: 88,
            borderRadius: 6,
            border: "2px solid #92400e",
            background: "#fff",
            objectFit: "contain",
            marginTop: 4,
          }}
        />
        <div style={{ width: "100%", marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#d1fae5", fontSize: 11 }}>
            <span>HP</span>
            <span>
              {player.currentHp}/{player.stats.maxHp}
            </span>
          </div>
          <HpBar current={player.currentHp} max={player.stats.maxHp} />
        </div>
        <div style={{ width: "100%", marginTop: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#a5f3fc", fontSize: 11 }}>
            <span>PP</span>
            <span>
              {player.currentPp}/{player.stats.maxPp}
            </span>
          </div>
          <PpBar current={player.currentPp} max={player.stats.maxPp} />
        </div>
        <div style={{ color: "#d1d5db", fontSize: 10, marginTop: 4, textAlign: "center" }}>
          攻{player.stats.attack} 防{player.stats.defense} 速{player.stats.speed} 避{Math.round(player.stats.evasion * 100)}%
        </div>
      </div>
    </div>
  );
}

export function BattlePanel(props: {
  me: PlayerBattleState;
  enemy: PlayerBattleState;
  turnResult: TurnResult | null;
  countdown: number;
  onActionSelect: (action: ActionType) => void;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [floaters, setFloaters] = useState<DamageFloater[]>([]);
  const [showFlash, setShowFlash] = useState(false);
  const prevTurnRef = useRef<number | null>(null);
  const floaterIdRef = useRef(0);
  const availableActions = useMemo(() => getAvailableActions(props.me), [props.me]);

  useEffect(() => {
    setSelectedAction(null);
  }, [props.me.lastActionCategory, props.countdown]);

  useEffect(() => {
    if (!props.turnResult) return;
    if (prevTurnRef.current === props.turnResult.turn) return;
    prevTurnRef.current = props.turnResult.turn;

    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 600);

    const newFloaters: DamageFloater[] = props.turnResult.damageEvents.map((event) => ({
      id: floaterIdRef.current++,
      amount: event.amount,
      avoided: event.avoided,
      toMe: event.to === props.me.id,
    }));
    if (newFloaters.length > 0) {
      setFloaters((prev) => [...prev, ...newFloaters]);
      setTimeout(() => {
        const ids = new Set(newFloaters.map((f) => f.id));
        setFloaters((prev) => prev.filter((f) => !ids.has(f.id)));
      }, 1500);
    }
  }, [props.turnResult, props.me.id]);

  const countdown = props.countdown;
  const countdownColor = countdown <= 5 ? "#ef4444" : countdown <= 10 ? "#f59e0b" : "#fef3c7";
  const countdownPulse = countdown <= 5;

  return (
    <div style={{ position: "relative" }}>
      {showFlash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(255,255,255,0.85)",
            borderRadius: 12,
            animation: "battleFlash 0.6s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}

      <section
        style={{
          background:
            "linear-gradient(to bottom, #1c0a00 0%, #3b1a00 20%, #6b3310 45%, #8b4513 55%, #5c2d0a 75%, #2d1205 100%)",
          borderRadius: 12,
          border: "3px solid #92400e",
          boxShadow: "0 6px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(251,191,36,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            background: "linear-gradient(to right, #0f0500, #3b1a00, #0f0500)",
            padding: "8px 16px",
            borderBottom: "2px solid #92400e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "#fbbf24",
              fontWeight: "bold",
              fontSize: 17,
              textShadow: "0 0 8px #fbbf2488",
              letterSpacing: "0.05em",
            }}
          >
            ⚔️ バトル {props.turnResult ? `ターン ${props.turnResult.turn}` : ""}
          </span>
          <span
            style={{
              color: countdownColor,
              fontWeight: "bold",
              fontSize: 26,
              textShadow: countdown <= 5 ? "0 0 12px #ef4444" : "none",
              transition: "color 0.3s",
              animation: countdownPulse ? "countdownPulse 0.8s ease-in-out infinite" : "none",
              display: "inline-block",
            }}
          >
            ⏱ {countdown}
          </span>
        </div>

        {/* Character arena */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "14px 14px 8px",
            alignItems: "flex-start",
          }}
        >
          <PlayerCard player={props.me} label="あなた" floaters={floaters.filter((f) => f.toMe)} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: "#fbbf24",
              fontWeight: "900",
              fontSize: 22,
              textShadow: "0 0 10px #fbbf2488",
              padding: "40px 2px 0",
              flexShrink: 0,
            }}
          >
            VS
          </div>
          <PlayerCard player={props.enemy} label="あいて" floaters={floaters.filter((f) => !f.toMe)} />
        </div>

        {/* Wood floor strip */}
        <div
          style={{
            height: 10,
            background:
              "repeating-linear-gradient(90deg, #5c3317 0px, #6b3a1a 50px, #7a4520 55px, #5c3317 100px)",
            borderTop: "2px solid #92400e",
            borderBottom: "2px solid #4a1a00",
          }}
        />

        {/* Turn result panel */}
        {props.turnResult && (
          <div
            style={{
              margin: "10px 14px 6px",
              background: "rgba(0,0,0,0.65)",
              borderRadius: 8,
              border: "1px solid #92400e",
              padding: "8px 12px",
              animation: "slideInFromBottom 0.4s ease-out",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
                gap: 8,
              }}
            >
              <span
                style={{
                  color: "#fde68a",
                  fontWeight: "bold",
                  fontSize: 13,
                  animation: "slideInFromLeft 0.4s ease-out",
                  display: "inline-block",
                }}
              >
                あなた: {ACTION_LABELS[props.turnResult.actions[props.me.id]]}
              </span>
              <span
                style={{
                  color: "#fde68a",
                  fontWeight: "bold",
                  fontSize: 13,
                  animation: "slideInFromRight 0.4s ease-out",
                  display: "inline-block",
                }}
              >
                あいて: {ACTION_LABELS[props.turnResult.actions[props.enemy.id]]}
              </span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {props.turnResult.damageEvents.map((event, i) => (
                <li
                  key={`${event.from}-${event.to}-${i}`}
                  style={{
                    color: event.avoided ? "#93c5fd" : "#fca5a5",
                    fontSize: 12,
                    animation: `slideInFromLeft 0.35s ease-out ${i * 0.08}s both`,
                    display: "inline-block",
                  }}
                >
                  {event.avoided
                    ? `${event.to === props.me.id ? "あなた" : "あいて"} が回避！`
                    : `${event.to === props.me.id ? "あなた" : "あいて"} に ${event.amount} ダメージ（${event.reason}）`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ padding: "6px 14px 14px" }}>
          <div style={{ color: "#9ca3af", fontSize: 11, marginBottom: 6 }}>
            前回行動: {props.me.lastActionCategory ?? "なし"} ／ 選択中:{" "}
            <span style={{ color: selectedAction ? ACTION_COLORS[selectedAction] : "#9ca3af", fontWeight: "bold" }}>
              {selectedAction ? ACTION_LABELS[selectedAction] : "未選択"}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((action) => {
              const selectable = availableActions.includes(action);
              const isSelected = selectedAction === action;
              const color = ACTION_COLORS[action];
              return (
                <button
                  key={action}
                  disabled={!selectable}
                  onClick={() => {
                    setSelectedAction(action);
                    props.onActionSelect(action);
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: `2px solid ${selectable ? color : "#374151"}`,
                    background: selectable ? (isSelected ? color : `${color}28`) : "#1f2937",
                    color: selectable ? (isSelected ? "#fff" : color) : "#6b7280",
                    fontWeight: "bold",
                    cursor: selectable ? "pointer" : "not-allowed",
                    transition: "all 0.15s",
                    transform: isSelected ? "scale(1.08)" : "scale(1)",
                    boxShadow: isSelected ? `0 0 12px ${color}88` : "none",
                    fontSize: 13,
                    letterSpacing: "0.02em",
                  }}
                >
                  {ACTION_LABELS[action]}
                </button>
              );
            })}
          </div>
          {props.me.lastActionCategory && (
            <p style={{ color: "#6b7280", fontSize: 10, marginTop: 4 }}>
              ※同カテゴリ行動は次ターン選択不可: {props.me.lastActionCategory}
            </p>
          )}
          <p style={{ color: "#6b7280", fontSize: 10, marginTop: 2 }}>
            まほうは最大PPに対する割合（弱20% / 強40%）で消費されます。
          </p>
        </div>
      </section>
    </div>
  );
}
