import { useEffect, useMemo, useRef, useState } from "react";

const MARKET_SOCKET_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const HEARTBEAT_MS = 10_000;

type SocketStatus = "idle" | "connecting" | "live" | "polling" | "error";

interface PriceChangeMessage {
  event_type: "price_change";
  price_changes?: Array<{
    asset_id?: string;
    price?: string | number;
  }>;
}

interface LastTradeMessage {
  event_type: "last_trade_price";
  asset_id?: string;
  price?: string | number;
}

type MarketSocketMessage = PriceChangeMessage | LastTradeMessage | { event_type?: string };

function isPriceChangeMessage(payload: MarketSocketMessage): payload is PriceChangeMessage {
  return payload.event_type === "price_change";
}

function isLastTradeMessage(payload: MarketSocketMessage): payload is LastTradeMessage {
  return payload.event_type === "last_trade_price";
}

function toFiniteNumber(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function useWebSocket(tokenIds: string[] = []) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<SocketStatus>(tokenIds.length ? "connecting" : "idle");
  const [message, setMessage] = useState("pollingOnly");
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const heartbeatRef = useRef<number | null>(null);

  const subscriptionKey = tokenIds.filter(Boolean).join("|");
  const stableTokenIds = useMemo(() => [...new Set(tokenIds.filter(Boolean))], [subscriptionKey]);

  useEffect(() => {
    if (!stableTokenIds.length) {
      setConnected(false);
      setStatus("idle");
      setMessage("noSubscription");
      setLivePrices({});
      return;
    }

    setStatus("connecting");
    setMessage("connecting");

    const socket = new WebSocket(MARKET_SOCKET_URL);

    function clearHeartbeat() {
      if (heartbeatRef.current != null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }

    socket.addEventListener("open", () => {
      setConnected(true);
      setStatus("live");
      setMessage("subscribed");
      socket.send(
        JSON.stringify({
          assets_ids: stableTokenIds,
          type: "market",
          custom_feature_enabled: true,
        }),
      );

      heartbeatRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send("PING");
        }
      }, HEARTBEAT_MS);
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      if (event.data === "PONG") {
        setConnected(true);
        setStatus("live");
        setMessage("heartbeatOk");
        return;
      }

      try {
        const payload = JSON.parse(event.data) as MarketSocketMessage;

        if (isPriceChangeMessage(payload) && Array.isArray(payload.price_changes)) {
          setLivePrices((current) => {
            const next = { ...current };
            for (const change of payload.price_changes ?? []) {
              if (change.asset_id) {
                next[change.asset_id] = toFiniteNumber(change.price);
              }
            }
            return next;
          });
          setConnected(true);
          setStatus("live");
          setMessage("priceUpdate");
          return;
        }

        if (isLastTradeMessage(payload) && payload.asset_id) {
          const assetId = payload.asset_id;
          setLivePrices((current) => ({
            ...current,
            [assetId]: toFiniteNumber(payload.price),
          }));
          setConnected(true);
          setStatus("live");
          setMessage("tradeUpdate");
          return;
        }

        if (payload.event_type) {
          setMessage(payload.event_type);
        }
      } catch {
        if (event.data !== "{}") {
          setMessage("realtimeMessage");
        }
      }
    });

    socket.addEventListener("close", () => {
      clearHeartbeat();
      setConnected(false);
      setStatus("polling");
      setMessage("realtimeDisconnected");
    });

    socket.addEventListener("error", () => {
      clearHeartbeat();
      setConnected(false);
      setStatus("error");
      setMessage("realtimeFailed");
    });

    return () => {
      clearHeartbeat();
      socket.close();
    };
  }, [stableTokenIds]);

  return {
    connected,
    status,
    message,
    livePrices,
  } as const;
}
