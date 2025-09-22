const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model units
let Unit, Cabang, HistoryUnits, Brandtv;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Unit = models.units;
  Cabang = models.cabang;
  HistoryUnits = models.history_units;
  Brandtv = models.brandtv;
  
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

    const { status, cabang, brandtvid, limit = 50, offset = 0, include_relations = false } = req.query;
    
    let whereClause = {};
    
    // Filter berdasarkan status (1 = active sebagai default jika tidak dispesifikasi)
    if (status !== undefined) {
      whereClause.status = parseInt(status);
    } else {
      whereClause.status = { [Op.ne]: 0 }; // Tampilkan yang bukan non-active
    }
    
    if (cabang !== undefined) {
      whereClause.cabangid = parseInt(cabang);
    }

    if (brandtvid !== undefined) {
      whereClause.brandtvid = parseInt(brandtvid);
    }

    // Setup include untuk join
    const includeOptions = [];
    
    if (include_relations === 'true') {
      // Join dengan Brandtv
      if (Brandtv) {
        includeOptions.push({
          model: Brandtv,
          as: 'brandtv',
          attributes: ['id', 'name'],
          required: false // LEFT JOIN
        });
      }
      
      // Join dengan Cabang
      if (Cabang) {
        includeOptions.push({
          model: Cabang,
          as: 'cabang',
          attributes: ['id', 'name', 'status'],
          required: false // LEFT JOIN
        });
      }
    }
    
    const units = await Unit.findAndCountAll({
      where: whereClause,
      include: includeOptions,
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

// Get available TV brands (TV yang belum digunakan oleh unit manapun)
router.get('/available-tv', verifyToken, async (req, res) => {
  try {
    if (!Brandtv) {
      return res.status(500).json({
        success: false,
        message: 'Brandtv model not available'
      });
    }

    const { limit = 50, offset = 0 } = req.query;

    // Validate and parse numeric parameters
    const parsedLimit = parseInt(limit) || 50;
    const parsedOffset = parseInt(offset) || 0;

    try {
      // Menggunakan raw query dengan kolom yang benar
      const results = await sequelize.query(`
        SELECT b.id, b.name, b.codetvid, b.ip,
               COUNT(*) OVER() as total_count
        FROM brandtv b 
        LEFT JOIN units u ON u.brandtvid = b.id AND u.status != 0
        WHERE u.id IS NULL
        ORDER BY b.name ASC
        LIMIT ? OFFSET ?
      `, {
        replacements: [parsedLimit, parsedOffset],
        type: sequelize.QueryTypes.SELECT
      });

      // Validasi hasil query
      if (!Array.isArray(results)) {
        throw new Error('Query result is not an array');
      }

      const totalCount = results.length > 0 ? parseInt(results[0].total_count) : 0;

      // Remove total_count from individual records
      const cleanResults = results.map(row => {
        const { total_count, ...cleanRow } = row;
        return cleanRow;
      });

      res.json({
        success: true,
        message: 'Available TV brands retrieved successfully',
        data: cleanResults,
        total: totalCount,
        limit: parsedLimit,
        offset: parsedOffset
      });
    } catch (rawQueryError) {
      console.error('Raw query failed:', rawQueryError);
      console.error('Raw query error details:', {
        message: rawQueryError.message,
        sql: rawQueryError.sql,
        parameters: rawQueryError.parameters
      });
      
      // Fallback ke Sequelize query builder dengan kolom yang benar
      try {
        const availableTv = await Brandtv.findAndCountAll({
          where: {
            id: {
              [Op.notIn]: sequelize.literal(`(
                SELECT DISTINCT brandtvid 
                FROM units 
                WHERE brandtvid IS NOT NULL AND status != 0
              )`)
            }
          },
          attributes: ['id', 'name', 'codetvid', 'ip'], // Hanya kolom yang ada
          limit: parsedLimit,
          offset: parsedOffset,
          order: [['name', 'ASC']]
        });

        res.json({
          success: true,
          message: 'Available TV brands retrieved successfully (fallback)',
          data: availableTv.rows,
          total: availableTv.count,
          limit: parsedLimit,
          offset: parsedOffset
        });
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        throw fallbackError;
      }
    }
  } catch (error) {
    console.error('Get available TV error:', error);
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

    const { name, cabang, brandtvid, status } = req.body;
    
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
      brandtvid: brandtvid ? parseInt(brandtvid) : null,
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

    const { name, cabang, brandtvid, status } = req.body;

    // Check if new name already exists (exclude current unit)
    if (name && name !== unit.name) {
      const existingUnit = await Unit.findOne({
        where: { 
          name,
          id: { [Op.ne]: unitId }
        }
      });

      if (existingUnit) {
        return res.status(409).json({
          success: false,
          message: 'Unit name already exists'
        });
      }
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
    
    await unit.update({
      name: name || unit.name,
      cabangid: cabang !== undefined ? (cabang ? parseInt(cabang) : null) : unit.cabangid,
      brandtvid: brandtvid !== undefined ? (brandtvid ? parseInt(brandtvid) : null) : unit.brandtvid,
      status: status !== undefined ? parseInt(status) : unit.status,
      updated_by: req.user?.userId || unit.updated_by
    });

    // Create history record with brandtvid
    if (HistoryUnits) {
      await HistoryUnits.create({
        unitid: unit.id,
        name: unit.name,
        brandtvid: unit.brandtvid,
        cabangid: unit.cabangid,
        status: unit.status,
        created_by: req.user?.userId || null
      });
    }

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

    if (unit.status === 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit is already inactive'
      });
    }

    // Set status to non-active (0)
    await unit.update({ 
      status: 0,
      updated_by: req.user?.userId || null
    });

    // Create history record with brandtvid
    if (HistoryUnits) {
      await HistoryUnits.create({
        unitid: unit.id,
        name: unit.name,
        brandtvid: unit.brandtvid,
        cabangid: unit.cabangid,
        status: unit.status,
        created_by: req.user?.userId || null
      });
    }

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