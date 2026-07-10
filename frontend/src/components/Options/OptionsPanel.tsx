"use client";

import { useEffect, useRef, useState } from "react";
import { soundManager } from "@/lib/soundManager";

export function OptionsPanel() {
  const [open, setOpen] = useState(false);
  const [bgmVol, setBgmVol] = useState(0.25);
  const [seVol, setSeVol] = useState(0.35);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load saved volumes from soundManager (which reads localStorage) on mount
  useEffect(() => {
    setBgmVol(soundManager.getBgmVolume());
    setSeVol(soundManager.getSeVolume());
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleBgmChange = (v: number) => {
    setBgmVol(v);
    soundManager.setBgmVolume(v);
  };

  const handleSeChange = (v: number) => {
    setSeVol(v);
    soundManager.setSeVolume(v);
  };

  return (
    <div ref={panelRef} style={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="オプション"
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: "rgba(20,20,30,0.88)",
          border: "2px solid #4b5563",
          fontSize: 20,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
          transition: "border-color 0.15s",
        }}
      >
        ⚙️
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 0,
            background: "#1a1a2e",
            border: "2px solid #4b5563",
            borderRadius: 12,
            padding: "16px 20px",
            minWidth: 230,
            boxShadow: "0 6px 28px rgba(0,0,0,0.65)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <span style={{ color: "#fde68a", fontWeight: "bold", fontSize: 14 }}>
              🔊 サウンド設定
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#9ca3af",
                fontSize: 16,
                cursor: "pointer",
                lineHeight: 1,
                padding: 0,
              }}
              title="閉じる"
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#d1d5db", fontSize: 13, display: "block", marginBottom: 6 }}>
              BGM音量：{Math.round(bgmVol * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(bgmVol * 100)}
              onChange={(e) => handleBgmChange(Number(e.target.value) / 100)}
              style={{ width: "100%", accentColor: "#fde68a" }}
            />
          </div>

          <div>
            <label style={{ color: "#d1d5db", fontSize: 13, display: "block", marginBottom: 6 }}>
              SE音量：{Math.round(seVol * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(seVol * 100)}
              onChange={(e) => handleSeChange(Number(e.target.value) / 100)}
              style={{ width: "100%", accentColor: "#fde68a" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
