const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model cabang
let Cabang;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Cabang = models.cabang;
  
  if (!Cabang) {
    console.error('❌ Cabang model not found in models');
  } else {
    console.log('✅ Cabang model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading cabang model:', error.message);
}

// Get all cabang (protected)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const { status, search, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    
    // Filter berdasarkan status (1 = active sebagai default jika tidak dispesifikasi)
    if (status !== undefined) {
      whereClause.status = parseInt(status);
    } else {
      whereClause.status = 1; // Hanya tampilkan yang active
    }
    
    // Search berdasarkan name atau address
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { address: { [Op.like]: `%${search}%` } }
      ];
    }
    
    const cabang = await Cabang.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'ASC']]
    });

    res.json({
      success: true,
      data: cabang.rows,
      total: cabang.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get cabang stats/overview (admin only)
router.get('/stats/overview', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const totalCabang = await Cabang.count();
    
    const activeCabang = await Cabang.count({
      where: { status: 1 }
    });
    
    const inactiveCabang = await Cabang.count({
      where: { status: 0 }
    });

    res.json({
      success: true,
      data: {
        total: totalCabang,
        active: activeCabang,
        inactive: inactiveCabang
      }
    });
  } catch (error) {
    console.error('Get cabang stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get cabang by ID (protected)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const cabangId = parseInt(req.params.id);
    const cabang = await Cabang.findByPk(cabangId);
    
    if (!cabang) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cabang not found' 
      });
    }

    res.json({
      success: true,
      data: cabang
    });
  } catch (error) {
    console.error('Get cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new cabang (admin only)
router.post('/', verifyToken, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const { name, address, phone, status } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    // Check if cabang name already exists
    const existingCabang = await Cabang.findOne({
      where: { name }
    });

    if (existingCabang) {
      return res.status(409).json({
        success: false,
        message: 'Cabang name already exists'
      });
    }

    const newCabang = await Cabang.create({
      name,
      status: 1,
    });

    res.status(201).json({
      success: true,
      message: 'Cabang created successfully',
      data: newCabang
    });
  } catch (error) {
    console.error('Create cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update cabang (admin only)
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const cabangId = parseInt(req.params.id);
    const cabang = await Cabang.findByPk(cabangId);
    
    if (!cabang) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cabang not found' 
      });
    }

    const { name, address, phone, status } = req.body;
    
    // Check if new name already exists (exclude current cabang)
    if (name && name !== cabang.name) {
      const existingCabang = await Cabang.findOne({
        where: { 
          name,
          id: { [Op.ne]: cabangId }
        }
      });

      if (existingCabang) {
        return res.status(409).json({
          success: false,
          message: 'Cabang name already exists'
        });
      }
    }
    
    await cabang.update({
      name: name || cabang.name,
      address: address !== undefined ? address : cabang.address,
      phone: phone !== undefined ? phone : cabang.phone,
      status: status !== undefined ? parseInt(status) : cabang.status,
      updated_by: req.user?.userId || cabang.updated_by
    });

    res.json({
      success: true,
      message: 'Cabang updated successfully',
      data: cabang
    });
  } catch (error) {
    console.error('Update cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete cabang (admin only) - Set status to inactive (0)
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const cabangId = parseInt(req.params.id);
    const cabang = await Cabang.findByPk(cabangId);
    
    if (!cabang) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cabang not found' 
      });
    }

    if (cabang.status === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cabang is already inactive'
      });
    }

    // Set status to inactive (0)
    await cabang.update({ 
      status: 0,
      updated_by: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'Cabang deactivated successfully'
    });
  } catch (error) {
    console.error('Delete cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update cabang status (admin only)
router.put('/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const cabangId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (status === undefined || ![0, 1].includes(parseInt(status))) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (0: inactive, 1: active)'
      });
    }

    const cabang = await Cabang.findByPk(cabangId);
    
    if (!cabang) {
      return res.status(404).json({
        success: false,
        message: 'Cabang not found'
      });
    }

    await cabang.update({ 
      status: parseInt(status),
      updated_by: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'Cabang status updated successfully',
      data: cabang
    });
  } catch (error) {
    console.error('Update cabang status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get cabang by status
router.get('/status/:status', verifyToken, verifyUser, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const { status } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const statusValue = parseInt(status);
    if (![0, 1].includes(statusValue)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status parameter (0: inactive, 1: active)'
      });
    }

    const cabang = await Cabang.findAndCountAll({
      where: {
        status: statusValue
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['name', 'ASC']]
    });

    const statusNames = {
      0: 'inactive',
      1: 'active'
    };

    res.json({
      success: true,
      data: cabang.rows,
      total: cabang.count,
      status: statusNames[statusValue],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get cabang by status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;