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

// ✅ IMPROVED: Time Out Endpoint (Parallel Processing)
router.get("/time_out", async (req, res) => {
  console.log('🔔 Time out endpoint called');
  
  try {
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

    // ✅ Collect all tasks untuk parallel processing
    const tasks = [];
    const taskMetadata = []; // Track metadata untuk setiap task

    for (const transaksi of getAll) {
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

        // ✅ Create task untuk setiap TV (non-blocking)
        const task = (async () => {
          try {
            // Get unit history
            const checkunit = await history_units.findOne({
              where: { token: unitToken }
            });

            // Get TV info
            let getTV;
            if (!checkunit) {
              getTV = await sequelize.query(`
                SELECT b.tv_id FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                WHERE u.status = 1 AND u.token = ?
              `, {
                replacements: [unitToken],
                type: sequelize.QueryTypes.SELECT,
              });
            } else {
              getTV = await sequelize.query(`
                SELECT b.tv_id FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                WHERE u.status = 1 AND u.id = ?
              `, {
                replacements: [checkunit.unitid],
                type: sequelize.QueryTypes.SELECT
              });
            }

            if (!getTV || getTV.length === 0) {
              return {
                token: unitToken,
                transaction_code: transaksi.code,
                success: false,
                message: "TV configuration not found"
              };
            }

            const tvInfo = getTV[0];
            const ws = tvConnections.get(tvInfo.tv_id);

            if (!ws || ws.readyState !== WebSocket.OPEN) {
              return {
                token: unitToken,
                transaction_code: transaksi.code,
                success: false,
                message: `TV ${tvInfo.tv_id} tidak terhubung`,
                tv_id: tvInfo.tv_id
              };
            }

            // ✅ Clear old response
            if (tvResponses.has(tvInfo.tv_id)) {
              console.log(`🧹 Clearing old response for TV ${tvInfo.tv_id}`);
              tvResponses.delete(tvInfo.tv_id);
            }

            // ✅ Send command
            await sendTVCommand(ws, tvInfo.tv_id, 26, 'power_off_timeout');
            console.log(`✅ Power off command sent to TV ${tvInfo.tv_id}`);

            // ✅ Wait for response (non-blocking per TV)
            console.log(`⏳ Menunggu response dari TV ${tvInfo.tv_id}...`);
            const tvResponse = await waitForTVResponse(
              tvResponses, 
              tvInfo.tv_id, 
              tvInfo.command, 
              10000
            );

            // ✅ Process response
            if (tvResponse) {
              tvResponses.delete(tvInfo.tv_id);

              if (tvResponse.status === 'success') {
                console.log(`✅ TV ${tvInfo.tv_id} berhasil dimatikan`);
                
                // Update transaksi
                await transaksi.update({ status: 0 });
                console.log(`✅ Transaksi ${transaksi.code} updated to status 0`);
                
                return {
                  token: unitToken,
                  transaction_code: transaksi.code,
                  tv_id: tvInfo.tv_id,
                  start_time: createdAt,
                  total_hours: totalHours,
                  end_time: endTime,
                  transaction_updated: true,
                  command_sent: tvInfo.command,
                  command_status: tvResponse.status,
                  response_time_ms: tvResponse.receivedAt ? 
                    new Date(tvResponse.receivedAt) - new Date(tvResponse.timestamp) : null,
                  success: true,
                  details_processed: group.allDetails.map(d => ({
                    id: d.id,
                    type: d.type,
                    hours: d.hours,
                    created_at: d.createdAt
                  }))
                };

              } else {
                console.error(`❌ TV ${tvInfo.tv_id} gagal eksekusi: ${tvResponse.error}`);

                return {
                  token: unitToken,
                  transaction_code: transaksi.code,
                  tv_id: tvInfo.tv_id,
                  success: false,
                  command_sent: tvInfo.command,
                  command_status: tvResponse.status,
                  message: tvResponse.message || 'Command execution failed',
                  error: tvResponse.error,
                  timestamp: tvResponse.timestamp
                };
              }
            } else {
              console.warn(`⏱️ TV ${tvInfo.tv_id} tidak merespon dalam 10 detik`);

              return {
                token: unitToken,
                transaction_code: transaksi.code,
                tv_id: tvInfo.tv_id,
                success: false,
                command_sent: tvInfo.command,
                message: 'TV tidak merespon dalam 10 detik',
                timeout: true,
                waited_ms: 10000
              };
            }

          } catch (error) {
            console.error(`❌ Error processing unit ${unitToken}:`, error.message);
            logError(error, null, { unitToken, transactionCode: transaksi.code });
            
            return {
              token: unitToken,
              transaction_code: transaksi.code,
              success: false,
              message: error.message || "Command failed",
              error: error.stack
            };
          }
        })();

        tasks.push(task);
        taskMetadata.push({ unitToken, transactionCode: transaksi.code });
      }
    }

    console.log(`\n🚀 Processing ${tasks.length} TVs in parallel...`);

    // ✅ Execute all tasks in parallel (Promise.allSettled untuk handle semua hasil)
    const startTime = Date.now();
    const results = await Promise.allSettled(tasks);
    const elapsed = Date.now() - startTime;

    console.log(`✅ All tasks completed in ${elapsed}ms`);

    // ✅ Process results
    let totalSuccess = 0;
    let totalFailed = 0;
    const finalResults = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.success) {
          totalSuccess++;
        } else {
          totalFailed++;
        }
        finalResults.push(data);
      } else {
        // Promise rejected
        totalFailed++;
        const metadata = taskMetadata[index];
        console.error(`❌ Task failed for ${metadata.unitToken}:`, result.reason);
        
        finalResults.push({
          token: metadata.unitToken,
          transaction_code: metadata.transactionCode,
          success: false,
          message: result.reason?.message || 'Task execution failed',
          error: result.reason?.stack
        });
      }
    });

    return res.json({
      success: true,
      message: `Perintah Power Off TV selesai diproses.`,
      summary: {
        total_units: tasks.length,
        success: totalSuccess,
        failed: totalFailed,
        success_rate: tasks.length > 0 ? 
          `${((totalSuccess / tasks.length) * 100).toFixed(1)}%` : '0%',
        execution_time_ms: elapsed
      },
      results: finalResults,
      timestamp: new Date().toISOString()
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

// ✅ IMPROVED: Sleep Endpoint (Parallel Processing)
router.get("/sleep", async (req, res) => {
  console.log('😴 Sleep mode endpoint called');
  
  try {
    const tvConnections = req.app.locals.tvConnections;
    const tvResponses = req.app.locals.tvResponses;

    if (!tvConnections || !tvResponses) {
      return res.status(500).json({
        success: false,
        message: 'WebSocket services not available'
      });
    }

    const getAll = await sequelize.query(`
      SELECT b.tv_id FROM units u 
      JOIN brandtv b ON b.id = u.brandtvid
      WHERE u.token NOT IN(
        SELECT td.unit_token FROM transaksi t 
        JOIN transaksi_detail td ON td.code = t.code 
        WHERE t.status = 1 AND td.status = 1
        AND td.unit_token IS NOT NULL
      )
      AND u.status = 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${getAll.length} TVs to sleep`);

    // ✅ Create parallel tasks
    const tasks = getAll.map(unit => {
      return (async () => {
        try {
          const ws = tvConnections.get(unit.tv_id);
          
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log(`⚠️ TV ${unit.tv_id} tidak terhubung, skip...`);
            return {
              tv_id: unit.tv_id,
              success: false,
              message: 'TV not connected'
            };
          }

          // Clear old response
          if (tvResponses.has(unit.tv_id)) {
            console.log(`🧹 Clearing old response for TV ${unit.tv_id}`);
            tvResponses.delete(unit.tv_id);
          }

          // Send sleep command
          await sendTVCommand(ws, unit.tv_id, 26, 'sleep_mode');
          console.log(`✅ Sleep command sent to TV ${unit.tv_id}`);

          // Wait for response
          console.log(`⏳ Menunggu response dari TV ${unit.tv_id}...`);
          const tvResponse = await waitForTVResponse(
            tvResponses, 
            unit.tv_id, 
            26, 
            8000
          );

          if (tvResponse) {
            tvResponses.delete(unit.tv_id);

            if (tvResponse.status === 'success') {
              console.log(`✅ Sleep command berhasil untuk TV ${unit.tv_id}`);

              return {
                tv_id: unit.tv_id,
                success: true,
                message: 'Sleep command executed successfully',
                command: 26,
                command_status: tvResponse.status,
                response_message: tvResponse.message,
                response_time_ms: tvResponse.receivedAt ? 
                  new Date(tvResponse.receivedAt) - new Date(tvResponse.timestamp) : null,
                timestamp: tvResponse.timestamp
              };

            } else {
              console.error(`❌ Sleep command gagal untuk TV ${unit.tv_id}: ${tvResponse.error}`);

              return {
                tv_id: unit.tv_id,
                success: false,
                command: 26,
                command_status: tvResponse.status,
                message: tvResponse.message || 'Command failed',
                error: tvResponse.error,
                timestamp: tvResponse.timestamp
              };
            }
          } else {
            console.warn(`⏱️ TV ${unit.tv_id} tidak merespon dalam 8 detik`);

            return {
              tv_id: unit.tv_id,
              success: false,
              command: 26,
              message: 'TV tidak merespon dalam 8 detik',
              timeout: true,
              waited_ms: 8000
            };
          }

        } catch (error) {
          console.error(`❌ Error processing TV ${unit.tv_id}:`, error.message);
          logError(error, null, { tv_id: unit.tv_id });
          
          return {
            tv_id: unit.tv_id,
            success: false,
            message: error.message || "Command failed",
            error: error.stack
          };
        }
      })();
    });

    console.log(`\n🚀 Processing ${tasks.length} TVs in parallel...`);

    // Execute all in parallel
    const startTime = Date.now();
    const results = await Promise.allSettled(tasks);
    const elapsed = Date.now() - startTime;

    console.log(`✅ All tasks completed in ${elapsed}ms`);

    // Process results
    let totalSuccess = 0;
    let totalFailed = 0;
    const finalResults = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.success) {
          totalSuccess++;
        } else {
          totalFailed++;
        }
        finalResults.push(data);
      } else {
        totalFailed++;
        const unit = getAll[index];
        console.error(`❌ Task failed for TV ${unit.tv_id}:`, result.reason);
        
        finalResults.push({
          tv_id: unit.tv_id,
          success: false,
          message: result.reason?.message || 'Task execution failed',
          error: result.reason?.stack
        });
      }
    });

    return res.json({
      success: true,
      message: `Perintah Sleep TV selesai diproses.`,
      summary: {
        total_units: tasks.length,
        success: totalSuccess,
        failed: totalFailed,
        success_rate: tasks.length > 0 ? 
          `${((totalSuccess / tasks.length) * 100).toFixed(1)}%` : '0%',
        execution_time_ms: elapsed
      },
      results: finalResults,
      timestamp: new Date().toISOString()
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
      message: 'tv_id and command are required',
      received: { tv_id, command }
    });
  }

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
      tv_id,
      debug: {
        wsExists: !!ws,
        wsReadyState: ws?.readyState
      }
    });
  }

  try {
    // ✅ Clear old response untuk tv_id ini sebelum kirim command baru
    if (tvResponses.has(tv_id)) {
      console.log(`🧹 Clearing old response for TV ${tv_id}`);
      tvResponses.delete(tv_id);
    }
    
    // ✅ Send command
    await sendTVCommand(ws, tv_id, command, target || 'manual_command');
    
    logInfo('TV Command sent', { 
      tv_id, 
      command, 
      target: target || 'manual_command',
      userId: req.user?.userId 
    });

    // ✅ Wait for response
    if (waitResponse === true || waitResponse === 'true') {
      console.log(`⏳ Waiting for response from TV ${tv_id}...`);
      
      const timeout = parseInt(req.body.timeout) || 10000; // Default 10 detik
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
              command: parseInt(command),
              target: target || 'manual_command',
              response: {
                status: tvResponse.status,
                message: tvResponse.message,
                timestamp: tvResponse.timestamp,
                executionTime: new Date(tvResponse.receivedAt) - new Date()
              }
            }
          });
        } else {
          // Command failed
          return res.status(503).json({
            success: false,
            message: `Command execution failed`,
            data: {
              tv_id,
              command: parseInt(command),
              response: {
                status: tvResponse.status,
                error: tvResponse.error,
                message: tvResponse.message,
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
            command: parseInt(command),
            timeout: true,
            waited_ms: timeout
          }
        });
      }
    }

    // ✅ Fire and forget (tanpa tunggu response)
    res.json({ 
      success: true, 
      message: `Command ${command} sent to ${tv_id}`,
      data: { 
        tv_id, 
        command: parseInt(command),
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
