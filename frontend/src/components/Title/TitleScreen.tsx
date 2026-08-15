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
            fontFamily: "var(--font-heading, cursive)",
            background: "linear-gradient(135deg, #e8c06a 0%, #c97840 40%, #8b5c30 70%, #c8a96a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            textShadow: "none",
            filter: "drop-shadow(0 4px 20px rgba(200,120,40,0.45))",
            animation: "titlePulse 3s ease-in-out infinite",
          }}
        >
          arttle
        </div>

        <div
          style={{
            color: "var(--text-muted)",
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
              border: "2px solid #c8a96a",
              background: "rgba(200,169,106,0.18)",
              color: "#e8ddd0",
              boxShadow: "2px 4px 0 0 rgba(0,0,0,0.45)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(200,169,106,0.32)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "2px 6px 0 0 rgba(0,0,0,0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(200,169,106,0.18)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "2px 4px 0 0 rgba(0,0,0,0.45)";
            }}
          >
            🎮 シングルプレイ
          </button>

          <button
            onClick={handleMultiPlay}
            style={{
              ...optionButtonStyle,
              border: "2px solid rgba(180,140,80,0.55)",
              background: "rgba(160,120,60,0.12)",
              color: "#d4c5b0",
              boxShadow: "2px 4px 0 0 rgba(0,0,0,0.40)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(160,120,60,0.26)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "2px 6px 0 0 rgba(0,0,0,0.40)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(160,120,60,0.12)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "2px 4px 0 0 rgba(0,0,0,0.40)";
            }}
          >
            👥 マルチプレイ
          </button>

          <button
            onClick={handleGhostMatch}
            style={{
              ...optionButtonStyle,
              border: "2px solid rgba(140,120,100,0.55)",
              background: "rgba(80,60,40,0.18)",
              color: "#c8b8a8",
              boxShadow: "2px 4px 0 0 rgba(0,0,0,0.38)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(80,60,40,0.32)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "2px 6px 0 0 rgba(0,0,0,0.38)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(80,60,40,0.18)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "2px 4px 0 0 rgba(0,0,0,0.38)";
            }}
          >
            👻 ゴーストマッチ
          </button>

          <button
            onClick={handleProfile}
            style={{
              ...optionButtonStyle,
              border: "2px solid rgba(120,110,90,0.50)",
              background: "rgba(60,50,30,0.15)",
              color: "#b8a898",
              boxShadow: "2px 4px 0 0 rgba(0,0,0,0.35)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(60,50,30,0.28)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "2px 6px 0 0 rgba(0,0,0,0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(60,50,30,0.15)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "2px 4px 0 0 rgba(0,0,0,0.35)";
            }}
          >
            📜 プロフィール
          </button>

          <button
            onClick={handleOpenOptions}
            style={{
              ...optionButtonStyle,
              border: "1px solid rgba(100,90,80,0.35)",
              background: "transparent",
              color: "var(--text-muted)",
              boxShadow: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(100,90,80,0.12)";
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.borderColor = "rgba(100,90,80,0.60)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "rgba(100,90,80,0.35)";
            }}
          >
            ⚙️ オプション
          </button>
        </div>

        <style>{`
          @keyframes titlePulse {
            0%, 100% { filter: drop-shadow(0 4px 20px rgba(200,120,40,0.45)); }
            50% { filter: drop-shadow(0 4px 36px rgba(180,100,30,0.70)); }
          }
        `}</style>
      </div>
      <OptionsPanel open={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </>
  );
}
