const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { logError, logInfo } = require('../middleware/logger');
const WebSocket = require('ws');

const router = express.Router();

// Import models
let Transaksi, history_units, TransaksiDetail, Unit, Brandtv;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Transaksi = models.transaksi;
  history_units = models.history_units;
  TransaksiDetail = models.transaksi_detail;
  Unit = models.units;
  Brandtv = models.brandtv;

  if (!Transaksi) {
    console.error('❌ Transaksi model not found');
  } else {
    console.log('✅ Transaksi model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading models:', error.message);
}

// ✅ Helper: Wait for TV response dengan improved debugging
const waitForTVResponse = (tvResponses, tv_id, command, timeout = 5000) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let checkCount = 0;
    const expectedCommand = parseInt(command); // ✅ Normalize ke number
    
    console.log(`⏳ Waiting for response from TV ${tv_id}, command: ${expectedCommand}, timeout: ${timeout}ms`);
    
    const checkInterval = setInterval(() => {
      checkCount++;
      const response = tvResponses.get(tv_id);
      const elapsed = Date.now() - startTime;
      
      // ✅ Debug log setiap 1 detik (10 checks x 100ms)
      if (checkCount % 10 === 0) {
        console.log(`⏳ Still waiting for TV ${tv_id} (${elapsed}ms / ${timeout}ms)...`);
        if (response) {
          console.log(`   Found response with command: ${response.command} (expected: ${expectedCommand})`);
          console.log(`   Status: ${response.status}`);
        } else {
          console.log(`   No response in map yet`);
        }
      }
      
      // ✅ Check response dengan command matching
      if (response) {
        const responseCommand = parseInt(response.command);
        
        // ✅ Match by command
        if (responseCommand === expectedCommand) {
          clearInterval(checkInterval);
          console.log(`✅ Response matched for TV ${tv_id}!`);
          console.log(`   Command: ${responseCommand}`);
          console.log(`   Status: ${response.status}`);
          console.log(`   Elapsed: ${elapsed}ms`);
          resolve(response);
          return;
        } else {
          // Command tidak match, mungkin response dari command sebelumnya
          if (checkCount % 10 === 0) {
            console.log(`⚠️ Response command mismatch: expected ${expectedCommand}, got ${responseCommand}`);
          }
        }
      }
      
      // ✅ Timeout check
      if (elapsed >= timeout) {
        clearInterval(checkInterval);
        
        console.warn(`⏱️ TIMEOUT: TV ${tv_id} tidak merespon dalam ${timeout}ms`);
        console.warn(`   Expected command: ${expectedCommand}`);
        console.warn(`   Total checks: ${checkCount}`);
        console.warn(`   Last response in map:`, response || 'null');
        
        // ✅ Cek apakah ada response tapi command tidak match
        if (response) {
          console.warn(`   ⚠️ Response ada tapi command tidak match (${response.command} vs ${expectedCommand})`);
        }
        
        resolve(null); // Timeout
      }
    }, 100); // Check setiap 100ms
  });
};

// ✅ Helper: Send command to TV with error handling
const sendTVCommand = async (ws, tv_id, command, target = 'control') => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(`TV ${tv_id} tidak terhubung`);
  }

  try {
    // ✅ Pastikan semua field ada nilainya
    const payload = {
      type: 'command',
      tv_id: String(tv_id), // ✅ Konversi ke string
      command: parseInt(command), // ✅ Konversi ke number
      target: String(target),
      timestamp: new Date().toISOString()
    };

    // ✅ Log payload sebelum dikirim
    console.log(`📤 Sending payload to TV ${tv_id}:`, JSON.stringify(payload));
    
    const jsonString = JSON.stringify(payload);
    ws.send(jsonString);
    
    console.log(`✅ Command ${command} sent to TV ${tv_id}`);
    logInfo('TV command sent', { tv_id, command, target, payloadSent: payload });
    
    return true;
  } catch (error) {
    console.error(`❌ Error sending command to TV ${tv_id}:`, error);
    console.error('Error details:', {
      tv_id,
      command,
      target,
      wsReadyState: ws?.readyState,
      errorMessage: error.message,
      errorStack: error.stack
    });
    logError(error, null, { tv_id, command });
    throw error;
  }
};

router.get('/', (req, res) => {
  res.json({
    message: 'Billing PS API - WebSocket Control Endpoint is active.',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// ✅ IMPROVED: Time Out Endpoint
router.get("/time_out", async (req, res) => {
  console.log('🔔 Time out endpoint called');
  
  try {
    // ✅ Validate WebSocket services
    const tvConnections = req.app.locals.tvConnections;
    const tvResponses = req.app.locals.tvResponses;
    
    if (!tvConnections || !tvResponses) {
      return res.status(500).json({
        success: false,
        message: 'WebSocket services not available'
      });
    }

    const includeOptions = [
      {
        model: TransaksiDetail,
        as: 'details',
        required: false,
        where: { status: 1 },
        include: [
          {
            model: Unit,
            as: 'unit',
            required: false
          },
        ]
      }
    ];

    const getAll = await Transaksi.findAll({
      where: { status: 1 },
      include: includeOptions
    });

    const results = [];
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const transaksi of getAll) {
      // Group details by unit_token
      const unitGroups = {};
      
      transaksi.details
        .filter(d => d.unit_token)
        .forEach(detail => {
          if (!unitGroups[detail.unit_token]) {
            unitGroups[detail.unit_token] = {
              initialDetail: null,
              totalHours: 0,
              allDetails: []
            };
          }
          
          unitGroups[detail.unit_token].allDetails.push(detail);
          unitGroups[detail.unit_token].totalHours += detail.hours || 0;
          
          if (detail.type === 0) {
            unitGroups[detail.unit_token].initialDetail = detail;
          }
        });

      // Process each unit group
      for (const [unitToken, group] of Object.entries(unitGroups)) {
        if (!group.initialDetail) {
          console.log(`⚠️ Unit ${unitToken} tidak memiliki transaksi awal (type 0), skip...`);
          continue;
        }

        // Hitung timeout
        const createdAt = new Date(group.initialDetail.createdAt);
        const totalHours = group.totalHours;
        const endTime = new Date(createdAt.getTime() + (totalHours * 60 * 60 * 1000));
        const now = new Date();

        console.log(`\n📊 Unit Token: ${unitToken}`);
        console.log(`   Start: ${createdAt.toISOString()}`);
        console.log(`   Hours: ${totalHours}h`);
        console.log(`   End: ${endTime.toISOString()}`);
        console.log(`   Expired: ${now >= endTime}`);

        // Skip jika belum timeout
        if (now < endTime) {
          console.log(`⏳ Unit ${unitToken} belum timeout, skip...`);
          continue;
        }

        console.log(`⏰ Unit ${unitToken} sudah timeout, akan dimatikan...`);
        totalProcessed++;

        try {
          // Get unit history
          const checkunit = await history_units.findOne({
            where: { token: unitToken }
          });

          // Get TV info
          let getTV;
          if (!checkunit) {
            getTV = await sequelize.query(`
              SELECT b.tv_id, c.command FROM units u 
              JOIN brandtv b ON b.id = u.brandtvid
              JOIN codetv c ON c.id = b.codetvid
              WHERE u.status = 1 AND c.desc = 'on/off' AND u.token = ?
            `, {
              replacements: [unitToken],
              type: sequelize.QueryTypes.SELECT,
            });
          } else {
            getTV = await sequelize.query(`
              SELECT b.tv_id, c.command FROM units u 
              JOIN brandtv b ON b.id = u.brandtvid
              JOIN codetv c ON c.id = b.codetvid
              WHERE u.status = 1 AND c.desc = 'on/off' AND u.id = ?
            `, {
              replacements: [checkunit.unitid],
              type: sequelize.QueryTypes.SELECT
            });
          }

          if (!getTV || getTV.length === 0) {
            totalFailed++;
            results.push({
              token: unitToken,
              transaction_code: transaksi.code,
              success: false,
              message: "TV configuration not found"
            });
            continue;
          }

          const tvInfo = getTV[0];
          const ws = tvConnections.get(tvInfo.tv_id);

          if (!ws || ws.readyState !== WebSocket.OPEN) {
            totalFailed++;
            results.push({
              token: unitToken,
              transaction_code: transaksi.code,
              success: false,
              message: `TV ${tvInfo.tv_id} tidak terhubung`,
              tv_id: tvInfo.tv_id
            });
            continue;
          }

          // ✅ Kirim command (gunakan command dari database, bukan hardcode)
          try {
            await sendTVCommand(ws, tvInfo.tv_id, tvInfo.command, 'power_off');
          } catch (sendError) {
            totalFailed++;
            results.push({
              token: unitToken,
              transaction_code: transaksi.code,
              success: false,
              message: `Failed to send command: ${sendError.message}`,
              tv_id: tvInfo.tv_id
            });
            continue;
          }

          // ✅ Tunggu response (Promise-based, non-blocking)
          console.log(`⏳ Menunggu response dari TV ${tvInfo.tv_id}...`);
          const tvResponse = await waitForTVResponse(
            tvResponses, 
            tvInfo.tv_id, 
            tvInfo.command, 
            10000 // 10 detik timeout
          );

          // Evaluasi response
          if (tvResponse && tvResponse.status === 'success') {
            console.log(`✅ TV ${tvInfo.tv_id} berhasil dimatikan`);
            
            // Update transaksi
            await transaksi.update({ status: 0 });
            console.log(`✅ Transaksi ${transaksi.code} updated to status 0`);
            
            totalSuccess++;
            results.push({
              token: unitToken,
              transaction_code: transaksi.code,
              tv_id: tvInfo.tv_id,
              start_time: createdAt,
              total_hours: totalHours,
              end_time: endTime,
              transaction_updated: true,
              command_sent: tvInfo.command,
              command_status: tvResponse.status,
              success: true,
              details_processed: group.allDetails.map(d => ({
                id: d.id,
                type: d.type,
                hours: d.hours,
                created_at: d.createdAt
              }))
            });

            // Clear response
            tvResponses.delete(tvInfo.tv_id);

          } else if (tvResponse && (tvResponse.status === 'failed' || tvResponse.status === 'error')) {
            console.error(`❌ TV ${tvInfo.tv_id} gagal eksekusi: ${tvResponse.error}`);
            totalFailed++;

            results.push({
              token: unitToken,
              transaction_code: transaksi.code,
              tv_id: tvInfo.tv_id,
              success: false,
              command_sent: tvInfo.command,
              command_status: tvResponse.status,
              message: tvResponse.message || 'Command execution failed',
              error: tvResponse.error
            });

          } else {
            // Timeout
            console.warn(`⏱️ TV ${tvInfo.tv_id} tidak merespon (timeout)`);
            totalFailed++;

            results.push({
              token: unitToken,
              transaction_code: transaksi.code,
              tv_id: tvInfo.tv_id,
              success: false,
              command_sent: tvInfo.command,
              message: 'TV tidak merespon (timeout)',
              timeout: true
            });
          }

        } catch (error) {
          totalFailed++;
          console.error(`❌ Error processing unit ${unitToken}:`, error.message);
          logError(error, null, { unitToken, transactionCode: transaksi.code });
          
          results.push({
            token: unitToken,
            transaction_code: transaksi.code,
            success: false,
            message: error.message || "Command failed",
            error: error.stack
          });
        }
      }
    }

    return res.json({
      success: true,
      message: `Perintah Power Off TV selesai diproses.`,
      summary: {
        total_units: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        success_rate: totalProcessed > 0 ? 
          `${((totalSuccess / totalProcessed) * 100).toFixed(1)}%` : '0%'
      },
      results: results
    });

  } catch (error) {
    console.error("❌ Error pada /time_out:", error);
    logError(error);
    
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal.",
      error: error.message
    });
  }
});

// ✅ IMPROVED: Sleep Endpoint
router.get("/sleep", async (req, res) => {
  console.log('😴 Sleep mode endpoint called');
  
  try {
    // ✅ Validate WebSocket services
    const tvConnections = req.app.locals.tvConnections;
    const tvResponses = req.app.locals.tvResponses;

    if (!tvConnections || !tvResponses) {
      return res.status(500).json({
        success: false,
        message: 'WebSocket services not available'
      });
    }

    const results = [];
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    const getAll = await sequelize.query(`
      SELECT b.tv_id, c.command FROM units u 
      JOIN brandtv b ON b.id = u.brandtvid 
      JOIN codetv c ON c.id = b.codetvid 
      WHERE u.token NOT IN(
        SELECT td.unit_token FROM transaksi t 
        JOIN transaksi_detail td ON td.code = t.code 
        WHERE t.status = 1 AND td.status = 1
        AND td.unit_token IS NOT NULL
      )
      AND u.status = 1 AND c.desc = 'play/pause'
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    for (const unit of getAll) {
      totalProcessed++;
      
      try {
        const ws = tvConnections.get(unit.tv_id);
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          console.log(`⚠️ TV ${unit.tv_id} tidak terhubung, skip...`);
          totalFailed++;
          results.push({
            tv_id: unit.tv_id,
            success: false,
            message: 'TV not connected'
          });
          continue;
        }

        // ✅ Kirim sleep command
        try {
          await sendTVCommand(ws, unit.tv_id, unit.command, 'sleep');
        } catch (sendError) {
          totalFailed++;
          results.push({
            tv_id: unit.tv_id,
            success: false,
            message: `Failed to send command: ${sendError.message}`
          });
          continue;
        }

        // ✅ Tunggu response
        console.log(`⏳ Menunggu response dari TV ${unit.tv_id}...`);
        const tvResponse = await waitForTVResponse(
          tvResponses, 
          unit.tv_id, 
          unit.command, 
          5000
        );

        // Evaluasi response
        if (tvResponse && tvResponse.status === 'success') {
          console.log(`✅ Sleep command berhasil untuk TV ${unit.tv_id}`);
          totalSuccess++;

          results.push({
            tv_id: unit.tv_id,
            success: true,
            message: 'Sleep command executed successfully',
            command: unit.command,
            command_status: tvResponse.status
          });

          // Clear response
          tvResponses.delete(unit.tv_id);

        } else if (tvResponse && (tvResponse.status === 'failed' || tvResponse.status === 'error')) {
          console.error(`❌ Sleep command gagal untuk TV ${unit.tv_id}`);
          totalFailed++;

          results.push({
            tv_id: unit.tv_id,
            success: false,
            message: tvResponse.message || 'Command failed',
            error: tvResponse.error
          });

        } else {
          // Timeout
          console.warn(`⏱️ TV ${unit.tv_id} tidak merespon (timeout)`);
          totalFailed++;

          results.push({
            tv_id: unit.tv_id,
            success: false,
            message: 'TV tidak merespon (timeout)',
            timeout: true
          });
        }

      } catch (error) {
        totalFailed++;
        console.error(`❌ Error processing TV ${unit.tv_id}:`, error);
        logError(error, null, { tv_id: unit.tv_id });
        
        results.push({
          tv_id: unit.tv_id,
          success: false,
          message: error.message || "Command failed",
          error: error.stack
        });
      }
    }

    return res.json({
      success: true,
      message: `Perintah Sleep TV selesai diproses.`,
      summary: {
        total_units: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        success_rate: totalProcessed > 0 ? 
          `${((totalSuccess / totalProcessed) * 100).toFixed(1)}%` : '0%'
      },
      results: results
    });

  } catch (error) {
    console.error('❌ Error in /sleep endpoint:', error);
    logError(error);
    
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal.",
      error: error.message
    });
  }
});

// ✅ IMPROVED: Kirim perintah ke TV tertentu via WebSocket
router.post('/tv/command', verifyToken, async (req, res) => {
  const { tv_id, command, target, waitResponse } = req.body;

  // Validation
  if (!tv_id || !command) {
    return res.status(400).json({ 
      success: false,
      message: 'tv_id and command are required'
    });
  }

  // Get WebSocket connections
  const tvConnections = req.app.locals.tvConnections;
  const tvResponses = req.app.locals.tvResponses;
  
  if (!tvConnections || !tvResponses) {
    return res.status(500).json({ 
      success: false,
      message: 'WebSocket services not available' 
    });
  }

  const ws = tvConnections.get(tv_id);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ 
      success: false,
      message: 'TV not connected or unavailable',
      tv_id 
    });
  }

  try {
    // ✅ Gunakan helper function sendTVCommand
    await sendTVCommand(ws, tv_id, command, target || 'manual_command');
    
    logInfo('TV Command sent', { 
      tv_id, 
      command, 
      target: target || 'manual_command',
      userId: req.user?.userId 
    });

    // ✅ Optional: Tunggu response dari TV
    if (waitResponse === true || waitResponse === 'true') {
      console.log(`⏳ Waiting for response from TV ${tv_id}...`);
      
      const timeout = parseInt(req.body.timeout) || 5000; // Default 5 detik
      const tvResponse = await waitForTVResponse(
        tvResponses, 
        tv_id, 
        command, 
        timeout
      );

      if (tvResponse) {
        // Clear response setelah digunakan
        tvResponses.delete(tv_id);

        if (tvResponse.status === 'success') {
          return res.json({
            success: true,
            message: `Command ${command} executed successfully on ${tv_id}`,
            data: {
              tv_id,
              command,
              target: target || 'manual_command',
              response: {
                status: tvResponse.status,
                message: tvResponse.message,
                timestamp: tvResponse.timestamp
              }
            }
          });
        } else {
          return res.status(503).json({
            success: false,
            message: `Command execution failed: ${tvResponse.message || tvResponse.error}`,
            data: {
              tv_id,
              command,
              response: {
                status: tvResponse.status,
                error: tvResponse.error,
                timestamp: tvResponse.timestamp
              }
            }
          });
        }
      } else {
        // Timeout
        return res.status(408).json({
          success: false,
          message: `TV ${tv_id} tidak merespon dalam ${timeout}ms`,
          data: {
            tv_id,
            command,
            timeout: true
          }
        });
      }
    }

    // ✅ Tanpa tunggu response (fire and forget)
    res.json({ 
      success: true, 
      message: `Command ${command} sent to ${tv_id}`,
      data: { 
        tv_id, 
        command,
        target: target || 'manual_command',
        note: 'Command sent without waiting for response'
      }
    });

  } catch (error) {
    console.error(`❌ Error sending command to ${tv_id}:`, error);
    logError(error, req, { tv_id, command });
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send command to TV',
      error: error.message
    });
  }
});

// ✅ IMPROVED: Lihat semua TV yang aktif
router.get('/tv/active', verifyToken, (req, res) => {
  try {
    const tvConnections = req.app.locals.tvConnections;
    const tvStatus = req.app.locals.tvStatus;
    
    if (!tvConnections) {
      return res.status(500).json({ 
        success: false,
        message: 'WebSocket connections not available' 
      });
    }

    const connectedTVs = [];
    const now = new Date();

    for (const [tv_id, ws] of tvConnections.entries()) {
      const isConnected = ws.readyState === WebSocket.OPEN;
      const status = tvStatus?.[tv_id];
      
      connectedTVs.push({
        id: tv_id,
        connected: isConnected,
        state: isConnected ? 'ONLINE' : 'OFFLINE',
        lastPing: status?.lastPing || null,
        ipAddress: status?.ipAddress || null,
        lastSeenSecondsAgo: status?.lastPing ? 
          Math.floor((now - status.lastPing) / 1000) : null
      });
    }

    // Sort by connected status
    connectedTVs.sort((a, b) => {
      if (a.connected === b.connected) {
        return (a.lastSeenSecondsAgo || 0) - (b.lastSeenSecondsAgo || 0);
      }
      return b.connected - a.connected;
    });

    res.json({ 
      success: true,
      data: {
        connectedTVs,
        summary: {
          total: connectedTVs.length,
          online: connectedTVs.filter(tv => tv.connected).length,
          offline: connectedTVs.filter(tv => !tv.connected).length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting active TVs:', error);
    logError(error, req);
    
    res.status(500).json({
      success: false,
      message: 'Failed to get active TVs',
      error: error.message
    });
  }
});

// ✅ IMPROVED: TV status detail
router.get('/tv/status/:tv_id', verifyToken, (req, res) => {
  try {
    const { tv_id } = req.params;
    const tvConnections = req.app.locals.tvConnections;
    const tvStatus = req.app.locals.tvStatus;
    const tvResponses = req.app.locals.tvResponses;
    
    const ws = tvConnections?.get(tv_id);
    const status = tvStatus?.[tv_id];
    const lastResponse = tvResponses?.get(tv_id);
    const now = new Date();
    
    if (!ws && !status) {
      return res.status(404).json({
        success: false,
        message: 'TV not found',
        tv_id
      });
    }

    const isOnline = ws && ws.readyState === WebSocket.OPEN;
    const lastSeenSeconds = status?.lastPing ? 
      Math.floor((now - status.lastPing) / 1000) : null;

    res.json({
      success: true,
      data: {
        tv_id,
        connected: isOnline,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
        lastPing: status?.lastPing || null,
        lastPingISO: status?.lastPing ? status.lastPing.toISOString() : null,
        lastSeenSecondsAgo: lastSeenSeconds,
        lastSeenHumanReadable: lastSeenSeconds ? 
          (lastSeenSeconds < 60 ? `${lastSeenSeconds}s ago` : 
           lastSeenSeconds < 3600 ? `${Math.floor(lastSeenSeconds / 60)}m ago` : 
           `${Math.floor(lastSeenSeconds / 3600)}h ago`) : null,
        ipAddress: status?.ipAddress || null,
        lastCommand: lastResponse ? {
          command: lastResponse.command,
          status: lastResponse.status,
          timestamp: lastResponse.timestamp
        } : null,
        websocket: {
          readyState: ws?.readyState,
          readyStateText: ws ? 
            (['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState]) : 'N/A'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting TV status:', error);
    logError(error, req);
    
    res.status(500).json({
      success: false,
      message: 'Failed to get TV status',
      error: error.message
    });
  }
});

// Register TV endpoint
router.post('/registertv', async (req, res) => {
  try {
    const { tv_id, model, ip, modeltv, cabangid } = req.body;

    if (!tv_id || !modeltv || !ip || !cabangid) {
      return res.status(400).json({
        success: false,
        message: 'tv_id, modeltv, ip, and cabangid are required'
      });
    }
console.log(req.body);
    // Cek apakah tv_id sudah ada
    const existingTv = await Brandtv.findOne({ where: { tv_id } });

    if (existingTv) {
      return res.json({
        success: true,
        message: 'TV already registered',
        data: existingTv
      });
    }

    // Insert TV baru
    const newTv = await Brandtv.create({
      name: modeltv,
      codetvid: 1,
      cabangid: parseInt(cabangid),
      tv_id: tv_id,
      ip_address: ip
    });

    return res.status(201).json({
      success: true,
      message: 'TV registered successfully',
      data: newTv
    });
  } catch (error) {
    console.error('Error in /registertv:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
