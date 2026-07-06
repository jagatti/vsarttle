export interface SignalMessage {
  type: "offer" | "answer" | "candidate";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface WebRtcManager {
  createOffer: () => Promise<void>;
  handleSignal: (message: SignalMessage) => Promise<void>;
  send: (data: unknown) => void;
  close: () => void;
}

export function createWebRtcManager(params: {
  isHost: boolean;
  onSignal: (message: SignalMessage) => void;
  onData: (data: unknown) => void;
  onChannelStateChange: (state: RTCDataChannelState) => void;
}): WebRtcManager {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  let channel: RTCDataChannel | null = null;

  const attachChannel = (incoming: RTCDataChannel) => {
    channel = incoming;
    channel.onopen = () => params.onChannelStateChange(channel?.readyState ?? "closed");
    channel.onclose = () => params.onChannelStateChange(channel?.readyState ?? "closed");
    channel.onerror = () => params.onChannelStateChange(channel?.readyState ?? "closed");
    channel.onmessage = (event) => {
      try {
        params.onData(JSON.parse(event.data));
      } catch {
        params.onData(event.data);
      }
    };
  };

  if (params.isHost) {
    attachChannel(peer.createDataChannel("battle"));
  } else {
    peer.ondatachannel = (event) => attachChannel(event.channel);
  }

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      params.onSignal({ type: "candidate", payload: event.candidate.toJSON() });
    }
  };

  const createOffer = async () => {
    if (!params.isHost) return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    params.onSignal({ type: "offer", payload: offer });
  };

  const handleSignal = async (message: SignalMessage) => {
    if (message.type === "offer") {
      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      params.onSignal({ type: "answer", payload: answer });
      return;
    }
    if (message.type === "answer") {
      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      return;
    }
    if (message.type === "candidate") {
      await peer.addIceCandidate(message.payload as RTCIceCandidateInit);
    }
  };

  const send = (data: unknown) => {
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify(data));
  };

  const close = () => {
    channel?.close();
    peer.close();
  };

  return { createOffer, handleSignal, send, close };
}
