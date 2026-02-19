const express = require('express');
const { verifyToken, verifyRole, verifyAdmin, verifyUser } = require('../middleware/auth');
const { PERMISSIONS, PERMISSION_GROUPS } = require('../constants/permissions');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model units
let Unit, Cabang, HistoryUnits, Brandtv, Access;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Unit = models.units;
  Cabang = models.cabang;
  HistoryUnits = models.history_units;
  Brandtv = models.brandtv;
  Access = models.access;
  
  if (!Unit) {
    console.error('❌ Units model not found in models');
  } else {
    console.log('✅ Units model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading units model:', error.message);
}

// Get all units (protected) - UPDATE
router.get('/', verifyToken, verifyRole([PERMISSIONS.VIEW_UNIT_RENTAL]), async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const { status, cabang, brandtvid, limit = 50, offset = 0, include_relations = false } = req.query;
    const cabangaccess = [];
    
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

    // Setup include untuk join
    const includeOptions = [];
    
    if (include_relations === 'true') {
      // Join dengan Brandtv - UPDATE: gunakan ip_address
      if (Brandtv) {
        includeOptions.push({
          model: Brandtv,
          as: 'brandtv',
          attributes: ['id', 'name', 'tv_id', 'ip_address'], // UPDATE: ip_address
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
      attributes: ['id', 'name', 'description', 'brandtvid' , 'cabangid', 'price', 'status', 'created_by', 'updated_by', 'createdAt', 'updatedAt'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'ASC']],
      include: includeOptions,
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
router.get('/available-tv/:id', verifyToken, async (req, res) => {
  try {
    if (!Brandtv) {
      return res.status(500).json({
        success: false,
        message: 'Brandtv model not available'
      });
    }

    const { limit = 50, offset = 0 } = req.query;
    const cabangid = req.params.id;

    // Validasi cabangid
    if (!cabangid) {
      return res.status(400).json({
        success: false,
        message: 'cabangid parameter is required'
      });
    }

    // Validate and parse numeric parameters
    const parsedLimit = parseInt(limit) || 50;
    const parsedOffset = parseInt(offset) || 0;

    try {
      // Menggunakan raw query dengan kolom yang benar
      const results = await sequelize.query(`
        SELECT b.id, b.name, b.ip_address, b.cabangid,
               COUNT(*) OVER() as total_count
        FROM brandtv b 
        LEFT JOIN units u ON u.brandtvid = b.id AND u.status != 0
        WHERE u.id IS NULL
        AND b.cabangid = ? 
        ORDER BY b.name ASC
        LIMIT ? OFFSET ?
      `, {
        replacements: [cabangid, parsedLimit, parsedOffset],
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
          attributes: ['id', 'name', 'cabangid', 'ip_address'], // UPDATE: ip_address
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

router.get('/available-tv/edit/:id/:ids', verifyToken, async (req, res) => {
  try {
    if (!Brandtv) {
      return res.status(500).json({
        success: false,
        message: 'Brandtv model not available'
      });
    }

    const { limit = 50, offset = 0 } = req.query;
    const unit_id = req.params.id;
    const cabang_id = req.params.ids; // cabangid

    // Validasi unit_id
    if (!unit_id) {
      return res.status(400).json({
        success: false,
        message: 'unit_id parameter is required'
      });
    }

    // Validasi cabang_id
    if (!cabang_id) {
      return res.status(400).json({
        success: false,
        message: 'cabang_id parameter is required'
      });
    }

    const parsedUnitId = parseInt(unit_id);
    if (isNaN(parsedUnitId) || parsedUnitId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_id. Must be a positive number.'
      });
    }

    const parsedCabangId = parseInt(cabang_id);
    if (isNaN(parsedCabangId) || parsedCabangId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cabang_id. Must be a positive number.'
      });
    }

    // Validate and parse numeric parameters
    const parsedLimit = parseInt(limit) || 50;
    const parsedOffset = parseInt(offset) || 0;

    try {
      // Menggunakan raw query dengan UNION dan GROUP BY - PERBAIKAN
      const results = await sequelize.query(`
        SELECT * FROM (
          (SELECT b.id, b.name, b.ip_address, b.cabangid,
                  'available' as status_type
           FROM brandtv b 
           LEFT JOIN units u ON u.brandtvid = b.id AND u.status != 0
           WHERE u.id IS NULL
           AND b.cabangid = ?
           GROUP BY b.id, b.name, b.ip_address, b.cabangid)
          UNION 
          (SELECT b.id, b.name, b.ip_address, b.cabangid,
                  'current' as status_type
           FROM brandtv b 
           LEFT JOIN units u ON u.brandtvid = b.id 
           WHERE u.id = ?
           AND b.cabangid = ?
           AND u.status = 1
           GROUP BY b.id, b.name, b.ip_address, b.cabangid)
        ) as combined_results
        ORDER BY status_type DESC, name ASC
        LIMIT ? OFFSET ?
      `, {
        replacements: [parsedCabangId, parsedUnitId, parsedCabangId, parsedLimit, parsedOffset],
        type: sequelize.QueryTypes.SELECT
      });

      console.log('Query results:', results);

      // Get total count dengan query terpisah
      const countResults = await sequelize.query(`
        SELECT COUNT(*) as total FROM (
          (SELECT b.id
           FROM brandtv b 
           LEFT JOIN units u ON u.brandtvid = b.id AND u.status != 0
           WHERE u.id IS NULL
           AND b.cabangid = ?
           GROUP BY b.id)
          UNION 
          (SELECT b.id
           FROM brandtv b 
           LEFT JOIN units u ON u.brandtvid = b.id 
           WHERE u.id = ?
           AND b.cabangid = ?
           AND u.status = 1
           GROUP BY b.id)
        ) as total_count
      `, {
        replacements: [parsedCabangId, parsedUnitId, parsedCabangId],
        type: sequelize.QueryTypes.SELECT
      });

      const totalCount = countResults[0]?.total || 0;

      // Validasi hasil query
      if (!Array.isArray(results)) {
        throw new Error('Query result is not an array');
      }

      // Tambahkan informasi status
      const cleanResults = results.map(row => {
        return {
          ...row,
          is_current: row.status_type === 'current' // Menandai TV yang sedang digunakan oleh unit ini
        };
      });

      res.json({
        success: true,
        message: 'Available TV brands for edit retrieved successfully',
        data: cleanResults,
        total: parseInt(totalCount),
        limit: parsedLimit,
        offset: parsedOffset,
        unit_id: parsedUnitId,
        cabang_id: parsedCabangId
      });
    } catch (rawQueryError) {
      console.error('Raw query failed:', rawQueryError);
      console.error('Raw query error details:', {
        message: rawQueryError.message,
        sql: rawQueryError.sql,
        parameters: rawQueryError.parameters
      });
      
      // Fallback ke Sequelize query builder - PERBAIKAN DUPLIKASI
      try {
        // Get current TV (yang sedang digunakan oleh unit ini) - dengan GROUP BY
        const currentTv = await sequelize.query(`
          SELECT b.id, b.name, b.ip_address, b.cabangid
          FROM brandtv b 
          LEFT JOIN units u ON u.brandtvid = b.id 
          WHERE u.id = ?
          AND b.cabangid = ?
          AND u.status = 1
          GROUP BY b.id, b.name, b.ip_address, b.cabangid
        `, {
          replacements: [parsedUnitId, parsedCabangId],
          type: sequelize.QueryTypes.SELECT
        });

        // Get available TVs (yang belum digunakan) dalam cabang tertentu - dengan GROUP BY dan EXCLUDE current TV
        const currentTvIds = currentTv.map(tv => tv.id);
        const excludeIds = currentTvIds.length > 0 ? currentTvIds : [0]; // fallback jika tidak ada current TV

        const availableTvs = await sequelize.query(`
          SELECT b.id, b.name, b.ip_address, b.cabangid
          FROM brandtv b 
          LEFT JOIN units u ON u.brandtvid = b.id AND u.status != 0
          WHERE u.id IS NULL
          AND b.cabangid = ?
          AND u.status = 1
          AND b.id NOT IN (${excludeIds.map(() => '?').join(',')})
          GROUP BY b.id, b.name, b.ip_address, b.cabangid
          ORDER BY b.name ASC
        `, {
          replacements: [parsedCabangId, ...excludeIds],
          type: sequelize.QueryTypes.SELECT
        });

        // Combine results tanpa duplikasi - menggunakan Map untuk memastikan unique ID
        const combinedMap = new Map();
        
        // Add current TV first (priority) - sudah unique karena GROUP BY
        currentTv.forEach(tv => {
          combinedMap.set(tv.id, { ...tv, is_current: true, status_type: 'current' });
        });
        
        // Add available TVs - sudah exclude current TV di query
        availableTvs.forEach(tv => {
          if (!combinedMap.has(tv.id)) { // double check untuk safety
            combinedMap.set(tv.id, { ...tv, is_current: false, status_type: 'available' });
          }
        });

        // Convert Map to Array dan sort
        const combinedResults = Array.from(combinedMap.values())
          .sort((a, b) => {
            // Sort by status_type first (current first), then by name
            if (a.status_type !== b.status_type) {
              return a.status_type === 'current' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

        // Apply pagination - TIDAK ADA DUPLIKASI LAGI
        const paginatedResults = combinedResults.slice(parsedOffset, parsedOffset + parsedLimit);

        res.json({
          success: true,
          message: 'Available TV brands for edit retrieved successfully (fallback)',
          data: paginatedResults,
          total: combinedResults.length,
          limit: parsedLimit,
          offset: parsedOffset,
          unit_id: parsedUnitId,
          cabang_id: parsedCabangId,
          fallback: true,
          debug: {
            current_tv_count: currentTv.length,
            available_tv_count: availableTvs.length,
            combined_unique_count: combinedResults.length
          }
        });
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        throw fallbackError;
      }
    }
  } catch (error) {
    console.error('Get available TV for edit error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/allactive/:id', verifyToken, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const { status, cabang, brandtvid, limit = 50, offset = 0, include_relations = false } = req.query;
    const _cabang = req.params.id;
    
    let whereClause = {};

    whereClause.cabangid = _cabang;
    whereClause.status = 1;

    // Setup include untuk join
    const includeOptions = [];
    
    if (include_relations === 'true') {
      // Join dengan Brandtv - UPDATE: gunakan ip_address
      if (Brandtv) {
        includeOptions.push({
          model: Brandtv,
          as: 'brandtv',
          attributes: ['id', 'name', 'ip_address'], // UPDATE: ip_address
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
      attributes: ['id', 'token', 'name', 'description', 'brandtvid', 'cabangid', 'price', 'status', 'created_by', 'updated_by', 'createdAt', 'updatedAt'],
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

router.get('/allactiveready/:id', verifyToken, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const { status, cabang, brandtvid, limit = 50, offset = 0, include_relations = false } = req.query;
    const _cabang = req.params.id;

    const checkNotReady = await sequelize.query(`
      SELECT COALESCE(u.id, hu.unitid, 0) as id 
      FROM transaksi t
      JOIN transaksi_detail td ON td.code = t.code
      LEFT JOIN units u ON u.token = td.unit_token
      LEFT JOIN history_units hu ON hu.token = td.unit_token
      WHERE t.status = 1
      AND td.unit_token IS NOT NULL
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    // Langsung dapat array ID tanpa loop for
    const notready = checkNotReady.map(row => row.id);
    
    let whereClause = {};

    whereClause.cabangid = _cabang;
    whereClause.status = 1;

    if (notready.length > 0) {
      whereClause.id = { [Op.notIn]: notready };
    }

    // Setup include untuk join
    const includeOptions = [];
    
    if (include_relations === 'true') {
      // Join dengan Brandtv - UPDATE: gunakan ip_address
      if (Brandtv) {
        includeOptions.push({
          model: Brandtv,
          as: 'brandtv',
          attributes: ['id', 'name', 'ip_address'], // UPDATE: ip_address
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
      attributes: ['id', 'token', 'name', 'description', 'brandtvid', 'cabangid', 'price', 'status', 'created_by', 'updated_by', 'createdAt', 'updatedAt'],
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

router.get('/report', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate, cabang, unit } = req.query;
    // console.log('Received report request with parameters:', { startDate, endDate, cabang, unit });
    // return;
    let _unit = [];

    if(cabang != undefined && unit != undefined) {
        _unit = await sequelize.query(`
          SELECT u.*, b.name as brand_name
          FROM units u
          JOIN brandtv b ON b.id = u.brandtvid
          where u.id = ? and u.cabangid = ?
        `, {
          replacements: [unit, cabang],
          type: sequelize.QueryTypes.SELECT
        });
    }else if(cabang && unit == undefined) {
        _unit = await sequelize.query(`
          SELECT u.*, b.name as brand_name
          FROM units u
          JOIN brandtv b ON b.id = u.brandtvid
          where u.cabangid = ?
        `, {
          replacements: [cabang],
          type: sequelize.QueryTypes.SELECT
        });
      }else {
        _unit = await sequelize.query(`
          SELECT u.*, b.name as brand_name
          FROM units u
          JOIN brandtv b ON b.id = u.brandtvid
        `, {
          type: sequelize.QueryTypes.SELECT
        });
      }

    const transaksi = [];
    for (const units of _unit) {
      const history_units = await sequelize.query(`
        select * from 
        history_units hu
        where hu.unitid = ?
        `,{
          replacements: [units.id],
        type: sequelize.QueryTypes.SELECT
      });

      const token_unit = [];
      for (const history of history_units) {
        token_unit.push(history.token);
      }

      const count_hours = await sequelize.query(`
          select count(hours) as count_hours, count(qty*harga) as count_price
          from transaksi_detail
          where unit_token IN (${token_unit.map(() => '?').join(',')})
          and createdAt >= ? and createdAt <= ?
        `,{
        replacements: [...token_unit, startDate, endDate],
        type: sequelize.QueryTypes.SELECT
      });

      transaksi.push({
        brand_name: units.brand_name,
        unit: units.name,
        count_hours: count_hours[0].count_hours,
        count_price: count_hours[0].count_price,
        status: units.status
      });
    }
    return res.json({
      success: true,
      data: transaksi
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
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
    
    if (isNaN(unitId) || unitId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid unit ID. Must be a positive number.',
        received: req.params.id
      });
    }

    const { include_relations = false } = req.query;

    const includeOptions = [];
    
    if (include_relations === 'true') {
      if (Brandtv) {
        includeOptions.push({
          model: Brandtv,
          as: 'brandtv',
          attributes: ['id', 'name', 'ip_address'], // UPDATE: ip_address
          required: false
        });
      }
      
      if (Cabang) {
        includeOptions.push({
          model: Cabang,
          as: 'cabang',
          attributes: ['id', 'name', 'status'],
          required: false
        });
      }
    }

    const unit = await Unit.findByPk(unitId, {
      include: includeOptions
    });
    
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

// Create new unit (admin only) - UPDATE
router.post('/', verifyToken, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }
    const { name, description, cabang, cabangid, brandtvid, status, price } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    if(cabang || cabangid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Use either cabang, not both.' 
      });
    }

    if (brandtvid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Use brandtv ID instead of brandtvid.' 
      });
    }

    if(price){
      return res.status(400).json({ 
        success: false, 
        message: 'Price must be a number.' 
      });
    }

    // Check if unit name already exists
    const existingUnit = await Unit.findOne({
      where: { name , status: 1, cabangid: cabang ? parseInt(cabang) : null }
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

    const _token =  'UNT-' + Math.random().toString(36).substring(2, 15); // Generate random token

    const newUnit = await Unit.create({
      token: _token,
      name,
      description: description || null,
      cabangid: cabang ? parseInt(cabang) : (cabangid ? parseInt(cabangid) : null),
      brandtvid: brandtvid ? parseInt(brandtvid) : null,
      status: status !== undefined ? parseInt(status) : 1,
      price: price !== undefined ? parseFloat(price) : null,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    });

    await HistoryUnits.create({
      token: _token,
      unitid: newUnit.id,
      name,
      description: description,
      brandtvid: brandtvid ? parseInt(brandtvid) : null,
      cabangid: cabang ? parseInt(cabang) : (cabangid ? parseInt(cabangid) : null),
      price: price !== undefined ? parseFloat(price) : null,
      status: 1,
      desc: 'Created',
      created_by: req.user?.userId || null
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

router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const unitId = parseInt(req.params.id);
    
    if (isNaN(unitId) || unitId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid unit ID. Must be a positive number.',
        received: req.params.id
      });
    }

    const unit = await Unit.findByPk(unitId);
    
    if (!unit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Unit not found' 
      });
    }

    const brand = await Unit.findOne({
      where: { 
        brandtvid: req.body.brandtvid,
        status : 1,
        id: { [Op.ne]: unitId } // Exclude current unit
       }
    });

    if(brand != null){
      return res.status(409).json({
        success: false,
        message: 'Brand TV already used by another unit'
      });
    }

    const { name, description, cabang, cabangid, price, brandtvid, status } = req.body;

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
    // if (cabang !== undefined && Cabang) {
    //   const parsedCabangId = parseInt(cabang);
    //   if (!isNaN(parsedCabangId)) {
    //     const cabangExists = await Cabang.findOne({
    //       where: { 
    //         id: parsedCabangId,
    //         status: 1 
    //       }
    //     });

    //     if (!cabangExists) {
    //       return res.status(400).json({
    //         success: false,
    //         message: 'Invalid cabang ID or cabang is inactive'
    //       });
    //     }
    //   }
    // }
    
    // if (cabangid !== undefined && Cabang) {
    //   const parsedCabangId = parseInt(cabangid);
    //   if (!isNaN(parsedCabangId)) {
    //     const cabangExists = await Cabang.findOne({
    //       where: { 
    //         id: parsedCabangId,
    //         status: 1 
    //       }
    //     });

    //     if (!cabangExists) {
    //       return res.status(400).json({
    //         success: false,
    //         message: 'Invalid cabang ID or cabang is inactive'
    //       });
    //     }
    //   }
    // }

    // Validasi brandtvid jika ada
    if (brandtvid === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Use brandtv ID instead of brandtvid.'
      });
    }

    // Validasi cabangid jika ada
    let parsedCabangId = cabang !== undefined ? cabang : cabangid;
    // if (cabang !== undefined) {
    //   if (cabang === null || cabang === '') {
    //     parsedCabangId = null;
    //   } else {
    //     parsedCabangId = parseInt(cabang);
    //     if (isNaN(parsedCabangId)) {
    //       return res.status(400).json({
    //         success: false,
    //         message: 'Invalid cabang ID. Must be a number.'
    //       });
    //     }
    //   }
    // }

    // Validasi status jika ada
    let parsedStatus = unit.status;
    if (status !== undefined) {
      parsedStatus = parseInt(status);
      if (isNaN(parsedStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be a number.'
        });
      }
    }

    const _token = 'UNT-' + Math.random().toString(36).substring(2, 15); // Generate random token
    
    // Create history record with description
    await HistoryUnits.create({
      token: _token,
      unitid: unit.id,
      name: name || unit.name,
      description: description !== undefined ? description : unit.description,
      brandtvid: brandtvid,
      cabangid: parsedCabangId,
      price: price !== undefined ? parseFloat(price) : unit.price,
      status: parsedStatus,
      desc: 'Updated',
      created_by: req.user?.userId || null
    });
    
    await unit.update({
      token: _token,
      name: name || unit.name,
      description: description !== undefined ? description : unit.description,
      cabangid: parsedCabangId,
      brandtvid: brandtvid,
      price: price !== undefined ? parseFloat(price) : unit.price,
      status: parsedStatus,
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
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!Unit) {
      return res.status(500).json({
        success: false,
        message: 'Units model not available'
      });
    }

    const unitId = parseInt(req.params.id);
    
    if (isNaN(unitId) || unitId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid unit ID. Must be a positive number.',
        received: req.params.id
      });
    }

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

    // Create history record with description
      await HistoryUnits.create({
        unitid: unit.id,
        name: unit.name,
        description: unit.description,
        brandtvid: unit.brandtvid,
        cabangid: unit.cabangid,
        price: unit.price,
        status: 0,
        desc: 'Deleted',
        created_by: req.user?.userId || null
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