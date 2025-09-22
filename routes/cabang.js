const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model cabang, users, dan access
let Cabang, Users, Access;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Cabang = models.cabang;
  Users = models.users;
  Access = models.access;
  
  if (!Cabang) {
    console.error('❌ Cabang model not found in models');
  } else {
    console.log('✅ Cabang model loaded successfully');
  }
  
  if (!Users) {
    console.error('❌ Users model not found in models');
  } else {
    console.log('✅ Users model loaded successfully');
  }
  
  if (!Access) {
    console.error('❌ Access model not found in models');
  } else {
    console.log('✅ Access model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading models:', error.message);
}

// Get cabang berdasarkan user yang login (protected)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!Cabang || !Users || !Access) {
      return res.status(500).json({
        success: false,
        message: 'Required models not available'
      });
    }

    const { search, limit = 50, offset = 0 } = req.query;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    try {
      // Menggunakan raw query untuk mendapatkan cabang berdasarkan user login
      let query = `
        SELECT c.id, c.name, c.status,
               COUNT(*) OVER() as total_count
        FROM users u 
        JOIN access a ON a.userid = u.id 
        JOIN cabang c ON c.id = a.cabangid
        WHERE c.status = 1 AND u.id = ?
      `;
      
      const replacements = [userId];

      // Tambahkan search jika ada
      if (search) {
        query += ` AND c.name LIKE ?`;
        replacements.push(`%${search}%`);
      }

      query += ` ORDER BY c.name ASC LIMIT ? OFFSET ?`;
      replacements.push(parseInt(limit), parseInt(offset));

      const results = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      const totalCount = results.length > 0 ? parseInt(results[0].total_count) : 0;

      // Remove total_count from individual records
      const cleanResults = results.map(row => {
        const { total_count, ...cleanRow } = row;
        return cleanRow;
      });

      res.json({
        success: true,
        data: cleanResults,
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        user_id: userId
      });
    } catch (rawQueryError) {
      console.error('Raw query failed, trying Sequelize approach:', rawQueryError);
      
      // Fallback ke Sequelize query builder
      let whereClause = { status: 1 };
      
      // Search berdasarkan name
      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }

      const cabangData = await Cabang.findAndCountAll({
        include: [
          {
            model: Access,
            as: 'access',
            include: [
              {
                model: Users,
                as: 'user',
                where: { id: userId },
                attributes: []
              }
            ],
            attributes: []
          }
        ],
        where: whereClause,
        attributes: ['id', 'name', 'status'],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['name', 'ASC']]
      });

      res.json({
        success: true,
        data: cabangData.rows,
        total: cabangData.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        user_id: userId,
        fallback: true
      });
    }
  } catch (error) {
    console.error('Get cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get cabang by ID (hanya cabang yang user memiliki akses)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!Cabang || !Users || !Access) {
      return res.status(500).json({
        success: false,
        message: 'Required models not available'
      });
    }

    const cabangId = parseInt(req.params.id);
    const userId = req.user?.userId;

    if (isNaN(cabangId) || cabangId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cabang ID. Must be a positive number.' 
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    // Cek apakah user memiliki akses ke cabang ini
    const cabangAccess = await sequelize.query(`
      SELECT c.id, c.name, c.status, c.created_at, c.updated_at
      FROM users u 
      JOIN access a ON a.userid = u.id 
      JOIN cabang c ON c.id = a.cabangid
      WHERE c.status = 1 AND u.id = ? AND c.id = ?
    `, {
      replacements: [userId, cabangId],
      type: sequelize.QueryTypes.SELECT
    });

    if (cabangAccess.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cabang not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: cabangAccess[0],
      user_id: userId
    });
  } catch (error) {
    console.error('Get cabang by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all cabang (admin only) - untuk melihat semua cabang tanpa filter user
router.get('/admin/all', verifyToken, verifyAdmin, async (req, res) => {
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
    
    // Search berdasarkan name
    if (search) {
      whereClause.name = { [Op.like]: `%${search}%` };
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
    console.error('Get all cabang error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Debug route untuk melihat access user
router.get('/debug/user-access', verifyToken, async (req, res) => {
  try {
    if (!sequelize) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }

    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    // Debug query untuk melihat akses user
    const userAccess = await sequelize.query(`
      SELECT u.id as user_id, u.username, u.name as user_name,
             a.id as access_id, a.cabangid,
             c.id as cabang_id, c.name as cabang_name, c.status as cabang_status
      FROM users u 
      LEFT JOIN access a ON a.userid = u.id 
      LEFT JOIN cabang c ON c.id = a.cabangid
      WHERE u.id = ?
      ORDER BY c.name ASC
    `, {
      replacements: [userId],
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      message: 'User access debug data retrieved successfully',
      data: {
        user_id: userId,
        access_data: userAccess
      }
    });
  } catch (error) {
    console.error('Debug user access error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new cabang (admin only)
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Cabang) {
      return res.status(500).json({
        success: false,
        message: 'Cabang model not available'
      });
    }

    const { name } = req.body;
    
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
    
    if (isNaN(cabangId) || cabangId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cabang ID. Must be a positive number.' 
      });
    }

    const cabang = await Cabang.findByPk(cabangId);
    
    if (!cabang) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cabang not found' 
      });
    }

    const { name, status } = req.body;
    
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
      status: status !== undefined ? parseInt(status) : cabang.status
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
    
    if (isNaN(cabangId) || cabangId < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cabang ID. Must be a positive number.' 
      });
    }

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

module.exports = router;