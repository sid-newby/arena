import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { LISTEN_PATH, type ListenService } from './listen.service.js';

const MAX_AUDIO_FRAME = 64 * 1024;

export function localRoomRequest(
  request: IncomingMessage,
  ports: { webPort: number; apiPort: number },
): boolean {
  const hosts = new Set([
    `127.0.0.1:${ports.webPort}`,
    `localhost:${ports.webPort}`,
    `127.0.0.1:${ports.apiPort}`,
    `localhost:${ports.apiPort}`,
  ]);
  const origins = new Set([...hosts].map((host) => `http://${host}`));
  return (
    hosts.has(request.headers.host ?? '') &&
    (!request.headers.origin || origins.has(request.headers.origin)) &&
    request.headers['sec-fetch-site'] !== 'cross-site'
  );
}

export function handleListenConnection(client: WebSocket, listen: ListenService) {
  const send = (event: unknown) => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify(event));
  };
  let session: ReturnType<ListenService['open']> | undefined;
  try {
    session = listen.open({
      event: (event) => {
        send(event);
        if (event.type === 'closed') client.close(1000, 'Listening ended.');
      },
    });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Listening failed.' });
    client.close(1011, 'Listening unavailable.');
    return;
  }
  client.on('message', (data, isBinary) => {
    if (!isBinary) return;
    const chunk = Array.isArray(data)
      ? Buffer.concat(data)
      : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : data;
    if (chunk.byteLength === 0 || chunk.byteLength > MAX_AUDIO_FRAME) return;
    session?.sendAudio(chunk);
  });
  const end = () => session?.close();
  client.on('close', end);
  client.on('error', end);
}

export function attachListenGateway(
  server: Server,
  listen: ListenService,
  ports: { webPort: number; apiPort: number } = { webPort: 58241, apiPort: 58242 },
) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_AUDIO_FRAME });
  sockets.on('connection', (client: WebSocket) => handleListenConnection(client, listen));
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = request.url?.split('?')[0];
    if (path !== LISTEN_PATH) {
      socket.destroy();
      return;
    }
    if (!localRoomRequest(request, ports)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client));
  });
  return sockets;
}
