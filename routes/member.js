const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model member
let Member;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Member = models.member;
  
  if (!Member) {
    console.error('❌ Member model not found in models');
  } else {
    console.log('✅ Member model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading member model:', error.message);
}

// Get all members (protected)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { status, search, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    
    // Filter berdasarkan status (1 = active sebagai default jika tidak dispesifikasi)
    if (status !== undefined) {
      whereClause.status = parseInt(status);
    } else {
      whereClause.status = { [Op.ne]: 0 }; // Tampilkan yang bukan non-active
    }
    
    // Search berdasarkan name atau telpon
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { telpon: { [Op.like]: `%${search}%` } }
      ];
    }
    
    const members = await Member.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'ASC']]
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

// Get member by ID (protected)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const memberId = parseInt(req.params.id);
    const member = await Member.findByPk(memberId);
    
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
    console.error('Get member error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new member (admin only) - SINGLE MEMBER
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const { name, telpon, status } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    // Validate phone number format (optional but recommended)
    if (telpon && !/^[0-9+\-\s()]+$/.test(telpon)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    // Check if member with same name already exists
    const existingMember = await Member.findOne({
      where: { name }
    });

    if (existingMember) {
      return res.status(409).json({
        success: false,
        message: 'Member name already exists'
      });
    }

    // Check if phone number already exists (if provided)
    if (telpon) {
      const existingPhone = await Member.findOne({
        where: { telpon }
      });

      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: 'Phone number already exists'
        });
      }
    }

    const newMember = await Member.create({
      name,
      telpon: telpon || null,
      status: status !== undefined ? parseInt(status) : 1,
      created_by: req.user?.userId || null,
      updated_by: req.user?.userId || null
    });

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

// Update member (admin only)
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const memberId = parseInt(req.params.id);
    const member = await Member.findByPk(memberId);
    
    if (!member) {
      return res.status(404).json({ 
        success: false, 
        message: 'Member not found' 
      });
    }

    const { name, telpon, status } = req.body;
    
    // Validate phone number format (if provided)
    if (telpon && !/^[0-9+\-\s()]+$/.test(telpon)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    // Check if new name already exists (exclude current member)
    if (name && name !== member.name) {
      const existingMember = await Member.findOne({
        where: { 
          name,
          id: { [Op.ne]: memberId }
        }
      });

      if (existingMember) {
        return res.status(409).json({
          success: false,
          message: 'Member name already exists'
        });
      }
    }

    // Check if new phone number already exists (exclude current member)
    if (telpon && telpon !== member.telpon) {
      const existingPhone = await Member.findOne({
        where: { 
          telpon,
          id: { [Op.ne]: memberId }
        }
      });

      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: 'Phone number already exists'
        });
      }
    }
    
    await member.update({
      name: name || member.name,
      telpon: telpon !== undefined ? telpon : member.telpon,
      status: status !== undefined ? parseInt(status) : member.status,
      updated_by: req.user?.userId || member.updated_by
    });

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

// Delete member (admin only) - Set status to inactive (0)
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!Member) {
      return res.status(500).json({
        success: false,
        message: 'Member model not available'
      });
    }

    const memberId = parseInt(req.params.id);
    const member = await Member.findByPk(memberId);
    
    if (!member) {
      return res.status(404).json({ 
        success: false, 
        message: 'Member not found' 
      });
    }

    if (member.status === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member is already inactive'
      });
    }

    // Set status to non-active (0)
    await member.update({ 
      status: 0,
      updated_by: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'Member deactivated successfully'
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