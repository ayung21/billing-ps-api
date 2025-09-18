const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model units
let Unit, Cabang, HistoryUnits;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Unit = models.units;
  Cabang = models.cabang;
  HistoryUnits = models.history_units;
  
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

// Get unit by ID (protected)
router.get('/:id', verifyToken, async (req, res) => {
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

// Create new unit (admin only) - SINGLE UNIT
router.post('/', verifyToken, async (req, res) => {
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

    // Check if unit name already exists
    const existingUnit = await Unit.findOne({
      where: { name }
    });

    if (existingUnit) {
      return res.status(409).json({
        success: false,
        message: 'Unit name already exists'
      });
    }

    // Validate cabang exists if provided
    if (cabang && Cabang) {
      const cabangExists = await Cabang.findOne({
        where: { 
          id: parseInt(cabang),
          status: 1 
        }
      });

      if (!cabangExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid cabang ID or cabang is inactive'
        });
      }
    }

    const newUnit = await Unit.create({
      name,
      cabangid: cabang ? parseInt(cabang) : null,
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
router.put('/:id', verifyToken, async (req, res) => {
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

    await HistoryUnits.create({
      unitid: unit.id,
      name: unit.name,
      cabangid: unit.cabangid,
      status: unit.status,
      created_by: req.user?.userId || null
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
router.delete('/:id', verifyToken, async (req, res) => {
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

module.exports = router;
