const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { exec } = require("child_process");
const history_units = require('../models/history_units');

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

// Generate transaction code with sequential number
const generateTransactionCode = async () => {
  const now = new Date();
  const year = now.getFullYear().toString(); // 4 digit tahun
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 2 digit bulan
  const day = now.getDate().toString().padStart(2, '0'); // 2 digit hari

  // Get today's date range for filtering
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), 31, 23, 59, 59);

  try {
    // Count today's transactions to get next sequential number
    const todayTransactionCount = await Transaksi.count({
      where: {
        createdAt: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    });

    // Next sequential number (starting from 0001)
    const sequentialNumber = (todayTransactionCount + 1).toString().padStart(4, '0');

    // Format: TRX + YYMMDD + SSSS (SSSS = Sequential number)
    // Contoh: TRX2512190001, TRX2512190002, TRX2512190003
    return `TRX${year}${month}${sequentialNumber}`;
  } catch (error) {
    console.error('Error generating transaction code:', error);
    // Fallback to timestamp-based code if database query fails
    const timestamp = Date.now().toString().slice(-3);
    return `TRX${year}${month}${day}${timestamp}`;
  }
};

// Ubah executeAdbControl menjadi Promise-based function
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

// Get all transactions (protected)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const { status, memberid, limit = 50, offset = 0, include_details = false } = req.query;
    let cabangaccess = [];
    let whereClause = {};

    const _access = await Access.findAll({
      where: {
        userId: req.user.userId
      }
    });

    for (const __access of _access) {
      cabangaccess.push(__access.cabangid);
    }

    whereClause.cabangid = { [Op.in]: cabangaccess };

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

    const transactions = await Transaksi.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    // Mapping hasil agar produk menjadi array detail
    const mappedData = transactions.rows.map(trx => ({
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
        .filter(d => d.produk) // hanya jika ada relasi produk
        .map(d => ({
          product_id: d.id,
          token: d.produk_token || d.token || null,
          name: d.produk?.name || d.name,
          quantity: d.qty || d.quantity || 1,
          price: d.harga || d.price || 0,
          total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
          produk_detail: d.produk // tampilkan detail produk jika ingin
        })),
      unit: (trx.details || [])
        .filter(d => d.unit) // hanya jika ada relasi unit
        .map(d => ({
          unit_id: d.id,
          token: d.unit_token || d.token || null,
          name: d.unit?.name || d.name,
          quantity: d.qty || d.quantity || 1,
          hours: d.hours || 1,
          price: d.harga || d.price || 0,
          total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
          unit_detail: d.unit // tampilkan detail unit jika ingin
        })),
      promo: (trx.details || [])
        .filter(d => d.promo) // hanya jika ada relasi promo
        .map(d => ({
          promo_id: d.id,
          token: d.promo_token || d.token || null,
          name: d.promo?.name || d.name,
          quantity: d.qty || d.quantity || 1,
          price: d.harga || d.price || 0,
          total: ((d.harga || d.price || 0) * (d.qty || d.quantity || 1)),
          promo_detail: d.promo // tampilkan detail promo jika ingin
        }))
    }));

    res.json({
      success: true,
      data: mappedData,
      total: transactions.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get transaction stats/overview (admin only)
router.get('/stats/overview', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const totalTransactions = await Transaksi.count();

    const activeTransactions = await Transaksi.count({
      where: { status: '1' } // status main
    });

    const completedTransactions = await Transaksi.count({
      where: { status: '0' } // status selesai
    });

    // Calculate total revenue from completed transactions
    const revenueResult = await Transaksi.findAll({
      where: { status: '0' },
      attributes: [
        [sequelize.fn('SUM', sequelize.cast(sequelize.col('grandtotal'), 'DECIMAL')), 'total_revenue']
      ],
      raw: true
    });

    const totalRevenue = revenueResult[0]?.total_revenue || 0;

    res.json({
      success: true,
      data: {
        total: totalTransactions,
        active: activeTransactions,
        completed: completedTransactions,
        revenue: parseFloat(totalRevenue)
      }
    });
  } catch (error) {
    console.error('Get transaction stats error:', error);
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
        name: product.name,
        produk_token: product.produk_token ?? null,
        qty: product.quantity ? parseInt(product.quantity) : 1,
        harga: product.price ? parseInt(product.price) : 0,
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

// Create new transaction with details (admin only)
router.post('/', verifyToken, async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  let transactionFinished = false;

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

    // Validation
    // console.log(req.body);
    // res.json({
    //   success: true,
    //   message: 'Transaction created successfully',
    //   data: req.body
    // });
    // return;
    if (!customer_name) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Either customer name or member ID is required'
      });
    }

    // if (!details || !Array.isArray(details) || details.length === 0) {
    //   await dbTransaction.rollback();
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Transaction details are required'
    //   });
    // }

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

    // Generate transaction code with sequential number
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

      // If code exists, wait a moment before trying again
      if (codeExists) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // res.json({
    //   success: true,
    //   message: 'Transaction created successfully',
    //   data: transactionCode
    // });
    // return;
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

    // Validate and create transaction details
    const createdDetails = [];
    let calculatedTotal = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      // Validate required fields
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

      await check.update({ stok: check.stok - product.quantity }, { transaction: dbTransaction });

      // Validate unit if provided
      if (product.unitid && Unit) {
        const unit = await Unit.findOne({
          where: { id: parseInt(product.unitid), status: { [Op.ne]: 0 } }
        });

        if (!unit) {
          await dbTransaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Invalid unit ID ${product.unitid} at product index ${i}`
          });
        }
      }

      // Validate promo if provided
      if (product.promoid && Promo) {
        const promo = await Promo.findOne({
          where: { id: parseInt(product.promoid), status: 1 }
        });

        if (!promo) {
          await dbTransaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Invalid promo ID ${product.promoid} at product index ${i}`
          });
        }
      }

      // Validate produk if provided
      if (product.produk && Produk) {
        const produk = await Produk.findOne({
          where: { id: parseInt(product.produk), status: 1 }
        });

        if (!produk) {
          await dbTransaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Invalid produk ID ${product.produk} at product index ${i}`
          });
        }
      }

      const productData = {
        code: transactionCode,
        name: product.name,
        produk_token: product.product_token ?? null,
        qty: product.quantity ? parseInt(product.quantity) : null,
        harga: product.price ? parseInt(product.price) : 0,
        status: 1,
        created_by: req.user?.userId || null,
        updated_by: req.user?.userId || null
      };

      const createdDetail = await TransaksiDetail.create(productData, { transaction: dbTransaction });
      // createdDetails.push(createdDetail);

      // calculatedTotal += productData.harga;
    }

    const productData = {
      code: transactionCode,
      name: '',
      promo_token: promo_token ?? null,
      unit_token: unit_token ?? null,
      hours: duration ? parseInt(duration) : null,
      harga: rental_price ? parseInt(rental_price) : 0,
      status: 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    };

    const createdDetail = await TransaksiDetail.create(productData, { transaction: dbTransaction });
    // Update total_price if not provided
    // if (!total_price) {
    //   await newTransaction.update({
    //     grandtotal: calculatedTotal.toString()
    //   }, { transaction: dbTransaction });
    // }

    // === COBA ADB CONTROL SEBELUM COMMIT ===
    const getIP = await sequelize.query(`
      SELECT b.*, c.* FROM units u 
      JOIN brandtv b ON b.id = u.brandtvid
      JOIN codetv c ON c.id = b.codetvid
      WHERE u.status = 1 AND c.desc = 'on/off' AND u.token = ?
    `, {
      replacements: [unit_token],
      type: sequelize.QueryTypes.SELECT,
    });

    console.log('Testing ADB control before commit...');
    const adbResult = await executeAdbControl(getIP[0].ip_address, getIP[0].command);
    console.log('ADB Control Success:', adbResult);

    // ADB berhasil, commit transaksi
    await dbTransaction.commit();
    transactionFinished = true;

    // Fetch complete transaction with details

    const includeOptions = [
      {
        model: TransaksiDetail,
        as: 'details',
        required: false,
        // where: { produk_token: { [Op.ne]: null } },
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

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully and TV turned on',
      data: mappedData,
      adb_result: adbResult
    });

  } catch (error) {
    // Rollback jika ADB gagal atau error lain
    try {
      await dbTransaction.rollback();
      console.log('Transaction rolled back due to error:', error.message || error);
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }

    // Jika error dari ADB control
    if (error.success === false && error.message) {
      return res.status(503).json({
        success: false,
        message: 'Transaction cancelled - TV control failed',
        error: error
      });
    }

    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update transaction (admin only)
router.put('/offtv/:code', verifyToken, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const { code } = req.params;
    const transaction = await Transaksi.findOne({
      where: { code, status: 1 },
      include: [{
        model: TransaksiDetail,
        as: 'details',
        required: false,
        where: { status: 1 }, // hanya detail yang aktif
        include: [
          {
            model: Unit,
            as: 'unit',
            required: false
          },
        ]
      }]
    });

    const unitTokens = transaction.details
      .filter(detail => detail.unit_token)
      .map(detail => detail.unit_token);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const { memberid, customer, telepon, grandtotal, status } = req.body;

    const checkunit = await HistoryUnits.findOne({
      where: { token: unitTokens[0] }
    });

    let getIP = [];
    if (!checkunit) {
      getIP = await sequelize.query(`
        SELECT b.*, c.* FROM units u 
        JOIN brandtv b ON b.id = u.brandtvid
        JOIN codetv c ON c.id = b.codetvid
        WHERE u.status = 1 AND c.desc = 'on/off' AND u.token = ?
      `, {
        replacements: [unitTokens[0]],
        type: sequelize.QueryTypes.SELECT
      });
    }else{
      getIP = await sequelize.query(`
        SELECT b.*, c.* FROM units u 
        JOIN brandtv b ON b.id = u.brandtvid
        JOIN codetv c ON c.id = b.codetvid
        WHERE u.status = 1 AND c.desc = 'on/off' AND u.id = ?
      `, {
        replacements: [checkunit.unitid],
        type: sequelize.QueryTypes.SELECT
      });
    }


    try {
      const adbResult = await executeAdbControl(getIP[0].ip_address, getIP[0].command);
      
      await transaction.update({
        status: 0,
        updated_by: req.user?.userId || transaction.updated_by
      });
      
      res.json({
        success: true,
        message: 'Transaction updated successfully',
        data: transaction,
        adb_result: adbResult
      });
    } catch (adbError) {
      console.error('ADB Control Failed:', adbError);
      
      res.status(503).json({
        success: false,
        message: 'Failed to turn off TV',
        error: adbError
      });
    }

  } catch (error) {
    console.error('Update transaction error:', error);
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