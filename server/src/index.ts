import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol/events';
import { registerSocketHandlers } from './handlers/registerSocketHandlers';
import { config } from './config';

const app = express();
app.use(cors({ origin: config.corsOrigin }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST']
  }
});

registerSocketHandlers(io);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${config.port}`);
});
