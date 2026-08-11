"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type PeerType from "peerjs";
import type { DataConnection } from "peerjs";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { ProfileScreen } from "@/components/Profile/ProfileScreen";
import { VsScreen } from "@/components/Vs/VsScreen";
import { WeakMagicSelectPanel } from "@/components/WeakMagicSelect/WeakMagicSelectPanel";
import { createMatchPlayerRecord, calculateFinalHpRatio, remapTurnResultsToPersistentIds } from "@/lib/matchBuilders";
import { drawingToDataUrl, prepareDrawingForWire } from "@/lib/drawingWire";
import { ensurePlayerIdentity, persistPlayerIdentity, type PlayerIdentity } from "@/lib/playerIdentity";
import { submitMatchRecord, syncPlayerNickname } from "@/lib/profileApi";
import { RoomPanel } from "@/components/Room/RoomPanel";
import { TitleScreen } from "@/components/Title/TitleScreen";
import { SinglePlayManager } from "@/components/SinglePlay/SinglePlayManager";
import { GhostMatchManager } from "@/components/GhostMatch/GhostMatchManager";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { calculateStatsFromDrawing, detectCharacterType } from "@/lib/statCalculator";
import { applyEnhancementSlot, ENHANCEMENT_SLOT_CHOICES, ENHANCEMENT_SLOT_META } from "@/lib/enhancementSlot";
import { soundManager } from "@/lib/soundManager";
import { getMultiplayerStageBgm } from "@/lib/vsTransition";
import type {
  ActionType,
  BattleMode,
  CharacterType,
  EnhancementSlot,
  PlayerBattleState,
  Stage,
  TurnResult,
  WeakMagicEffectSelection,
  WireDrawingData,
} from "@/types/game";

const DRAW_SECONDS = 300;
const TURN_SECONDS = 30;
const PARALYSIS_BOTH_TURN_SECONDS = 3;
const PARALYSIS_SINGLE_EARLY_FINALIZE_MS = 250;
const RECONNECT_SECONDS = 30;
const ROOM_ID_PREFIX = "vsarttle-";

function generateRoomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface PeerCharacter {
  persistentPlayerId: string;
  nickname: string;
  drawing: WireDrawingData;
  stats: PlayerBattleState["stats"];
  characterType: CharacterType;
  enhancementSlot: EnhancementSlot | null;
  battleMode: BattleMode;
  weakMagicSelection?: WeakMagicEffectSelection;
}

type RematchMode = "same" | "redraw";

type WireMessage =
  | { type: "room_config"; payload: { battleMode: BattleMode } }
  | { type: "ready"; payload: PeerCharacter }
  | { type: "turn_start"; payload: { turn: number; deadline: number } }
  | { type: "turn_action"; payload: { turn: number; playerId: string; action: ActionType } }
  | { type: "turn_result"; payload: TurnResult }
  | { type: "forfeit"; payload: { winnerId: string; reason: string } }
  | { type: "rematch"; payload: { mode: RematchMode } }
  | { type: "return_to_title"; payload: Record<string, never> };

export default function Home() {
  const peerRef = useRef<PeerType | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const myIdRef = useRef("");
  const roleRef = useRef<"host" | "guest" | null>(null);
  const peerIdRef = useRef("");
  const pendingActionsRef = useRef<Record<string, ActionType>>({});
  const turnTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  /** True when we (or the peer) intentionally triggered a title-return, so the
   *  close event should NOT start the forfeit countdown. */
  const intentionalDisconnectRef = useRef(false);
  const countdownIntervalRef = useRef<number | null>(null);
  const localCharacterRef = useRef<PeerCharacter | null>(null);
  const remoteCharacterRef = useRef<PeerCharacter | null>(null);
  const battleModeRef = useRef<BattleMode>("simple");
  const battleStateRef = useRef<Record<string, PlayerBattleState>>({});
  // Tracks the highest turn number that finalizeTurn has successfully started
  // processing. Used as an idempotency guard to prevent the same turn from being
  // finalized twice (e.g. when a stale turn_action wire message arrives after the
  // turn timer has already fired, and combines with the host's next-turn action
  // already stored in pendingActionsRef to spuriously trigger another finalize).
  const finalizedTurnRef = useRef(0);
  // Guards against re-applying a "rematch" choice twice for the same battle finish
  // (once from the local button click, once from the message echoed by the peer).
  const rematchHandledRef = useRef(false);
  // Tracks the previously-completed drawing (kept only so DrawPanel can prefill an
  // edit after choosing "描きなおしてもう１戦"). This must NOT be treated as a
  // completed "ready" character for the new match.
  const previousDrawingRef = useRef<WireDrawingData | null>(null);
  const pendingBattleStartRef = useRef<(() => void) | null>(null);
  const matchIdRef = useRef("");
  const turnHistoryRef = useRef<Pick<TurnResult, "turn" | "winnerId" | "nextStates">[]>([]);
  const submittedMatchIdsRef = useRef<Set<string>>(new Set());

  const [stage, setStage] = useState<Stage>("title");
  const [status, setStatus] = useState("ルームを作成するか入室してください");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("プレイヤー");
  const [playerIdentity, setPlayerIdentity] = useState<PlayerIdentity | null>(null);
  const [battleMode, setBattleMode] = useState<BattleMode>("simple");
  const [drawSeconds, setDrawSeconds] = useState(DRAW_SECONDS);
  const [turnCountdown, setTurnCountdown] = useState(TURN_SECONDS);
  const [countdownEpoch, setCountdownEpoch] = useState(0);
  const [turn, setTurn] = useState(1);
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  // True from the moment the player confirms their action until both (a) the turn
  // number has incremented and (b) a new countdown has actually been started.
  // While this is true, BattlePanel unmounts the action buttons from the DOM so
  // that no click can slip through during the animation / turn-finalization window.
  const [isResolvingTurn, setIsResolvingTurn] = useState(false);
  // Records the turn number that triggered the current resolving phase.
  const resolvingTurnNumberRef = useRef<number | null>(null);
  // Records the countdown epoch observed when the current resolving phase started.
  const resolvingEpochRef = useRef<number | null>(null);
  const [winnerText, setWinnerText] = useState("");
  const [battleState, setBattleState] = useState<Record<string, PlayerBattleState>>({});
  const [battleFinish, setBattleFinish] = useState<{ winnerId: string } | null>(null);
  const [pendingCharacterBase, setPendingCharacterBase] = useState<{
    drawing: WireDrawingData;
    stats: PlayerBattleState["stats"];
    characterType: CharacterType;
  } | null>(null);
  const [pendingReadyCharacter, setPendingReadyCharacter] = useState<PeerCharacter | null>(null);
  /** Cumulative win/loss record against the current opponent (resets on room change). */
  const [matchRecord, setMatchRecord] = useState({ wins: 0, losses: 0 });
  /** When non-empty, shows an overlay informing this player that the peer returned to title. */
  const [peerReturnMsg, setPeerReturnMsg] = useState("");

  const myState = useMemo(() => battleState[myIdRef.current], [battleState]);
  const enemyState = useMemo(() => battleState[peerIdRef.current], [battleState]);

  const sendWire = (payload: WireMessage) => {
    connRef.current?.send(payload);
  };

  const recordTurnResult = useCallback((result: Pick<TurnResult, "turn" | "winnerId" | "nextStates">) => {
    turnHistoryRef.current = [
      ...turnHistoryRef.current.filter((entry) => entry.turn !== result.turn),
      result,
    ].sort((left, right) => left.turn - right.turn);
  }, []);

  const ensureSyncedIdentity = useCallback(
    async (name: string) => {
      const normalized = name.trim() || "プレイヤー";
      const base = playerIdentity ?? ensurePlayerIdentity(normalized);
      const updated = persistPlayerIdentity({
        ...base,
        nickname: normalized,
      });
      setPlayerIdentity(updated);
      setNickname(updated.nickname);
      try {
        await syncPlayerNickname(updated.playerId, updated.nickname);
      } catch {
        // Ignore sync failures so local play can continue offline.
      }
      return updated;
    },
    [playerIdentity],
  );

  const scheduleTurnFinalize = (turnNumber: number, delayMs: number) => {
    // Do not (re-)schedule a turn that is already finalized. Without this guard a
    // stale turn_action wire message arriving late could call scheduleTurnFinalize
    // for the old turn, silently cancelling the live timer for the *next* turn and
    // then re-running finalizeTurn with wrong state.
    if (finalizedTurnRef.current >= turnNumber) return;
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    turnTimerRef.current = window.setTimeout(() => finalizeTurn(turnNumber), delayMs);
  };

  const getBothParalyzed = (battle: Record<string, PlayerBattleState>) => {
    const myId = myIdRef.current;
    const enemyId = peerIdRef.current;
    if (!battle[myId] || !battle[enemyId]) return false;
    return !!battle[myId].paralyzedNextTurn && !!battle[enemyId].paralyzedNextTurn;
  };

  const getTurnWindowSeconds = (battle: Record<string, PlayerBattleState>) =>
    getBothParalyzed(battle) ? PARALYSIS_BOTH_TURN_SECONDS : TURN_SECONDS;

  const maybeFinalizeTurnEarly = (turnNumber: number) => {
    if (roleRef.current !== "host") return;
    const myId = myIdRef.current;
    const enemyId = peerIdRef.current;
    const battle = battleStateRef.current;
    if (!battle[myId] || !battle[enemyId]) return;
    const myParalyzed = !!battle[myId].paralyzedNextTurn;
    const enemyParalyzed = !!battle[enemyId].paralyzedNextTurn;

    const pending = pendingActionsRef.current;
    if (pending[myId] && pending[enemyId]) {
      scheduleTurnFinalize(turnNumber, myParalyzed || enemyParalyzed ? PARALYSIS_SINGLE_EARLY_FINALIZE_MS : 0);
      return;
    }

    if (myParalyzed && enemyParalyzed) {
      scheduleTurnFinalize(turnNumber, PARALYSIS_BOTH_TURN_SECONDS * 1000);
      return;
    }

    if (myParalyzed !== enemyParalyzed) {
      const nonParalyzedId = myParalyzed ? enemyId : myId;
      if (pending[nonParalyzedId]) {
        scheduleTurnFinalize(turnNumber, PARALYSIS_SINGLE_EARLY_FINALIZE_MS);
      }
    }
  };

  const startHostTurn = (turnNumber: number, battle: Record<string, PlayerBattleState>) => {
    const durationSeconds = getTurnWindowSeconds(battle);
    const deadline = Date.now() + durationSeconds * 1000;
    sendWire({ type: "turn_start", payload: { turn: turnNumber, deadline } });
    startCountdown(deadline);
    scheduleTurnFinalize(turnNumber, durationSeconds * 1000);
  };

  // Shared countdown timer used by both host and guest
  const startCountdown = (deadline: number) => {
    setCountdownEpoch((epoch) => epoch + 1);
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
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
  };

  const finalizeReadyCharacter = (character: PeerCharacter) => {
    setPendingCharacterBase(null);
    setPendingReadyCharacter(null);
    localCharacterRef.current = character;
    sendWire({ type: "ready", payload: character });
    setStatus("準備完了。相手の完成を待っています。");
    const remote = remoteCharacterRef.current;
    if (remote && stage === "drawing") beginBattle(character, remote);
  };

  const beginBattle = (local: PeerCharacter, remote: PeerCharacter) => {
    const me: PlayerBattleState = {
      id: myIdRef.current,
      nickname: local.nickname,
      imageDataUrl: drawingToDataUrl(local.drawing),
      stats: local.stats,
      characterType: local.characterType,
      enhancementSlot: local.enhancementSlot,
      currentHp: local.stats.maxHp,
      currentPp: local.stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    const enemy: PlayerBattleState = {
      id: peerIdRef.current,
      nickname: remote.nickname,
      imageDataUrl: drawingToDataUrl(remote.drawing),
      stats: remote.stats,
      characterType: remote.characterType,
      enhancementSlot: remote.enhancementSlot,
      currentHp: remote.stats.maxHp,
      currentPp: remote.stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    const initial = { [me.id]: me, [enemy.id]: enemy };
    battleStateRef.current = initial;
    setBattleState(initial);
    setBattleFinish(null);
    setTurnResult(null);
    setTurn(1);
    setStatus("対戦開始！");
    matchIdRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    turnHistoryRef.current = [];
    pendingBattleStartRef.current = () => {
      pendingActionsRef.current = {};
      finalizedTurnRef.current = 0;
      setIsResolvingTurn(false);
      resolvingTurnNumberRef.current = null;
      resolvingEpochRef.current = null;
      setCountdownEpoch(0);
      setStage("battle");
      pendingBattleStartRef.current = null;
      if (roleRef.current === "host") {
        startHostTurn(1, initial);
      }
    };
    setStage("vs");
  };

  const finalizeTurn = (turnNumber: number) => {
    if (roleRef.current !== "host") return;
    // Idempotency guard: prevent the same turn from being finalized more than once.
    // This can happen when a stale turn_action message arrives after the turn timer
    // already fired, combining with next-turn actions already in pendingActionsRef to
    // spuriously trigger scheduleTurnFinalize for the old turn number.
    if (finalizedTurnRef.current >= turnNumber) return;
    const current = pendingActionsRef.current;
    const myId = myIdRef.current;
    const enemyId = peerIdRef.current;
    const currentBattle = structuredClone(battleStateRef.current);
    if (!currentBattle[myId] || !currentBattle[enemyId]) return;
    // Mark as finalized before any async effects or recursive scheduling so that
    // any re-entrant call (e.g. from a queued turn_action handler) exits early.
    finalizedTurnRef.current = turnNumber;

    const fillAction = (id: string): ActionType => {
      // まひ状態なら選択済みのわざがあっても無視し、そのターンは行動不能にする。
      if (currentBattle[id].paralyzedNextTurn) return "paralysis";
      const selected = current[id];
      if (selected) return selected;
      const available = getAvailableActions(currentBattle[id], turnNumber);
      return available[Math.floor(Math.random() * available.length)] ?? "attack";
    };

    const actions = {
      [myId]: fillAction(myId),
      [enemyId]: fillAction(enemyId),
    };

    const result = resolveTurn({
      turn: turnNumber,
      players: currentBattle,
      actions,
      weakMagicSelections: {
        [myId]: localCharacterRef.current?.weakMagicSelection,
        [enemyId]: remoteCharacterRef.current?.weakMagicSelection,
      },
    });
    battleStateRef.current = result.nextStates;
    setBattleState(result.nextStates);
    setTurnResult(result);
    recordTurnResult({
      turn: result.turn,
      winnerId: result.winnerId,
      nextStates: result.nextStates,
    });
    sendWire({ type: "turn_result", payload: result });
    pendingActionsRef.current = {};

    if (result.winnerId) {
      setBattleFinish({ winnerId: result.winnerId });
      return;
    }

    const nextTurn = turnNumber + 1;
    setTurn(nextTurn);
    startHostTurn(nextTurn, result.nextStates);
  };

  // Reset the rematch guard whenever a new battle finish occurs, so the next
  // "再戦"/"描きなおしてもう１戦" choice can be applied exactly once.
  // Also clear the resolving-turn flag: if the player's last action caused the
  // battle to end, we never get a turn increment + countdown reset, so we must
  // clear isResolvingTurn here to avoid leaving it permanently stuck on true.
  useEffect(() => {
    if (battleFinish) {
      rematchHandledRef.current = false;
      setIsResolvingTurn(false);
      resolvingTurnNumberRef.current = null;
      resolvingEpochRef.current = null;
    }
  }, [battleFinish]);

  // Update the cumulative win/loss record whenever a battle concludes.
  useEffect(() => {
    if (!battleFinish) return;
    const myId = myIdRef.current;
    setMatchRecord((prev) => ({
      wins: prev.wins + (battleFinish.winnerId === myId ? 1 : 0),
      losses: prev.losses + (battleFinish.winnerId !== myId ? 1 : 0),
    }));
  }, [battleFinish]);

  useEffect(() => {
    const identity = ensurePlayerIdentity("プレイヤー");
    setPlayerIdentity(identity);
    setNickname(identity.nickname);
    void syncPlayerNickname(identity.playerId, identity.nickname).catch(() => {});
  }, []);

  useEffect(() => {
    if (!battleFinish || roleRef.current !== "host") return;
    if (!matchIdRef.current || submittedMatchIdsRef.current.has(matchIdRef.current)) return;
    const local = localCharacterRef.current;
    const remote = remoteCharacterRef.current;
    const myBattleState = battleStateRef.current[myIdRef.current];
    const enemyBattleState = battleStateRef.current[peerIdRef.current];
    if (!local || !remote || !myBattleState || !enemyBattleState) return;

    submittedMatchIdsRef.current.add(matchIdRef.current);
    const winnerPersistentId =
      battleFinish.winnerId === myIdRef.current
        ? local.persistentPlayerId
        : battleFinish.winnerId === peerIdRef.current
        ? remote.persistentPlayerId
        : null;

    void (async () => {
      try {
        const players = await Promise.all([
          createMatchPlayerRecord({
            playerId: local.persistentPlayerId,
            nickname: local.nickname,
            characterType: myBattleState.characterType,
            stats: myBattleState.stats,
            drawingSource: myBattleState.imageDataUrl,
          }),
          createMatchPlayerRecord({
            playerId: remote.persistentPlayerId,
            nickname: remote.nickname,
            characterType: enemyBattleState.characterType,
            stats: enemyBattleState.stats,
            drawingSource: enemyBattleState.imageDataUrl,
          }),
        ]);

        await submitMatchRecord({
          match: {
            matchId: matchIdRef.current,
            playedAt: new Date().toISOString(),
            battleMode: battleModeRef.current,
            source: "multiplayer",
            players,
            winnerId: winnerPersistentId,
            turnCount: turnHistoryRef.current.length,
            finalHpRatio: calculateFinalHpRatio(battleFinish.winnerId, battleStateRef.current),
            singlePlayResult: null,
            rating: null,
          },
          turnResults: remapTurnResultsToPersistentIds(turnHistoryRef.current, {
            [myIdRef.current]: local.persistentPlayerId,
            [peerIdRef.current]: remote.persistentPlayerId,
          }),
        });
      } catch (err) {
        console.error("[page] submitMatchRecord failed:", err);
        submittedMatchIdsRef.current.delete(matchIdRef.current);
      }
    })();
  }, [battleFinish, recordTurnResult]);

  // Clear the resolving-turn flag once both the turn number has advanced past the
  // turn where the action was submitted AND startCountdown has been called again.
  // The countdown epoch is a deterministic signal that a new turn window actually
  // started; unlike countdown value checks, this cannot be satisfied by stale values.
  useEffect(() => {
    if (!isResolvingTurn) return;
    if (resolvingTurnNumberRef.current === null) return;
    if (resolvingEpochRef.current === null) return;
    if (turn > resolvingTurnNumberRef.current && countdownEpoch > resolvingEpochRef.current) {
      setIsResolvingTurn(false);
      resolvingTurnNumberRef.current = null;
      resolvingEpochRef.current = null;
    }
  }, [turn, countdownEpoch, isResolvingTurn]);

  const applyRematch = (mode: RematchMode) => {
    if (rematchHandledRef.current) return;
    rematchHandledRef.current = true;

    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    pendingActionsRef.current = {};
    finalizedTurnRef.current = 0;
    setTurnResult(null);
    setIsResolvingTurn(false);
    resolvingTurnNumberRef.current = null;
    resolvingEpochRef.current = null;
    setCountdownEpoch(0);

    if (mode === "same") {
      // 再戦: 前回のイラスト・ステータスをそのまま引き継ぎ、バトルパートから再開する。
      const local = localCharacterRef.current;
      const remote = remoteCharacterRef.current;
      if (!local || !remote) return;
      beginBattle(local, remote);
      setStatus("再戦開始！");
      return;
    }

    // 描きなおしてもう１戦: ラクガキパートに戻る。相手の新しい絵を待つ必要があるため
    // remoteCharacterRef はクリアするが、自分の前回のイラストは DrawPanel の
    // initialDrawing として引き継ぎ、続きから編集できるようにする。
    // localCharacterRef も必ずクリアすること。クリアしないと、自分がまだ描き直して
    // いない間に相手の "ready"（新しい絵）を受信した際、handleWire の ready 処理が
    // 古い(前回戦の) localCharacterRef を使って beginBattle してしまい、
    // 片方だけが勝手にバトルパートへ進んでしまう不具合が起きる。
    previousDrawingRef.current = localCharacterRef.current?.drawing ?? previousDrawingRef.current;
    localCharacterRef.current = null;
    remoteCharacterRef.current = null;
    setPendingCharacterBase(null);
    setPendingReadyCharacter(null);
    setBattleFinish(null);
    setBattleState({});
    setTurn(1);
    setDrawSeconds(DRAW_SECONDS);
    setStage("drawing");
    setStatus("描きなおしてもう１戦！前回の絵を編集できます。");
  };

  const onRematchSame = () => {
    if (roleRef.current !== "host") return;
    sendWire({ type: "rematch", payload: { mode: "same" } });
    applyRematch("same");
  };

  const onRematchRedraw = () => {
    if (roleRef.current !== "host") return;
    sendWire({ type: "rematch", payload: { mode: "redraw" } });
    applyRematch("redraw");
  };

  const destroyPeer = () => {
    connRef.current?.close();
    connRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
  };

  /** Clean up the current multiplayer session and return to the title screen. */
  const goToTitle = () => {
    intentionalDisconnectRef.current = true;
    destroyPeer();
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setBattleFinish(null);
    setTurnResult(null);
    setIsResolvingTurn(false);
    resolvingTurnNumberRef.current = null;
    resolvingEpochRef.current = null;
    setCountdownEpoch(0);
    setBattleState({});
    localCharacterRef.current = null;
    remoteCharacterRef.current = null;
    matchIdRef.current = "";
    turnHistoryRef.current = [];
    previousDrawingRef.current = null;
    pendingBattleStartRef.current = null;
    setPendingCharacterBase(null);
    setPendingReadyCharacter(null);
    battleModeRef.current = "simple";
    setBattleMode("simple");
    setMatchRecord({ wins: 0, losses: 0 });
    setStage("title");
    setStatus("ルームを作成するか入室してください");
    intentionalDisconnectRef.current = false;
  };

  const onReturnToTitle = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    sendWire({ type: "return_to_title", payload: {} });
    goToTitle();
  };

  const handleWire = (message: WireMessage) => {
    if (message.type === "room_config") {
      battleModeRef.current = message.payload.battleMode;
      setBattleMode(message.payload.battleMode);
      return;
    }

    if (message.type === "ready") {
      battleModeRef.current = message.payload.battleMode;
      setBattleMode(message.payload.battleMode);
      remoteCharacterRef.current = message.payload;
      const local = localCharacterRef.current;
      if (local && stage === "drawing") beginBattle(local, message.payload);
      return;
    }

    if (message.type === "turn_start") {
      setTurn(message.payload.turn);
      startCountdown(message.payload.deadline);
      return;
    }

    if (message.type === "turn_action" && roleRef.current === "host") {
      // Discard actions that belong to a turn we have already finalized. Without
      // this filter a late-arriving turn_action for turn N can land in
      // pendingActionsRef together with the host's already-stored action for turn
      // N+1, making maybeFinalizeTurnEarly see "both actions present" for the old
      // turn, cancel the live N+1 timer, and re-run finalizeTurn(N) with stale /
      // wrong-turn data — corrupting the battle state and causing a softlock.
      if (message.payload.turn <= finalizedTurnRef.current) return;
      pendingActionsRef.current[message.payload.playerId] = message.payload.action;
      maybeFinalizeTurnEarly(message.payload.turn);
      return;
    }

    if (message.type === "turn_result") {
      battleStateRef.current = message.payload.nextStates;
      setBattleState(message.payload.nextStates);
      setTurnResult(message.payload);
      recordTurnResult({
        turn: message.payload.turn,
        winnerId: message.payload.winnerId,
        nextStates: message.payload.nextStates,
      });
      // Also advance the guest's turn state so it stays in sync with the host even
      // if the turn_start message for the next turn is delayed or arrives after the
      // player has already interacted (belt-and-suspenders alongside turn_start).
      if (!message.payload.winnerId) {
        setTurn(message.payload.turn + 1);
      }
      if (message.payload.winnerId) {
        setBattleFinish({ winnerId: message.payload.winnerId });
      }
      return;
    }

    if (message.type === "rematch") {
      applyRematch(message.payload.mode);
      return;
    }

    if (message.type === "return_to_title") {
      // Peer pressed "タイトルへ戻る" — set intentional flag so the close event
      // does not start the forfeit countdown, then display notification and auto-navigate.
      intentionalDisconnectRef.current = true;
      setPeerReturnMsg("ホストがタイトルへ戻りました");
      window.setTimeout(() => {
        goToTitle();
        setPeerReturnMsg("");
      }, 2000);
      return;
    }

    if (message.type === "forfeit") {
      // Only used for disconnection-based forfeits (not HP=0 game end)
      pendingBattleStartRef.current = null;
      setStage("result");
      setWinnerText(message.payload.winnerId === myIdRef.current ? "相手切断により勝利" : "切断により敗北");
    }
  };

  // Keep handleWire ref current so DataConnection callbacks always call the latest version
  const handleWireRef = useRef(handleWire);
  useEffect(() => {
    handleWireRef.current = handleWire;
  });

  const attachConnectionHandlers = (conn: DataConnection) => {
    connRef.current = conn;
    conn.on("data", (data) => handleWireRef.current(data as WireMessage));
    conn.on("close", () => {
      pendingBattleStartRef.current = null;
      if (intentionalDisconnectRef.current) {
        // We (or the peer) deliberately closed the connection — skip forfeit flow.
        return;
      }
      setStatus(`接続切断。${RECONNECT_SECONDS}秒以内に復帰できなければ敗北`);
      reconnectTimerRef.current = window.setTimeout(() => {
        setStage("result");
        setWinnerText("切断復帰できず敗北");
      }, RECONNECT_SECONDS * 1000);
    });
    conn.on("error", (err) => {
      console.error("DataConnection error:", err);
      setStatus(`接続エラー: ${(err as Error).message}`);
    });
  };

  const startHostSession = async (name: string, selectedBattleMode: BattleMode) => {
    destroyPeer();
    const identity = await ensureSyncedIdentity(name);
    setNickname(identity.nickname);
    battleModeRef.current = selectedBattleMode;
    setBattleMode(selectedBattleMode);
    setStatus("ルームを作成中...");

    let retries = 0;
    const tryCreate = async () => {
      const code = generateRoomCode();
      const { default: Peer } = await import("peerjs");
      const peer = new Peer(ROOM_ID_PREFIX + code);
      peerRef.current = peer;

      peer.on("open", (id) => {
        myIdRef.current = id;
        roleRef.current = "host";
        setRoomCode(code);
        setStatus(`ルーム作成完了。友達にルーム番号: ${code} を教えてください`);
      });

      peer.on("connection", (conn) => {
        peerIdRef.current = conn.peer;
        setStatus("相手が入室しました。P2P接続を確立中...");
        conn.on("open", () => {
          attachConnectionHandlers(conn);
          sendWire({ type: "room_config", payload: { battleMode: battleModeRef.current } });
          setStatus("P2P接続完了。おえかきを開始します。");
          setStage("drawing");
          setDrawSeconds(DRAW_SECONDS);
        });
      });

      peer.on("error", (err) => {
        const peerErr = err as { type?: string } & Error;
        if (peerErr.type === "unavailable-id" && retries < 3) {
          retries++;
          peer.destroy();
          void tryCreate();
        } else {
          setStatus(`エラー: ${err.message}`);
        }
      });
    };

    await tryCreate();
  };

  const startGuestSession = async (code: string, name: string) => {
    destroyPeer();
    const identity = await ensureSyncedIdentity(name);
    setNickname(identity.nickname);
    battleModeRef.current = "simple";
    setBattleMode("simple");
    setStatus("入室中...");

    const { default: Peer } = await import("peerjs");
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      myIdRef.current = id;
      roleRef.current = "guest";
      peerIdRef.current = ROOM_ID_PREFIX + code;

      // Use PeerJS default (binary) serialization instead of "json": the JSON
      // serializer does not chunk large payloads and silently drops any
      // message over ~16KB, which caused the "ready" message (containing the
      // full drawing) to be lost and both players to get stuck waiting.
      const conn = peer.connect(ROOM_ID_PREFIX + code);
      attachConnectionHandlers(conn);

      conn.on("open", () => {
        setRoomCode(code);
        setStatus("P2P接続完了。おえかきを開始します。");
        setStage("drawing");
        setDrawSeconds(DRAW_SECONDS);
      });
    });

    peer.on("error", (err) => {
      const peerErr = err as { type?: string } & Error;
      if (peerErr.type === "peer-unavailable") {
        setStatus(`ルーム ${code} が見つかりません。番号を確認してください。`);
      } else {
        setStatus(`エラー: ${err.message}`);
      }
    });
  };

  const onCreate = (name: string, selectedBattleMode: BattleMode) => {
    void startHostSession(name, selectedBattleMode);
  };

  const onJoin = (code: string, name: string) => {
    void startGuestSession(code, name);
  };

  useEffect(() => {
    return () => {
      destroyPeer();
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (stage !== "drawing") return;
    const timer = window.setInterval(() => {
      setDrawSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  // BGM transitions: play drawing BGM on drawing stage, battle BGM on battle stage
  useEffect(() => {
    if (stage === "singleplay") {
      // SinglePlayManager manages BGM internally for its own drawing/battle stages.
      return;
    }
    const bgm = getMultiplayerStageBgm(stage);
    if (bgm) {
      soundManager.playBgm(bgm);
    } else {
      soundManager.stopBgm();
    }
  }, [stage]);

  const onDrawingComplete = (payload: { drawing: Parameters<typeof calculateStatsFromDrawing>[0]; imageData: ImageData }) => {
    const stats = calculateStatsFromDrawing(payload.drawing, payload.imageData);
    const characterType = detectCharacterType(payload.imageData);
    setPendingCharacterBase({
      drawing: prepareDrawingForWire(payload.drawing),
      stats,
      characterType,
    });
    setStatus("強化スロットを1つ選択してください。");
  };

  const onEnhancementSlotSelect = (slot: EnhancementSlot) => {
    if (!pendingCharacterBase) return;
    const identity = playerIdentity ?? ensurePlayerIdentity(nickname);
    const character: PeerCharacter = {
      persistentPlayerId: identity.playerId,
      nickname,
      drawing: pendingCharacterBase.drawing,
      stats: applyEnhancementSlot(pendingCharacterBase.stats, slot),
      characterType: pendingCharacterBase.characterType,
      enhancementSlot: slot,
      battleMode: battleModeRef.current,
    };
    if (battleModeRef.current === "custom") {
      setPendingCharacterBase(null);
      setPendingReadyCharacter(character);
      setStatus("弱まほう効果を選択してください。");
      return;
    }
    finalizeReadyCharacter(character);
  };

  const onWeakMagicSelectionConfirm = (selection: WeakMagicEffectSelection) => {
    if (!pendingReadyCharacter) return;
    finalizeReadyCharacter({ ...pendingReadyCharacter, weakMagicSelection: selection });
  };

  const onActionSelect = (action: ActionType) => {
    // Enter the resolving phase immediately so the action buttons are removed from
    // the DOM before the next render. This prevents any further clicks from landing
    // while the turn is being finalized and the animation is playing.
    setIsResolvingTurn(true);
    resolvingTurnNumberRef.current = turn;
    resolvingEpochRef.current = countdownEpoch;
    sendWire({ type: "turn_action", payload: { turn, playerId: myIdRef.current, action } });
    if (roleRef.current === "host") {
      pendingActionsRef.current[myIdRef.current] = action;
      maybeFinalizeTurnEarly(turn);
    }
  };

  const handleVsComplete = useCallback(() => {
    pendingBattleStartRef.current?.();
  }, []);

  const onBackToRoom = () => {
    destroyPeer();
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setBattleFinish(null);
    setTurnResult(null);
    setIsResolvingTurn(false);
    resolvingTurnNumberRef.current = null;
    resolvingEpochRef.current = null;
    setCountdownEpoch(0);
    setBattleState({});
    matchIdRef.current = "";
    turnHistoryRef.current = [];
    // Clear stale character data so a future room's drawing phase never gets
    // prefilled with an illustration from a previous, unrelated match.
    localCharacterRef.current = null;
    remoteCharacterRef.current = null;
    previousDrawingRef.current = null;
    pendingBattleStartRef.current = null;
    setPendingCharacterBase(null);
    setPendingReadyCharacter(null);
    battleModeRef.current = "simple";
    setBattleMode("simple");
    setMatchRecord({ wins: 0, losses: 0 });
    setStage("room");
    setStatus("ルームを作成するか入室してください");
  };

  // Keep the same container ratio as single play so battle layouts don't stretch unnaturally.
  const containerMaxWidthClass = "max-w-5xl";

  return (
    <main className={`mx-auto flex min-h-screen w-full ${containerMaxWidthClass} flex-col gap-4 p-4`}>
      {/* Peer-returned-to-title overlay (visible regardless of stage) */}
      {peerReturnMsg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "rgba(30,10,0,0.95)",
              border: "2px solid #fbbf24",
              borderRadius: 16,
              padding: "32px 40px",
              textAlign: "center",
              color: "#fef3c7",
              maxWidth: 400,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 12 }}>
              {peerReturnMsg}
            </div>
            <div style={{ fontSize: 14, color: "#d1d5db" }}>まもなくタイトルへ戻ります…</div>
          </div>
        </div>
      )}

      {stage !== "title" && stage !== "singleplay" && stage !== "ghostmatch" && (
        <h1 className="text-2xl font-bold">ラクガキ対戦 arttle</h1>
      )}

      {stage === "title" && (
        <TitleScreen
          onSinglePlay={() => {
            setStage("singleplay");
          }}
          onMultiPlay={() => {
            setStage("room");
          }}
          onGhostMatch={() => {
            setStage("ghostmatch");
          }}
          onProfile={() => {
            const identity = playerIdentity ?? ensurePlayerIdentity(nickname);
            setPlayerIdentity(identity);
            setNickname(identity.nickname);
            setStage("profile");
          }}
        />
      )}

      {stage === "profile" && playerIdentity && (
        <ProfileScreen
          playerId={playerIdentity.playerId}
          fallbackNickname={nickname}
          onBack={() => setStage("title")}
        />
      )}

      {stage === "singleplay" && (
        <SinglePlayManager
          onBackToTitle={() => setStage("title")}
          playerProfile={{
            playerId: playerIdentity?.playerId ?? ensurePlayerIdentity("プレイヤー").playerId,
            nickname,
          }}
        />
      )}

      {stage === "ghostmatch" && (
        <GhostMatchManager
          onBackToTitle={() => setStage("title")}
          playerProfile={{
            playerId: playerIdentity?.playerId ?? ensurePlayerIdentity("プレイヤー").playerId,
            nickname,
          }}
        />
      )}

      {stage === "room" && (
        <RoomPanel
          status={status}
          roomCode={roomCode}
          nickname={nickname}
          canUseSignaling={true}
          onNicknameChange={setNickname}
          onCreate={onCreate}
          onJoin={onJoin}
          onBackToTitle={() => setStage("title")}
        />
      )}

      {stage === "drawing" && (
        <>
          <DrawPanel seconds={drawSeconds} onComplete={onDrawingComplete} initialDrawing={previousDrawingRef.current ?? undefined} />
          {/* Enhancement slot selection — shown as a modal overlay after drawing is complete */}
          {pendingCharacterBase && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                background: "rgba(0,0,0,0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  background: "rgba(20,8,0,0.97)",
                  border: "2px solid #d97706",
                  borderRadius: 16,
                  padding: "32px 36px",
                  maxWidth: 480,
                  width: "90vw",
                  color: "#fef3c7",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
                }}
              >
                <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>強化スロットを選択</h2>
                <p style={{ fontSize: 14, color: "#fbbf24", marginBottom: 20 }}>絵の完成ボーナスとして1つ選べます（マルチプレイのみ）</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {ENHANCEMENT_SLOT_CHOICES.map((slot) => (
                    <button
                      key={slot}
                      style={{
                        minWidth: 140,
                        borderRadius: 10,
                        border: "2px solid #d97706",
                        background: "rgba(120,50,0,0.4)",
                        padding: "12px 16px",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "#fef3c7",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(180,80,0,0.6)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(120,50,0,0.4)"; }}
                      onClick={() => {
                        soundManager.playSe("/sounds/se/button.mp3");
                        onEnhancementSlotSelect(slot);
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>
                        {ENHANCEMENT_SLOT_META[slot].icon} {ENHANCEMENT_SLOT_META[slot].label}
                      </div>
                      <div style={{ fontSize: 13, color: "#fbbf24" }}>{ENHANCEMENT_SLOT_META[slot].effectText}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {pendingReadyCharacter && battleMode === "custom" && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1001,
                background: "rgba(0,0,0,0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  background: "rgba(20,8,0,0.97)",
                  border: "2px solid #d97706",
                  borderRadius: 16,
                  padding: "32px 36px",
                  maxWidth: 560,
                  width: "90vw",
                  maxHeight: "90vh",
                  overflowY: "auto",
                  color: "#fef3c7",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
                }}
              >
                <WeakMagicSelectPanel onConfirm={onWeakMagicSelectionConfirm} />
              </div>
            </div>
          )}
        </>
      )}

      {stage === "battle" && myState && enemyState && (
        <BattlePanel
          me={myState}
          enemy={enemyState}
          role={roleRef.current === "host" ? "host" : "guest"}
          turn={turn}
          turnResult={turnResult}
          countdown={turnCountdown}
          onActionSelect={onActionSelect}
          isResolvingTurn={isResolvingTurn}
          finishResult={battleFinish}
          onRematchSame={onRematchSame}
          onRematchRedraw={onRematchRedraw}
          matchRecord={matchRecord}
          onReturnToTitle={onReturnToTitle}
          showArenaBackground={true}
        />
      )}

      {stage === "vs" && myState && enemyState && (
        <VsScreen
          me={myState}
          enemy={enemyState}
          onComplete={handleVsComplete}
        />
      )}

      {stage === "result" && (
        <section className="rounded-lg border p-4">
          <h2 className="text-xl font-bold">勝負結果</h2>
          <p className="text-lg">{winnerText}</p>
          <button
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
            onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); onBackToRoom(); }}
          >
            ルーム作成へ戻る
          </button>
        </section>
      )}
    </main>
  );
}
