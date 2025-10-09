const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import models
let Member;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Member = models.member;
} catch (error) {
  console.error('Error loading models:', error);
}

// GET all members
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { status, limit = 50, offset = 0, search } = req.query;

    // Build where clause
    let whereClause = {};
    
    // if (status !== undefined) {
      // whereClause.status = 1;
    // }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { telepon: { [Op.like]: `%${search}%` } }
      ];
    }

    const members = await Member.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'name', 'telepon', 'status', 'created_by', 'updated_by', 'createdAt', 'updatedAt'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['status', 'DESC']]
    });

    res.json({
      success: true,
      data: members.rows,
      total: members.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET member by ID
router.get('/activemember', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { limit = 50, offset = 0 } = req.query;

    // Build where clause
    let whereClause = {};
    whereClause.status = 1;

    const members = await Member.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'name', 'telepon', 'status', 'created_by', 'updated_by', 'createdAt', 'updatedAt'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'DESC']]
    });

    res.json({
      success: true,
      data: members.rows,
      total: members.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET member by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { id } = req.params;

    const member = await Member.findOne({
      where: { id: parseInt(id) },
      attributes: ['id', 'name', 'telepon', 'status', 'created_by', 'updated_by', 'createdAt', 'updatedAt']
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    console.error('Get member by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST create new member
router.post('/', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { name, telepon, status } = req.body;

    // Validasi input
    if (!name || !telepon) {
      return res.status(400).json({
        success: false,
        message: 'Name and telepon are required'
      });
    }

    // Cek apakah telepon sudah ada
    const existingPhone = await Member.findOne({
      where: { telepon, status: 1 }
    });

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already exists'
      });
    }

    const memberData = {
      name,
      telepon,
      status: status !== undefined ? parseInt(status) : 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    };

    const newMember = await Member.create(memberData);

    res.status(201).json({
      success: true,
      message: 'Member created successfully',
      data: newMember
    });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT update member
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { id } = req.params;
    const { name, telepon, status } = req.body;

    const member = await Member.findOne({
      where: { id: parseInt(id) }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Validasi input
    if (!name || !telepon) {
      return res.status(400).json({
        success: false,
        message: 'Name and telepon are required'
      });
    }

    // Cek apakah telepon sudah ada di member lain
    if (telepon !== member.telepon) {
      const existingPhone = await Member.findOne({
        where: { 
          telepon, 
          status: 1,
          id: { [Op.ne]: parseInt(id) }
        }
      });

      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: 'Phone number already exists'
        });
      }
    }

    const updateData = {
      name,
      telepon,
      status: status !== undefined ? parseInt(status) : member.status,
      updated_by: req.user?.userId || member.updated_by
    };

    await member.update(updateData);

    res.json({
      success: true,
      message: 'Member updated successfully',
      data: member
    });
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE member (soft delete - change status to 0)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { id } = req.params;

    const member = await Member.findOne({
      where: { id: parseInt(id) }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    if (member.status === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member already deleted'
      });
    }

    // Soft delete - ubah status menjadi 0
    await member.update({
      status: 0,
      updated_by: req.user?.userId || member.updated_by
    });

    res.json({
      success: true,
      message: 'Member deleted successfully',
      data: member
    });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;