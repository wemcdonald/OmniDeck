import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface WsMessage {
  type: string;
  data?: unknown;
}

type MessageHandler = (msg: WsMessage) => void;

interface WsContextValue {
  connected: boolean;
  subscribe(type: string, handler: MessageHandler): () => void;
  send(msg: WsMessage): void;
}

const WsContext = createContext<WsContextValue>({
  connected: false,
  subscribe: () => () => {},
  send: () => {},
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmountedRef.current) setConnected(true);
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as WsMessage;
          const handlers = handlersRef.current.get(msg.type);
          handlers?.forEach((h) => h(msg));
        } catch {
          // ignore malformed messages
        }
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  function subscribe(type: string, handler: MessageHandler): () => void {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);
    return () => handlersRef.current.get(type)?.delete(handler);
  }

  function send(msg: WsMessage): void {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  return (
    <WsContext.Provider value={{ connected, subscribe, send }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWebSocket(): WsContextValue {
  return useContext(WsContext);
}
