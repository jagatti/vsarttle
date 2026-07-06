"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { RoomPanel } from "@/components/Room/RoomPanel";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { calculateStatsFromDrawing } from "@/lib/statCalculator";
import { createWebRtcManager, type SignalMessage } from "@/lib/webrtc";
import type { ActionType, PlayerBattleState, Stage, TurnResult } from "@/types/game";

const DRAW_SECONDS = 300;
const TURN_SECONDS = 5;
const RECONNECT_SECONDS = 30;

interface PeerCharacter {
  nickname: string;
  imageDataUrl: string;
  stats: PlayerBattleState["stats"];
}

type WireMessage =
  | { type: "ready"; payload: PeerCharacter }
  | { type: "turn_start"; payload: { turn: number; deadline: number } }
  | { type: "turn_action"; payload: { turn: number; playerId: string; action: ActionType } }
  | { type: "turn_result"; payload: TurnResult }
  | { type: "forfeit"; payload: { winnerId: string; reason: string } };

export default function Home() {
  const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL;
  const wsRef = useRef<WebSocket | null>(null);
  const rtcRef = useRef<ReturnType<typeof createWebRtcManager> | null>(null);
  const myIdRef = useRef("");
  const roleRef = useRef<"host" | "guest" | null>(null);
  const peerIdRef = useRef("");
  const pendingActionsRef = useRef<Record<string, ActionType>>({});
  const turnTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const [stage, setStage] = useState<Stage>("room");
  const [status, setStatus] = useState("ルームを作成するか入室してください");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("プレイヤー");
  const [drawSeconds, setDrawSeconds] = useState(DRAW_SECONDS);
  const [turnCountdown, setTurnCountdown] = useState(TURN_SECONDS);
  const [turn, setTurn] = useState(1);
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  const [winnerText, setWinnerText] = useState("");
  const [localCharacter, setLocalCharacter] = useState<PeerCharacter | null>(null);
  const [remoteCharacter, setRemoteCharacter] = useState<PeerCharacter | null>(null);
  const [battleState, setBattleState] = useState<Record<string, PlayerBattleState>>({});

  const myState = useMemo(() => battleState[myIdRef.current], [battleState]);
  const enemyState = useMemo(() => battleState[peerIdRef.current], [battleState]);

  const sendSignal = (targetId: string, signal: SignalMessage) => {
    wsRef.current?.send(JSON.stringify({ type: "signal", roomCode, targetId, signal }));
  };

  const sendWire = (payload: WireMessage) => {
    rtcRef.current?.send(payload);
  };

  const beginBattle = (local: PeerCharacter, remote: PeerCharacter) => {
    const me: PlayerBattleState = {
      id: myIdRef.current,
      nickname: local.nickname,
      imageDataUrl: local.imageDataUrl,
      stats: local.stats,
      currentHp: local.stats.maxHp,
      currentPp: local.stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    const enemy: PlayerBattleState = {
      id: peerIdRef.current,
      nickname: remote.nickname,
      imageDataUrl: remote.imageDataUrl,
      stats: remote.stats,
      currentHp: remote.stats.maxHp,
      currentPp: remote.stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    setBattleState({ [me.id]: me, [enemy.id]: enemy });
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
    const currentBattle = structuredClone(battleState);
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
      setRemoteCharacter(message.payload);
      if (localCharacter) beginBattle(localCharacter, message.payload);
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

  const setupRtc = (isHost: boolean) => {
    rtcRef.current?.close();
    rtcRef.current = createWebRtcManager({
      isHost,
      onSignal: (signal) => sendSignal(peerIdRef.current, signal),
      onData: (data) => handleWire(data as WireMessage),
      onChannelStateChange: (state) => {
        if (state === "open") {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          setStatus("P2P接続完了。おえかきを開始します。");
          setStage("drawing");
          setDrawSeconds(DRAW_SECONDS);
        }
        if (state === "closed") {
          setStatus(`接続切断。${RECONNECT_SECONDS}秒以内に復帰できなければ敗北`);
          reconnectTimerRef.current = window.setTimeout(() => {
            setStage("result");
            setWinnerText("切断復帰できず敗北");
          }, RECONNECT_SECONDS * 1000);
        }
      },
    });

    if (isHost) {
      void rtcRef.current.createOffer();
    }
  };

  useEffect(() => {
    if (!signalingUrl) {
      setStatus("NEXT_PUBLIC_SIGNALING_SERVER_URL が未設定です");
      return;
    }

    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("シグナリングサーバー接続完了");
    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "room_created") {
        myIdRef.current = msg.clientId;
        roleRef.current = "host";
        setRoomCode(msg.roomCode);
        setStatus(`ルーム作成完了。番号: ${msg.roomCode}`);
      }
      if (msg.type === "joined_room") {
        myIdRef.current = msg.clientId;
        peerIdRef.current = msg.hostId;
        roleRef.current = "guest";
        setRoomCode(msg.roomCode);
        setStatus("入室成功。ホスト接続待ち...");
        setupRtc(false);
      }
      if (msg.type === "peer_joined") {
        peerIdRef.current = msg.peerId;
        setStatus("相手が入室しました。P2P接続を開始します。");
        setupRtc(true);
      }
      if (msg.type === "signal") {
        await rtcRef.current?.handleSignal(msg.signal as SignalMessage);
      }
      if (msg.type === "error") {
        setStatus(`エラー: ${msg.message}`);
      }
    };

    return () => {
      ws.close();
      rtcRef.current?.close();
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [signalingUrl]);

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

  const onCreate = (name: string) => {
    setNickname(name);
    wsRef.current?.send(JSON.stringify({ type: "create_room", nickname: name }));
  };

  const onJoin = (code: string, name: string) => {
    setNickname(name);
    wsRef.current?.send(JSON.stringify({ type: "join_room", roomCode: code, nickname: name }));
  };

  const onDrawingComplete = (payload: { drawing: Parameters<typeof calculateStatsFromDrawing>[0]; imageDataUrl: string; imageData: ImageData }) => {
    const stats = calculateStatsFromDrawing(payload.drawing, payload.imageData);
    const character: PeerCharacter = {
      nickname,
      imageDataUrl: payload.imageDataUrl,
      stats,
    };
    setLocalCharacter(character);
    sendWire({ type: "ready", payload: character });
    setStatus("準備完了。相手の完成を待っています。");
    if (remoteCharacter) beginBattle(character, remoteCharacter);
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
      <p className="text-sm text-gray-700">シグナリング: {signalingUrl ?? "未設定"}</p>

      {stage === "room" && <RoomPanel status={status} roomCode={roomCode} onCreate={onCreate} onJoin={onJoin} />}

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
