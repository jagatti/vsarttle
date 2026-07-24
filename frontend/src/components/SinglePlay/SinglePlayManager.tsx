"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { calculateStatsFromDrawing, detectCharacterType } from "@/lib/statCalculator";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import {
  applySinglePlayLimitBreak,
  getSinglePlayLimitBreakDisplayDurationMs,
  getSinglePlayLimitBreakStatusLines,
  LIMIT_BREAK_BGM_PATH,
  LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS,
} from "@/lib/singlePlayLimitBreak";
import { soundManager } from "@/lib/soundManager";
import { getBossData } from "@/data/bosses";
import {
  getFloorScoreDetail,
  getTotalScoreRank,
  type BasicRank,
  type FloorRecord,
  type ScoreRank,
} from "@/lib/scoreRank";
import type {
  ActionType,
  CharacterStats,
  CharacterType,
  DrawingData,
  PlayerBattleState,
  TurnResult,
} from "@/types/game";

const TOTAL_FLOORS = 5;
const TURN_SECONDS = 30;
// When the active player is まひ (paralyzed), they cannot select any action,
// so there is no need to wait for the full turn timer before auto-advancing.
const PARALYSIS_TURN_SECONDS = 3;
const POST_TURN_DELAY_MS = 4200;
const FINAL_FLOOR_WIN_TO_RESULT_MS = 2200;
const RESULT_ROLL_SCROLL_MS = 18000;
const RESULT_TOTAL_BUTTON_DELAY_MS = 3000;
// The final (5th floor) boss should only use チャージ (charge) once its HP
// has dropped to this fraction (or below) of its max HP.
const FLOOR5_BOSS_CHARGE_HP_THRESHOLD = 0.3;

// ── Types ────────────────────────────────────────────────────────────────────

interface SpCharacter {
  slotIndex: number;
  id: string;
  nickname: string;
  imageDataUrl: string;
  stats: CharacterStats;
  characterType: CharacterType;
  currentHp: number;
  currentPp: number;
}

type SpStage =
  | "drawing"
  | "char_select"
  | "battle"
  | "floor_win"
  | "floor_lose"
  | "all_clear"
  | "result_roll";

type FloorRecords = Partial<Record<number, FloorRecord>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPlayerState(char: SpCharacter): PlayerBattleState {
  return {
    id: char.id,
    nickname: char.nickname,
    imageDataUrl: char.imageDataUrl,
    stats: char.stats,
    characterType: char.characterType,
    currentHp: char.currentHp,
    currentPp: char.currentPp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

function buildEnemyState(floor: number, phase: 1 | 2): PlayerBattleState {
  const boss = getBossData(floor, phase);
  return {
    id: `boss-${floor}-${phase}`,
    nickname: boss.name,
    imageDataUrl: boss.imageUrl,
    stats: boss.stats,
    characterType: boss.characterType,
    currentHp: boss.stats.maxHp,
    currentPp: boss.stats.maxPp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

function getRankTextStyle(rank: BasicRank | ScoreRank): React.CSSProperties {
  if (rank === "SS") {
    return {
      background:
        "linear-gradient(90deg, #f00, #f80, #ff0, #0f0, #08f, #80f, #f00)",
      backgroundSize: "300% 100%",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      animation: "rainbowShift 0.8s linear infinite",
    };
  }

  if (rank === "S") return { color: "#ef4444" };
  if (rank === "A") return { color: "#22c55e" };
  if (rank === "B") return { color: "#3b82f6" };
  return { color: "#9ca3af" };
}

// `isFloor5Boss` restricts チャージ (charge) so that the final boss (floor 5,
// either phase) will only use it once its HP has dropped to 30% or below of
// its max HP. This keeps the CPU from charging early when it doesn't need to.
function pickCpuAction(enemy: PlayerBattleState, isFloor5Boss: boolean, turn: number): ActionType {
  if (enemy.limitBreakActive) return "magicStrong";
  let available = getAvailableActions(enemy, turn);
  if (isFloor5Boss) {
    const hpRatio = enemy.stats.maxHp > 0 ? enemy.currentHp / enemy.stats.maxHp : 0;
    if (hpRatio > FLOOR5_BOSS_CHARGE_HP_THRESHOLD) {
      const withoutCharge = available.filter((a) => a !== "charge");
      if (withoutCharge.length > 0) available = withoutCharge;
    }
  }
  if (available.length === 0) return "paralysis";
  return available[Math.floor(Math.random() * available.length)];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SlotPreview({ char, label, onClear }: { char: SpCharacter | null; label: string; onClear?: () => void }) {
  const borderColor = char ? "#6366f1" : "#374151";
  const pct = char ? Math.max(0, Math.min(100, (char.currentHp / char.stats.maxHp) * 100)) : 0;
  const hpColor = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";

  return (
    <div
      style={{
        width: 110,
        borderRadius: 10,
        border: `2px solid ${borderColor}`,
        background: "rgba(0,0,0,0.3)",
        padding: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: "bold" }}>{label}</div>
      <div
        style={{
          width: 90,
          height: 90,
          borderRadius: 8,
          border: `1px solid ${borderColor}`,
          background: "#fff",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {char ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={char.imageDataUrl}
            alt={char.nickname}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "#6b7280", fontSize: 28 }}>+</span>
        )}
      </div>
      {char && (
        <div style={{ width: "100%", fontSize: 10, color: "#d1d5db" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>HP</span>
            <span>{char.currentHp}/{char.stats.maxHp}</span>
          </div>
          <div
            style={{
              height: 5,
              background: "#111",
              borderRadius: 3,
              marginTop: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: hpColor,
                borderRadius: 3,
                transition: "width 0.4s",
              }}
            />
          </div>
        </div>
      )}
      {char && onClear && (
        <button
          onClick={onClear}
          style={{
            marginTop: 2,
            padding: "2px 8px",
            borderRadius: 5,
            border: "1px solid #6b7280",
            background: "rgba(55,65,81,0.8)",
            color: "#9ca3af",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          ✕ 解除
        </button>
      )}
    </div>
  );
}

function DrawingPhase(props: {
  slots: (SpCharacter | null)[];
  onSet: (payload: { drawing: DrawingData; imageData: ImageData }) => void;
  onComplete: () => void;
  onClear: (index: number) => void;
}) {
  const filledCount = props.slots.filter(Boolean).length;
  const nextSlotIndex = props.slots.findIndex((s) => s === null);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex-1 min-w-0">
        <DrawPanel
          seconds={999999}
          noTimer
          onSet={props.onSet}
          onComplete={() => { /* not used in single-play drawing */ }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 130,
          padding: "12px 0",
        }}
      >
        <div
          style={{
            color: "#fde68a",
            fontWeight: "bold",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          キャラ枠
        </div>

        {props.slots.map((char, i) => (
          <SlotPreview key={i} char={char} label={`枠 ${i + 1}`} onClear={char ? () => props.onClear(i) : undefined} />
        ))}

        <div style={{ color: "#9ca3af", fontSize: 11, textAlign: "center" }}>
          {filledCount === 0
            ? "「セット」で絵をセットしよう"
            : nextSlotIndex !== -1
            ? `次は枠${nextSlotIndex + 1}にセットされます`
            : "3体セット完了！"}
        </div>

        <button
          disabled={filledCount === 0}
          onClick={() => {
            soundManager.playSe("/sounds/se/button.mp3");
            props.onComplete();
          }}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: filledCount > 0 ? "2px solid #22c55e" : "2px solid #374151",
            background: filledCount > 0 ? "rgba(6,60,20,0.9)" : "#1f2937",
            color: filledCount > 0 ? "#86efac" : "#6b7280",
            fontWeight: "bold",
            fontSize: 14,
            cursor: filledCount > 0 ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          {filledCount > 0 ? "⚔️ バトル開始！" : "完成"}
        </button>
      </div>
    </div>
  );
}

function CharSelectScreen(props: {
  characters: (SpCharacter | null)[];
  floor: number;
  onSelect: (index: number) => void;
}) {
  const alive = props.characters
    .map((c, i) => ({ char: c, i }))
    .filter(({ char }) => char !== null && char.currentHp > 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        padding: 32,
        minHeight: "60vh",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          color: "#fde68a",
          fontSize: "clamp(20px, 2.5vw, 32px)",
          fontWeight: "bold",
        }}
      >
        第{props.floor}層 — 使用するキャラを選択
      </div>
      <div style={{ color: "#9ca3af", fontSize: 14 }}>
        HPが残っているキャラを選んでください
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {alive.map(({ char, i }) => {
          const c = char!;
          const pct = Math.max(0, Math.min(100, (c.currentHp / c.stats.maxHp) * 100));
          const hpColor = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
          return (
            <button
              key={i}
              onClick={() => {
                soundManager.playSe("/sounds/se/button.mp3");
                props.onSelect(i);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: "16px 20px",
                borderRadius: 12,
                border: "2px solid #6366f1",
                background: "rgba(99,102,241,0.1)",
                cursor: "pointer",
                transition: "all 0.2s",
                minWidth: 140,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(99,102,241,0.25)";
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(99,102,241,0.1)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <div style={{ color: "#c7d2fe", fontWeight: "bold", fontSize: 14 }}>
                枠 {i + 1}
              </div>
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 10,
                  border: "2px solid #6366f1",
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.imageDataUrl}
                  alt={c.nickname}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <div style={{ color: "#d1d5db", fontSize: 12 }}>
                HP: {c.currentHp}/{c.stats.maxHp}
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  background: "#111",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: hpColor,
                    borderRadius: 3,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SinglePlayManager(props: { onBackToTitle: () => void }) {
  // ── Stage ───────────────────────────────────────────────────────────────
  const [spStage, setSpStage] = useState<SpStage>("drawing");

  // ── Drawing phase state ────────────────────────────────────────────────────
  const [characters, setCharacters] = useState<(SpCharacter | null)[]>([null, null, null]);

  // ── Battle progression state ───────────────────────────────────────────────
  const [floor, setFloor] = useState(1);
  const [bossPhase, setBossPhase] = useState<1 | 2>(1);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);

  // ── Battle UI state ─────────────────────────────────────────────────────────
  const [battleState, setBattleState] = useState<Record<string, PlayerBattleState>>({});
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  const [battleFinish, setBattleFinish] = useState<{ winnerId: string } | null>(null);
  const [turn, setTurn] = useState(1);
  const [turnCountdown, setTurnCountdown] = useState(TURN_SECONDS);
  const [bossTransforming, setBossTransforming] = useState(false);
  const [limitBreaking, setLimitBreaking] = useState(false);
  const [visibleLimitBreakStatCount, setVisibleLimitBreakStatCount] = useState(0);
  const [floorRecords, setFloorRecords] = useState<FloorRecords>({});
  const [showResultTotal, setShowResultTotal] = useState(false);
  const [showResultBackButton, setShowResultBackButton] = useState(false);

  // ── Mutable refs (avoid stale closures) ───────────────────────────────────
  const battleStateRef = useRef<Record<string, PlayerBattleState>>({});
  const charactersRef = useRef<(SpCharacter | null)[]>([null, null, null]);
  const floorRef = useRef(1);
  const bossPhaseRef = useRef<1 | 2>(1);
  const activeCharIndexRef = useRef<number | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const postTurnTimerRef = useRef<number | null>(null);
  const limitBreakTimerRef = useRef<number | null>(null);
  const pendingActionRef = useRef<ActionType | null>(null);
  const resumeBattleWithNextCharRef = useRef(false);
  const turnRef = useRef(1);
  const floorContinuedRef = useRef<Partial<Record<number, boolean>>>({});
  const floorUsedCharIndexesRef = useRef<Partial<Record<number, Set<number>>>>({});
  const floor5Phase2StartTurnRef = useRef<number | null>(null);
  const finalWinToResultTimerRef = useRef<number | null>(null);
  const resultTotalTimerRef = useRef<number | null>(null);
  const resultBackButtonTimerRef = useRef<number | null>(null);

  // Keep refs in sync
  useEffect(() => { charactersRef.current = characters; }, [characters]);
  useEffect(() => { floorRef.current = floor; }, [floor]);
  useEffect(() => { bossPhaseRef.current = bossPhase; }, [bossPhase]);
  useEffect(() => { activeCharIndexRef.current = activeCharIndex; }, [activeCharIndex]);
  useEffect(() => { turnRef.current = turn; }, [turn]);

  // ── BGM ───────────────────────────────────────────────────────────────────
  const limitBreakUsed =
    Object.values(battleState).find((state) => state.id.startsWith("boss-"))?.limitBreakUsed ?? false;

  useEffect(() => {
    if (limitBreaking || limitBreakUsed) {
      soundManager.playBgm(LIMIT_BREAK_BGM_PATH);
    } else if (spStage === "drawing") {
      soundManager.playBgm("/sounds/bgm/oekaki_loop.mp3");
    } else if (spStage === "battle") {
      let bgm = "/sounds/bgm/battle_loop.mp3";
      if (floor === 3) {
        bgm = "/sounds/bgm/boss3_loop.mp3";
      } else if (floor === 4) {
        bgm = "/sounds/bgm/boss4_loop.mp3";
      } else if (floor === 5) {
        bgm = bossPhase === 2 ? "/sounds/bgm/boss5-2_loop.mp3" : "/sounds/bgm/boss5-1_loop.mp3";
      }
      soundManager.playBgm(bgm);
    } else {
      soundManager.stopBgm();
    }
  }, [spStage, floor, bossPhase, limitBreaking, limitBreakUsed]);

  useEffect(() => {
    if (spStage !== "floor_win" || floor !== TOTAL_FLOORS) return;
    if (finalWinToResultTimerRef.current) clearTimeout(finalWinToResultTimerRef.current);
    finalWinToResultTimerRef.current = window.setTimeout(() => {
      setSpStage("result_roll");
    }, FINAL_FLOOR_WIN_TO_RESULT_MS);
    return () => {
      if (finalWinToResultTimerRef.current) clearTimeout(finalWinToResultTimerRef.current);
    };
  }, [floor, spStage]);

  useEffect(() => {
    if (spStage !== "result_roll") return;
    setShowResultTotal(false);
    setShowResultBackButton(false);
    if (resultTotalTimerRef.current) clearTimeout(resultTotalTimerRef.current);
    if (resultBackButtonTimerRef.current) clearTimeout(resultBackButtonTimerRef.current);
    resultTotalTimerRef.current = window.setTimeout(() => {
      setShowResultTotal(true);
    }, RESULT_ROLL_SCROLL_MS);
    resultBackButtonTimerRef.current = window.setTimeout(() => {
      setShowResultBackButton(true);
    }, RESULT_ROLL_SCROLL_MS + RESULT_TOTAL_BUTTON_DELAY_MS);
    return () => {
      if (resultTotalTimerRef.current) clearTimeout(resultTotalTimerRef.current);
      if (resultBackButtonTimerRef.current) clearTimeout(resultBackButtonTimerRef.current);
    };
  }, [spStage]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      if (postTurnTimerRef.current) clearTimeout(postTurnTimerRef.current);
      if (limitBreakTimerRef.current) clearTimeout(limitBreakTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (finalWinToResultTimerRef.current) clearTimeout(finalWinToResultTimerRef.current);
      if (resultTotalTimerRef.current) clearTimeout(resultTotalTimerRef.current);
      if (resultBackButtonTimerRef.current) clearTimeout(resultBackButtonTimerRef.current);
    };
  }, []);

  const limitBreakEnemyState =
    Object.values(battleState).find((state) => state.id.startsWith("boss-")) ?? null;
  const limitBreakStatusLines = useMemo(
    () => (limitBreakEnemyState ? getSinglePlayLimitBreakStatusLines(limitBreakEnemyState) : []),
    [limitBreakEnemyState],
  );

  useEffect(() => {
    if (!limitBreaking) {
      setVisibleLimitBreakStatCount(0);
      return;
    }

    if (limitBreakStatusLines.length === 0) return;

    setVisibleLimitBreakStatCount(1);
    const revealTimers = limitBreakStatusLines.slice(1).map((_, index) =>
      window.setTimeout(() => {
        setVisibleLimitBreakStatCount(index + 2);
      }, (index + 1) * LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS),
    );

    return () => {
      revealTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [limitBreaking, limitBreakStatusLines]);

  // ── Countdown ─────────────────────────────────────────────────────────────
  const startCountdown = useCallback((seconds: number = TURN_SECONDS) => {
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    const deadline = Date.now() + seconds * 1000;
    const update = () => {
      const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnCountdown(remain);
      if (remain <= 0 && countdownIntervalRef.current !== null) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
    update();
    countdownIntervalRef.current = window.setInterval(update, 200);
  }, []);

  const ensureFloorUsedCharSet = useCallback((targetFloor: number): Set<number> => {
    const existing = floorUsedCharIndexesRef.current[targetFloor];
    if (existing) return existing;
    const created = new Set<number>();
    floorUsedCharIndexesRef.current[targetFloor] = created;
    return created;
  }, []);

  const markContinuedForFloor = useCallback((targetFloor: number) => {
    floorContinuedRef.current[targetFloor] = true;
  }, []);

  const recordFloorClear = useCallback(
    (targetFloor: number, clearTurn: number) => {
      const usedChars = ensureFloorUsedCharSet(targetFloor);
      const record: FloorRecord = {
        continued: floorContinuedRef.current[targetFloor] ?? false,
        charactersUsed: Math.max(1, usedChars.size),
        clearTurn,
      };
      setFloorRecords((prev) => ({ ...prev, [targetFloor]: record }));
    },
    [ensureFloorUsedCharSet],
  );

  // ── Core battle loop (uses refs to avoid stale closures) ──────────────────

  // scheduleAutoAction, finalizeTurn, handlePostTurn all call each other in a
  // cycle.  We break the cycle with a pair of stable "dispatch" refs so that
  // each function always invokes the most-recently-assigned version of its
  // callees without needing them all to be in the same dependency array.

  const doFinalizeTurnRef = useRef<(
    turnNumber: number,
    playerAction: ActionType | null,
    playerIdParam: string,
    enemyIdParam: string,
  ) => void>(() => {});

  const doHandlePostTurnRef = useRef<(
    result: TurnResult,
    playerIdParam: string,
    enemyIdParam: string,
    turnNumber: number,
  ) => void>(() => {});

  const doScheduleAutoActionRef = useRef<(
    turnNumber: number,
    battle: Record<string, PlayerBattleState>,
    playerIdParam: string,
    enemyIdParam: string,
  ) => void>(() => {});

  useEffect(() => {
    doFinalizeTurnRef.current = (
      turnNumber: number,
      playerAction: ActionType | null,
      playerIdParam: string,
      enemyIdParam: string,
    ) => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      const currentBattle = structuredClone(battleStateRef.current);
      if (!currentBattle[playerIdParam] || !currentBattle[enemyIdParam]) return;

      const resolvedPlayerAction = ((): ActionType => {
        if (currentBattle[playerIdParam].paralyzedNextTurn) return "paralysis";
        if (playerAction) return playerAction;
        const avail = getAvailableActions(currentBattle[playerIdParam], turnNumber);
        return avail.length > 0
          ? avail[Math.floor(Math.random() * avail.length)]
          : "attack";
      })();

      const isFloor5Boss = floorRef.current === 5 && enemyIdParam.startsWith("boss-5-");
      const cpuAction: ActionType = currentBattle[enemyIdParam].limitBreakActive
        ? "magicStrong"
        : currentBattle[enemyIdParam].paralyzedNextTurn
        ? "paralysis"
        : pickCpuAction(currentBattle[enemyIdParam], isFloor5Boss, turnNumber);

      const result = resolveTurn({
        turn: turnNumber,
        players: currentBattle,
        actions: {
          [playerIdParam]: resolvedPlayerAction,
          [enemyIdParam]: cpuAction,
        },
      });

      battleStateRef.current = result.nextStates;
      setBattleState(result.nextStates);
      setTurnResult(result);
      pendingActionRef.current = null;

      if (postTurnTimerRef.current) clearTimeout(postTurnTimerRef.current);
      postTurnTimerRef.current = window.setTimeout(() => {
        doHandlePostTurnRef.current(result, playerIdParam, enemyIdParam, turnNumber);
      }, POST_TURN_DELAY_MS);
    };
  });

  useEffect(() => {
    doHandlePostTurnRef.current = (
      result: TurnResult,
      playerIdParam: string,
      enemyIdParam: string,
      turnNumber: number,
    ) => {
      const nextStates = result.nextStates;
      const currentFloor = floorRef.current;
      const currentBossPhase = bossPhaseRef.current;
      const currentActiveCharIndex = activeCharIndexRef.current;

      if (nextStates[enemyIdParam] && nextStates[enemyIdParam].currentHp <= 0) {
        // Check for limit break trigger: boss-5-2, first time HP reaches 0
        if (enemyIdParam === "boss-5-2" && !nextStates[enemyIdParam].limitBreakUsed) {
          const limitBrokenEnemy = applySinglePlayLimitBreak(nextStates[enemyIdParam]);
          const newBattle = {
            [playerIdParam]: nextStates[playerIdParam],
            [enemyIdParam]: limitBrokenEnemy,
          };
          battleStateRef.current = newBattle;
          setBattleState(newBattle);
          setTurnResult(null);
          setLimitBreaking(true);
          if (limitBreakTimerRef.current) clearTimeout(limitBreakTimerRef.current);
          limitBreakTimerRef.current = window.setTimeout(() => {
            setLimitBreaking(false);
            const nextTurn = turnNumber + 1;
            setTurn(nextTurn);
            turnRef.current = nextTurn;
            startCountdown(TURN_SECONDS);
            doScheduleAutoActionRef.current(nextTurn, newBattle, playerIdParam, enemyIdParam);
          }, getSinglePlayLimitBreakDisplayDurationMs(
            getSinglePlayLimitBreakStatusLines(limitBrokenEnemy).length,
          ));
          return;
        }

        // Enemy defeated
        if (currentFloor === 5 && currentBossPhase === 1) {
          // Boss floor 5 phase 1 → transform to phase 2
          setBossTransforming(true);
          window.setTimeout(() => {
            setBossTransforming(false);
            setBossPhase(2);

            // Heal all player characters
            setCharacters((prev) =>
              prev.map((c) =>
                c ? { ...c, currentHp: c.stats.maxHp, currentPp: c.stats.maxPp } : c,
              ),
            );

            const healedPlayer: PlayerBattleState = {
              ...nextStates[playerIdParam],
              currentHp: nextStates[playerIdParam].stats.maxHp,
              currentPp: nextStates[playerIdParam].stats.maxPp,
              chargeMultiplier: 1,
              lastActionCategory: null,
            };
            const newEnemy = buildEnemyState(5, 2);
            const newBattle = {
              [playerIdParam]: healedPlayer,
              [newEnemy.id]: newEnemy,
            };
            battleStateRef.current = newBattle;
            setBattleState(newBattle);
            setBattleFinish(null);
            setTurnResult(null);
            setTurn(1);
            turnRef.current = 1;
            floor5Phase2StartTurnRef.current = 1;

            startCountdown();
            doScheduleAutoActionRef.current(1, newBattle, playerIdParam, newEnemy.id);
          }, 2500);
        } else {
          // Normal floor win
          const clearTurn = currentFloor === 5
            ? Math.max(1, turnNumber - (floor5Phase2StartTurnRef.current ?? 1) + 1)
            : turnNumber;
          recordFloorClear(currentFloor, clearTurn);
          setBattleFinish({ winnerId: playerIdParam });
          setSpStage("floor_win");
        }
      } else if (nextStates[playerIdParam] && nextStates[playerIdParam].currentHp <= 0) {
        // Active player character defeated
        const chars = charactersRef.current;
        const otherAlive = chars.some(
          (c, i) => c !== null && i !== currentActiveCharIndex && c.currentHp > 0,
        );

        // Sync KO'd character HP
        if (currentActiveCharIndex !== null) {
          setCharacters((prev) =>
            prev.map((c, i) =>
              i === currentActiveCharIndex && c
                ? { ...c, currentHp: 0 }
                : c,
            ),
          );
        }

        if (otherAlive) {
          resumeBattleWithNextCharRef.current = true;
          setSpStage("char_select");
          setTurnResult(null);
          setBattleFinish(null);
        } else {
          setBattleFinish({ winnerId: enemyIdParam });
          setSpStage("floor_lose");
        }
      } else {
        // Continue battle
        const nextTurn = turnNumber + 1;
        setTurn(nextTurn);
        turnRef.current = nextTurn;
        // If the active player is まひ (paralyzed) for the upcoming turn, they
        // have no action to choose, so shorten the wait before auto-advancing
        // instead of forcing the full 30-second turn timer.
        const nextTurnSeconds = nextStates[playerIdParam]?.paralyzedNextTurn
          ? PARALYSIS_TURN_SECONDS
          : TURN_SECONDS;
        startCountdown(nextTurnSeconds);
        doScheduleAutoActionRef.current(nextTurn, nextStates, playerIdParam, enemyIdParam);
      }
    };
  });

  useEffect(() => {
    doScheduleAutoActionRef.current = (
      turnNumber: number,
      battle: Record<string, PlayerBattleState>,
      playerIdParam: string,
      enemyIdParam: string,
    ) => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      // When the active player is まひ (paralyzed), there is nothing for them
      // to select, so advance to the next phase after a short delay instead
      // of waiting for the full turn timer.
      const delaySeconds = battle[playerIdParam]?.paralyzedNextTurn
        ? PARALYSIS_TURN_SECONDS
        : TURN_SECONDS;
      turnTimerRef.current = window.setTimeout(() => {
        doFinalizeTurnRef.current(turnNumber, pendingActionRef.current, playerIdParam, enemyIdParam);
        pendingActionRef.current = null;
      }, delaySeconds * 1000);
    };
  });

  // ── Start floor battle ─────────────────────────────────────────────────────
  const startFloorBattle = useCallback(
    (charIndex: number, currentFloor: number, currentBossPhase: 1 | 2) => {
      const chars = charactersRef.current;
      const char = chars[charIndex];
      if (!char) return;
      ensureFloorUsedCharSet(currentFloor).add(charIndex);
      if (currentFloor === 5 && currentBossPhase === 2 && floor5Phase2StartTurnRef.current === null) {
        floor5Phase2StartTurnRef.current = turnRef.current;
      }

      const playerState = toPlayerState(char);
      const existingEnemy = Object.values(battleStateRef.current).find((state) =>
        state.id.startsWith("boss-"),
      );
      const shouldResumeBattle =
        resumeBattleWithNextCharRef.current &&
        !!existingEnemy &&
        existingEnemy.currentHp > 0;
      const enemyState = shouldResumeBattle
        ? existingEnemy
        : buildEnemyState(currentFloor, currentBossPhase);
      const nextTurn = shouldResumeBattle ? turnRef.current + 1 : 1;

      const initial = {
        [playerState.id]: playerState,
        [enemyState.id]: enemyState,
      };

      battleStateRef.current = initial;
      setBattleState(initial);
      setBattleFinish(null);
      setTurnResult(null);
      setTurn(nextTurn);
      turnRef.current = nextTurn;
      setActiveCharIndex(charIndex);
      pendingActionRef.current = null;
      resumeBattleWithNextCharRef.current = false;
      setSpStage("battle");

      startCountdown(initial[playerState.id]?.paralyzedNextTurn ? PARALYSIS_TURN_SECONDS : TURN_SECONDS);
      doScheduleAutoActionRef.current(nextTurn, initial, playerState.id, enemyState.id);
    },
    [ensureFloorUsedCharSet, startCountdown],
  );

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleSetSlot = useCallback(
    (payload: { drawing: DrawingData; imageData: ImageData }) => {
      const chars = charactersRef.current;
      const nextIndex = chars.findIndex((c) => c === null);
      if (nextIndex === -1) {
        soundManager.playSe("/sounds/se/ng.mp3");
        return;
      }

      soundManager.playSe("/sounds/se/button.mp3");
      const stats = calculateStatsFromDrawing(payload.drawing, payload.imageData);
      const characterType = detectCharacterType(payload.imageData);
      const imageDataUrl = drawingToDataUrl(payload.drawing);

      const newChar: SpCharacter = {
        slotIndex: nextIndex,
        id: `player-${nextIndex}`,
        nickname: `キャラ${nextIndex + 1}`,
        imageDataUrl,
        stats,
        characterType,
        currentHp: stats.maxHp,
        currentPp: stats.maxPp,
      };

      const updated = chars.map((c, i) =>
        i === nextIndex ? newChar : c,
      ) as (SpCharacter | null)[];
      setCharacters(updated);

      if (updated.every((c) => c !== null)) {
        window.setTimeout(() => setSpStage("char_select"), 300);
      }
    },
    [],
  );

  const handleDrawingComplete = useCallback(() => {
    setSpStage("char_select");
  }, []);

  const handleClearSlot = useCallback((index: number) => {
    soundManager.playSe("/sounds/se/button.mp3");
    setCharacters((prev) => prev.map((c, i) => (i === index ? null : c)));
  }, []);

  const handleCharSelect = useCallback(
    (index: number) => {
      startFloorBattle(index, floorRef.current, bossPhaseRef.current);
    },
    [startFloorBattle],
  );

  const onActionSelect = useCallback((action: ActionType) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = action;

    const playerIds = Object.keys(battleStateRef.current);
    const playerIdParam = playerIds.find((id) => id.startsWith("player-"));
    const enemyIdParam = playerIds.find((id) => id.startsWith("boss-"));
    if (!playerIdParam || !enemyIdParam) return;

    doFinalizeTurnRef.current(turnRef.current, action, playerIdParam, enemyIdParam);
  }, []);

  const handleNextFloor = useCallback(() => {
    soundManager.playSe("/sounds/se/button.mp3");
    resumeBattleWithNextCharRef.current = false;
    const nextFloor = floorRef.current + 1;

    if (nextFloor > TOTAL_FLOORS) {
      setSpStage("result_roll");
      return;
    }

    setCharacters((prev) =>
      prev.map((c) =>
        c ? { ...c, currentHp: c.stats.maxHp, currentPp: c.stats.maxPp } : c,
      ),
    );

    setFloor(nextFloor);
    setBossPhase(1);
    floor5Phase2StartTurnRef.current = null;
    setBattleFinish(null);
    setTurnResult(null);
    setSpStage("char_select");
  }, []);

  const handleRetryFloor = useCallback(() => {
    soundManager.playSe("/sounds/se/button.mp3");
    resumeBattleWithNextCharRef.current = false;
    markContinuedForFloor(floorRef.current);
    floor5Phase2StartTurnRef.current = null;

    setCharacters((prev) =>
      prev.map((c) =>
        c ? { ...c, currentHp: c.stats.maxHp, currentPp: c.stats.maxPp } : c,
      ),
    );

    setBossPhase(1);
    setBattleFinish(null);
    setTurnResult(null);
    setSpStage("char_select");
  }, [markContinuedForFloor]);

  // ── Derived battle state ───────────────────────────────────────────────────
  const playerIds = Object.keys(battleState);
  const playerIdInBattle = playerIds.find((id) => id.startsWith("player-"));
  const enemyIdInBattle = playerIds.find((id) => id.startsWith("boss-"));
  const myState = playerIdInBattle ? battleState[playerIdInBattle] : null;
  const enemyState = enemyIdInBattle ? battleState[enemyIdInBattle] : null;
  const resultFloorDetails = useMemo(
    () =>
      Array.from({ length: TOTAL_FLOORS }, (_, index) => {
        const floorNumber = index + 1;
        const record = floorRecords[floorNumber] ?? {
          continued: true,
          charactersUsed: 3,
          clearTurn: 99,
        };
        return {
          ...getFloorScoreDetail(floorNumber, record),
          record,
        };
      }),
    [floorRecords],
  );
  const totalScore = useMemo(
    () => getTotalScoreRank(resultFloorDetails.map((detail) => detail.score)),
    [resultFloorDetails],
  );

  const finishButtonStyle: React.CSSProperties = {
    padding: "clamp(8px, 1vw, 12px) clamp(14px, 1.8vw, 22px)",
    borderRadius: 8,
    fontWeight: "bold",
    fontSize: "clamp(12px, 1.1vw, 15px)",
    cursor: "pointer",
  };

  // ── Boss transformation overlay ────────────────────────────────────────────
  if (bossTransforming) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: "900",
            background:
              "linear-gradient(90deg, #f00, #f80, #ff0, #0f0, #08f, #80f, #f00)",
            backgroundSize: "300% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "rainbowShift 0.5s linear infinite",
          }}
        >
          ✨ 変身！ ✨
        </div>
        <div style={{ color: "#fde68a", fontSize: 18, fontWeight: "bold" }}>
          ボスが姿を変えた…！
        </div>
      </div>
    );
  }

  // ── Limit break overlay ────────────────────────────────────────────────────
  if (limitBreaking) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          gap: 24,
          background: "rgba(80,0,0,0.5)",
        }}
      >
        <div
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: "900",
            color: "#ff2222",
            textShadow: "0 0 16px #ff0000, 0 0 32px #ff6600",
            animation: "rainbowShift 0.3s linear infinite",
            background:
              "linear-gradient(90deg, #f00, #f80, #f00, #f80, #f00)",
            backgroundSize: "300% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          💥 リミットブレイク！ 💥
        </div>
        <div style={{ color: "#fca5a5", fontSize: 18, fontWeight: "bold" }}>
          ステータスが激変した！
        </div>
        {limitBreakEnemyState && (
          <div
            style={{
              position: "relative",
              width: 240,
              height: 240,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -16,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #ff0040, #ff8a00, #fff200, #1dff7a, #00d4ff, #6a5cff, #ff00c8, #ff0040)",
                backgroundSize: "300% 300%",
                animation: "rainbowShift 0.7s linear infinite, limitBreakAuraPulse 1.8s ease-in-out infinite",
                filter: "blur(18px)",
                opacity: 0.95,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: 28,
                background:
                  "linear-gradient(135deg, #ff0040, #ff8a00, #fff200, #1dff7a, #00d4ff, #6a5cff, #ff00c8, #ff0040)",
                backgroundSize: "300% 300%",
                animation: "rainbowShift 0.7s linear infinite, limitBreakAuraPulse 1.8s ease-in-out infinite",
                boxShadow: "0 0 36px rgba(255,255,255,0.35)",
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={limitBreakEnemyState.imageDataUrl}
              alt={limitBreakEnemyState.nickname}
              style={{
                position: "relative",
                width: 220,
                height: 220,
                objectFit: "contain",
                borderRadius: 24,
                background: "rgba(0,0,0,0.35)",
                boxShadow: "0 0 30px rgba(255,255,255,0.25)",
              }}
            />
          </div>
        )}
        <div
          style={{
            color: "#fca5a5",
            fontSize: 15,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            textAlign: "center",
            border: "2px solid #ef4444",
            borderRadius: 10,
            padding: "12px 24px",
            background: "rgba(0,0,0,0.5)",
          }}
        >
          {limitBreakStatusLines.map((line, index) => {
            const isVisible = index < visibleLimitBreakStatCount;
            return (
              <div
                key={line}
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(8px)",
                  transition: "opacity 500ms ease, transform 500ms ease",
                  minHeight: 22,
                }}
              >
                {isVisible ? line : "\u00a0"}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Drawing phase ────────────────────────────────────────────────────────
  if (spStage === "drawing") {
    return (
      <div>
        <div
          style={{
            marginBottom: 12,
            color: "#fde68a",
            fontWeight: "bold",
            fontSize: 18,
          }}
        >
          🎨 シングルプレイ — おえかきパート
        </div>
        <div style={{ marginBottom: 8, color: "#9ca3af", fontSize: 13 }}>
          キャラクターを描いて「セット」ボタンで枠にセットしよう。1〜3体セットしたら「バトル開始！」へ進めます。
        </div>
        <DrawingPhase
          slots={characters}
          onSet={handleSetSlot}
          onComplete={handleDrawingComplete}
          onClear={handleClearSlot}
        />
      </div>
    );
  }

  // ── Character select ───────────────────────────────────────────────────────
  if (spStage === "char_select") {
    return (
      <CharSelectScreen
        characters={characters}
        floor={floor}
        onSelect={handleCharSelect}
      />
    );
  }

  // ── Battle ──────────────────────────────────────────────────────────────
  if ((spStage === "battle" || spStage === "floor_win" || spStage === "floor_lose") && myState && enemyState) {
    const isWin = !!battleFinish && battleFinish.winnerId === myState.id;
    const isLose = !!battleFinish && battleFinish.winnerId === enemyState.id;

    const customFinishButtons = (
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {isWin && floor < TOTAL_FLOORS && (
          <button
            onClick={handleNextFloor}
            style={{
              ...finishButtonStyle,
              border: "2px solid #22c55e",
              background: "rgba(6,60,20,0.9)",
              color: "#86efac",
            }}
          >
            {`次の層へ進む（第${floor + 1}層）`}
          </button>
        )}
        {isLose && (
          <>
            <button
              onClick={() => {
                soundManager.playSe("/sounds/se/button.mp3");
                props.onBackToTitle();
              }}
              style={{
                ...finishButtonStyle,
                border: "2px solid #6b7280",
                background: "rgba(30,30,30,0.9)",
                color: "#9ca3af",
              }}
            >
              タイトルに戻る
            </button>
            <button
              onClick={handleRetryFloor}
              style={{
                ...finishButtonStyle,
                border: "2px solid #f59e0b",
                background: "rgba(120,60,0,0.9)",
                color: "#fde68a",
              }}
            >
              再開（第{floor}層から）
            </button>
          </>
        )}
      </div>
    );

    return (
      <BattlePanel
        me={myState}
        enemy={enemyState}
        role="host"
        turn={turn}
        turnResult={turnResult}
        countdown={turnCountdown}
        onActionSelect={spStage === "battle" ? onActionSelect : () => {}}
        finishResult={battleFinish}
        onRematchSame={() => { /* not used in single play */ }}
        onRematchRedraw={() => { /* not used in single play */ }}
        customFinishButtons={customFinishButtons}
      />
    );
  }

  if (spStage === "result_roll") {
    return (
      <div className="singleplay-result-roll-screen">
        <div className="singleplay-result-roll-fade" />
        <div className="singleplay-result-roll-viewport">
          <div
            className="singleplay-result-roll-track"
            style={{ animationDuration: `${RESULT_ROLL_SCROLL_MS}ms` }}
          >
            {resultFloorDetails.map((detail) => (
              <section key={detail.floor} className="singleplay-result-roll-block">
                <div className="singleplay-result-roll-floor-title">第{detail.floor}層</div>
                <div>
                  コンテニュー：
                  <span style={{ ...getRankTextStyle(detail.continueRank), fontWeight: 900 }}>{detail.continueRank}</span>
                </div>
                <div>
                  {detail.record.charactersUsed}体使用クリア：
                  <span style={{ ...getRankTextStyle(detail.characterRank), fontWeight: 900 }}>{detail.characterRank}</span>
                </div>
                <div>
                  {detail.record.clearTurn}ターンクリア：
                  <span style={{ ...getRankTextStyle(detail.turnRank), fontWeight: 900 }}>{detail.turnRank}</span>
                </div>
                <div className="singleplay-result-roll-floor-score">
                  SCORE：
                  <span style={{ ...getRankTextStyle(detail.score), fontWeight: 900 }}>{detail.score}</span>
                </div>
              </section>
            ))}
          </div>
        </div>
        {showResultTotal && (
          <div className="singleplay-result-total-wrap">
            <div className="singleplay-result-total-label">TOTAL SCORE</div>
            <div style={{ ...getRankTextStyle(totalScore.rank), fontWeight: 900, fontSize: "clamp(56px, 9vw, 120px)" }}>
              {totalScore.rank}
            </div>
          </div>
        )}
        {showResultBackButton && (
          <button
            onClick={() => {
              soundManager.playSe("/sounds/se/button.mp3");
              props.onBackToTitle();
            }}
            style={{
              position: "absolute",
              bottom: "max(16px, 4vh)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 3,
              padding: "16px 32px",
              borderRadius: 10,
              border: "2px solid #6366f1",
              background: "rgba(99,102,241,0.15)",
              color: "#c7d2fe",
              fontWeight: "bold",
              fontSize: 18,
              cursor: "pointer",
              animation: "singlePlayResultButtonFadeIn 0.8s ease-out",
            }}
          >
            タイトルに戻る
          </button>
        )}
      </div>
    );
  }

  // ── All clear ─────────────────────────────────────────────────────────────
  if (spStage === "all_clear") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          gap: 32,
        }}
      >
        <div
          style={{
            fontSize: "clamp(36px, 5vw, 72px)",
            fontWeight: "900",
            background:
              "linear-gradient(90deg, #f00, #f80, #ff0, #0f0, #08f, #80f, #f00)",
            backgroundSize: "300% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "rainbowShift 1.2s linear infinite",
            letterSpacing: "0.08em",
          }}
        >
          🏆 ALL CLEAR! 🏆
        </div>
        <div
          style={{
            color: "#fde68a",
            fontSize: "clamp(16px, 2vw, 24px)",
            fontWeight: "bold",
            textAlign: "center",
          }}
        >
          全5層を制覇しました！
          <br />
          おめでとうございます！
        </div>
        <button
          onClick={() => {
            soundManager.playSe("/sounds/se/button.mp3");
            props.onBackToTitle();
          }}
          style={{
            padding: "16px 32px",
            borderRadius: 10,
            border: "2px solid #6366f1",
            background: "rgba(99,102,241,0.15)",
            color: "#c7d2fe",
            fontWeight: "bold",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          タイトルに戻る
        </button>
      </div>
    );
  }

  return null;
}
