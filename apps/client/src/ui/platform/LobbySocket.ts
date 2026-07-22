/**
 * LobbySocket — thin wrapper around the platform lobby WebSocket
 * (GET /api/v1/lobby/ws?token=<access>). Sends heartbeats, forwards every
 * parsed frame to the injected handler (the app store applies the pure
 * lobbyReducer), and auto-reconnects with backoff while enabled. No zustand
 * imports here (client-08 arch rule) — state flows through the callbacks.
 */

const HEARTBEAT_MS = 20_000;
const RECONNECT_MS = 3_000;

export interface LobbySocketHandlers {
  /** parsed JSON frame from the server */
  onMessage(msg: unknown): void;
  onStatus(status: "connecting" | "connected" | "disconnected"): void;
  /** must return a CURRENT access token (refreshed if needed), or null */
  getToken(): Promise<string | null>;
}

export function lobbyWsUrl(token: string, loc: { protocol: string; host: string } = location): string {
  const scheme = loc.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${loc.host}/api/v1/lobby/ws?token=${encodeURIComponent(token)}`;
}

export class LobbySocket {
  private ws: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;

  constructor(private readonly handlers: LobbySocketHandlers) {}

  /** Open (and keep open) the socket until stop() is called. */
  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    void this.open();
  }

  stop(): void {
    this.enabled = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.teardown();
    this.handlers.onStatus("disconnected");
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendChat(roomId: string, text: string): void {
    this.send({ type: "chat", roomId, text });
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private async open(): Promise<void> {
    if (!this.enabled) return;
    this.handlers.onStatus("connecting");
    const token = await this.handlers.getToken();
    if (!this.enabled) return;
    if (!token) {
      this.handlers.onStatus("disconnected");
      this.scheduleReconnect();
      return;
    }
    const ws = new WebSocket(lobbyWsUrl(token));
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.handlers.onStatus("connected");
      this.send({ type: "heartbeat" });
      this.heartbeat = setInterval(() => this.send({ type: "heartbeat" }), HEARTBEAT_MS);
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      try {
        this.handlers.onMessage(JSON.parse(String(ev.data)));
      } catch {
        /* non-JSON frame — ignore */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.teardown();
      this.handlers.onStatus("disconnected");
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, RECONNECT_MS);
  }

  private teardown(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* already closed */
      }
      this.ws = null;
    }
  }
}
