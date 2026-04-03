import http from 'http';
import { WebSocketServer } from 'ws';

/**
 * @param {{
 *   port: number,
 *   hub: ReturnType<import('../hub/streamHub.js').createStreamHub>,
 *   onClientMessage?: (data: unknown) => void
 * }} opts
 */
export function createBrokerServer({ port, hub, onClientMessage }) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'future-chart-broker',
          wsClients: hub.clientCount(),
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    hub.add(ws);
    ws.send(
      JSON.stringify({
        type: 'hello',
        message:
          '한투 전용: {"op":"sync_watchlist","feeds":[{"provider":"kis","symbol":"005380"},…]} 후 {"op":"subscribe",…} 차트 포커스. provider: kis | kis-index | kis-overseas',
      })
    );
    ws.on('message', (buf) => {
      try {
        const data = JSON.parse(buf.toString());
        onClientMessage?.(data);
      } catch {
        /* ignore */
      }
    });
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.listen(port, () => resolve(undefined));
        server.on('error', reject);
      });
    },
    close() {
      return new Promise((resolve) => {
        // 모든 클라이언트 WS 즉시 강제 종료 (graceful shutdown 블로킹 방지)
        for (const ws of wss.clients) {
          try { ws.terminate(); } catch { /* ignore */ }
        }
        wss.close(() => {
          server.closeAllConnections?.(); // Node 18.2+
          server.close(() => resolve(undefined));
        });
        // 최대 2초 후 강제 종료
        setTimeout(resolve, 2000);
      });
    },
  };
}
