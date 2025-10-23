const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { exec } = require("child_process");

const router = express.Router();

// Import model cabang, users, dan access
let Transaksi, history_units, TransaksiDetail, Unit;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Transaksi = models.transaksi;
  history_units = models.history_units;
  TransaksiDetail = models.transaksi_detail;
  Unit = models.units;

  if (!Transaksi) {
    console.error('❌ Transaksi model not found in models');
  } else {
    console.log('✅ Transaksi model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading models:', error.message);
}

const executeAdbControl = (ip, adbCommand) => {
  return new Promise((resolve, reject) => {
    const fullAdbAddress = `${ip}:5555`;
    const connectCmd = `adb connect ${fullAdbAddress}`;

    exec(connectCmd, { timeout: 10000 }, (connectError, connectStdout, connectStderr) => {

      if (connectError || connectStderr.includes("unable to connect")) {
        console.log('❌ Connection failed');
        return reject({
          success: false,
          message: `❌ Gagal terhubung ke TV (${ip}).`,
          details: "Pastikan TV menyala, Network Debugging/ADB aktif, dan tidak terhalang firewall/VPN.",
          adb_output: connectStderr.trim() || connectStdout.trim()
        });
      }

      // 2. KONEKSI BERHASIL, jalankan PERINTAH KONTROL
      const controlCmd = `adb -s ${fullAdbAddress} ${adbCommand}`;

      exec(controlCmd, (controlError, controlStdout, controlStderr) => {
        // Opsional: Coba putuskan koneksi setelah selesai
        exec(`adb disconnect ${fullAdbAddress}`);

        if (controlError) {
          console.log('❌ Control command failed');
          return reject({
            success: false,
            message: `⚠️ Terhubung, tetapi perintah kontrol gagal dijalankan.`,
            error: controlStderr.trim(),
            command_executed: adbCommand
          });
        }

        console.log('✅ Control command success');
        // 3. KONTROL BERHASIL
        resolve({
          success: true,
          ip: ip,
          message: `✅ Perintah '${adbCommand}' berhasil dikirim ke TV.`,
          command_executed: adbCommand,
          output: controlStdout.trim()
        });
      });
    });
  });
};

// --- ENDPOINTS KHUSUS UNTUK KONTROL TV ---

router.get('/', (req, res) => {
  res.json({
    message: 'Billing PS API - ADB Control Endpoint is active.',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

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
              SELECT b.ip_address, c.command FROM units u 
              JOIN brandtv b ON b.id = u.brandtvid
              JOIN codetv c ON c.id = b.codetvid
              WHERE u.status = 1 AND c.desc = 'on/off' AND u.token = ?
            `, {
              replacements: [unitToken],
              type: sequelize.QueryTypes.SELECT,
            });
          } else {
            getIP = await sequelize.query(`
              SELECT b.ip_address, c.command FROM units u 
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

          // 4. JALANKAN KONTROL ADB
          console.log(`🔌 Mengirim perintah ADB ke ${unitData.ip_address} dengan command '${unitData.command}'`);
          const adbResult = await executeAdbControl(unitData.ip_address, unitData.command);

          // 5. UPDATE STATUS TRANSAKSI MENJADI 0 (SELESAI)
          await transaksi.update({
            status: 0,
          });

          console.log(`✅ Transaksi ${transaksi.code} berhasil diupdate status = 0`);
          totalSuccess++;

          adbResults.push({
            token: unitToken,
            transaction_code: transaksi.code,
            ip_address: unitData.ip_address,
            start_time: createdAt,
            total_hours: totalHours,
            end_time: endTime,
            transaction_updated: true,
            details_processed: group.allDetails.map(d => ({
              id: d.id,
              type: d.type,
              hours: d.hours,
              created_at: d.createdAt
            })),
            ...adbResult
          });

        } catch (error) {
          totalFailed++;
          console.error(`Error processing unit ${unitToken}:`, error.message);
          adbResults.push({
            token: unitToken,
            transaction_code: transaksi.code,
            success: false,
            message: error.message || "ADB command failed",
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

router.get("/sleep", async (req, res) => {
  console.log('loop mode sleep');
  try {
    const adbResults = [];
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    const getAll = await sequelize.query(`
          select b.ip_address, c.command  from units u 
          join brandtv b on b.id = u.brandtvid 
          join codetv c on c.id = b.codetvid 
          where token not in(
            select td.unit_token from transaksi t 
            join transaksi_detail td on td.code = t.code 
            where t.status = 1 and td.status = 1
            and td.unit_token is not null
          )
          and u.status = 1 and c.desc = 'play/pause'
          `, {
      type: sequelize.QueryTypes.SELECT
    })

    for (const transaksi of getAll) {
      totalProcessed++;
      try {
        console.log(`🔌 Mengirim perintah ADB ke ${transaksi.ip_address} dengan command '${transaksi.command}'`);
        const adbResult = await executeAdbControl(transaksi.ip_address, transaksi.command);
        console.log(`✅ ADB command executed successfully for ${transaksi.ip_address}`);
        totalSuccess++;

        adbResults.push({
          ip: transaksi.ip_address,
          ...adbResult
        });
      } catch (error) {
        totalFailed++;
        adbResults.push({
          success: false,
          ip: transaksi.ip_address,
          message: error.message || "ADB command failed",
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
    console.error('❌ Error in /time_out endpoint:', error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal saat memproses timeout.",
      error: error.message
    });
  }
});

router.get("/tv/:token/toggle_power", verifyToken, async (req, res) => {
  const { token } = req.params;

  try {
    // 1. Dapatkan Unit History
    const checkunit = await history_units.findOne({
      where: { token: token }
    });

    // 2. Tentukan dan Jalankan Query
    let getIP;

    if (!checkunit) {
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                JOIN codetv c ON c.id = b.codetvid
                WHERE u.status = 1 AND c.desc = 'on/off' AND u.token = ?
            `, {
        replacements: [token],
        type: sequelize.QueryTypes.SELECT,
      });
    } else {
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
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
      return res.status(404).json({
        success: false,
        message: "Unit atau Perintah Power (on/off) tidak ditemukan."
      });
    }

    const unitData = getIP[0];

    // 4. JALANKAN KONTROL ADB
    // Pastikan executeAdbControl menggunakan await karena ini adalah I/O
    const adbResult = await executeAdbControl(unitData.ip_address, unitData.command);

    // 5. RESPON KEBERHASILAN
    return res.json({
      success: true,
      message: "Perintah Power TV berhasil dikirim.",
      adb_result: adbResult
    });

  } catch (error) {
    console.error("Error pada /tv/:token/toggle_power:", error);

    // 6. RESPON KEGAGALAN SERVER/ADB
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal saat memproses perintah.",
      error: error.message
    });
  }
});

// Keycode 24: VOLUME_UP
router.get("/tv/:token/volume_up", verifyToken, async (req, res) => {
  const { token } = req.params;

  try {
    const checkunit = await history_units.findOne({
      where: { token: token }
    });

    let getIP;
    const commandDesc = 'volume_up';

    if (!checkunit) {
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                JOIN codetv c ON c.id = b.codetvid
                WHERE u.status = 1 AND c.desc = ? AND u.token = ?
            `, {
        replacements: [commandDesc, token], // Menggunakan commandDesc
        type: sequelize.QueryTypes.SELECT,
      });
    } else {
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                JOIN codetv c ON c.id = b.codetvid
                WHERE u.status = 1 AND c.desc = ? AND u.id = ?
            `, {
        replacements: [commandDesc, checkunit.unitid], // Menggunakan commandDesc
        type: sequelize.QueryTypes.SELECT
      });
    }

    // Penanganan Data Kosong
    if (!getIP || getIP.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Unit atau perintah 'volume_up' tidak ditemukan."
      });
    }

    const unitData = getIP[0];

    // Eksekusi ADB dan Menunggu Hasil
    const adbResult = await executeAdbControl(unitData.ip_address, unitData.command);

    // Response Sukses
    return res.json({
      success: true,
      message: "Perintah Volume Up berhasil dikirim.",
      adb_result: adbResult
    });

  } catch (error) {
    console.error("Error pada /tv/:token/volume_up:", error);

    // Response Gagal
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal saat menaikkan volume.",
      error: error.message
    });
  }
});

// Keycode 25: VOLUME_DOWN
router.get("/tv/:token/volume_down", verifyToken, async (req, res) => {
  const { token } = req.params;

  try {
    // PERHATIAN: Perbaikan token pada findOne
    const checkunit = await history_units.findOne({
      where: { token: token } // Menggunakan 'token' dari params, bukan unitTokens[0]
    });

    let getIP;
    const commandDesc = 'volume_down';

    if (!checkunit) {
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                JOIN codetv c ON c.id = b.codetvid
                WHERE u.status = 1 AND c.desc = ? AND u.token = ?
            `, {
        replacements: [commandDesc, token],
        type: sequelize.QueryTypes.SELECT,
      });
    } else {
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                JOIN codetv c ON c.id = b.codetvid
                WHERE u.status = 1 AND c.desc = ? AND u.id = ?
            `, {
        replacements: [commandDesc, checkunit.unitid],
        type: sequelize.QueryTypes.SELECT
      });
    }

    // Penanganan Data Kosong
    if (!getIP || getIP.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Unit atau perintah 'volume_down' tidak ditemukan."
      });
    }

    const unitData = getIP[0];
    const adbResult = await executeAdbControl(unitData.ip_address, unitData.command);

    return res.json({
      success: true,
      message: "Perintah Volume Down berhasil dikirim.",
      adb_result: adbResult
    });

  } catch (error) {
    console.error("Error pada /tv/:token/volume_down:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal saat menurunkan volume.",
      error: error.message
    });
  }
});

// Keycode 164: VOLUME_MUTE
router.get("/tv/:token/mute", verifyToken, async (req, res) => {
  const { token } = req.params;

  try {
    // PERHATIAN: Perbaikan token pada findOne
    const checkunit = await history_units.findOne({
      where: { token: token } // Menggunakan 'token' dari params, bukan unitTokens[0]
    });

    let getIP;
    const commandDesc = 'volume_mute';

    if (!checkunit) {
      // PERHATIAN: Hapus const yang berlebihan di sini
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                JOIN codetv c ON c.id = b.codetvid
                WHERE u.status = 1 AND c.desc = ? AND u.token = ?
            `, {
        replacements: [commandDesc, token],
        type: sequelize.QueryTypes.SELECT,
      });
    } else {
      getIP = await sequelize.query(`
                SELECT b.ip_address, c.command FROM units u 
                JOIN brandtv b ON b.id = u.brandtvid
                JOIN codetv c ON c.id = b.codetvid
                WHERE u.status = 1 AND c.desc = ? AND u.id = ?
            `, {
        replacements: [commandDesc, checkunit.unitid],
        type: sequelize.QueryTypes.SELECT
      });
    }

    // Penanganan Data Kosong
    if (!getIP || getIP.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Unit atau perintah 'volume_mute' tidak ditemukan."
      });
    }

    const unitData = getIP[0];
    const adbResult = await executeAdbControl(unitData.ip_address, unitData.command);

    return res.json({
      success: true,
      message: "Perintah Mute berhasil dikirim.",
      adb_result: adbResult
    });

  } catch (error) {
    console.error("Error pada /tv/:token/mute:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal saat memproses perintah mute.",
      error: error.message
    });
  }
});

module.exports = router;
