const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// Import model users
const initModels = require('../models/init-models');
const { verifyToken } = require('../middleware/auth');
const models = initModels(sequelize);
const User = models.users;
const Role = models.role;
const Access = models.access;

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Find user by username or email
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username },
          { email: username }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // ✅ CEK STATUS USER
    if (user.status !== 1) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is inactive. Please contact administrator' 
      });
    }

    // Compare password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // ✅ CEK ACTIVE_PERIOD
    if (user.active_period) {
      const activePeriod = new Date(user.active_period);
      const today = new Date();
      
      // Set jam ke 00:00:00 untuk perbandingan tanggal saja
      today.setHours(0, 0, 0, 0);
      activePeriod.setHours(0, 0, 0, 0);
      
      if (activePeriod < today) {
        return res.status(403).json({ 
          success: false, 
          message: 'Account period has expired. Please renew your subscription',
          expired_date: user.active_period
        });
      }
    } else {
      // Jika active_period null/kosong, anggap expired
      return res.status(403).json({ 
        success: false, 
        message: 'Account has no active period. Please contact administrator'
      });
    }

    const userRole = await Role.findAll({
      where: {
        status: 1,
        userid: user.id
      }
    });

    let cabangaccess = [];
    const _access = await Access.findAll({
      where: {
        userId: user.id
      }
    });

    for (const __access of _access) {
      cabangaccess.push(__access.cabangid);
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          cabang: cabangaccess,
          status: user.status,
          active_period: user.active_period,
          roles: userRole.map(role => role.role)
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email, and password are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      status: 1, // active
      active_period: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        status: newUser.status
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        active_period: user.active_period
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    console.error('Profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Update profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const { username, email } = req.body;
    
    await user.update({
      username: username || user.username,
      email: email || user.email
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Change password
router.put('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedNewPassword });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get all users (admin only)
router.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { status, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    if (status !== undefined) {
      whereClause.status = parseInt(status);
    }
    
    const users = await User.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'username', 'email', 'status', 'active_period'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'DESC']]
    });

    res.json({
      success: true,
      data: users.rows,
      total: users.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Update user status
router.put('/users/:id/status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id } = req.params;
    const { status } = req.body;
    
    if (status === undefined || ![0, 1].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be 0 (inactive) or 1 (active)'
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.update({ 
      status,
      active_period: status === 1 ? new Date() : user.active_period
    });

    res.json({
      success: true,
      message: 'User status updated successfully',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

router.get('/checktoken', verifyToken, (req, res) => {
  res.json({ success: true, message: 'Token is valid', user: req.user });
});

module.exports = router;
