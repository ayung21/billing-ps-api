const express = require('express');
const { verifyToken, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model promo
let Promo, Unit, Access, Cabang;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Promo = models.promo;
  Unit = models.units;
  Access = models.access;
  Cabang = models.cabang;
  
  if (!Promo) {
    console.error('❌ Promo model not found in models');
  } else {
    console.log('✅ Promo model loaded successfully');
  }
  
  if (!Unit) {
    console.error('❌ Unit model not found in models');
  } else {
    console.log('✅ Unit model loaded successfully');
  }
  
  if (!Cabang) {
    console.error('❌ Cabang model not found in models');
  } else {
    console.log('✅ Cabang model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading promo model:', error.message);
}

// Get all promo (protected) - WITH JOINS - RAW QUERY ONLY
// Get all promo (protected) - WITH JOINS - RAW QUERY ONLY
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }

    const { status, unitid, cabangid, limit = 50, offset = 0 } = req.query;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    try {
      // Get user's cabang access
      const _access = await sequelize.query(`
        SELECT cabangid FROM access WHERE userid = ?
      `, {
        replacements: [userId],
        type: sequelize.QueryTypes.SELECT
      });
      
      const cabangaccess = _access.map(access => access.cabangid);

      if (cabangaccess.length === 0) {
        return res.json({
          success: true,
          data: [],
          total: 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          message: 'No cabang access found'
        });
      }

      // Build where clause for filters
      let whereClause = [];
      const replacements = [];

      // Status filter
      if (status !== undefined) {
        whereClause.push('p.status = ?');
        replacements.push(parseInt(status));
      } else {
        whereClause.push('p.status != ?');
        replacements.push(0); // Show non-inactive
      }

      // Unit filter
      if (unitid !== undefined) {
        whereClause.push('p.unitid = ?');
        replacements.push(parseInt(unitid));
      }

      // Cabang filter
      if (cabangid !== undefined) {
        whereClause.push('p.cabangid = ?');
        replacements.push(parseInt(cabangid));
      }

      // User cabang access filter
      whereClause.push(`p.cabangid IN (${cabangaccess.map(() => '?').join(',')})`);
      replacements.push(...cabangaccess);

      // Build final query with discount calculation - CAST to DECIMAL for precise calculation
      let query = `
        SELECT p.id, p.name as promoname, p.discount_nominal, p.discount_percent, 
               p.hours, p.status, p.createdAt, p.updatedAt, p.created_by, p.updated_by,
               u.id as unitid, u.name as unitname, u.price as unitprice,
               CAST(u.price * p.hours AS DECIMAL(15,2)) as before_discount,
               CAST((u.price * p.hours) - CASE 
                 WHEN p.discount_nominal IS NULL THEN (u.price * p.hours * (p.discount_percent / 100)) 
                 ELSE p.discount_nominal 
               END AS DECIMAL(15,2)) as after_discount,
               u.description as unitdescription, c.id as cabangid, c.name as cabangname,
               COUNT(*) OVER() as total_count
        FROM promo p 
        JOIN units u ON u.id = p.unitid 
        JOIN cabang c ON c.id = p.cabangid
      `;

      if (whereClause.length > 0) {
        query += ` WHERE ${whereClause.join(' AND ')}`;
      }

      query += ` ORDER BY p.id ASC LIMIT ? OFFSET ?`;
      replacements.push(parseInt(limit), parseInt(offset));

      const results = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      const totalCount = results.length > 0 ? parseInt(results[0].total_count) : 0;

      // Remove total_count from individual records
      const cleanResults = results.map(row => {
        const { total_count, ...cleanRow } = row;
        return {
          ...cleanRow,
          // Convert to proper numeric types
          before_discount: parseFloat(cleanRow.before_discount || 0),
          after_discount: parseFloat(cleanRow.after_discount || 0),
          unitprice: parseFloat(cleanRow.unitprice || 0)
        };
      });

      res.json({
        success: true,
        data: cleanResults,
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        user_cabang_access: cabangaccess
      });
    } catch (queryError) {
      console.error('Query error:', queryError);
      res.status(500).json({ 
        success: false, 
        message: 'Database query failed',
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }
  } catch (error) {
    console.error('Get promos error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ...existing code untuk route lainnya tetap sama...

// Get promo by ID (protected) - WITH JOINS - RAW QUERY ONLY
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }

    const promoId = parseInt(req.params.id);
    const userId = req.user?.userId;

    if (isNaN(promoId) || promoId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid promo ID. Must be a positive number.' 
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    try {
      // Get user's cabang access
      const _access = await sequelize.query(`
        SELECT cabangid FROM access WHERE userid = ?
      `, {
        replacements: [userId],
        type: sequelize.QueryTypes.SELECT
      });
      
      const cabangaccess = _access.map(access => access.cabangid);

      // Raw query untuk get by ID dengan JOIN
      const results = await sequelize.query(`
        SELECT p.id, p.name as promoname, p.discount_nominal, p.discount_percent, 
               p.hours, p.status, p.created_at, p.updated_at, p.created_by, p.updated_by,
               u.id as unitid, u.name as unitname, u.price as unitprice, u.description as unitdescription,
               c.id as cabangid, c.name as cabangname
        FROM promo p 
        JOIN units u ON u.id = p.unitid 
        JOIN cabang c ON c.id = p.cabangid
        WHERE p.id = ? AND p.cabangid IN (${cabangaccess.map(() => '?').join(',')})
      `, {
        replacements: [promoId, ...cabangaccess],
        type: sequelize.QueryTypes.SELECT
      });

      if (results.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Promo not found or access denied' 
        });
      }

      res.json({
        success: true,
        data: results[0],
        user_cabang_access: cabangaccess
      });
    } catch (queryError) {
      console.error('Query error:', queryError);
      res.status(500).json({ 
        success: false, 
        message: 'Database query failed',
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }
  } catch (error) {
    console.error('Get promo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new promo (admin only) - RAW QUERY
router.post('/', verifyToken, async (req, res) => {
  try {
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }

    const { 
      name, 
      unitid, 
      discount_percent, 
      discount_nominal, 
      cabangid,
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

    if (!hours || isNaN(parseInt(hours))) {
      return res.status(400).json({
        success: false,
        message: 'Hours must be a number'
      });
    }

    if (!unitid) {
      return res.status(400).json({
        success: false,
        message: 'Unit must be selected from available units only'
      });
    }

    try {
      // Validate unit exists and get cabangid from unit - RAW QUERY
      // const unitExists = await sequelize.query(`
      //   SELECT id, cabangid FROM units WHERE id = ? AND status != 0
      // `, {
      //   replacements: [parseInt(unitid)],
      //   type: sequelize.QueryTypes.SELECT
      // });

      // if (unitExists.length === 0) {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Invalid unit ID or unit is inactive'
      //   });
      // }

      // const cabangid = unitExists[0].cabangid;

      // Check if promo name already exists in the same cabang - RAW QUERY
      const existingPromo = await sequelize.query(`
        SELECT id FROM promo WHERE name = ? AND cabangid = ?
      `, {
        replacements: [name, cabangid],
        type: sequelize.QueryTypes.SELECT
      });

      if (existingPromo.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Promo name already exists in this cabang'
        });
      }

      // Insert new promo - RAW QUERY
      const insertResult = await sequelize.query(`
        INSERT INTO promo (name, unitid, cabangid, discount_percent, discount_nominal, hours, status, created_by, updated_by, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, {
        replacements: [
          name,
          parseInt(unitid),
          cabangid,
          discount_percent ? parseInt(discount_percent) : null,
          discount_nominal ? parseInt(discount_nominal) : null,
          parseInt(hours),
          status !== undefined ? parseInt(status) : 1,
          req.user?.userId || null,
          req.user?.userId || null
        ],
        type: sequelize.QueryTypes.INSERT
      });

      const newPromoId = insertResult[0];

      // Get the created promo with JOIN
      const newPromo = await sequelize.query(`
        SELECT p.id, p.name as promoname, p.discount_nominal, p.discount_percent, 
               p.hours, p.status, p.createdAt, p.updatedAt,
               u.id as unitid, u.name as unitname, u.price as unitprice,
               c.id as cabangid, c.name as cabangname
        FROM promo p 
        JOIN units u ON u.id = p.unitid 
        JOIN cabang c ON c.id = p.cabangid
        WHERE p.id = ?
      `, {
        replacements: [newPromoId],
        type: sequelize.QueryTypes.SELECT
      });

      res.status(201).json({
        success: true,
        message: 'Promo created successfully',
        data: newPromo[0]
      });
    } catch (queryError) {
      console.error('Query error:', queryError);
      res.status(500).json({ 
        success: false, 
        message: 'Database query failed',
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }
  } catch (error) {
    console.error('Create promo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update promo (admin only) - RAW QUERY
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }

    const promoId = parseInt(req.params.id);
    
    if (isNaN(promoId) || promoId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid promo ID. Must be a positive number.' 
      });
    }

    try {
      // Check if promo exists - RAW QUERY
      const existingPromo = await sequelize.query(`
        SELECT * FROM promo WHERE id = ?
      `, {
        replacements: [promoId],
        type: sequelize.QueryTypes.SELECT
      });
      
      if (existingPromo.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Promo not found' 
        });
      }

      const promo = existingPromo[0];
      
      const { 
        name, 
        unitid,
        cabangid,
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

      // Check if new name already exists (exclude current promo) - RAW QUERY
      if (name && name !== promo.name) {
        const existingName = await sequelize.query(`
          SELECT id FROM promo WHERE name = ? AND id != ? AND cabangid = ?
        `, {
          replacements: [name, promoId, promo.cabangid],
          type: sequelize.QueryTypes.SELECT
        });

        if (existingName.length > 0) {
          return res.status(409).json({
            success: false,
            message: 'Promo name already exists in this cabang'
          });
        }
      }

      // Validate unit exists if provided - RAW QUERY
      if (unitid) {
        const unitExists = await sequelize.query(`
          SELECT id FROM units WHERE id = ? AND status != 0
        `, {
          replacements: [parseInt(unitid)],
          type: sequelize.QueryTypes.SELECT
        });

        if (unitExists.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Invalid unit ID or unit is inactive'
          });
        }
      }

      // Update promo - RAW QUERY
      await sequelize.query(`
        UPDATE promo 
        SET name = ?, 
            unitid = ?, 
            discount_percent = ?, 
            discount_nominal = ?, 
            hours = ?, 
            status = ?, 
            updated_by = ?, 
            updatedAt = NOW()
        WHERE id = ?
      `, {
        replacements: [
          name || promo.name,
          unitid !== undefined ? (unitid ? parseInt(unitid) : null) : promo.unitid,
          discount_percent !== undefined ? (discount_percent ? parseInt(discount_percent) : null) : promo.discount_percent,
          discount_nominal !== undefined ? (discount_nominal ? parseInt(discount_nominal) : null) : promo.discount_nominal,
          hours !== undefined ? (hours ? parseInt(hours) : null) : promo.hours,
          status !== undefined ? parseInt(status) : promo.status,
          req.user?.userId || null,
          promoId
        ],
        type: sequelize.QueryTypes.UPDATE
      });

      // Get updated promo with JOIN
      const updatedPromo = await sequelize.query(`
        SELECT p.id, p.name as promoname, p.discount_nominal, p.discount_percent, 
               p.hours, p.status, p.createdAt, p.updatedAt,
               u.id as unitid, u.name as unitname, u.price as unitprice,
               c.id as cabangid, c.name as cabangname
        FROM promo p 
        JOIN units u ON u.id = p.unitid 
        JOIN cabang c ON c.id = p.cabangid
        WHERE p.id = ?
      `, {
        replacements: [promoId],
        type: sequelize.QueryTypes.SELECT
      });

      res.json({
        success: true,
        message: 'Promo updated successfully',
        data: updatedPromo[0]
      });
    } catch (queryError) {
      console.error('Query error:', queryError);
      res.status(500).json({ 
        success: false, 
        message: 'Database query failed',
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }
  } catch (error) {
    console.error('Update promo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete promo (admin only) - Set status to inactive (0) - RAW QUERY
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }

    const promoId = parseInt(req.params.id);
    
    if (isNaN(promoId) || promoId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid promo ID. Must be a positive number.' 
      });
    }

    try {
      // Check if promo exists - RAW QUERY
      const existingPromo = await sequelize.query(`
        SELECT id, status FROM promo WHERE id = ?
      `, {
        replacements: [promoId],
        type: sequelize.QueryTypes.SELECT
      });
      
      if (existingPromo.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Promo not found' 
        });
      }

      if (existingPromo[0].status === 0) {
        return res.status(400).json({
          success: false,
          message: 'Promo is already inactive'
        });
      }

      // Set status to non-active (0) - RAW QUERY
      await sequelize.query(`
        UPDATE promo 
        SET status = 0, updated_by = ?, updated_at = NOW()
        WHERE id = ?
      `, {
        replacements: [req.user?.userId || null, promoId],
        type: sequelize.QueryTypes.UPDATE
      });

      res.json({
        success: true,
        message: 'Promo deactivated successfully'
      });
    } catch (queryError) {
      console.error('Query error:', queryError);
      res.status(500).json({ 
        success: false, 
        message: 'Database query failed',
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }
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