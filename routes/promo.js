const express = require('express');
const { verifyToken, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model promo
let Promo, Unit;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Promo = models.promo;
  Unit = models.units;
  
  if (!Promo) {
    console.error('❌ Promo model not found in models');
  } else {
    console.log('✅ Promo model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading promo model:', error.message);
}

// Get all promo (protected)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!Promo) {
      return res.status(500).json({
        success: false,
        message: 'Promo model not available'
      });
    }

    const { status, unitid, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    
    // Filter berdasarkan status (1 = active sebagai default jika tidak dispesifikasi)
    if (status !== undefined) {
      whereClause.status = parseInt(status);
    } else {
      whereClause.status = { [Op.ne]: 0 }; // Tampilkan yang bukan non-active
    }
    
    if (unitid !== undefined) {
      whereClause.unitid = parseInt(unitid);
    }
    
    const promos = await Promo.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'ASC']]
    });

    res.json({
      success: true,
      data: promos.rows,
      total: promos.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get promos error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get promo by ID (protected)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!Promo) {
      return res.status(500).json({
        success: false,
        message: 'Promo model not available'
      });
    }

    const promoId = parseInt(req.params.id);
    const promo = await Promo.findByPk(promoId);
    
    if (!promo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Promo not found' 
      });
    }

    res.json({
      success: true,
      data: promo
    });
  } catch (error) {
    console.error('Get promo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new promo (admin only) - SINGLE PROMO
router.post('/', verifyToken, async (req, res) => {
  try {
    if (!Promo) {
      return res.status(500).json({
        success: false,
        message: 'Promo model not available'
      });
    }

    const { 
      name, 
      unitid, 
      discount_percent, 
      discount_nominal, 
      hours, 
      status 
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    // Validate discount - either percent or nominal, not both
    if (discount_percent && discount_nominal) {
      return res.status(400).json({
        success: false,
        message: 'Cannot have both discount_percent and discount_nominal'
      });
    }

    if (!discount_percent && !discount_nominal) {
      return res.status(400).json({
        success: false,
        message: 'Either discount_percent or discount_nominal is required'
      });
    }

    if (!hours && isNaN(parseInt(hours))) {
      return res.status(400).json({
        success: false,
        message: 'Hours must be a number'
      });
    }

    if (!unitid) {
      return res.status(400).json({
        success: false,
        message: 'Unit must selected from available units only'
      });
    }

    // Validate unit exists if provided
    if (unitid && Unit) {
      const unitExists = await Unit.findOne({
        where: { 
          id: parseInt(unitid),
          status: { [Op.ne]: 0 } // unit must be active
        }
      });

      if (!unitExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid unit ID or unit is inactive'
        });
      }
    }

    // Check if promo name already exists
    const existingPromo = await Promo.findOne({
      where: { name }
    });

    if (existingPromo) {
      return res.status(409).json({
        success: false,
        message: 'Promo name already exists'
      });
    }

    const newPromo = await Promo.create({
      name,
      unitid: unitid ? parseInt(unitid) : null,
      discount_percent: discount_percent ? parseInt(discount_percent) : null,
      discount_nominal: discount_nominal ? parseInt(discount_nominal) : null,
      hours: hours ? parseInt(hours) : null,
      status: status !== undefined ? parseInt(status) : 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    });

    res.status(201).json({
      success: true,
      message: 'Promo created successfully',
      data: newPromo
    });
  } catch (error) {
    console.error('Create promo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update promo (admin only)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!Promo) {
      return res.status(500).json({
        success: false,
        message: 'Promo model not available'
      });
    }

    const promoId = parseInt(req.params.id);
    const promo = await Promo.findByPk(promoId);
    
    if (!promo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Promo not found' 
      });
    }

    const { 
      nama, 
      unitid, 
      discount_percent, 
      discount_nominal, 
      hours, 
      status 
    } = req.body;

    // Validate discount - either percent or nominal, not both
    if (discount_percent && discount_nominal) {
      return res.status(400).json({
        success: false,
        message: 'Cannot have both discount_percent and discount_nominal'
      });
    }

    // Check if new name already exists (exclude current promo)
    if (nama && nama !== promo.nama) {
      const existingPromo = await Promo.findOne({
        where: { 
          nama,
          id: { [Op.ne]: promoId }
        }
      });

      if (existingPromo) {
        return res.status(409).json({
          success: false,
          message: 'Promo name already exists'
        });
      }
    }

    // Validate unit exists if provided
    if (unitid && Unit) {
      const unitExists = await Unit.findOne({
        where: { 
          id: parseInt(unitid),
          status: { [Op.ne]: 0 }
        }
      });

      if (!unitExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid unit ID or unit is inactive'
        });
      }
    }
    
    await promo.update({
      nama: nama || promo.nama,
      unitid: unitid !== undefined ? (unitid ? parseInt(unitid) : null) : promo.unitid,
      discount_percent: discount_percent !== undefined ? (discount_percent ? parseInt(discount_percent) : null) : promo.discount_percent,
      discount_nominal: discount_nominal !== undefined ? (discount_nominal ? parseInt(discount_nominal) : null) : promo.discount_nominal,
      hours: hours !== undefined ? (hours ? parseInt(hours) : null) : promo.hours,
      status: status !== undefined ? parseInt(status) : promo.status,
      updated_by: req.user?.userId || promo.updated_by
    });

    res.json({
      success: true,
      message: 'Promo updated successfully',
      data: promo
    });
  } catch (error) {
    console.error('Update promo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete promo (admin only) - Set status to inactive (0)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!Promo) {
      return res.status(500).json({
        success: false,
        message: 'Promo model not available'
      });
    }

    const promoId = parseInt(req.params.id);
    const promo = await Promo.findByPk(promoId);
    
    if (!promo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Promo not found' 
      });
    }

    if (promo.status === 0) {
      return res.status(400).json({
        success: false,
        message: 'Promo is already inactive'
      });
    }

    // Set status to non-active (0)
    await promo.update({ 
      status: 0,
      updated_by: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'Promo deactivated successfully'
    });
  } catch (error) {
    console.error('Delete promo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;