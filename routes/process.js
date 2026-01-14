const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { exec } = require("child_process");
const { logError, logInfo } = require('../middleware/logger');
const WebSocket = require('ws');

const router = express.Router();

// Import model cabang, users, dan access
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
    console.error('❌ Transaksi model not found in models');
  } else {
    console.log('✅ Transaksi model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading models:', error.message);
}

router.get('/', (req, res) => {
  res.json({
    message: 'Billing PS API - ADB Control Endpoint is active.',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// ...existing code...

router.get("/time_out", async (req, res) => {
  console.log('time out endpoint called');
  try {
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
      where: {
        status: 1,
      },
      include: includeOptions
    });

    const tvConnections = req.app.locals.tvConnections;
    const tvResponses = req.app.locals.tvResponses; // ✅ TAMBAHKAN INI
    const adbResults = [];
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const transaksi of getAll) {
      // Group details by unit_token untuk menghitung total hours
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
          
          // Simpan detail type 0 sebagai initial detail untuk referensi waktu mulai
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

        // Hitung timeout berdasarkan waktu transaksi awal + total hours
        const createdAt = new Date(group.initialDetail.createdAt);
        const totalHours = group.totalHours;
        const endTime = new Date(createdAt.getTime() + (totalHours * 60 * 60 * 1000));
        const now = new Date();

        console.log(`Unit Token: ${unitToken}`);
        console.log(`Transaction Start: ${createdAt}`);
        console.log(`Total Hours (type 0 + type 1): ${totalHours}`);
        console.log(`End Time: ${endTime}`);
        console.log(`Now: ${now}`);
        console.log(`Is Expired: ${now >= endTime}`);

        // Jika belum waktunya timeout, skip unit ini
        if (now < endTime) {
          console.log(`⏳ Unit ${unitToken} belum timeout, skip...`);
          continue;
        }

        console.log(`⏰ Unit ${unitToken} sudah timeout, akan dimatikan...`);
        totalProcessed++;

        try {
          // 1. Dapatkan Unit History
          const checkunit = await history_units.findOne({
            where: { token: unitToken }
          });

          // 2. Tentukan dan Jalankan Query
          let getIP;

          if (!checkunit) {
            getIP = await sequelize.query(`
              SELECT b.ip_address, b.tv_id, c.command, c.code FROM units u 
              JOIN brandtv b ON b.id = u.brandtvid
              JOIN codetv c ON c.id = b.codetvid
              WHERE u.status = 1 AND c.desc = 'on/off' AND u.token = ?
            `, {
              replacements: [unitToken],
              type: sequelize.QueryTypes.SELECT,
            });
          } else {
            getIP = await sequelize.query(`
              SELECT b.ip_address, b.tv_id, c.command, c.code FROM units u 
              JOIN brandtv b ON b.id = u.brandtvid
              JOIN codetv c ON c.id = b.codetvid
              WHERE u.status = 1 AND c.desc = 'on/off' AND u.id = ?
            `, {
              replacements: [checkunit.unitid],
              type: sequelize.QueryTypes.SELECT
            });
          }

          // 3. PENANGANAN DATA KOSONG
          if (!getIP || getIP.length === 0) {
            totalFailed++;
            adbResults.push({
              token: unitToken,
              transaction_code: transaksi.code,
              success: false,
              message: "Unit atau Perintah Power (off) tidak ditemukan."
            });
            continue;
          }

          const unitData = getIP[0];
          const ws = tvConnections.get(unitData.tv_id);

          if (!ws || ws.readyState !== WebSocket.OPEN) {
            totalFailed++;
            adbResults.push({
              token: unitToken,
              transaction_code: transaksi.code,
              success: false,
              message: `TV ${unitData.tv_id} tidak terhubung atau unavailable`
            });
            continue;
          }

          // 4. KIRIM COMMAND KE TV
          const powerOffCommand = 223; // ✅ Definisikan command sebagai konstanta
          console.log(`📤 Mengirim perintah Power Off ke TV ${unitData.tv_id}, command: ${powerOffCommand}`);
          ws.send(JSON.stringify({ 
            type: 'command', 
            tvId: unitData.tv_id, // ✅ Server kirim dengan tvId (camelCase)
            command: powerOffCommand,
            target: 'power_off',
            timestamp: new Date().toISOString()
          }));

          // ✅ 5. TUNGGU RESPONSE DARI TV (dengan timeout)
          let tvResponse = null;
          const maxWaitTime = 5000; // 5 detik timeout
          const startWait = Date.now();

          console.log(`⏳ Menunggu response dari TV ${unitData.tv_id}...`);

          while (Date.now() - startWait < maxWaitTime) {
            // Cek apakah ada response dari TV
            const response = tvResponses.get(unitData.tv_id);
            
            // ✅ Cek dengan powerOffCommand (223), bukan unitData.command
            if (response && response.command === powerOffCommand) {
              tvResponse = response;
              console.log(`📥 Response diterima dari TV ${unitData.tv_id}:`, tvResponse);
              break;
            }
            
            // Tunggu 100ms sebelum cek lagi
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Debug jika tidak ada response
          if (!tvResponse) {
            console.warn(`⚠️ Tidak ada response dari TV ${unitData.tv_id} setelah ${maxWaitTime}ms`);
            console.log(`Current responses in map:`, Array.from(tvResponses.keys()));
          }

          // ✅ 6. EVALUASI RESPONSE (sesuaikan dengan "success" dan "failed")
          if (tvResponse && tvResponse.status === 'success') {
            console.log(`✅ TV ${unitData.tv_id} berhasil dimatikan`);
            
            // 7. UPDATE STATUS TRANSAKSI MENJADI 0 (SELESAI)
            await transaksi.update({
              status: 0,
            });

            console.log(`✅ Transaksi ${transaksi.code} berhasil diupdate status = 0`);
            totalSuccess++;

            adbResults.push({
              token: unitToken,
              transaction_code: transaksi.code,
              tv_id: unitData.tv_id,
              ip_address: unitData.ip_address,
              start_time: createdAt,
              total_hours: totalHours,
              end_time: endTime,
              transaction_updated: true,
              command_sent: powerOffCommand,
              command_status: tvResponse.status,
              command_message: tvResponse.message,
              success: true,
              details_processed: group.allDetails.map(d => ({
                id: d.id,
                type: d.type,
                hours: d.hours,
                created_at: d.createdAt
              }))
            });

            // Clear response setelah digunakan
            tvResponses.delete(unitData.tv_id);

          } else if (tvResponse && (tvResponse.status === 'failed' || tvResponse.status === 'error')) {
            console.error(`❌ TV ${unitData.tv_id} gagal eksekusi command: ${tvResponse.error || tvResponse.message}`);
            totalFailed++;

            adbResults.push({
              token: unitToken,
              transaction_code: transaksi.code,
              tv_id: unitData.tv_id,
              success: false,
              command_sent: powerOffCommand,
              command_status: tvResponse.status,
              message: tvResponse.message || 'Command execution failed',
              error: tvResponse.error
            });

          } else {
            // Timeout - tidak ada response
            console.warn(`⚠️ TV ${unitData.tv_id} tidak merespon dalam ${maxWaitTime}ms`);
            totalFailed++;

            adbResults.push({
              token: unitToken,
              transaction_code: transaksi.code,
              tv_id: unitData.tv_id,
              success: false,
              command_sent: powerOffCommand,
              message: 'TV tidak merespon (timeout)',
              timeout: true
            });
          }

        } catch (error) {
          totalFailed++;
          console.error(`Error processing unit ${unitToken}:`, error.message);
          adbResults.push({
            token: unitToken,
            transaction_code: transaksi.code,
            success: false,
            message: error.message || "Command failed",
            error: error
          });
        }
      }
    }

    // 5. RESPON KEBERHASILAN
    return res.json({
      success: true,
      message: `Perintah Power TV selesai diproses.`,
      summary: {
        total_units: totalProcessed,
        success: totalSuccess,
        failed: totalFailed
      },
      adb_results: adbResults
    });

  } catch (error) {
    console.error("Error pada /time_out:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal saat memproses perintah.",
      error: error.message
    });
  }
});

// ...existing code...

router.get("/sleep", async (req, res) => {
  console.log('loop mode sleep');
  try {
    const adbResults = [];
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    const tvConnections = req.app.locals.tvConnections;
    const tvResponses = req.app.locals.tvResponses;

    const getAll = await sequelize.query(`
      SELECT b.ip_address, b.tv_id, c.command FROM units u 
      JOIN brandtv b ON b.id = u.brandtvid 
      JOIN codetv c ON c.id = b.codetvid 
      WHERE token NOT IN(
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
        const ws = tvConnections?.get(unit.tv_id);
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          console.log(`⚠️ TV ${unit.tv_id} tidak terhubung, skip...`);
          totalFailed++;
          adbResults.push({
            ip: unit.ip_address,
            tv_id: unit.tv_id,
            success: false,
            message: 'TV not connected'
          });
          continue;
        }

        // ✅ Kirim command via WebSocket dengan format yang benar
        console.log(`📤 Mengirim perintah Sleep ke TV ${unit.tv_id} (command: ${unit.command})`);
        ws.send(JSON.stringify({ 
          type: 'command', 
          tv_id: unit.tv_id,
          command: unit.command, // Gunakan command dari database
          target: 'sleep',
          timestamp: new Date().toISOString()
        }));

        // ✅ Tunggu response dari TV (dengan timeout)
        let tvResponse = null;
        const maxWaitTime = 5000; // 5 detik timeout
        const startWait = Date.now();
        
        while (Date.now() - startWait < maxWaitTime) {
          const response = tvResponses.get(unit.tv_id);
          
          if (response && response.command === unit.command) {
            tvResponse = response;
            console.log(`📥 Response diterima dari TV ${unit.tv_id}:`, tvResponse);
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // ✅ Evaluasi response
        if (tvResponse && tvResponse.status === 'success') {
          console.log(`✅ Sleep command berhasil untuk TV ${unit.tv_id}`);
          totalSuccess++;

          adbResults.push({
            ip: unit.ip_address,
            tv_id: unit.tv_id,
            success: true,
            message: 'Sleep command sent successfully',
            command: unit.command,
            command_status: tvResponse.status
          });

          // Clear response
          tvResponses.delete(unit.tv_id);

        } else if (tvResponse && (tvResponse.status === 'failed' || tvResponse.status === 'error')) {
          console.error(`❌ Sleep command gagal untuk TV ${unit.tv_id}: ${tvResponse.error}`);
          totalFailed++;

          adbResults.push({
            ip: unit.ip_address,
            tv_id: unit.tv_id,
            success: false,
            message: tvResponse.message,
            error: tvResponse.error
          });

        } else {
          // Timeout
          console.warn(`⚠️ TV ${unit.tv_id} tidak merespon dalam ${maxWaitTime}ms`);
          totalFailed++;

          adbResults.push({
            ip: unit.ip_address,
            tv_id: unit.tv_id,
            success: false,
            message: 'TV tidak merespon (timeout)',
            timeout: true
          });
        }

      } catch (error) {
        totalFailed++;
        console.error(`Error sending sleep command to ${unit.tv_id}:`, error);
        adbResults.push({
          success: false,
          ip: unit.ip_address,
          tv_id: unit.tv_id,
          message: error.message || "Command failed",
          error: error
        });
      }
    }

    return res.json({
      success: true,
      message: `Perintah Sleep TV selesai diproses.`,
      summary: {
        total_units: totalProcessed,
        success: totalSuccess,
        failed: totalFailed
      },
      adb_results: adbResults
    });

  } catch (error) {
    console.error('❌ Error in /sleep endpoint:', error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal saat memproses sleep.",
      error: error.message
    });
  }
});

// ✅ Kirim perintah ke TV tertentu via WebSocket
router.post('/tv/command', verifyToken, (req, res) => {
  const { tvId, command } = req.body;

  if (!tvId || !command) {
    return res.status(400).json({ 
      success: false,
      message: 'tvId and command are required' 
    });
  }

  // Ambil tvConnections dari app.locals
  const tvConnections = req.app.locals.tvConnections;
  
  if (!tvConnections) {
    return res.status(500).json({ 
      success: false,
      message: 'WebSocket connections not available' 
    });
  }

  const ws = tvConnections.get(tvId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ 
      success: false,
      message: 'TV not connected or unavailable',
      tvId 
    });
  }

  try {
    ws.send(JSON.stringify({ type: 'command', tvId, command }));
    console.log(`📤 Sent command ${command} to ${tvId}`);
    logInfo(`TV Command sent`, { tvId, command, userId: req.user?.userId });

    res.json({ 
      success: true, 
      message: `Command ${command} sent to ${tvId}`,
      data: { tvId, command }
    });
  } catch (error) {
    console.error(`Error sending command to ${tvId}:`, error);
    logError(error, req);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send command to TV',
      error: error.message
    });
  }
});

// ✅ Lihat semua TV yang aktif
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

    for (const [tvId, ws] of tvConnections.entries()) {
      const isConnected = ws.readyState === WebSocket.OPEN;
      const status = tvStatus[tvId];
      
      connectedTVs.push({
        id: tvId,
        connected: isConnected,
        lastPing: status?.lastPing || null,
        ipAddress: status?.ipAddress || null,
        lastSeenSecondsAgo: status?.lastPing ? 
          Math.floor((now - status.lastPing) / 1000) : null
      });
    }

    res.json({ 
      success: true,
      data: {
        connectedTVs,
        summary: {
          total: connectedTVs.length,
          connected: connectedTVs.filter(tv => tv.connected).length,
          disconnected: connectedTVs.filter(tv => !tv.connected).length
        }
      }
    });
  } catch (error) {
    console.error('Error getting active TVs:', error);
    logError(error, req);
    
    res.status(500).json({
      success: false,
      message: 'Failed to get active TVs',
      error: error.message
    });
  }
});

// ✅ TV status detail
router.get('/tv/status/:tvId', verifyToken, (req, res) => {
  const { tvId } = req.params;
  const tvConnections = req.app.locals.tvConnections;
  const tvStatus = req.app.locals.tvStatus;
  
  const ws = tvConnections?.get(tvId);
  const status = tvStatus?.[tvId];
  const now = new Date();
  
  if (!ws && !status) {
    return res.status(404).json({
      success: false,
      message: 'TV not found',
      tvId
    });
  }

  res.json({
    success: true,
    data: {
      tvId,
      connected: ws ? ws.readyState === WebSocket.OPEN : false,
      lastPing: status?.lastPing || null,
      ipAddress: status?.ipAddress || null,
      lastSeenSecondsAgo: status?.lastPing ? 
        Math.floor((now - status.lastPing) / 1000) : null,
      status: ws && ws.readyState === WebSocket.OPEN ? 'ONLINE' : 'OFFLINE'
    }
  });
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
