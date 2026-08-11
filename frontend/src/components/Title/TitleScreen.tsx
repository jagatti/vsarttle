"use client";

import { useState } from "react";
import { OptionsPanel } from "@/components/Options/OptionsPanel";
import { soundManager } from "@/lib/soundManager";

export function TitleScreen(props: {
  onSinglePlay: () => void;
  onMultiPlay: () => void;
  onGhostMatch: () => void;
  onProfile: () => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);

  const handleSinglePlay = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onSinglePlay();
  };

  const handleMultiPlay = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onMultiPlay();
  };

  const handleProfile = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onProfile();
  };

  const handleGhostMatch = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    props.onGhostMatch();
  };

  const handleOpenOptions = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    setOptionsOpen(true);
  };

  const optionButtonStyle = {
    padding: "18px 32px",
    borderRadius: 12,
    fontWeight: "bold",
    fontSize: "clamp(16px, 2vw, 22px)",
    cursor: "pointer",
    letterSpacing: "0.05em",
    transition: "all 0.2s ease",
  } as const;

  return (
    <>
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

        <div
          style={{
            color: "#d1d5db",
            fontSize: "clamp(13px, 1.5vw, 18px)",
            fontWeight: "bold",
            letterSpacing: "0.1em",
            marginTop: -20,
          }}
        >
          ラクガキ対戦
        </div>

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
              ...optionButtonStyle,
              border: "2px solid #f59e0b",
              background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.2))",
              color: "#fde68a",
              boxShadow: "0 0 20px rgba(245,158,11,0.3)",
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
              ...optionButtonStyle,
              border: "2px solid #6366f1",
              background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(59,130,246,0.2))",
              color: "#c7d2fe",
              boxShadow: "0 0 20px rgba(99,102,241,0.3)",
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

          <button
            onClick={handleGhostMatch}
            style={{
              ...optionButtonStyle,
              border: "2px solid #a855f7",
              background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(79,70,229,0.2))",
              color: "#e9d5ff",
              boxShadow: "0 0 20px rgba(168,85,247,0.3)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(168,85,247,0.4), rgba(79,70,229,0.4))";
              e.currentTarget.style.transform = "scale(1.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(79,70,229,0.2))";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            👻 ゴーストマッチ
          </button>

          <button
            onClick={handleProfile}
            style={{
              ...optionButtonStyle,
              border: "2px solid #14b8a6",
              background: "linear-gradient(135deg, rgba(20,184,166,0.2), rgba(59,130,246,0.18))",
              color: "#99f6e4",
              boxShadow: "0 0 20px rgba(20,184,166,0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(20,184,166,0.4), rgba(59,130,246,0.34))";
              e.currentTarget.style.transform = "scale(1.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(20,184,166,0.2), rgba(59,130,246,0.18))";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            📜 プロフィール
          </button>

          <button
            onClick={handleOpenOptions}
            style={{
              ...optionButtonStyle,
              border: "2px solid #4b5563",
              background: "linear-gradient(135deg, rgba(75,85,99,0.24), rgba(31,41,55,0.24))",
              color: "#e5e7eb",
              boxShadow: "0 0 20px rgba(75,85,99,0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(75,85,99,0.4), rgba(31,41,55,0.4))";
              e.currentTarget.style.transform = "scale(1.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(75,85,99,0.24), rgba(31,41,55,0.24))";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            ⚙️ オプション
          </button>
        </div>

        <style>{`
          @keyframes titlePulse {
            0%, 100% { filter: drop-shadow(0 4px 24px rgba(239,68,68,0.4)); }
            50% { filter: drop-shadow(0 4px 40px rgba(139,92,246,0.6)); }
          }
        `}</style>
      </div>
      <OptionsPanel open={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </>
  );
}
