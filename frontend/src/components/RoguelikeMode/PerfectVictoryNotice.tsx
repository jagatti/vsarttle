"use client";

export function PerfectVictoryNotice(props: { floor: number; onDismiss: () => void }) {
  return (
    <button
      type="button"
      aria-label="完全勝利ボーナスを閉じる"
      onClick={props.onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        border: 0,
        background: "radial-gradient(ellipse, rgba(234,179,8,0.3), rgba(2,6,23,0.82) 70%)",
        color: "#fef3c7",
        cursor: "pointer",
        animation: "perfectVictoryReveal 650ms cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
    >
      <span style={{ fontSize: "clamp(18px, 3vw, 30px)" }}>✨ 第{props.floor}層 ✨</span>
      <strong style={{ fontSize: "clamp(42px, 9vw, 92px)", fontWeight: 1000, color: "#fde047", textShadow: "0 0 18px #f59e0b, 0 0 42px #facc15", animation: "youWinPulse 1s ease-in-out infinite" }}>
        完全勝利！
      </strong>
      <span style={{ fontSize: "clamp(20px, 4vw, 38px)", fontWeight: 900, color: "#bbf7d0", textShadow: "0 0 16px #22c55e" }}>
        全ステータス +10%
      </span>
      <span style={{ fontSize: 14, color: "#e2e8f0" }}>タップして閉じる</span>
    </button>
  );
}
