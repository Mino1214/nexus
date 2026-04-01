/**
 * 브라우저 클라이언트에게 JSON 브로드캐스트
 */
export function createStreamHub() {
  /** @type {Set<import('ws').WebSocket>} */
  const clients = new Set();

  return {
    /**
     * @param {import('ws').WebSocket} ws
     */
    add(ws) {
      clients.add(ws);
      const onClose = () => {
        clients.delete(ws);
      };
      ws.on('close', onClose);
      ws.on('error', onClose);
    },

    /**
     * @param {unknown} payload
     */
    broadcast(payload) {
      const s = JSON.stringify(payload);
      for (const c of clients) {
        if (c.readyState === 1) {
          c.send(s);
        }
      }
    },

    clientCount() {
      return clients.size;
    },
  };
}
