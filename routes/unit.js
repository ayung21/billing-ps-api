const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model units
let Unit;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Unit = models.units;
  
  if (!Unit) {
    console.error('❌ Units model not found in models');
  } else {
    console.log('✅ Units model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading units model:', error.message);
}

// Get all units (protected)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const { status, cabang, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    
    // Filter berdasarkan status (1 = active sebagai default jika tidak dispesifikasi)
    if (status !== undefined) {
      whereClause.status = parseInt(status);
    } else {
      whereClause.status = { [Op.ne]: 0 }; // Tampilkan yang bukan non-active
    }
    
    if (cabang !== undefined) {
      whereClause.cabang = parseInt(cabang);
    }
    
    const units = await Unit.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'ASC']]
    });

    res.json({
      success: true,
      data: units.rows,
      total: units.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get units error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get units stats/overview (admin only)
router.get('/stats/overview', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const totalUnits = await Unit.count();
    
    const activeUnits = await Unit.count({
      where: { status: 1 }
    });
    
    const inactiveUnits = await Unit.count({
      where: { status: 0 }
    });
    
    const maintenanceUnits = await Unit.count({
      where: { status: 2 }
    });

    res.json({
      success: true,
      data: {
        total: totalUnits,
        active: activeUnits,
        inactive: inactiveUnits,
        maintenance: maintenanceUnits
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get unit by ID (protected)
router.get('/:id', verifyToken, verifyUser, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const unitId = parseInt(req.params.id);
    const unit = await Unit.findByPk(unitId);
    
    if (!unit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Unit not found' 
      });
    }

    res.json({
      success: true,
      data: unit
    });
  } catch (error) {
    console.error('Get unit error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new unit (admin only)
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const { name, cabang, status } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    const newUnit = await Unit.create({
      name,
      cabang: cabang || null,
      status: status !== undefined ? parseInt(status) : 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    });

    res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      data: newUnit
    });
  } catch (error) {
    console.error('Create unit error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update unit (admin only)
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const unitId = parseInt(req.params.id);
    const unit = await Unit.findByPk(unitId);
    
    if (!unit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Unit not found' 
      });
    }

    const { name, cabang, status } = req.body;
    
    await unit.update({
      name: name || unit.name,
      cabang: cabang !== undefined ? cabang : unit.cabang,
      status: status !== undefined ? parseInt(status) : unit.status,
      updated_by: req.user?.userId || unit.updated_by
    });

    res.json({
      success: true,
      message: 'Unit updated successfully',
      data: unit
    });
  } catch (error) {
    console.error('Update unit error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete unit (admin only) - Set status to inactive (0)
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const unitId = parseInt(req.params.id);
    const unit = await Unit.findByPk(unitId);
    
    if (!unit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Unit not found' 
      });
    }

    // Set status to non-active (0)
    await unit.update({ 
      status: 0,
      updated_by: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'Unit deactivated successfully'
    });
  } catch (error) {
    console.error('Delete unit error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update unit status (admin only)
router.put('/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const unitId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (status === undefined || ![0, 1, 2].includes(parseInt(status))) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (0: non-active, 1: active, 2: maintenance)'
      });
    }

    const unit = await Unit.findByPk(unitId);
    
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    await unit.update({ 
      status: parseInt(status),
      updated_by: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'Unit status updated successfully',
      data: unit
    });
  } catch (error) {
    console.error('Update unit status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get units by status
router.get('/status/:status', verifyToken, verifyUser, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const { status } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const statusValue = parseInt(status);
    if (![0, 1, 2].includes(statusValue)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status parameter (0: non-active, 1: active, 2: maintenance)'
      });
    }

    const units = await Unit.findAndCountAll({
      where: {
        status: statusValue
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['name', 'ASC']]
    });

    const statusNames = {
      0: 'non-active',
      1: 'active', 
      2: 'maintenance'
    };

    res.json({
      success: true,
      data: units.rows,
      total: units.count,
      status: statusNames[statusValue],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get units by status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get units by cabang
router.get('/cabang/:cabang', verifyToken, verifyUser, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const { cabang } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {
      cabang: parseInt(cabang)
    };

    if (status !== undefined) {
      whereClause.status = parseInt(status);
    }

    const units = await Unit.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: units.rows,
      total: units.count,
      cabang: parseInt(cabang),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get units by cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
