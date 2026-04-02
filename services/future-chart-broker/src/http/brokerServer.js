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
          '마켓데이터: {"op":"sync_watchlist","feeds":[{"provider":"kis","symbol":"005380"},…]} 후 {"op":"subscribe",…} 로 차트 포커스. 지수 kis-index / 해외 kis-overseas / Yahoo provider.',
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
        wss.close(() => {
          server.close(() => resolve(undefined));
        });
      });
    },
  };
}
