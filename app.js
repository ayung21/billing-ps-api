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

// ============================
// 📊 TV DATA STORAGE
// ============================
const tvConnections = new Map(); // { tv_id: WebSocket }
const tvStatus = new Map(); // { tv_id: { lastPing, ipAddress, userAgent, status } }
const tvResponses = new Map(); // { tv_id: { lastResponse, command, status, message, data } }

const TIMEOUT_MS = 3 * 60 * 1000; // 3 menit timeout

// ============================
// 🔌 WEBSOCKET HANDLER
// ============================
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  let tv_id = null;
  
  console.log(`🔌 New WebSocket connection from ${clientIp}`);
  logInfo('WebSocket connection established', { clientIp });

  ws.isAlive = true;

  // ============================
  // 📨 MESSAGE HANDLER
  // ============================
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const now = new Date();

      console.log(`📩 Message received:`, data);

      // ============================
      // 1️⃣ REGISTER - TV mendaftar pertama kali
      // ============================
      if (data.type === 'register') {
        tv_id = data.tv_id || data.id;
        
        if (!tv_id) {
          console.error('❌ Register failed: no tv_id provided');
          ws.send(JSON.stringify({
            type: 'error',
            message: 'tv_id is required for registration'
          }));
          return;
        }

        // Simpan koneksi WebSocket
        tvConnections.set(tv_id, ws);
        ws.tv_id = tv_id; // Attach tv_id ke WebSocket object

        // Update status TV
        tvStatus.set(tv_id, {
          lastPing: now,
          ipAddress: data.ip || clientIp,
          userAgent: data.model || 'Unknown',
          modelTv: data.modeltv,
          cabangid: data.cabangid,
          status: 'online',
          connectedAt: now
        });

        console.log(`✅ TV Registered: ${tv_id} (${data.modeltv})`);
        logInfo('TV registered via WebSocket', { 
          tv_id: tv_id, 
          model: data.model,
          modeltv: data.modeltv,
          ip: data.ip,
          cabangid: data.cabangid 
        });
        tvStatusLogger.logTVRegistered(tv_id, data.modeltv, data.ip);

        // Simpan ke database
        try {
          const initModels = require('./models/init-models');
          const models = initModels(sequelize);
          const Brandtv = models.brandtv;

          const existingTv = await Brandtv.findOne({ where: { tv_id: tv_id } });

          if (!existingTv && data.modeltv && data.cabangid) {
            await Brandtv.create({
              name: data.modeltv,
              codetvid: 1,
              cabangid: parseInt(data.cabangid),
              tv_id: tv_id,
              ip_address: data.ip || clientIp
            });
            console.log(`💾 TV saved to database: ${tv_id}`);
            logInfo('TV saved to database', { tv_id: tv_id });
          }
        } catch (error) {
          console.error('❌ Error saving TV to database:', error);
          logError(error);
        }

        // Kirim konfirmasi registrasi
        ws.send(JSON.stringify({
          type: 'register_ack',
          status: 'success',
          tv_id: tv_id,
          message: 'Registration successful',
          timestamp: now.toISOString()
        }));
      }

      // ============================
      // 2️⃣ PING - TV mengirim heartbeat
      // ============================
      else if (data.type === 'ping') {
        tv_id = data.tv_id || ws.tv_id;
        
        if (!tv_id) {
          console.warn('⚠️ Ping without tv_id');
          return;
        }

        ws.isAlive = true;

        // Check jika TV sebelumnya offline
        const previousStatus = tvStatus.get(tv_id);
        const wasOffline = !previousStatus || 
                          (now - previousStatus.lastPing) >= TIMEOUT_MS;

        // Update status
        tvStatus.set(tv_id, {
          ...previousStatus,
          lastPing: now,
          ipAddress: data.ip || clientIp,
          status: 'online'
        });

        console.log(`📶 Ping from TV: ${tv_id}`);
        tvStatusLogger.logPing(tv_id, data.ip || clientIp, 'WebSocket');

        if (wasOffline) {
          console.log(`✅ TV ${tv_id} came back online`);
          tvStatusLogger.logTVOnline(tv_id);
        }

        // Kirim pong
        ws.send(JSON.stringify({
          type: 'pong',
          tv_id: tv_id,
          time: now.toISOString(),
          status: 'ok'
        }));
      }

      // ============================
      // 3️⃣ COMMAND_RESPONSE - TV mengirim hasil eksekusi command
      // ============================
      else if (data.type === 'command_response') {
        tv_id = data.tv_id || ws.tv_id;

        if (!tv_id) {
          console.error('❌ Command response without tv_id');
          return;
        }

        console.log(`📥 Command Response from TV ${tv_id}:`, {
          command: data.command,
          status: data.status,
          message: data.message
        });

        // Simpan response
        tvResponses.set(tv_id, {
          lastResponse: now,
          tv_id: tv_id,
          command: data.command,
          status: data.status,
          message: data.message,
          error: data.error || null,
          details: data.details || null,
          timestamp: data.timestamp
        });

        logInfo('Command response received from TV', {
          tv_id: tv_id,
          command: data.command,
          status: data.status,
          message: data.message
        });

        tvStatusLogger.logCommandResponse(
          tv_id, 
          data.command, 
          data.status, 
          data.message
        );

        // Kirim acknowledgment
        ws.send(JSON.stringify({
          type: 'response_ack',
          tv_id: tv_id,
          received: true,
          timestamp: now.toISOString()
        }));
      }

      // ============================
      // 4️⃣ ERROR - TV mengirim error message
      // ============================
      else if (data.type === 'error') {
        tv_id = data.tv_id || ws.tv_id;

        console.error(`❌ Error from TV ${tv_id}:`, data.message);
        logError(new Error(`TV Error: ${data.message}`), null, { 
          tv_id: tv_id,
          error_details: data
        });

        // Simpan error sebagai response
        tvResponses.set(tv_id, {
          lastResponse: now,
          tv_id: tv_id,
          command: data.command || 'unknown',
          status: 'error',
          message: data.message,
          error: data.error || data.message,
          timestamp: now.toISOString()
        });
      }

      // ============================
      // 5️⃣ STATUS_UPDATE - TV mengirim update status
      // ============================
      else if (data.type === 'status_update') {
        tv_id = data.tv_id || ws.tv_id;

        if (!tv_id) {
          console.warn('⚠️ Status update without tv_id');
          return;
        }

        console.log(`📊 Status Update from TV ${tv_id}:`, data.status);
        
        // Update status TV
        const currentStatus = tvStatus.get(tv_id) || {};
        tvStatus.set(tv_id, {
          ...currentStatus,
          lastPing: now,
          currentStatus: data.status,
          details: data.details,
          updated: now
        });

        logInfo('TV status update received', {
          tv_id: tv_id,
          status: data.status,
          details: data.details
        });
      }

      // ============================
      // 6️⃣ CONFIRM - TV mengirim konfirmasi command
      // ============================
      else if (data.type === 'confirm') {
        tv_id = data.tv_id || ws.tv_id; // ✅ TV kirim tv_id (snake_case)

        if (!tv_id) {
          console.error('❌ Confirm without tv_id');
          return;
        }

        console.log(`📥 Command Confirmation from TV ${tv_id}:`, {
          command: data.command,
          status: data.status,
          error: data.error
        });

        // Simpan response
        tvResponses.set(tv_id, {
          lastResponse: now,
          tv_id: tv_id,
          command: data.command,
          status: data.status, // "success" atau "failed"
          message: data.status === 'success' ? 'Command executed successfully' : 'Command execution failed',
          error: data.error || null,
          timestamp: data.time || now.toISOString()
        });

        console.log(`💾 Response saved for TV ${tv_id}, command ${data.command}, status ${data.status}`);

        logInfo('Command confirmation received from TV', {
          tv_id: tv_id,
          command: data.command,
          status: data.status,
          error: data.error
        });

        tvStatusLogger.logCommandResponse(
          tv_id, 
          data.command, 
          data.status, 
          data.error || 'Success'
        );

        // Kirim acknowledgment
        ws.send(JSON.stringify({
          type: 'confirm_ack',
          tv_id: tv_id,
          received: true,
          timestamp: now.toISOString()
        }));
      }

      // ============================
      // 7️⃣ UNKNOWN MESSAGE TYPE
      // ============================
      else {
        console.log(`⚠️ Unknown message type: ${data.type} from ${tv_id || clientIp}`);
        logInfo('Unknown WebSocket message type', { type: data.type, data });
      }

    } catch (error) {
      console.error('❌ Error processing WebSocket message:', error);
      logError(error);
      
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        error: error.message
      }));
    }
  });

  // ============================
  // 🏓 PONG HANDLER (for heartbeat)
  // ============================
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // ============================
  // ❌ CLOSE HANDLER
  // ============================
  ws.on('close', (code, reason) => {
    tv_id = ws.tv_id;
    
    console.log(`❌ WebSocket closed for TV: ${tv_id || 'unknown'} (code: ${code}, reason: ${reason || 'none'})`);
    logInfo('WebSocket connection closed', { 
      tv_id: tv_id, 
      code, 
      reason: reason.toString() 
    });

    if (tv_id) {
      tvConnections.delete(tv_id);
      
      // Update status ke offline
      const currentStatus = tvStatus.get(tv_id);
      if (currentStatus) {
        tvStatus.set(tv_id, {
          ...currentStatus,
          status: 'offline',
          disconnectedAt: new Date()
        });
      }
      
      tvStatusLogger.logTVOffline(tv_id);
    }
  });

  // ============================
  // ⚠️ ERROR HANDLER
  // ============================
  ws.on('error', (error) => {
    console.error(`⚠️ WebSocket error for TV: ${ws.tv_id || 'unknown'}`, error);
    logError(error, null, { tv_id: ws.tv_id });
  });

  // ============================
  // 👋 WELCOME MESSAGE
  // ============================
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Billing PS Server',
    timestamp: new Date().toISOString(),
    server_version: '1.0.0'
  }));
});

// ============================
// 🕐 HEARTBEAT INTERVAL
// ============================
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log(`💀 Terminating inactive connection: ${ws.tv_id || 'unknown'}`);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // 30 detik

// ============================
// 🧹 CLEANUP OFFLINE TVs
// ============================
const cleanupInterval = setInterval(() => {
  const now = new Date();
  let offlineCount = 0;

  for (const [tv_id, status] of tvStatus.entries()) {
    const timeSinceLastPing = now - status.lastPing;
    
    if (timeSinceLastPing >= TIMEOUT_MS && status.status === 'online') {
      status.status = 'offline';
      status.disconnectedAt = now;
      offlineCount++;
      
      console.log(`⚠️ TV ${tv_id} marked as offline (no ping for ${Math.floor(timeSinceLastPing / 1000)}s)`);
      tvStatusLogger.logTVOffline(tv_id);
    }
  }

  if (offlineCount > 0) {
    console.log(`🧹 Cleanup: ${offlineCount} TV(s) marked as offline`);
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

// ✅ Export ke app.locals untuk digunakan di routes
app.locals.tvConnections = tvConnections;
app.locals.tvStatus = tvStatus;
app.locals.tvResponses = tvResponses;

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
      connected_tvs: tvConnections.size,
      registered_tvs: tvStatus.size,
      responses: tvResponses.size
    }
  });
});

// HTTP Ping endpoint (fallback)
app.get('/ping', (req, res) => {
  const id = req.query.id || "unknown";
  const now = new Date();
  const ipAddress = req.ip || req.connection.remoteAddress;

  const currentStatus = tvStatus.get(id);
  const wasOffline = !currentStatus || 
                     (now - currentStatus.lastPing) >= TIMEOUT_MS;

  tvStatus.set(id, {
    ...currentStatus,
    lastPing: now,
    ipAddress,
    status: 'online'
  });

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

  for (const [tv_id, status] of tvStatus.entries()) {
    const timeSinceLastPing = now - status.lastPing;
    const isOnline = timeSinceLastPing < TIMEOUT_MS;

    statusList[tv_id] = {
      online: isOnline,
      lastPing: status.lastPing.toISOString(),
      secondsSinceLastPing: Math.floor(timeSinceLastPing / 1000),
      ipAddress: status.ipAddress,
      modelTv: status.modelTv,
      currentStatus: status.currentStatus,
      wsConnected: tvConnections.has(tv_id)
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
      wsConnections: tvConnections.size,
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
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 WebSocket at ws://localhost:${PORT}/ws`);
  console.log(`📡 HTTP API at http://localhost:${PORT}`);
  logInfo(`Server started with WebSocket support on port ${PORT}`);
});

// ============================
// 🛑 GRACEFUL SHUTDOWN
// ============================
const shutdown = () => {
  console.log('Shutting down gracefully...');
  
  clearInterval(heartbeatInterval);
  clearInterval(cleanupInterval);
  
  // Close all WebSocket connections
  tvConnections.forEach((ws, tv_id) => {
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

module.exports = app;
