require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { authMiddleware } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const characterRoutes = require('./routes/characters');
const campaignRoutes = require('./routes/campaigns');
const srdRoutes = require('./routes/srd');
const { registerSocketHandlers } = require('./socket/handlers');

const PORT = process.env.PORT || 5005;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_URL, credentials: true },
  maxHttpBufferSize: 2e6,
});

app.set('trust proxy', 1);
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(authMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/srd', srdRoutes);
// AI: the MCP server (/mcp) and the DM's assistant API (/api/ai), see server/ai/.
const aiTables = {}; // the table actions, filled in once the socket handlers exist (below)
require('./ai/mcp').mount(app);
require('./ai/routes').mount(app, aiTables);
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'dnd', ts: Date.now() }));

// SERVE_CLIENT=1 serves client/dist from this process too, so pages, API and
// socket share one origin, which is what a demo tunnel needs. Prod keeps
// nginx serving the client.
if (process.env.SERVE_CLIENT) {
  const path = require('path');
  const dist = process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist'); // a build elsewhere (tests)
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dnd')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

const tables = registerSocketHandlers(io);
Object.assign(aiTables, { dispatch: tables.dispatch, emitToUser: tables.emitToUser, isOnline: tables.isOnline });

// Going down without losing anything: every room is written first (rooms are
// otherwise saved a second or two after each change, socket/roomState.js).
//   SIGTERM, SIGINT  systemctl stop / restart, Ctrl+C. After the save the
//                    process dies by the same signal, so systemd sees the
//                    clean stop it asked for.
//   SIGUSR2          deploy.sh's restart, which has no root to ask systemd
//                    with: save, then exit non-zero, so Restart=on-failure
//                    starts the new code. (A process from before this existed
//                    dies of SIGUSR2's default action: also a restart.)
// Writes that fail are retried for a few seconds; past that it goes anyway.
let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  const t0 = Date.now();
  let res = { rooms: 0, failed: 0 };
  try {
    res = await tables.shutdown();
    while (res.failed && Date.now() - t0 < 8000) {
      await new Promise((r) => setTimeout(r, 500));
      res = await tables.saveAll();
    }
  } catch (err) {
    console.error('saving rooms on the way down failed:', err.message);
  }
  console.log(`${signal}: saved ${res.rooms - res.failed}/${res.rooms} rooms in ${Date.now() - t0} ms; exiting`);
  if (signal === 'SIGUSR2') process.exit(75);
  process.removeAllListeners(signal);
  process.kill(process.pid, signal);
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGUSR2']) process.on(sig, () => stop(sig));

server.listen(PORT, () => {
  console.log(`dnd.ojee.net server listening on :${PORT} (client: ${CLIENT_URL})`);
});
