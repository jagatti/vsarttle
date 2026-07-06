"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type PeerType from "peerjs";
import type { DataConnection } from "peerjs";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { drawingToDataUrl, prepareDrawingForWire } from "@/lib/drawingWire";
import { RoomPanel } from "@/components/Room/RoomPanel";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { calculateStatsFromDrawing } from "@/lib/statCalculator";
import type { ActionType, PlayerBattleState, Stage, TurnResult, WireDrawingData } from "@/types/game";

const DRAW_SECONDS = 300;
const TURN_SECONDS = 15;
const RECONNECT_SECONDS = 30;
const ROOM_ID_PREFIX = "vsarttle-";

function generateRoomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface PeerCharacter {
  nickname: string;
  drawing: WireDrawingData;
  stats: PlayerBattleState["stats"];
}

type WireMessage =
  | { type: "ready"; payload: PeerCharacter }
  | { type: "turn_start"; payload: { turn: number; deadline: number } }
  | { type: "turn_action"; payload: { turn: number; playerId: string; action: ActionType } }
  | { type: "turn_result"; payload: TurnResult }
  | { type: "forfeit"; payload: { winnerId: string; reason: string } };

export default function Home() {
  const peerRef = useRef<PeerType | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const myIdRef = useRef("");
  const roleRef = useRef<"host" | "guest" | null>(null);
  const peerIdRef = useRef("");
  const pendingActionsRef = useRef<Record<string, ActionType>>({});
  const turnTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const localCharacterRef = useRef<PeerCharacter | null>(null);
  const remoteCharacterRef = useRef<PeerCharacter | null>(null);
  const battleStateRef = useRef<Record<string, PlayerBattleState>>({});

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

  const myState = useMemo(() => battleState[myIdRef.current], [battleState]);
  const enemyState = useMemo(() => battleState[peerIdRef.current], [battleState]);

  const sendWire = (payload: WireMessage) => {
    connRef.current?.send(payload);
  };

  const beginBattle = (local: PeerCharacter, remote: PeerCharacter) => {
    const me: PlayerBattleState = {
      id: myIdRef.current,
      nickname: local.nickname,
      imageDataUrl: drawingToDataUrl(local.drawing),
      stats: local.stats,
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
      currentHp: remote.stats.maxHp,
      currentPp: remote.stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    const initial = { [me.id]: me, [enemy.id]: enemy };
    battleStateRef.current = initial;
    setBattleState(initial);
    setTurn(1);
    setStage("battle");
    setStatus("対戦開始！");

    if (roleRef.current === "host") {
      const deadline = Date.now() + TURN_SECONDS * 1000;
      sendWire({ type: "turn_start", payload: { turn: 1, deadline } });
      setTurnCountdown(TURN_SECONDS);
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      turnTimerRef.current = window.setTimeout(() => finalizeTurn(1), TURN_SECONDS * 1000);
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
      const didWin = result.winnerId === myId;
      setStage("result");
      setWinnerText(didWin ? "あなたの勝ち！" : "あなたの負け…");
      sendWire({ type: "forfeit", payload: { winnerId: result.winnerId, reason: "HPが0になりました" } });
      return;
    }

    const nextTurn = turnNumber + 1;
    setTurn(nextTurn);
    const deadline = Date.now() + TURN_SECONDS * 1000;
    sendWire({ type: "turn_start", payload: { turn: nextTurn, deadline } });
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    turnTimerRef.current = window.setTimeout(() => finalizeTurn(nextTurn), TURN_SECONDS * 1000);
  };

  const handleWire = (message: WireMessage) => {
    if (message.type === "ready") {
      remoteCharacterRef.current = message.payload;
      const local = localCharacterRef.current;
      if (local) beginBattle(local, message.payload);
      return;
    }

    if (message.type === "turn_start") {
      setTurn(message.payload.turn);
      const updateCountdown = () => {
        const remain = Math.max(0, Math.ceil((message.payload.deadline - Date.now()) / 1000));
        setTurnCountdown(remain);
      };
      updateCountdown();
      const interval = window.setInterval(updateCountdown, 200);
      window.setTimeout(() => window.clearInterval(interval), TURN_SECONDS * 1000 + 400);
      return;
    }

    if (message.type === "turn_action" && roleRef.current === "host") {
      pendingActionsRef.current[message.payload.playerId] = message.payload.action;
      if (pendingActionsRef.current[myIdRef.current] && pendingActionsRef.current[peerIdRef.current]) {
        if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
        finalizeTurn(message.payload.turn);
      }
      return;
    }

    if (message.type === "turn_result") {
      battleStateRef.current = message.payload.nextStates;
      setBattleState(message.payload.nextStates);
      setTurnResult(message.payload);
      if (message.payload.winnerId) {
        const didWin = message.payload.winnerId === myIdRef.current;
        setStage("result");
        setWinnerText(didWin ? "あなたの勝ち！" : "あなたの負け…");
      }
      return;
    }

    if (message.type === "forfeit") {
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

      const conn = peer.connect(ROOM_ID_PREFIX + code, { serialization: "json" });
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

  const onDrawingComplete = (payload: { drawing: Parameters<typeof calculateStatsFromDrawing>[0]; imageData: ImageData }) => {
    const stats = calculateStatsFromDrawing(payload.drawing, payload.imageData);
    const character: PeerCharacter = {
      nickname,
      drawing: prepareDrawingForWire(payload.drawing),
      stats,
    };
    localCharacterRef.current = character;
    sendWire({ type: "ready", payload: character });
    setStatus("準備完了。相手の完成を待っています。");
    const remote = remoteCharacterRef.current;
    if (remote) beginBattle(character, remote);
  };

  const onActionSelect = (action: ActionType) => {
    sendWire({ type: "turn_action", payload: { turn, playerId: myIdRef.current, action } });
    if (roleRef.current === "host") {
      pendingActionsRef.current[myIdRef.current] = action;
      if (pendingActionsRef.current[myIdRef.current] && pendingActionsRef.current[peerIdRef.current]) {
        if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
        finalizeTurn(turn);
      }
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">ラクガキ対戦 arttle</h1>

      {stage === "room" && (
        <RoomPanel status={status} roomCode={roomCode} canUseSignaling={true} onCreate={onCreate} onJoin={onJoin} />
      )}

      {stage === "drawing" && <DrawPanel seconds={drawSeconds} onComplete={onDrawingComplete} />}

      {stage === "battle" && myState && enemyState && (
        <BattlePanel me={myState} enemy={enemyState} turnResult={turnResult} countdown={turnCountdown} onActionSelect={onActionSelect} />
      )}

      {stage === "result" && (
        <section className="rounded-lg border p-4">
          <h2 className="text-xl font-bold">勝負結果</h2>
          <p className="text-lg">{winnerText}</p>
        </section>
      )}
    </main>
  );
}
