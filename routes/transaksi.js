const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { logError, logInfo } = require('../middleware/logger');
const WebSocket = require('ws');

const router = express.Router();

// Import models
let Transaksi, TransaksiDetail, Member, Unit, Promo, Produk, Access, HistoryProduk, HistoryUnits;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Transaksi = models.transaksi;
  TransaksiDetail = models.transaksi_detail;
  Member = models.member;
  Unit = models.units;
  Promo = models.promo;
  Produk = models.produk;
  Access = models.access;
  HistoryProduk = models.history_produk;
  HistoryUnits = models.history_units;

  if (!Transaksi || !TransaksiDetail) {
    console.error('❌ Transaksi models not found');
  } else {
    console.log('✅ Transaksi models loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading transaksi models:', error.message);
}

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
          // Command tidak match
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
        
        if (response) {
          console.warn(`   ⚠️ Response ada tapi command tidak match (${response.command} vs ${expectedCommand})`);
        }
        
        resolve(null); // Timeout
      }
    }, 100); // Check setiap 100ms
  });
};

// ✅ IMPROVED: Send command to TV with error handling
const sendTVCommand = async (ws, tvId, command, target = 'control') => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(`TV ${tvId} tidak terhubung`);
  }

  try {
    // ✅ Format payload dengan tv_id (snake_case) untuk compatibility
    const payload = {
      type: 'command',
      tv_id: String(tvId),  // ✅ Primary field: snake_case
      tvId: String(tvId),   // ✅ Backup field: camelCase
      command: parseInt(command),
      target: String(target),
      timestamp: new Date().toISOString()
    };

    // ✅ Log payload sebelum dikirim
    console.log(`📤 Sending payload to TV ${tvId}:`, JSON.stringify(payload));
    
    const jsonString = JSON.stringify(payload);
    
    // ✅ Tambahkan error callback
    ws.send(jsonString, (error) => {
      if (error) {
        console.error(`❌ WebSocket send error for TV ${tvId}:`, error);
      }
    });
    
    console.log(`✅ Command ${command} sent to TV ${tvId}`);
    logInfo('TV command sent', { tvId, command, target, payloadSent: payload });
    
    return true;
  } catch (error) {
    console.error(`❌ Error sending command to TV ${tvId}:`, error);
    console.error('Error details:', {
      tvId,
      command,
      target,
      wsReadyState: ws?.readyState,
      errorMessage: error.message,
      errorStack: error.stack
    });
    logError(error, null, { tvId, command });
    throw error;
  }
};

// Generate transaction code with sequential number
const generateTransactionCode = async () => {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), 31, 23, 59, 59);

  try {
    const todayTransactionCount = await Transaksi.count({
      where: {
        createdAt: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    });

    const sequentialNumber = (todayTransactionCount + 1).toString().padStart(4, '0');
    return `TRX${year}${month}${sequentialNumber}`;
  } catch (error) {
    console.error('Error generating transaction code:', error);
    const timestamp = Date.now().toString().slice(-3);
    return `TRX${year}${month}${timestamp}`;
  }
};

const groupItemsByToken = (items) => {
  return Object.values(
    items.reduce((acc, item) => {
      const key = item.token;
      
      if (!acc[key]) {
        acc[key] = { ...item };
      } else {
        acc[key].quantity += item.quantity;
        
        if (item.hours !== undefined) {
          acc[key].hours = (acc[key].hours || 0) + item.hours;
        }
        
        acc[key].total += item.total;
        acc[key].price = acc[key].total;
        
        if (acc[key].promo_detail && item.promo_detail) {
          const currentDiscount = parseFloat(acc[key].promo_detail.discount_nominal) || 0;
          const newDiscount = parseFloat(item.promo_detail.discount_nominal) || 0;
          acc[key].promo_detail.discount_nominal = currentDiscount + newDiscount;
          
          if (item.promo_detail.hours !== undefined) {
            acc[key].promo_detail.hours = (acc[key].promo_detail.hours || 0) + item.promo_detail.hours;
          }
        }
      }
      
      return acc;
    }, {})
  );
};

// Get all transactions (protected)
router.post('/', verifyToken, async (req, res) => {
  const dbTransaction = await sequelize.transaction();

  try {
    if (!Transaksi || !TransaksiDetail) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi models not available'
      });
    }

    const {
      memberid,
      cabang_id,
      customer_name,
      customer_phone,
      total_price,
      rental_price,
      status = '1',
      products,
      unit_token,
      promo_token,
      duration
    } = req.body;

    // ✅ Get WebSocket connections
    const tvConnections = req.app.locals.tvConnections;
    const tvResponses = req.app.locals.tvResponses;

    if (!tvConnections || !tvResponses) {
      await dbTransaction.rollback();
      return res.status(500).json({
        success: false,
        message: 'WebSocket services not available'
      });
    }

    // Validation
    if (!customer_name) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Customer name is required'
      });
    }

    // Cek unit sedang digunakan
    const _unit = await sequelize.query(`
      SELECT * FROM transaksi_detail td
      JOIN transaksi t ON t.code = td.code
      WHERE td.unit_token = :unit_token
      AND t.status = 1
    `, {
      replacements: { unit_token },
      type: sequelize.QueryTypes.SELECT,
    });

    if (_unit.length > 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Unit/PS sedang digunakan'
      });
    }

    const _promo = promo_token ? await Promo.findOne({
      where: { token: promo_token, status: 1 }
    }) : null;

    // Validate member if provided
    if (memberid && Member) {
      const member = await Member.findOne({
        where: { id: parseInt(memberid), status: 1 }
      });

      if (!member) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid member ID or member is inactive'
        });
      }
    }

    // Generate transaction code
    let transactionCode;
    let codeExists = true;
    let attempts = 0;

    while (codeExists && attempts < 10) {
      transactionCode = await generateTransactionCode();
      const existing = await Transaksi.findOne({
        where: { code: transactionCode }
      });
      codeExists = !!existing;
      attempts++;

      if (codeExists) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    if (codeExists) {
      await dbTransaction.rollback();
      return res.status(500).json({
        success: false,
        message: 'Failed to generate unique transaction code'
      });
    }

    // Create main transaction
    const newTransaction = await Transaksi.create({
      code: transactionCode,
      memberid: memberid ? parseInt(memberid) : null,
      customer: customer_name || null,
      telepon: customer_phone || null,
      cabangid: cabang_id ? parseInt(cabang_id) : null,
      qty: 1,
      grandtotal: total_price ? total_price.toString() : '0',
      status: 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    }, { transaction: dbTransaction });

    // Create product details
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      const check = await Produk.findOne({
        where: { token: product.product_token }
      });

      if (check.stok < product.quantity) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product ${i} is out of stock`
        });
      }

      await check.update({ 
        stok: check.stok - product.quantity 
      }, { transaction: dbTransaction });

      const productData = {
        code: transactionCode,
        name: product.name,
        produk_token: product.product_token ?? null,
        qty: product.quantity ? parseInt(product.quantity) : null,
        harga: product.price ? parseInt(product.price) : 0,
        total: parseInt(product.price) * parseInt(product.quantity),
        status: 1,
        created_by: req.user?.userId || null,
        updated_by: req.user?.userId || null
      };

      await TransaksiDetail.create(productData, { transaction: dbTransaction });
    }

    // Create rental detail
    const rentalData = {
      code: transactionCode,
      name: promo_token ? _promo.name : null,
      promo_token: promo_token ?? null,
      unit_token: unit_token ?? null,
      hours: duration ? parseInt(duration) : null,
      harga: rental_price ? parseInt(rental_price) : 0,
      total: rental_price ? parseInt(rental_price) : 0,
      status: 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    };

    await TransaksiDetail.create(rentalData, { transaction: dbTransaction });

    // ✅ WEBSOCKET CONTROL - POWER ON TV
    console.log('Getting TV info for unit token:', unit_token);
    const getTV = await sequelize.query(`
      SELECT b.tv_id FROM units u 
      JOIN brandtv b ON b.id = u.brandtvid
      WHERE u.status = 1 AND u.token = ?
    `, {
      replacements: [unit_token],
      type: sequelize.QueryTypes.SELECT,
    });

    if (!getTV || getTV.length === 0) {
      await dbTransaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'TV configuration not found for this unit'
      });
    }

    const tvInfo = getTV[0];
    const ws = tvConnections.get(tvInfo.tv_id);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      await dbTransaction.rollback();
      return res.status(503).json({
        success: false,
        message: `TV ${tvInfo.tv_id} tidak terhubung`,
        debug: {
          tv_id: tvInfo.tv_id,
          wsExists: !!ws,
          wsReadyState: ws?.readyState
        }
      });
    }

    console.log(`Sending POWER ON command to TV: ${tvInfo.tv_id}, command: 224`);

    try {
      // ✅ PERBAIKAN: Clear old response sebelum kirim command baru
      if (tvResponses.has(tvInfo.tv_id)) {
        console.log(`🧹 Clearing old response for TV ${tvInfo.tv_id}`);
        tvResponses.delete(tvInfo.tv_id);
      }

      // ✅ Kirim command
      await sendTVCommand(ws, tvInfo.tv_id, 224, 'power_on');

      // ✅ Tunggu response (Promise-based, non-blocking)
      console.log(`⏳ Menunggu response dari TV ${tvInfo.tv_id}...`);
      const tvResponse = await waitForTVResponse(
        tvResponses, 
        tvInfo.tv_id, 
        224, 
        10000 // 10 detik timeout
      );

      // ✅ PERBAIKAN: Evaluasi response dengan handling lengkap
      if (tvResponse) {
        // Clear response setelah digunakan
        tvResponses.delete(tvInfo.tv_id);

        if (tvResponse.status === 'success') {
          console.log(`✅ TV ${tvInfo.tv_id} berhasil dinyalakan`);

          // WebSocket berhasil, commit transaksi
          await dbTransaction.commit();

          // Fetch complete transaction
          const includeOptions = [
            {
              model: TransaksiDetail,
              as: 'details',
              required: false,
              include: [
                { model: Unit, as: 'unit', required: false },
                { model: Promo, as: 'promo', required: false },
                { model: Produk, as: 'produk', required: false }
              ]
            }
          ];

          const trx = await Transaksi.findOne({
            where: { code: transactionCode },
            include: includeOptions
          });

          const mappedData = {
            code: trx.code,
            memberid: trx.memberid,
            customer: trx.customer,
            telepon: trx.telepon,
            grandtotal: trx.grandtotal,
            cabangid: trx.cabangid,
            status: trx.status,
            created_by: trx.created_by,
            updated_by: trx.updated_by,
            createdAt: trx.createdAt,
            updatedAt: trx.updatedAt,
            produk: (trx.details || [])
              .filter(d => d.produk)
              .map(d => ({
                product_id: d.id,
                token: d.produk_token || d.token || null,
                name: d.produk?.name || d.name,
                quantity: d.qty || d.quantity || 1,
                price: d.harga || d.price || 0,
                total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
                produk_detail: d.produk
              })),
            unit: (trx.details || [])
              .filter(d => d.unit)
              .map(d => ({
                unit_id: d.id,
                token: d.unit_token || d.token || null,
                name: d.unit?.name || d.name,
                quantity: d.qty || d.quantity || 1,
                hours: d.hours || 1,
                price: d.harga || d.price || 0,
                total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
                unit_detail: d.unit
              })),
            promo: (trx.details || [])
              .filter(d => d.promo)
              .map(d => ({
                promo_id: d.id,
                token: d.promo_token || d.token || null,
                name: d.promo?.name || d.name,
                quantity: d.qty || d.quantity || 1,
                price: d.harga || d.price || 0,
                total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
                promo_detail: d.promo
              }))
          };

          return res.status(201).json({
            success: true,
            message: 'Transaction created successfully and TV turned on',
            data: mappedData,
            ws_result: {
              tv_id: tvInfo.tv_id,
              command: 224,
              command_status: tvResponse.status,
              response_time_ms: tvResponse.receivedAt ? 
                new Date(tvResponse.receivedAt) - new Date(tvResponse.timestamp) : null,
              timestamp: tvResponse.timestamp
            }
          });

        } else if (tvResponse.status === 'failed' || tvResponse.status === 'error') {
          await dbTransaction.rollback();
          console.error(`❌ TV ${tvInfo.tv_id} gagal eksekusi: ${tvResponse.error}`);
          
          return res.status(503).json({
            success: false,
            message: `Transaction cancelled - TV control failed`,
            error: {
              tv_id: tvInfo.tv_id,
              command: 224,
              command_status: tvResponse.status,
              message: tvResponse.message || 'Command execution failed',
              error: tvResponse.error,
              timestamp: tvResponse.timestamp
            }
          });
        }
      } else {
        // ✅ PERBAIKAN: Timeout handling
        await dbTransaction.rollback();
        console.warn(`⏱️ TV ${tvInfo.tv_id} tidak merespon dalam 10 detik`);
        
        return res.status(408).json({
          success: false,
          message: 'Transaction cancelled - TV tidak merespon (timeout)',
          error: {
            tv_id: tvInfo.tv_id,
            command: 224,
            timeout: true,
            waited_ms: 10000
          }
        });
      }

    } catch (wsError) {
      await dbTransaction.rollback();
      console.error('WebSocket error during TV control:', wsError);
      
      return res.status(503).json({
        success: false,
        message: 'Transaction cancelled - Failed to control TV',
        error: {
          tv_id: tvInfo.tv_id,
          message: wsError.message,
          stack: process.env.NODE_ENV === 'development' ? wsError.stack : undefined
        }
      });
    }

  } catch (error) {
    try {
      await dbTransaction.rollback();
      console.log('Transaction rolled back due to error:', error.message || error);
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }

    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get unit/PS statistics
router.get('/stats/units', verifyToken, async (req, res) => {
  try {
    if (!Transaksi || !Unit) {
      return res.status(500).json({
        success: false,
        message: 'Required models not available'
      });
    }

    let cabangaccess = [];

    const _access = await Access.findAll({
      where: {
        userId: req.user.userId
      }
    });

    for (const __access of _access) {
      cabangaccess.push(__access.cabangid);
    }

    // 1. PS Ready - unit yang tidak sedang dipakai (token not in active transactions)
    const psReadyResult = await sequelize.query(`
      SELECT COUNT(*) as count FROM units u 
      WHERE u.status = 1 
      AND u.cabangid IN (:cabangaccess)
      AND u.token NOT IN (
        SELECT DISTINCT td.unit_token FROM transaksi t 
        JOIN transaksi_detail td ON td.code = t.code 
        WHERE t.status = 1 AND td.unit_token IS NOT NULL
      )
    `, {
      replacements: { cabangaccess },
      type: sequelize.QueryTypes.SELECT
    });

    // 2. PS Dipakai - unit yang sedang digunakan dalam transaksi aktif
    const psDipakaiResult = await sequelize.query(`
      SELECT COUNT(DISTINCT u.token) as count FROM units u 
      JOIN transaksi_detail td ON td.unit_token = u.token 
      JOIN transaksi t ON t.code = td.code 
      AND u.cabangid IN (:cabangaccess)
      WHERE t.status = 1 AND u.status = 1
    `, {
      replacements: { cabangaccess },
      type: sequelize.QueryTypes.SELECT
    });

    // 3. Total PS - semua unit yang aktif
    const totalPsResult = await sequelize.query(`
      SELECT COUNT(*) as count FROM units u 
      WHERE u.status = 1
      AND u.cabangid IN (:cabangaccess)
    `, {
      replacements: { cabangaccess },
      type: sequelize.QueryTypes.SELECT
    });

    // 4. PS yang akan selesai - unit dengan waktu habis dalam 30 menit ke depan
    const psAkanSelesaiResult = await sequelize.query(`
      SELECT COUNT(DISTINCT u.token) as count FROM units u 
      JOIN transaksi_detail td ON td.unit_token = u.token 
      JOIN transaksi t ON t.code = td.code 
      WHERE t.status = 1 
      AND u.status = 1
      AND u.cabangid IN (:cabangaccess)
      AND DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) <= DATE_ADD(NOW(), INTERVAL 30 MINUTE)
      AND DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) > NOW()
    `, {
      type: sequelize.QueryTypes.SELECT,
      replacements: { cabangaccess }
    });

    // 5. PS yang sudah timeout (lewat waktu tapi transaksi masih aktif)
    const psTimeoutResult = await sequelize.query(`
      SELECT COUNT(DISTINCT u.token) as count FROM units u 
      JOIN transaksi_detail td ON td.unit_token = u.token 
      JOIN transaksi t ON t.code = td.code 
      WHERE t.status = 1 
      AND u.cabangid IN (:cabangaccess)
      AND u.status = 1
      AND DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) < NOW()
    `, {
      type: sequelize.QueryTypes.SELECT,
      replacements: { cabangaccess }
    });

    const psReady = psReadyResult[0]?.count || 0;
    const psDipakai = psDipakaiResult[0]?.count || 0;
    const totalPs = totalPsResult[0]?.count || 0;
    const psAkanSelesai = psAkanSelesaiResult[0]?.count || 0;
    const psTimeout = psTimeoutResult[0]?.count || 0;

    res.json({
      success: true,
      data: {
        ps_ready: parseInt(psReady),           // PS yang siap digunakan
        ps_dipakai: parseInt(psDipakai),       // PS yang sedang digunakan
        ps_akan_selesai: parseInt(psAkanSelesai), // PS yang akan selesai dalam 30 menit
        // ps_timeout: parseInt(psTimeout),        // PS yang sudah lewat waktu
        total_ps: parseInt(totalPs),           // Total PS aktif
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get unit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get detailed list of units by status
router.get('/stats/units/detail', verifyToken, async (req, res) => {
  try {
    const { type = 'ready' } = req.query; // ready, dipakai, akan_selesai, timeout

    let query = '';
    let replacements = [];

    switch (type) {
      case 'ready':
        query = `
          SELECT u.id, u.token, u.name, u.status 
          FROM units u 
          WHERE u.status = 1 
          AND u.token NOT IN (
            SELECT DISTINCT td.unit_token FROM transaksi t 
            JOIN transaksi_detail td ON td.code = t.code 
            WHERE t.status = 1 AND td.unit_token IS NOT NULL
          )
          ORDER BY u.name
        `;
        break;

      case 'dipakai':
        query = `
          SELECT DISTINCT u.id, u.token, u.name, u.status,
                 t.code as transaction_code, t.customer, t.telepon,
                 td.hours, td.createdAt as start_time,
                 DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) as end_time,
                 TIMESTAMPDIFF(MINUTE, NOW(), DATE_ADD(td.createdAt, INTERVAL td.hours HOUR)) as remaining_minutes
          FROM units u 
          JOIN transaksi_detail td ON td.unit_token = u.token 
          JOIN transaksi t ON t.code = td.code 
          WHERE t.status = 1 AND u.status = 1
          ORDER BY end_time ASC
        `;
        break;

      case 'akan_selesai':
        query = `
          SELECT DISTINCT u.id, u.token, u.name, u.status,
                 t.code as transaction_code, t.customer, t.telepon,
                 td.hours, td.createdAt as start_time,
                 DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) as end_time,
                 TIMESTAMPDIFF(MINUTE, NOW(), DATE_ADD(td.createdAt, INTERVAL td.hours HOUR)) as remaining_minutes
          FROM units u 
          JOIN transaksi_detail td ON td.unit_token = u.token 
          JOIN transaksi t ON t.code = td.code 
          WHERE t.status = 1 AND u.status = 1
          AND DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) <= DATE_ADD(NOW(), INTERVAL 30 MINUTE)
          AND DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) > NOW()
          ORDER BY end_time ASC
        `;
        break;

      case 'timeout':
        query = `
          SELECT DISTINCT u.id, u.token, u.name, u.status,
                 t.code as transaction_code, t.customer, t.telepon,
                 td.hours, td.createdAt as start_time,
                 DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) as end_time,
                 TIMESTAMPDIFF(MINUTE, DATE_ADD(td.createdAt, INTERVAL td.hours HOUR), NOW()) as overtime_minutes
          FROM units u 
          JOIN transaksi_detail td ON td.unit_token = u.token 
          JOIN transaksi t ON t.code = td.code 
          WHERE t.status = 1 AND u.status = 1
          AND DATE_ADD(td.createdAt, INTERVAL td.hours HOUR) < NOW()
          ORDER BY end_time ASC
        `;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid type parameter. Use: ready, dipakai, akan_selesai, timeout'
        });
    }

    const result = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: result,
      type: type,
      count: result.length
    });

  } catch (error) {
    console.error('Get unit detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get transaction by code (protected)
router.get('/:code', verifyToken, async (req, res) => {
  try {
    if (!Transaksi || !TransaksiDetail) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi models not available'
      });
    }

    const { code } = req.params;
    const includeOptions = [
      {
        model: TransaksiDetail,
        as: 'details',
        required: false,
        where: { status: 1 },
        include: [
          {
            model: Unit,
            as: 'unit', // pastikan alias sesuai relasi di init-models.js
            required: false
          },
          {
            model: Promo,
            as: 'promo', // pastikan alias sesuai relasi di init-models.js
            required: false
          },
          {
            model: Produk,
            as: 'produk', // pastikan alias sesuai relasi di init-models.js
            required: false
          }
        ]
      }
    ];

    const trx = await Transaksi.findOne({
      where: { code: code },
      include: includeOptions
    });

    const mappedData = {
      code: trx.code,
      memberid: trx.memberid,
      customer: trx.customer,
      telepon: trx.telepon,
      grandtotal: trx.grandtotal,
      cabangid: trx.cabangid,
      status: trx.status,
      created_by: trx.created_by,
      updated_by: trx.updated_by,
      createdAt: trx.createdAt,
      updatedAt: trx.updatedAt,
      produk: (trx.details || [])
        .filter(d => d.produk)
        .map(d => ({
          product_id: d.id,
          type: d.type,
          token: d.produk_token || d.token || null,
          name: d.produk?.name || d.name,
          quantity: d.qty || d.quantity || 1,
          price: d.harga || d.price || 0,
          total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
          produk_detail: d.produk
        })),
      unit: (trx.details || [])
        .filter(d => d.unit)
        .map(d => ({
          unit_id: d.id,
          type: d.type,
          token: d.unit_token || d.token || null,
          name: d.unit?.name || d.name,
          quantity: d.qty || d.quantity || 1,
          hours: d.hours || 1,
          price: d.harga || d.price || 0,
          total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
          unit_detail: d.unit
        })),
      promo: (trx.details || [])
        .filter(d => d.promo)
        .map(d => ({
          promo_id: d.id,
          type: d.type,
          token: d.promo_token || d.token || null,
          name: d.promo?.name || d.name,
          quantity: d.qty || d.quantity || 1,
          price: d.harga || d.price || 0,
          total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
          promo_detail: d.promo
        }))
    };

    res.status(200).json({
      success: true,
      message: 'Transaction fetched successfully',
      data: mappedData
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.delete('/deleteproduk/:id', verifyToken, async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid detail transaction ID is required'
      });
    }

    // Cari detail transaksi berdasarkan ID
    const detail = await TransaksiDetail.findOne({
      where: { id: parseInt(id) },
      transaction: dbTransaction
    });

    if (!detail) {
      await dbTransaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Transaction detail not found'
      });
    }

    // Cek apakah detail sudah dihapus sebelumnya
    if (detail.status === 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction detail already deleted'
      });
    }

    // Update status detail menjadi 0 (soft delete)
    await detail.update({
      status: 0,
      updated_by: req.user?.userId || null
    }, { transaction: dbTransaction });

    // Hitung ulang grandtotal (hanya detail dengan status = 1)
    const totalResult = await sequelize.query(`
      SELECT SUM(harga * qty) as total_harga 
      FROM transaksi_detail 
      WHERE code = ? AND status = 1
    `, {
      replacements: [detail.code],
      type: sequelize.QueryTypes.SELECT,
      transaction: dbTransaction
    });

    const newGrandTotal = totalResult[0]?.total_harga || 0;

    const historyproduk = await HistoryProduk.findOne({
      where: { token: detail.produk_token }
    });

    if (historyproduk) {
      const produk = await Produk.findOne({
        where: { id: historyproduk.produkid }
      });

      if (produk) {
        await produk.update({
          stok: produk.stok + detail.qty
        }, {
          transaction: dbTransaction
        });
      }
    } else {
      const produk = await Produk.findOne({
        where: { token: detail.produk_token }
      });

      if (produk) {
        await produk.update({
          stok: produk.stok + detail.qty
        }, {
          transaction: dbTransaction
        });
      }
    }

    // Update grandtotal di transaksi utama
    await Transaksi.update({
      grandtotal: newGrandTotal.toString(),
      updated_by: req.user?.userId || null
    }, {
      where: { code: detail.code },
      transaction: dbTransaction
    });

    await dbTransaction.commit();

    res.json({
      success: true,
      message: 'Product deleted successfully and grandtotal updated',
      data: {
        deleted_detail_id: parseInt(id),
        transaction_code: detail.code,
        new_grandtotal: newGrandTotal
      }
    });

  } catch (error) {
    try { await dbTransaction.rollback(); } catch { }
    console.error('Delete produk from detail_transaksi error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/report', verifyToken, async (req, res) => {
  try {
        const { startDate, endDate, cabangId, consoleId, operationalHours = 16 } = req.query;
        
        let whereConditions = `
            td.status = 1
            AND td.unit_token IS NOT NULL
            AND td.produk_token IS NULL
        `;

        const replacements = {};

        if (startDate && endDate) {
            whereConditions += ` AND DATE(td.createdAt) BETWEEN :startDate AND :endDate`;
            replacements.startDate = startDate;
            replacements.endDate = endDate;
        }

        if (consoleId) {
            whereConditions += ` AND td.unit_token = :consoleId`;
            replacements.consoleId = consoleId;
        }

        if (cabangId) {
            whereConditions += ` AND t.cabangid = :cabangId`;
            replacements.cabangId = cabangId;
        }

        const results = await sequelize.query(`
            SELECT 
                hu.name as consoleName,
                hu.unitid as consoleId,
                t.cabangid as cabangId,
                td.unit_token as unit_token,
                td.harga as pricePerHour,
                DATE(td.createdAt) as date,
                SUM(td.hours) as hours,
                COUNT(td.id) as transactions,
                SUM(td.total) as revenue
            FROM transaksi_detail td
            JOIN history_units hu ON hu.token = td.unit_token
            JOIN transaksi t ON t.code = td.code
            WHERE ${whereConditions}
            GROUP BY td.unit_token, td.harga, hu.name, hu.unitid, t.cabangid, DATE(td.createdAt)
            ORDER BY hu.name, td.harga, DATE(td.createdAt)
        `, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Transform data
        const consoleMap = new Map();

        results.forEach(row => {
            const key = `${row.unit_token}_${row.pricePerHour}`;
            
            if (!consoleMap.has(key)) {
                consoleMap.set(key, {
                    consoleName: row.consoleName,
                    consoleId: row.consoleId,
                    cabangId: row.cabangId,
                    totalHours: 0,
                    totalTransactions: 0,
                    totalRevenue: 0,
                    averageHours: 0,
                    pricePerHour: parseInt(row.pricePerHour),
                    utilization: 0,
                    rentalData: []
                });
            }

            const console = consoleMap.get(key);
            const hours = parseInt(row.hours) || 0;
            const transactions = parseInt(row.transactions) || 0;
            const revenue = parseInt(row.revenue) || 0;

            console.totalHours += hours;
            console.totalTransactions += transactions;
            console.totalRevenue += revenue;
            
            console.rentalData.push({
                date: row.date,
                hours: hours,
                transactions: transactions,
                revenue: revenue
            });
        });

        // Calculate metrics
        const maxHoursPerDay = parseInt(operationalHours);
        const reportData = Array.from(consoleMap.values()).map(console => {
            // Average hours per transaction
            console.averageHours = console.totalTransactions > 0 
                ? parseFloat((console.totalHours / console.totalTransactions).toFixed(2))
                : 0;

            // Utilization based on operational hours
            const totalDays = console.rentalData.length;
            const maxPossibleHours = totalDays * maxHoursPerDay;
            console.utilization = maxPossibleHours > 0
                ? Math.round((console.totalHours / maxPossibleHours) * 100)
                : 0;

            return console;
        });

        res.json({
            success: true,
            data: reportData,
            meta: {
                operationalHoursPerDay: maxHoursPerDay,
                totalConsoles: reportData.length
            }
        });

    } catch (error) {
        console.error('Error generating console rental report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating console rental report',
            error: error.message
        });
    }
})

router.post('/addproduk', verifyToken, async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { code, products } = req.body;

    if (!code || !products || !Array.isArray(products) || products.length === 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction code and products array are required'
      });
    }

    // Cek transaksi utama
    const trx = await Transaksi.findOne({
      where: { code },
      transaction: dbTransaction // tambahkan transaction
    });
    if (!trx) {
      await dbTransaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // cek stock
    const stock = await Produk.findOne({
      where: { token: products[0].produk_token },
    });

    if (stock.stok < products[0].quantity) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Stok tidak mencukupi'
      });
    }

    const createdDetails = [];
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      // Validasi minimal: nama produk
      if (!product.name) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product at index ${i} is missing required field: name`
        });
      }

      const detailData = {
        code,
        type: 1,
        name: product.name,
        produk_token: product.produk_token ?? null,
        qty: product.quantity ? parseInt(product.quantity) : 1,
        harga: product.price ? parseInt(product.price) : 0,
        total: parseInt(product.price) * parseInt(product.quantity),
        status: 1,
        created_by: req.user?.userId || null,
        updated_by: req.user?.userId || null
      };

      const createdDetail = await TransaksiDetail.create(detailData, { transaction: dbTransaction });
      createdDetails.push(createdDetail);
    }

    // === Perbaikan: Gunakan raw query dengan transaction ===
    const totalResult = await sequelize.query(`
      SELECT SUM(harga * qty) as total_harga 
      FROM transaksi_detail 
      WHERE code = ?
      AND status = 1
    `, {
      replacements: [code],
      type: sequelize.QueryTypes.SELECT,
      transaction: dbTransaction // penting: gunakan transaction
    });

    const newGrandTotal = totalResult[0]?.total_harga || 0;

    // Update transaksi utama
    await trx.update({
      grandtotal: newGrandTotal.toString()
    }, {
      transaction: dbTransaction
    });

    // update stok produk
    await Produk.update({
      stok: stock.stok - products[0].quantity
    }, {
      where: { token: products[0].produk_token },
      transaction: dbTransaction
    });

    await dbTransaction.commit();

    // Ambil detail yang baru saja ditambahkan (beserta relasi jika perlu)
    const detailIds = createdDetails.map(d => d.id);
    const newDetails = await TransaksiDetail.findAll({
      where: { id: { [Op.in]: detailIds } },
      include: [
        { model: Produk, as: 'produk', required: false },
        { model: Unit, as: 'unit', required: false },
        { model: Promo, as: 'promo', required: false }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Produk berhasil ditambahkan ke detail transaksi dan grandtotal diupdate',
      data: newDetails,
      grandtotal: newGrandTotal
    });
  } catch (error) {
    try { await dbTransaction.rollback(); } catch { }
    console.error('Add produk to detail_transaksi error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new transaction with WebSocket control
router.post('/', verifyToken, async (req, res) => {
  const dbTransaction = await sequelize.transaction();

  try {
    if (!Transaksi || !TransaksiDetail) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi models not available'
      });
    }

    const {
      memberid,
      cabang_id,
      customer_name,
      customer_phone,
      total_price,
      rental_price,
      status = '1',
      products,
      unit_token,
      promo_token,
      duration
    } = req.body;

    // ✅ Get WebSocket connections
    const tvConnections = req.app.locals.tvConnections;
    const tvResponses = req.app.locals.tvResponses;

    if (!tvConnections || !tvResponses) {
      await dbTransaction.rollback();
      return res.status(500).json({
        success: false,
        message: 'WebSocket services not available'
      });
    }

    // Validation
    if (!customer_name) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Customer name is required'
      });
    }

    // Cek unit sedang digunakan
    const _unit = await sequelize.query(`
      SELECT * FROM transaksi_detail td
      JOIN transaksi t ON t.code = td.code
      WHERE td.unit_token = :unit_token
      AND t.status = 1
    `, {
      replacements: { unit_token },
      type: sequelize.QueryTypes.SELECT,
    });

    if (_unit.length > 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Unit/PS sedang digunakan'
      });
    }

    const _promo = promo_token ? await Promo.findOne({
      where: { token: promo_token, status: 1 }
    }) : null;

    // Validate member if provided
    if (memberid && Member) {
      const member = await Member.findOne({
        where: { id: parseInt(memberid), status: 1 }
      });

      if (!member) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid member ID or member is inactive'
        });
      }
    }

    // Generate transaction code
    let transactionCode;
    let codeExists = true;
    let attempts = 0;

    while (codeExists && attempts < 10) {
      transactionCode = await generateTransactionCode();
      const existing = await Transaksi.findOne({
        where: { code: transactionCode }
      });
      codeExists = !!existing;
      attempts++;

      if (codeExists) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    if (codeExists) {
      await dbTransaction.rollback();
      return res.status(500).json({
        success: false,
        message: 'Failed to generate unique transaction code'
      });
    }

    // Create main transaction
    const newTransaction = await Transaksi.create({
      code: transactionCode,
      memberid: memberid ? parseInt(memberid) : null,
      customer: customer_name || null,
      telepon: customer_phone || null,
      cabangid: cabang_id ? parseInt(cabang_id) : null,
      qty: 1,
      grandtotal: total_price ? total_price.toString() : '0',
      status: 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    }, { transaction: dbTransaction });

    // Create product details
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      const check = await Produk.findOne({
        where: { token: product.product_token }
      });

      if (check.stok < product.quantity) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product ${i} is out of stock`
        });
      }

      await check.update({ 
        stok: check.stok - product.quantity 
      }, { transaction: dbTransaction });

      const productData = {
        code: transactionCode,
        name: product.name,
        produk_token: product.product_token ?? null,
        qty: product.quantity ? parseInt(product.quantity) : null,
        harga: product.price ? parseInt(product.price) : 0,
        total: parseInt(product.price) * parseInt(product.quantity),
        status: 1,
        created_by: req.user?.userId || null,
        updated_by: req.user?.userId || null
      };

      await TransaksiDetail.create(productData, { transaction: dbTransaction });
    }

    // Create rental detail
    const rentalData = {
      code: transactionCode,
      name: promo_token ? _promo.name : null,
      promo_token: promo_token ?? null,
      unit_token: unit_token ?? null,
      hours: duration ? parseInt(duration) : null,
      harga: rental_price ? parseInt(rental_price) : 0,
      total: rental_price ? parseInt(rental_price) : 0,
      status: 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    };

    await TransaksiDetail.create(rentalData, { transaction: dbTransaction });

    // ✅ WEBSOCKET CONTROL - POWER ON TV
    console.log('Getting TV info for unit token:', unit_token);
    const getTV = await sequelize.query(`
      SELECT b.tv_id FROM units u 
      JOIN brandtv b ON b.id = u.brandtvid
      WHERE u.status = 1 AND u.token = ?
    `, {
      replacements: [unit_token],
      type: sequelize.QueryTypes.SELECT,
    });

    if (!getTV || getTV.length === 0) {
      await dbTransaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'TV configuration not found for this unit'
      });
    }

    const tvInfo = getTV[0];
    const ws = tvConnections.get(tvInfo.tv_id);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      await dbTransaction.rollback();
      return res.status(503).json({
        success: false,
        message: `TV ${tvInfo.tv_id} tidak terhubung`,
        debug: {
          tv_id: tvInfo.tv_id,
          wsExists: !!ws,
          wsReadyState: ws?.readyState
        }
      });
    }

    console.log(`Sending POWER ON command to TV: ${tvInfo.tv_id}, command: 224`);

    try {
      // ✅ PERBAIKAN: Clear old response sebelum kirim command baru
      if (tvResponses.has(tvInfo.tv_id)) {
        console.log(`🧹 Clearing old response for TV ${tvInfo.tv_id}`);
        tvResponses.delete(tvInfo.tv_id);
      }

      // ✅ Kirim command
      await sendTVCommand(ws, tvInfo.tv_id, 224, 'power_on');

      // ✅ Tunggu response (Promise-based, non-blocking)
      console.log(`⏳ Menunggu response dari TV ${tvInfo.tv_id}...`);
      const tvResponse = await waitForTVResponse(
        tvResponses, 
        tvInfo.tv_id, 
        224, 
        10000 // 10 detik timeout
      );

      // ✅ PERBAIKAN: Evaluasi response dengan handling lengkap
      if (tvResponse) {
        // Clear response setelah digunakan
        tvResponses.delete(tvInfo.tv_id);

        if (tvResponse.status === 'success') {
          console.log(`✅ TV ${tvInfo.tv_id} berhasil dinyalakan`);

          // WebSocket berhasil, commit transaksi
          await dbTransaction.commit();

          // Fetch complete transaction
          const includeOptions = [
            {
              model: TransaksiDetail,
              as: 'details',
              required: false,
              include: [
                { model: Unit, as: 'unit', required: false },
                { model: Promo, as: 'promo', required: false },
                { model: Produk, as: 'produk', required: false }
              ]
            }
          ];

          const trx = await Transaksi.findOne({
            where: { code: transactionCode },
            include: includeOptions
          });

          const mappedData = {
            code: trx.code,
            memberid: trx.memberid,
            customer: trx.customer,
            telepon: trx.telepon,
            grandtotal: trx.grandtotal,
            cabangid: trx.cabangid,
            status: trx.status,
            created_by: trx.created_by,
            updated_by: trx.updated_by,
            createdAt: trx.createdAt,
            updatedAt: trx.updatedAt,
            produk: (trx.details || [])
              .filter(d => d.produk)
              .map(d => ({
                product_id: d.id,
                token: d.produk_token || d.token || null,
                name: d.produk?.name || d.name,
                quantity: d.qty || d.quantity || 1,
                price: d.harga || d.price || 0,
                total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
                produk_detail: d.produk
              })),
            unit: (trx.details || [])
              .filter(d => d.unit)
              .map(d => ({
                unit_id: d.id,
                token: d.unit_token || d.token || null,
                name: d.unit?.name || d.name,
                quantity: d.qty || d.quantity || 1,
                hours: d.hours || 1,
                price: d.harga || d.price || 0,
                total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
                unit_detail: d.unit
              })),
            promo: (trx.details || [])
              .filter(d => d.promo)
              .map(d => ({
                promo_id: d.id,
                token: d.promo_token || d.token || null,
                name: d.promo?.name || d.name,
                quantity: d.qty || d.quantity || 1,
                price: d.harga || d.price || 0,
                total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
                promo_detail: d.promo
              }))
          };

          return res.status(201).json({
            success: true,
            message: 'Transaction created successfully and TV turned on',
            data: mappedData,
            ws_result: {
              tv_id: tvInfo.tv_id,
              command: 224,
              command_status: tvResponse.status,
              response_time_ms: tvResponse.receivedAt ? 
                new Date(tvResponse.receivedAt) - new Date(tvResponse.timestamp) : null,
              timestamp: tvResponse.timestamp
            }
          });

        } else if (tvResponse.status === 'failed' || tvResponse.status === 'error') {
          await dbTransaction.rollback();
          console.error(`❌ TV ${tvInfo.tv_id} gagal eksekusi: ${tvResponse.error}`);
          
          return res.status(503).json({
            success: false,
            message: `Transaction cancelled - TV control failed`,
            error: {
              tv_id: tvInfo.tv_id,
              command: 224,
              command_status: tvResponse.status,
              message: tvResponse.message || 'Command execution failed',
              error: tvResponse.error,
              timestamp: tvResponse.timestamp
            }
          });
        }
      } else {
        // ✅ PERBAIKAN: Timeout handling
        await dbTransaction.rollback();
        console.warn(`⏱️ TV ${tvInfo.tv_id} tidak merespon dalam 10 detik`);
        
        return res.status(408).json({
          success: false,
          message: 'Transaction cancelled - TV tidak merespon (timeout)',
          error: {
            tv_id: tvInfo.tv_id,
            command: 224,
            timeout: true,
            waited_ms: 10000
          }
        });
      }

    } catch (wsError) {
      await dbTransaction.rollback();
      console.error('WebSocket error during TV control:', wsError);
      
      return res.status(503).json({
        success: false,
        message: 'Transaction cancelled - Failed to control TV',
        error: {
          tv_id: tvInfo.tv_id,
          message: wsError.message,
          stack: process.env.NODE_ENV === 'development' ? wsError.stack : undefined
        }
      });
    }

  } catch (error) {
    try {
      await dbTransaction.rollback();
      console.log('Transaction rolled back due to error:', error.message || error);
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }

    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


router.post('/extendtime/:code', verifyToken, async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const { code } = req.params;
    const _transaction = await Transaksi.findOne({
      where: { code, status: 1 },
      include: [{
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
      }]
    });

    if (!_transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const unitDetails = _transaction.details.filter(detail => detail.unit_token);
    
    if (unitDetails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unit found in this transaction'
      });
    }

    const unitDetail = unitDetails[0];
    const currentHours = unitDetail.hours || 0;
    const currentHarga = unitDetail.harga || 0;

    const pricePerHour = currentHours > 0 ? Math.round(currentHarga / currentHours) : currentHarga;

    let { duration, extend_type, promo_token } = req.body;
    let transaction;

    if (!duration || isNaN(parseInt(duration)) || parseInt(duration) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid duration is required'
      });
    }

    if (extend_type == 'promo') {
      const _promo = await TransaksiDetail.findOne({
        where: {
          code: code,
          promo_token: promo_token,
          status: 1,
          type: 0
        }
      });

      if (!_promo) {
        await dbTransaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Promo not found in this transaction'
        });
      }

      const productData = {
        code: code,
        type: 1,
        name: null,
        promo_token: promo_token,
        unit_token: _promo.unit_token,
        hours: _promo.hours,
        harga: _promo.harga,
        total: _promo.harga,
        status: 1,
        created_by: req.user?.userId || null,
        updated_by: req.user?.userId || null
      };

      await TransaksiDetail.create(productData, { transaction: dbTransaction });
    } else {
      // Regular extend
      const _reguler = await TransaksiDetail.findOne({
        where: {
          code: code,
          status: 1,
          type: 0,
          unit_token: { [Op.ne]: null } // unit_token is not null
        }
      });

      if (!_reguler) {
        await dbTransaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Unit transaction not found'
        });
      }

      const additionalHours = parseInt(duration);
      const additionalCost = additionalHours * pricePerHour;

      const productData = {
        code: code,
        type: 1,
        name: null,
        promo_token: null,
        unit_token: _reguler.unit_token,
        hours: additionalHours,
        harga: additionalCost,
        total: additionalCost,
        status: 1,
        created_by: req.user?.userId || null,
        updated_by: req.user?.userId || null
      };

      await TransaksiDetail.create(productData, { transaction: dbTransaction });
    }

    // Hitung ulang total jam dan harga untuk unit tersebut
    const totalUnitDetails = await TransaksiDetail.findAll({
      where: {
        code: code,
        unit_token: unitDetail.unit_token,
        status: 1
      }
    });

    let totalHours = 0;
    let totalHarga = 0;

    totalUnitDetails.forEach(detail => {
      totalHours += detail.hours || 0;
      totalHarga += detail.harga || 0;
    });

    // Hitung ulang grandtotal dari semua detail transaksi
    const totalResult = await sequelize.query(`
      SELECT SUM(
        CASE 
          WHEN unit_token IS NOT NULL THEN harga
          ELSE harga * qty
        END
      ) as total_harga 
      FROM transaksi_detail 
      WHERE code = ? AND status = 1
    `, {
      replacements: [code],
      type: sequelize.QueryTypes.SELECT,
      transaction: dbTransaction
    });

    const newGrandTotal = parseInt(totalResult[0]?.total_harga) || 0;

    // Update grandtotal di transaksi utama
    await _transaction.update({
      grandtotal: newGrandTotal.toString(),
      updated_by: req.user?.userId || null
    }, { transaction: dbTransaction });

    await dbTransaction.commit();

    res.json({
      success: true,
      message: 'Waktu berhasil diperpanjang',
      data: {
        new_grandtotal: newGrandTotal,
        total_hours: totalHours,
        total_harga: totalHarga,
        extend_type: extend_type,
        duration_added: parseInt(duration)
      }
    });

  } catch (error) {
    try {
      await dbTransaction.rollback();
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }
    
    console.error('Extend time error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update transaction status (admin only)
router.put('/:code/status', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const { code } = req.params;
    const { status } = req.body;

    if (status === undefined || !['0', '1'].includes(status.toString())) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (0: selesai, 1: main)'
      });
    }

    const transaction = await Transaksi.findOne({ where: { code } });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    await transaction.update({
      status: status.toString(),
      updated_by: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'Transaction status updated successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Update transaction status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get transactions by status
router.get('/status/:status', verifyToken, verifyUser, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const { status } = req.params;
    const { limit = 50, offset = 0, include_details = false } = req.query;

    if (!['0', '1'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status parameter (0: selesai, 1: main)'
      });
    }

    const includeOptions = [];
    if (include_details === 'true') {
      includeOptions.push({
        model: TransaksiDetail,
        as: 'details',
        required: false
      });
    }

    const transactions = await Transaksi.findAndCountAll({
      where: { status },
      include: includeOptions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const statusNames = {
      '0': 'selesai',
      '1': 'main'
    };

    res.json({
      success: true,
      data: transactions.rows,
      total: transactions.count,
      status: statusNames[status],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get transactions by status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get transactions by member
router.get('/member/:memberid', verifyToken, verifyUser, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const { memberid } = req.params;
    const { status, limit = 50, offset = 0, include_details = false } = req.query;

    let whereClause = {
      memberid: parseInt(memberid)
    };

    if (status !== undefined) {
      whereClause.status = status;
    }

    const includeOptions = [];
    if (include_details === 'true') {
      includeOptions.push({
        model: TransaksiDetail,
        as: 'details',
        required: false
      });
    }

    const transactions = await Transaksi.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: transactions.rows,
      total: transactions.count,
      memberid: parseInt(memberid),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get transactions by member error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get today's transaction count and next number (admin only)
router.get('/stats/today', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const todayCount = await Transaksi.count({
      where: {
        createdAt: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    });

    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const nextNumber = (todayCount + 1).toString().padStart(3, '0');
    const nextCode = `TRX${year}${month}${day}${nextNumber}`;

    res.json({
      success: true,
      data: {
        date: now.toISOString().split('T')[0],
        todayTransactionCount: todayCount,
        nextSequentialNumber: nextNumber,
        nextTransactionCode: nextCode
      }
    });
  } catch (error) {
    console.error('Get today stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;