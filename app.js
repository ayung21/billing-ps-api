const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');
const { testConnection, sequelize } = require('./config/database');
const { logError, logInfo, requestLogger } = require('./middleware/logger');
const tvStatusLogger = require('./middleware/tvStatusLogger');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// ✅ Map untuk menyimpan koneksi TV
const tvConnections = new Map();

// ✅ TV Status tracking
const tvStatus = {};
const TIMEOUT_MS = 3 * 60 * 1000; // 3 menit

// ============================
// 🔌 WEBSOCKET HANDLER
// ============================
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`📺 TV connected from ${ip}`);

  ws.isAlive = true;

  // Saat TV kirim pesan
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'register') {
        const tvId = data.tv_id || data.id || ip;
        tvConnections.set(tvId, ws);
        console.log(`✅ TV registered: ${tvId}`);
        ws.send(JSON.stringify({ type: 'welcome', message: `Registered as ${tvId}` }));
      } else if (data.type === 'ping') {
        ws.isAlive = true;
        const tvId = data.tv_id || ip;
        tvStatus[tvId] = { lastPing: new Date(), ipAddress: ip };
      } else {
        console.log(`📩 Message from ${ip}:`, data);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', () => {
    console.log(`❌ TV disconnected: ${ip}`);
    for (const [id, socket] of tvConnections.entries()) {
      if (socket === ws) tvConnections.delete(id);
    }
  });
});

// ✅ Heartbeat untuk memastikan koneksi tetap hidup
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ============================
// 🔧 EXPRESS SETUP
// ============================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Import routes
const authRoutes = require('./routes/auth');
const unitRoutes = require('./routes/unit');
const cabangRoutes = require('./routes/cabang');
const promoRoutes = require('./routes/promo');
const produkRoutes = require('./routes/produk');
const memberRoutes = require('./routes/member');
const transaksiRoutes = require('./routes/transaksi');
const _process = require('./routes/process');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/unit', unitRoutes);
app.use('/api/cabang', cabangRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/transaksi', transaksiRoutes);
app.use('/api/processcode', _process);

// ✅ Export tvConnections untuk digunakan di routes lain
app.locals.tvConnections = tvConnections;
app.locals.tvStatus = tvStatus;

// ============================
// 🌐 API ENDPOINTS
// ============================

app.get('/', (req, res) => {
  res.json({
    message: 'Billing PS API Server + WebSocket is running!',
    ws: '/ws',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// ✅ Kirim perintah ke TV tertentu
app.post('/api/tv/command', (req, res) => {
  const { tv_id, command } = req.body;

  if (!tv_id || !command) {
    return res.status(400).json({ error: 'tv_id and command are required' });
  }

  const ws = tvConnections.get(tv_id);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ error: 'TV not connected or unavailable' });
  }

  ws.send(JSON.stringify({ type: 'command', command }));
  console.log(`📤 Sent command ${command} to ${tv_id}`);
  logInfo(`Command ${command} sent to ${tv_id}`);

  res.json({ success: true, message: `Command ${command} sent to ${tv_id}` });
});

// ✅ Lihat semua TV yang aktif
app.get('/api/tv/active', (req, res) => {
  const list = Array.from(tvConnections.keys());
  res.json({ connectedTVs: list, count: list.length });
});

// ============================
// 🧱 DATABASE INIT
// ============================
(async () => {
  const connected = await testConnection();
  if (connected) {
    await sequelize.sync({ force: false });
    console.log('✅ Database synchronized.');
  }
})();

// ============================
// 🚀 START SERVER
// ============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 WebSocket at ws://localhost:${PORT}/ws`);
  logInfo(`Server started with WebSocket support on port ${PORT}`);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  server.close(() => process.exit(0));
});
