"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type PeerType from "peerjs";
import type { DataConnection } from "peerjs";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { drawingToDataUrl, prepareDrawingForWire } from "@/lib/drawingWire";
import { RoomPanel } from "@/components/Room/RoomPanel";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { calculateStatsFromDrawing, detectCharacterType } from "@/lib/statCalculator";
import { soundManager } from "@/lib/soundManager";
import type { ActionType, PlayerBattleState, Stage, TurnResult, WireDrawingData, CharacterType } from "@/types/game";

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
  nickname: string;
  drawing: WireDrawingData;
  stats: PlayerBattleState["stats"];
  characterType: CharacterType;
}

type RematchMode = "same" | "redraw";

type WireMessage =
  | { type: "ready"; payload: PeerCharacter }
  | { type: "turn_start"; payload: { turn: number; deadline: number } }
  | { type: "turn_action"; payload: { turn: number; playerId: string; action: ActionType } }
  | { type: "turn_result"; payload: TurnResult }
  | { type: "forfeit"; payload: { winnerId: string; reason: string } }
  | { type: "rematch"; payload: { mode: RematchMode } };

export default function Home() {
  const peerRef = useRef<PeerType | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const myIdRef = useRef("");
  const roleRef = useRef<"host" | "guest" | null>(null);
  const peerIdRef = useRef("");
  const pendingActionsRef = useRef<Record<string, ActionType>>({});
  const turnTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const localCharacterRef = useRef<PeerCharacter | null>(null);
  const remoteCharacterRef = useRef<PeerCharacter | null>(null);
  const battleStateRef = useRef<Record<string, PlayerBattleState>>({});
  // Guards against re-applying a "rematch" choice twice for the same battle finish
  // (once from the local button click, once from the message echoed by the peer).
  const rematchHandledRef = useRef(false);

  const [stage, setStage] = useState<Stage>("room");
  const [status, setStatus] = useState("ルームを作成するか入室してください");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("プレイヤー");
  const [drawSeconds, setDrawSeconds] = useState(DRAW_SECONDS);
  const [turnCountdown, setTurnCountdown] = useState(TURN_SECONDS);
  const [turn, setTurn] = useState(1);
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  const [winnerText, setWinnerText] = useState("");
  const [battleState, setBattleState] = useState<Record<string, PlayerBattleState>>({});
  const [battleFinish, setBattleFinish] = useState<{ winnerId: string } | null>(null);

  const myState = useMemo(() => battleState[myIdRef.current], [battleState]);
  const enemyState = useMemo(() => battleState[peerIdRef.current], [battleState]);

  const sendWire = (payload: WireMessage) => {
    connRef.current?.send(payload);
  };

  const scheduleTurnFinalize = (turnNumber: number, delayMs: number) => {
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

  const beginBattle = (local: PeerCharacter, remote: PeerCharacter) => {
    const me: PlayerBattleState = {
      id: myIdRef.current,
      nickname: local.nickname,
      imageDataUrl: drawingToDataUrl(local.drawing),
      stats: local.stats,
      characterType: local.characterType,
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
      currentHp: remote.stats.maxHp,
      currentPp: remote.stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    const initial = { [me.id]: me, [enemy.id]: enemy };
    battleStateRef.current = initial;
    setBattleState(initial);
    setBattleFinish(null);
    setTurn(1);
    setStage("battle");
    setStatus("対戦開始！");

    if (roleRef.current === "host") {
      startHostTurn(1, initial);
    }
  };

  const finalizeTurn = (turnNumber: number) => {
    if (roleRef.current !== "host") return;
    const current = pendingActionsRef.current;
    const myId = myIdRef.current;
    const enemyId = peerIdRef.current;
    const currentBattle = structuredClone(battleStateRef.current);
    if (!currentBattle[myId] || !currentBattle[enemyId]) return;

    const fillAction = (id: string): ActionType => {
      // まひ状態なら選択済みのわざがあっても無視し、そのターンは行動不能にする。
      if (currentBattle[id].paralyzedNextTurn) return "paralysis";
      const selected = current[id];
      if (selected) return selected;
      const available = getAvailableActions(currentBattle[id]);
      return available[Math.floor(Math.random() * available.length)] ?? "attack";
    };

    const actions = {
      [myId]: fillAction(myId),
      [enemyId]: fillAction(enemyId),
    };

    const result = resolveTurn({ turn: turnNumber, players: currentBattle, actions });
    battleStateRef.current = result.nextStates;
    setBattleState(result.nextStates);
    setTurnResult(result);
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
  useEffect(() => {
    if (battleFinish) rematchHandledRef.current = false;
  }, [battleFinish]);

  const applyRematch = (mode: RematchMode) => {
    if (rematchHandledRef.current) return;
    rematchHandledRef.current = true;

    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    pendingActionsRef.current = {};
    setTurnResult(null);

    if (mode === "same") {
      // 再戦: 前回のイラスト・ステータスをそのまま引き継ぎ、バトルパートから再開する。
      const local = localCharacterRef.current;
      const remote = remoteCharacterRef.current;
      if (!local || !remote) return;
      beginBattle(local, remote);
      soundManager.playBgm("/sounds/bgm/battle_loop.mp3");
      setStatus("再戦開始！");
      return;
    }

    // 描きなおしてもう１戦: ラクガキパートに戻る。相手の新しい絵を待つ必要があるため
    // remoteCharacterRef はクリアするが、自分の前回のイラストは DrawPanel の
    // initialDrawing として引き継ぎ、続きから編集できるようにする。
    remoteCharacterRef.current = null;
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

  const handleWire = (message: WireMessage) => {
    if (message.type === "ready") {
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
      pendingActionsRef.current[message.payload.playerId] = message.payload.action;
      maybeFinalizeTurnEarly(message.payload.turn);
      return;
    }

    if (message.type === "turn_result") {
      battleStateRef.current = message.payload.nextStates;
      setBattleState(message.payload.nextStates);
      setTurnResult(message.payload);
      if (message.payload.winnerId) {
        setBattleFinish({ winnerId: message.payload.winnerId });
      }
      return;
    }

    if (message.type === "rematch") {
      applyRematch(message.payload.mode);
      return;
    }

    if (message.type === "forfeit") {
      // Only used for disconnection-based forfeits (not HP=0 game end)
      setStage("result");
      setWinnerText(message.payload.winnerId === myIdRef.current ? "相手切断により勝利" : "切断により敗北");
    }
  };

  // Keep handleWire ref current so DataConnection callbacks always call the latest version
  const handleWireRef = useRef(handleWire);
  useEffect(() => {
    handleWireRef.current = handleWire;
  });

  const destroyPeer = () => {
    connRef.current?.close();
    connRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
  };

  const attachConnectionHandlers = (conn: DataConnection) => {
    connRef.current = conn;
    conn.on("data", (data) => handleWireRef.current(data as WireMessage));
    conn.on("close", () => {
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

  const startHostSession = async (name: string) => {
    destroyPeer();
    setNickname(name);
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
    setNickname(name);
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

  const onCreate = (name: string) => {
    void startHostSession(name);
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
    if (stage === "drawing") {
      soundManager.playBgm("/sounds/bgm/oekaki_loop.mp3");
    } else if (stage === "battle") {
      soundManager.playBgm("/sounds/bgm/battle_loop.mp3");
    } else {
      soundManager.stopBgm();
    }
  }, [stage]);

  const onDrawingComplete = (payload: { drawing: Parameters<typeof calculateStatsFromDrawing>[0]; imageData: ImageData }) => {
    const stats = calculateStatsFromDrawing(payload.drawing, payload.imageData);
    const characterType = detectCharacterType(payload.imageData);
    const character: PeerCharacter = {
      nickname,
      drawing: prepareDrawingForWire(payload.drawing),
      stats,
      characterType,
    };
    localCharacterRef.current = character;
    sendWire({ type: "ready", payload: character });
    setStatus("準備完了。相手の完成を待っています。");
    const remote = remoteCharacterRef.current;
    if (remote && stage === "drawing") beginBattle(character, remote);
  };

  const onActionSelect = (action: ActionType) => {
    sendWire({ type: "turn_action", payload: { turn, playerId: myIdRef.current, action } });
    if (roleRef.current === "host") {
      pendingActionsRef.current[myIdRef.current] = action;
      maybeFinalizeTurnEarly(turn);
    }
  };

  const onBackToRoom = () => {
    destroyPeer();
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setBattleFinish(null);
    setTurnResult(null);
    setBattleState({});
    // Clear stale character data so a future room's drawing phase never gets
    // prefilled with an illustration from a previous, unrelated match.
    localCharacterRef.current = null;
    remoteCharacterRef.current = null;
    setStage("room");
    setStatus("ルームを作成するか入室してください");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">ラクガキ対戦 arttle</h1>

      {stage === "room" && (
        <RoomPanel status={status} roomCode={roomCode} canUseSignaling={true} onCreate={onCreate} onJoin={onJoin} />
      )}

      {stage === "drawing" && (
        <DrawPanel seconds={drawSeconds} onComplete={onDrawingComplete} initialDrawing={localCharacterRef.current?.drawing} />
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
          finishResult={battleFinish}
          onRematchSame={onRematchSame}
          onRematchRedraw={onRematchRedraw}
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
