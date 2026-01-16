const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
const server = http.createServer(app);

// ✅ Initialize WebSocket dengan proper config
const wss = new WebSocket.Server({ 
  server,
  clientTracking: true, // ✅ Track clients
  perMessageDeflate: false // ✅ Disable compression untuk stability
});

// ✅ Global storage untuk TV connections
app.locals.tvConnections = new Map();
app.locals.tvResponses = new Map();
app.locals.tvStatus = {};

// ✅ Cleanup function untuk remove stale connections
const cleanupTVConnection = (tvId) => {
  console.log(`🧹 Cleaning up TV ${tvId}`);
  
  const existingWs = app.locals.tvConnections.get(tvId);
  if (existingWs) {
    try {
      existingWs.terminate(); // ✅ Force close old connection
    } catch (error) {
      console.error(`Error terminating old connection for ${tvId}:`, error);
    }
  }
  
  app.locals.tvConnections.delete(tvId);
  app.locals.tvResponses.delete(tvId);
  
  if (app.locals.tvStatus[tvId]) {
    delete app.locals.tvStatus[tvId];
  }
};

// ✅ Ping interval untuk keep-alive
const PING_INTERVAL = 30000; // 30 detik
const PING_TIMEOUT = 10000; // 10 detik

wss.on('connection', (ws, req) => {
  // ✅ Parse TV ID dari URL
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const tvId = urlParams.get('tv_id');
  const ipAddress = req.socket.remoteAddress;

  if (!tvId) {
    console.error('❌ Connection rejected: No tv_id provided');
    ws.close(1008, 'tv_id required');
    return;
  }

  console.log(`📡 TV ${tvId} connecting from ${ipAddress}...`);

  // ✅ Cleanup existing connection dulu sebelum add yang baru
  if (app.locals.tvConnections.has(tvId)) {
    console.warn(`⚠️ TV ${tvId} already connected, replacing old connection...`);
    cleanupTVConnection(tvId);
  }

  // ✅ Store connection
  app.locals.tvConnections.set(tvId, ws);
  app.locals.tvStatus[tvId] = {
    lastPing: new Date(),
    ipAddress: ipAddress,
    connected: true
  };

  console.log(`✅ TV ${tvId} connected successfully`);

  // ✅ Setup ping/pong untuk keep-alive
  let pingTimer = null;
  let pongReceived = true;

  const startPingInterval = () => {
    // ✅ Clear existing timer
    if (pingTimer) {
      clearInterval(pingTimer);
    }

    pingTimer = setInterval(() => {
      if (!pongReceived) {
        console.warn(`⚠️ TV ${tvId} tidak merespon pong, closing connection...`);
        ws.terminate();
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        pongReceived = false;
        
        try {
          ws.ping();
          console.log(`🏓 Ping sent to TV ${tvId}`);
        } catch (error) {
          console.error(`❌ Error sending ping to TV ${tvId}:`, error);
        }
      }
    }, PING_INTERVAL);
  };

  // ✅ Start ping interval
  startPingInterval();

  // ✅ Handle pong response
  ws.on('pong', () => {
    pongReceived = true;
    console.log(`🏓 Pong received from TV ${tvId}`);
    
    // ✅ Update last ping time
    if (app.locals.tvStatus[tvId]) {
      app.locals.tvStatus[tvId].lastPing = new Date();
    }
  });

  // ✅ Handle messages dari TV
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 Message from TV ${tvId}:`, data);

      // ✅ Handle response dari TV
      if (data.type === 'response') {
        app.locals.tvResponses.set(tvId, {
          command: data.command,
          status: data.status,
          message: data.message,
          error: data.error,
          timestamp: data.timestamp || new Date().toISOString()
        });
        console.log(`✅ Response from TV ${tvId} saved`);
      }

      // ✅ Handle ping dari TV client (optional)
      if (data.type === 'ping') {
        const pongPayload = {
          type: 'pong',
          tv_id: tvId,
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(pongPayload));
        console.log(`🏓 Pong sent to TV ${tvId}`);
      }

      // ✅ Update last ping time
      if (app.locals.tvStatus[tvId]) {
        app.locals.tvStatus[tvId].lastPing = new Date();
      }

    } catch (error) {
      console.error(`❌ Error parsing message from TV ${tvId}:`, error);
      console.error('Raw message:', message.toString());
    }
  });

  // ✅ Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for TV ${tvId}:`, error);
    
    // ✅ Jangan auto-reconnect di sini, biar TV client yang handle
  });

  // ✅ Handle disconnect
  ws.on('close', (code, reason) => {
    console.log(`📡 TV ${tvId} disconnected. Code: ${code}, Reason: ${reason}`);
    
    // ✅ Cleanup
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    
    // ✅ Remove dari storage
    cleanupTVConnection(tvId);
    
    console.log(`🧹 TV ${tvId} cleaned up successfully`);
  });

  // ✅ Send welcome message
  const welcomePayload = {
    type: 'connected',
    tv_id: tvId,
    message: 'Connected to server successfully',
    timestamp: new Date().toISOString()
  };

  try {
    ws.send(JSON.stringify(welcomePayload));
    console.log(`👋 Welcome message sent to TV ${tvId}`);
  } catch (error) {
    console.error(`❌ Error sending welcome message to TV ${tvId}:`, error);
  }
});

// ✅ Cleanup stale connections periodically
setInterval(() => {
  const now = new Date();
  const STALE_THRESHOLD = 60000; // 60 detik

  for (const [tvId, status] of Object.entries(app.locals.tvStatus)) {
    const timeSinceLastPing = now - status.lastPing;
    
    if (timeSinceLastPing > STALE_THRESHOLD) {
      console.warn(`⚠️ TV ${tvId} stale (${Math.floor(timeSinceLastPing / 1000)}s), cleaning up...`);
      cleanupTVConnection(tvId);
    }
  }
}, 30000); // Check setiap 30 detik

// ✅ Graceful shutdown
const gracefulShutdown = () => {
  console.log('🛑 Server shutting down...');
  
  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });
  
  // Clear all timers
  app.locals.tvConnections.clear();
  app.locals.tvResponses.clear();
  app.locals.tvStatus = {};
  
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ============================
// 🔧 EXPRESS SETUP
// ============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ============================
// 🌐 API ENDPOINTS
// ============================

app.get('/', (req, res) => {
  res.json({
    message: 'Billing PS API Server + WebSocket is running!',
    websocket: 'ws://localhost:' + (process.env.PORT || 3000) + '/ws',
    status: 'OK',
    timestamp: new Date().toISOString(),
    stats: {
      connected_tvs: app.locals.tvConnections.size,
      registered_tvs: Object.keys(app.locals.tvStatus).length,
      responses: app.locals.tvResponses.size
    }
  });
});

// HTTP Ping endpoint (fallback)
app.get('/ping', (req, res) => {
  const id = req.query.id || "unknown";
  const now = new Date();
  const ipAddress = req.ip || req.connection.remoteAddress;

  const currentStatus = app.locals.tvStatus[id];
  const wasOffline = !currentStatus || 
                     (now - currentStatus.lastPing) >= (3 * 60 * 1000);

  app.locals.tvStatus[id] = {
    ...currentStatus,
    lastPing: now,
    ipAddress,
    status: 'online'
  };

  console.log(`[HTTP PING] TV: ${id}`);
  tvStatusLogger.logPing(id, ipAddress, 'HTTP');
  
  if (wasOffline) {
    tvStatusLogger.logTVOnline(id);
  }

  res.json({
    status: "ok",
    tv: id,
    time: now.toISOString(),
    message: "Ping received successfully"
  });
});

// Get TV status
app.get('/status', (req, res) => {
  const now = new Date();
  const statusList = {};

  for (const [tv_id, status] of Object.entries(app.locals.tvStatus)) {
    const timeSinceLastPing = now - status.lastPing;
    const isOnline = timeSinceLastPing < (3 * 60 * 1000);

    statusList[tv_id] = {
      online: isOnline,
      lastPing: status.lastPing.toISOString(),
      secondsSinceLastPing: Math.floor(timeSinceLastPing / 1000),
      ipAddress: status.ipAddress,
      modelTv: status.modelTv,
      currentStatus: status.currentStatus,
      wsConnected: app.locals.tvConnections.has(tv_id)
    };
  }

  const onlineCount = Object.values(statusList).filter(tv => tv.online).length;
  const totalCount = Object.keys(statusList).length;

  res.json({
    success: true,
    summary: {
      total: totalCount,
      online: onlineCount,
      offline: totalCount - onlineCount,
      wsConnections: app.locals.tvConnections.size,
      checkTime: now.toISOString()
    },
    tvs: statusList
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  logError(err, req);
  
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// ============================
// 🧱 DATABASE INIT
// ============================
(async () => {
  const connected = await testConnection();
  if (connected) {
    await sequelize.sync({ force: false });
    console.log('✅ Database synchronized.');
    logInfo('Database synchronized successfully');
  }
})();

// ============================
// 🚀 START SERVER
// ============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
});

// ============================
// 🛑 GRACEFUL SHUTDOWN
// ============================
const shutdown = () => {
  console.log('Shutting down gracefully...');
  
  clearInterval(heartbeatInterval);
  clearInterval(cleanupInterval);
  
  // Close all WebSocket connections
  app.locals.tvConnections.forEach((ws, tv_id) => {
    ws.close(1000, 'Server shutting down');
  });
  
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server, wss };
