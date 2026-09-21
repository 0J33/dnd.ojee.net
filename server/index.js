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
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'dnd', ts: Date.now() }));

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dnd')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`dnd.ojee.net server listening on :${PORT} (client: ${CLIENT_URL})`);
});
