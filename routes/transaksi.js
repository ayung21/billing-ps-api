const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import models
let Transaksi, TransaksiDetail, Member, Unit, Promo, Produk;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Transaksi = models.transaksi;
  TransaksiDetail = models.transaksi_detail;
  Member = models.member;
  Unit = models.units;
  Promo = models.promo;
  Produk = models.produk;
  
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
  const year = now.getFullYear().toString().slice(-2); // 2 digit tahun terakhir
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 2 digit bulan
  const day = now.getDate().toString().padStart(2, '0'); // 2 digit hari
  
  // Get today's date range for filtering
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  try {
    // Count today's transactions to get next sequential number
    const todayTransactionCount = await Transaksi.count({
      where: {
        createdAt: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    });
    
    // Next sequential number (starting from 001)
    const sequentialNumber = (todayTransactionCount + 1).toString().padStart(3, '0');
    
    // Format: TRX + YYMMDD + SSS (SSS = Sequential number)
    // Contoh: TRX251219001, TRX251219002, TRX251219003
    return `TRX${year}${month}${day}${sequentialNumber}`;
  } catch (error) {
    console.error('Error generating transaction code:', error);
    // Fallback to timestamp-based code if database query fails
    const timestamp = Date.now().toString().slice(-3);
    return `TRX${year}${month}${day}${timestamp}`;
  }
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
    
    let whereClause = {};
    
    if (status !== undefined) {
      whereClause.status = status;
    }
    
    if (memberid !== undefined) {
      whereClause.memberid = parseInt(memberid);
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
    const transaction = await Transaksi.findOne({
      where: { code },
      include: [{
        model: TransaksiDetail,
        as: 'details',
        required: false
      }]
    });
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    res.json({
      success: true,
      data: transaction
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

// Create new transaction with details (admin only)
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
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
      customer, 
      telepon, 
      grandtotal, 
      status = '1',
      details 
    } = req.body;
    
    // Validation
    if (!customer && !memberid) {
      await dbTransaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Either customer name or member ID is required' 
      });
    }

    if (!details || !Array.isArray(details) || details.length === 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction details are required'
      });
    }

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
      customer: customer || null,
      telepon: telepon || null,
      grandtotal: grandtotal ? grandtotal.toString() : '0',
      status: status.toString(),
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    }, { transaction: dbTransaction });

    // Validate and create transaction details
    const createdDetails = [];
    let calculatedTotal = 0;

    for (let i = 0; i < details.length; i++) {
      const detail = details[i];
      
      // Validate required fields
      if (!detail.name) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Detail at index ${i} is missing required field: name`
        });
      }

      // Validate unit if provided
      if (detail.unitid && Unit) {
        const unit = await Unit.findOne({
          where: { id: parseInt(detail.unitid), status: { [Op.ne]: 0 } }
        });

        if (!unit) {
          await dbTransaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Invalid unit ID ${detail.unitid} at detail index ${i}`
          });
        }
      }

      // Validate promo if provided
      if (detail.promoid && Promo) {
        const promo = await Promo.findOne({
          where: { id: parseInt(detail.promoid), status: 1 }
        });

        if (!promo) {
          await dbTransaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Invalid promo ID ${detail.promoid} at detail index ${i}`
          });
        }
      }

      // Validate produk if provided
      if (detail.produk && Produk) {
        const produk = await Produk.findOne({
          where: { id: parseInt(detail.produk), status: 1 }
        });

        if (!produk) {
          await dbTransaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Invalid produk ID ${detail.produk} at detail index ${i}`
          });
        }
      }

      const detailData = {
        code: transactionCode,
        name: detail.name,
        promoid: detail.promoid ? parseInt(detail.promoid) : null,
        produk: detail.produk ? parseInt(detail.produk) : null,
        unitid: detail.unitid ? parseInt(detail.unitid) : null,
        hours: detail.hours ? parseInt(detail.hours) : null,
        harga: detail.harga ? parseInt(detail.harga) : 0,
        status: detail.status !== undefined ? parseInt(detail.status) : 1,
        created_by: req.user?.userId || null,
        updated_by: req.user?.userId || null
      };

      const createdDetail = await TransaksiDetail.create(detailData, { transaction: dbTransaction });
      createdDetails.push(createdDetail);
      
      calculatedTotal += detailData.harga;
    }

    // Update grandtotal if not provided
    if (!grandtotal) {
      await newTransaction.update({
        grandtotal: calculatedTotal.toString()
      }, { transaction: dbTransaction });
    }

    await dbTransaction.commit();

    // Fetch complete transaction with details
    const completeTransaction = await Transaksi.findOne({
      where: { code: transactionCode },
      include: [{
        model: TransaksiDetail,
        as: 'details'
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: completeTransaction
    });

  } catch (error) {
    await dbTransaction.rollback();
    console.error('Create transaction error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update transaction (admin only)
router.put('/:code', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Transaksi) {
      return res.status(500).json({
        success: false,
        message: 'Transaksi model not available'
      });
    }

    const { code } = req.params;
    const transaction = await Transaksi.findOne({ where: { code } });
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    const { memberid, customer, telepon, grandtotal, status } = req.body;
    
    // Validate member if provided
    if (memberid && Member) {
      const member = await Member.findOne({
        where: { id: parseInt(memberid), status: 1 }
      });

      if (!member) {
        return res.status(400).json({
          success: false,
          message: 'Invalid member ID or member is inactive'
        });
      }
    }
    
    await transaction.update({
      memberid: memberid !== undefined ? (memberid ? parseInt(memberid) : null) : transaction.memberid,
      customer: customer !== undefined ? customer : transaction.customer,
      telepon: telepon !== undefined ? telepon : transaction.telepon,
      grandtotal: grandtotal !== undefined ? grandtotal.toString() : transaction.grandtotal,
      status: status !== undefined ? status.toString() : transaction.status,
      updated_by: req.user?.userId || transaction.updated_by
    });

    res.json({
      success: true,
      message: 'Transaction updated successfully',
      data: transaction
    });
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