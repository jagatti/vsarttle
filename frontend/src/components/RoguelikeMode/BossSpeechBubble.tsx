"use client";

import type { CSSProperties } from "react";

interface BossSpeechBubbleProps {
  text: string;
}

export function BossSpeechBubble({ text }: BossSpeechBubbleProps) {
  const bubbleStyle: CSSProperties = {
    position: "relative",
    display: "inline-block",
    background: "#ffffff",
    color: "#1a1a1a",
    borderRadius: 10,
    padding: "10px 18px",
    fontWeight: "bold",
    fontSize: "clamp(14px, 1.4vw, 18px)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
    maxWidth: 260,
    textAlign: "center",
  };

  const tailStyle: CSSProperties = {
    position: "absolute",
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderTop: "12px solid #ffffff",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={bubbleStyle}>
        {text}
        <div style={tailStyle} />
      </div>
    </div>
  );
}
