"use client";

import { soundManager } from "@/lib/soundManager";

export function TitleScreen(props: {
  onSinglePlay: () => void;
  onMultiPlay: () => void;
}) {
  const handleSinglePlay = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onSinglePlay();
  };

  const handleMultiPlay = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onMultiPlay();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        gap: 40,
      }}
    >
      {/* Title logo */}
      <div
        style={{
          fontSize: "clamp(56px, 10vw, 120px)",
          fontWeight: "900",
          letterSpacing: "0.05em",
          background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 40%, #8b5cf6 80%, #3b82f6 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          textShadow: "none",
          filter: "drop-shadow(0 4px 24px rgba(239,68,68,0.4))",
          animation: "titlePulse 3s ease-in-out infinite",
        }}
      >
        arttle
      </div>

      {/* Tagline */}
      <div
        style={{
          color: "#d1d5db",
          fontSize: "clamp(13px, 1.5vw, 18px)",
          fontWeight: "bold",
          letterSpacing: "0.1em",
          marginTop: -20,
        }}
      >
        ラクガキバトル
      </div>

      {/* Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          width: "100%",
          maxWidth: 320,
          marginTop: 20,
        }}
      >
        <button
          onClick={handleSinglePlay}
          style={{
            padding: "18px 32px",
            borderRadius: 12,
            border: "2px solid #f59e0b",
            background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.2))",
            color: "#fde68a",
            fontWeight: "bold",
            fontSize: "clamp(16px, 2vw, 22px)",
            cursor: "pointer",
            letterSpacing: "0.05em",
            boxShadow: "0 0 20px rgba(245,158,11,0.3)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, rgba(245,158,11,0.4), rgba(239,68,68,0.4))";
            e.currentTarget.style.transform = "scale(1.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.2))";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          🎮 シングルプレイ
        </button>

        <button
          onClick={handleMultiPlay}
          style={{
            padding: "18px 32px",
            borderRadius: 12,
            border: "2px solid #6366f1",
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(59,130,246,0.2))",
            color: "#c7d2fe",
            fontWeight: "bold",
            fontSize: "clamp(16px, 2vw, 22px)",
            cursor: "pointer",
            letterSpacing: "0.05em",
            boxShadow: "0 0 20px rgba(99,102,241,0.3)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(59,130,246,0.4))";
            e.currentTarget.style.transform = "scale(1.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(59,130,246,0.2))";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          👥 マルチプレイ
        </button>
      </div>

      <style>{`
        @keyframes titlePulse {
          0%, 100% { filter: drop-shadow(0 4px 24px rgba(239,68,68,0.4)); }
          50% { filter: drop-shadow(0 4px 40px rgba(139,92,246,0.6)); }
        }
      `}</style>
    </div>
  );
}
