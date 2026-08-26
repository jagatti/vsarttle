"use client";

interface BossSpeechBubbleProps {
  text: string;
}

export function BossSpeechBubble({ text }: BossSpeechBubbleProps) {
  return (
    <div
      style={{
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
      }}
    >
      {text}
    </div>
  );
}
