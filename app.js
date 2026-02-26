const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');
const { testConnection, sequelize } = require('./config/database');
const { logError, logInfo, requestLogger } = require('./middleware/logger');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// ✅ Initialize WebSocket dengan path seperti kode lama
const wss = new WebSocket.Server({ 
  server, 
  path: '/ws' // ✅ Tambahkan path seperti kode lama
});

// ✅ Global storage untuk TV connections
app.locals.tvConnections = new Map();
app.locals.tvResponses = new Map();
app.locals.tvStatus = {};

// ✅ Cleanup function
const cleanupTVConnection = (tvId) => {
  console.log(`🧹 Cleaning up TV ${tvId}`);
  
  const existingWs = app.locals.tvConnections.get(tvId);
  if (existingWs) {
    try {
      existingWs.terminate();
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

// ============================
// 🔌 WEBSOCKET HANDLER
// ============================
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`📺 TV connected from ${ip}`);
  
  // ✅ Tracking alive status
  ws.isAlive = true;
  let tvId = null;

  // ✅ Handle messages dari TV
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 Message from ${tvId || ip}:`, data);
      
      // ✅ Handle registration
      if (data.type === 'register') {
        tvId = data.tv_id || data.id || ip;
        
        if (app.locals.tvConnections.has(tvId)) {
          console.warn(`⚠️ TV ${tvId} already connected, replacing...`);
          cleanupTVConnection(tvId);
        }
        
        app.locals.tvConnections.set(tvId, ws);
        app.locals.tvStatus[tvId] = {
          lastPing: new Date(),
          ipAddress: ip,
          connected: true,
          model: data.model || 'unknown',
          modeltv: data.modeltv || 'unknown'
        };
        
        console.log(`✅ TV registered: ${tvId}`);
        console.log(`   Total connected TVs: ${app.locals.tvConnections.size}`);
        
        ws.send(JSON.stringify({ 
          type: 'welcome', 
          message: `Registered as ${tvId}`,
          server_time: new Date().toISOString()
        }));
        
        logInfo('TV registered', { tvId, ip });
      }
      
      // ✅ Handle ping
      else if (data.type === 'ping') {
        ws.isAlive = true;
        const pingTvId = data.tv_id || tvId || ip;
        
        app.locals.tvStatus[pingTvId] = {
          ...app.locals.tvStatus[pingTvId],
          lastPing: new Date(),
          ipAddress: data.ip || ip,
          connected: true
        };
        
        ws.send(JSON.stringify({
          type: 'pong',
          tv_id: pingTvId,
          timestamp: new Date().toISOString()
        }));
        
        console.log(`🏓 Ping received from TV ${pingTvId}`);
      }
      
      // ✅ FIXED: Handle response/confirm (support both types dari TV)
      else if (data.type === 'response' || data.type === 'confirm') {
        const responseTvId = data.tv_id || tvId;
        
        // ✅ Normalize status
        let normalizedStatus = data.status;
        if (data.status === 'success') {
          normalizedStatus = 'success';
        } else if (data.status === 'failed' || data.status === 'error') {
          normalizedStatus = 'failed';
        }
        
        // ✅ Store response dengan format yang konsisten
        const responseData = {
          command: parseInt(data.command), // ✅ Convert ke number
          status: normalizedStatus,
          message: data.message || (normalizedStatus === 'success' ? 'Command executed' : 'Command failed'),
          error: data.error || null,
          timestamp: data.timestamp || data.time || new Date().toISOString(),
          originalType: data.type,
          receivedAt: new Date().toISOString()
        };
        
        // ✅ Store ke tvResponses
        app.locals.tvResponses.set(responseTvId, responseData);
        
        console.log(`✅ ${data.type === 'confirm' ? 'Confirmation' : 'Response'} from TV ${responseTvId} saved:`);
        console.log(`   Command: ${responseData.command}`);
        console.log(`   Status: ${responseData.status}`);
        if (responseData.error) {
          console.log(`   Error: ${responseData.error}`);
        }
        
        // ✅ Log error jika command failed
        if (normalizedStatus === 'failed' && data.error) {
          console.error(`❌ TV ${responseTvId} command ${data.command} failed:`);
          console.error(`   ${data.error}`);
          logError(new Error(`TV command failed: ${data.error}`), null, { 
            tvId: responseTvId, 
            command: data.command 
          });
        }
      }
      
      // ✅ Handle message lainnya
      else {
        console.log(`📩 Other message type '${data.type}' from ${tvId || ip}:`, data);
      }
      
    } catch (err) {
      console.error('❌ Error parsing message:', err);
      console.error('Raw message:', message.toString());
    }
  });

  // ✅ Handle pong (dari server ping)
  ws.on('pong', () => {
    ws.isAlive = true;
    if (tvId && app.locals.tvStatus[tvId]) {
      app.locals.tvStatus[tvId].lastPing = new Date();
    }
    console.log(`🏓 Pong received from TV ${tvId || ip}`);
  });

  // ✅ Handle error
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for TV ${tvId || ip}:`, error);
  });

  // ✅ Handle close
  ws.on('close', (code, reason) => {
    console.log(`📡 TV ${tvId || ip} disconnected. Code: ${code}, Reason: ${reason || 'No reason'}`);
    
    if (tvId) {
      cleanupTVConnection(tvId);
    } else {
      // Cleanup by IP jika belum register
      for (const [id, socket] of app.locals.tvConnections.entries()) {
        if (socket === ws) {
          cleanupTVConnection(id);
          break;
        }
      }
    }
    
    console.log(`   Remaining connected TVs: ${app.locals.tvConnections.size}`);
  });
});

// ✅ Heartbeat untuk keep-alive (seperti kode lama)
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.warn('⚠️ Terminating inactive connection');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // 30 detik

// ✅ Cleanup stale connections
const cleanupInterval = setInterval(() => {
  const now = new Date();
  const STALE_THRESHOLD = 3 * 60 * 1000; // 3 menit

  for (const [tvId, status] of Object.entries(app.locals.tvStatus)) {
    const timeSinceLastPing = now - status.lastPing;
    
    if (timeSinceLastPing > STALE_THRESHOLD) {
      console.warn(`⚠️ TV ${tvId} stale (${Math.floor(timeSinceLastPing / 1000)}s), cleaning up...`);
      cleanupTVConnection(tvId);
    }
  }
}, 60000); // Check setiap 1 menit

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
const processRoutes = require('./routes/process');
const daily = require('./routes/daily');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/unit', unitRoutes);
app.use('/api/cabang', cabangRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/transaksi', transaksiRoutes);
app.use('/api/processcode', processRoutes);
app.use('/api/daily', daily);

// ============================
// 🌐 API ENDPOINTS
// ============================

app.get('/', (req, res) => {
  res.json({
    message: 'Billing PS API Server + WebSocket is running!',
    websocket: `ws://localhost:${process.env.PORT || 3000}/ws`,
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
  
  if (wasOffline) {
    console.log(`✅ TV ${id} is now online`);
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
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// ============================
// 🧱 DATABASE INIT
// ============================
(async () => {
  try {
    const connected = await testConnection();
    if (connected) {
      await sequelize.sync({ force: false });
      console.log('✅ Database synchronized.');
      logInfo('Database synchronized successfully');
    } else {
      console.error('❌ Database connection failed, server starting without database');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
})();

// ============================
// 🚀 START SERVER
// ============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready on ws://localhost:${PORT}/ws`);
  console.log(`🌐 API available at http://localhost:${PORT}`);
  logInfo(`Server started with WebSocket support on port ${PORT}`);
});

// ============================
// 🛑 GRACEFUL SHUTDOWN
// ============================
const gracefulShutdown = () => {
  console.log('🛑 Server shutting down...');
  
  // Clear intervals
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  
  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });
  
  // Clear all maps
  app.locals.tvConnections.clear();
  app.locals.tvResponses.clear();
  app.locals.tvStatus = {};
  
  // Close servers
  wss.close(() => console.log('✅ WebSocket server closed'));
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { app, server, wss };
