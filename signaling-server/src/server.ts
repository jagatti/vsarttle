import { WebSocketServer, WebSocket } from "ws";

interface Client {
  id: string;
  nickname: string;
  socket: WebSocket;
  roomCode: string | null;
}

interface Room {
  code: string;
  hostId: string;
  guestId: string | null;
  createdAt: number;
}

const PORT = Number(process.env.PORT ?? 8080);
const ROOM_TTL_SECONDS = 100;

const clients = new Map<string, Client>();
const rooms = new Map<string, Room>();

const server = new WebSocketServer({ port: PORT });

const send = (socket: WebSocket, payload: unknown) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const randomRoomCode = () => {
  let code = "";
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
};

const cleanupExpiredRooms = () => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (!room.guestId && now - room.createdAt > ROOM_TTL_SECONDS * 1000) {
      rooms.delete(code);
      const host = clients.get(room.hostId);
      if (host) {
        host.roomCode = null;
        send(host.socket, { type: "error", message: "ルームの有効期限（100秒）が切れました" });
      }
    }
  }
};

setInterval(cleanupExpiredRooms, 1000);

server.on("connection", (socket) => {
  const clientId = crypto.randomUUID();
  const client: Client = { id: clientId, nickname: "", socket, roomCode: null };
  clients.set(clientId, client);

  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "create_room") {
        cleanupExpiredRooms();
        const roomCode = randomRoomCode();
        const room: Room = {
          code: roomCode,
          hostId: client.id,
          guestId: null,
          createdAt: Date.now(),
        };
        rooms.set(roomCode, room);
        client.nickname = String(msg.nickname ?? "").slice(0, 16);
        client.roomCode = roomCode;
        send(socket, { type: "room_created", roomCode, clientId });
        return;
      }

      if (msg.type === "join_room") {
        cleanupExpiredRooms();
        const roomCode = String(msg.roomCode ?? "");
        const room = rooms.get(roomCode);
        if (!room) {
          send(socket, { type: "error", message: "ルームが見つかりません" });
          return;
        }
        if (room.guestId) {
          send(socket, { type: "error", message: "このルームは満員です" });
          return;
        }
        room.guestId = client.id;
        client.nickname = String(msg.nickname ?? "").slice(0, 16);
        client.roomCode = roomCode;

        send(socket, { type: "joined_room", roomCode, hostId: room.hostId, clientId });
        const host = clients.get(room.hostId);
        if (host) {
          send(host.socket, { type: "peer_joined", peerId: client.id, peerNickname: client.nickname });
        }
        return;
      }

      if (msg.type === "signal") {
        const targetId = String(msg.targetId ?? "");
        const target = clients.get(targetId);
        if (!target) {
          send(socket, { type: "error", message: "接続相手が見つかりません" });
          return;
        }
        send(target.socket, {
          type: "signal",
          fromId: client.id,
          signal: msg.signal,
        });
      }
    } catch {
      send(socket, { type: "error", message: "不正なメッセージ形式です" });
    }
  });

  socket.on("close", () => {
    const active = clients.get(clientId);
    if (!active) return;

    if (active.roomCode) {
      const room = rooms.get(active.roomCode);
      if (room) {
        const peerId = room.hostId === clientId ? room.guestId : room.hostId;
        if (peerId) {
          const peer = clients.get(peerId);
          if (peer) send(peer.socket, { type: "error", message: "対戦相手が切断しました" });
        }
        rooms.delete(active.roomCode);
      }
    }

    clients.delete(clientId);
  });
});

console.log(`signaling server started on :${PORT}`);
