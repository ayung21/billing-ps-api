const jwt = require('jsonwebtoken');
const initModels = require('../models/init-models');
const { sequelize } = require('../config/database');

// Initialize models
const models = initModels(sequelize);
const Role = models.role; // ✅ lowercase 'role'
const User = models.users; // ✅ lowercase 'user'

// Middleware untuk verifikasi JWT token
const verifyToken = async (req, res, next) => {
  try {
    // Ambil token dari header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided or invalid format. Use Bearer <token>'
      });
    }

    // Extract token dari "Bearer <token>"
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ CEK USER STATUS DAN ACTIVE_PERIOD
    const user = await User.findOne({
      where: {
        id: decoded.userId
      }
    });

    // Validasi user ada
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validasi status user = 1 (aktif)
    if (user.status !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact administrator'
      });
    }

    // Validasi active_period masih berlaku
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

    // Ambil roles user dari database
    const userRoles = await Role.findAll({
      where: {
        userid: decoded.userId,
        status: 1 // hanya ambil role yang aktif
      }
    });

    // ⭐ INI YANG PENTING! ⭐
    // Attach user info DAN roles ke request object
    req.user = {
      userId: decoded.userId,
      id: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      status: user.status,
      active_period: user.active_period,
      roles: userRoles.map(r => r.role) // [1, 2, 3] ← Array role IDs
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else {
      console.error('Token verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Token verification failed'
      });
    }
  }
};

/**
 * Middleware untuk verifikasi role access
 * User harus memiliki MINIMAL SATU role dari allowedRoles (OR logic)
 * 
 * @param {Array<number>} allowedRoles - Array role ID yang diizinkan, contoh: [1, 2, 3]
 * @returns {Function} Express middleware function
 * 
 * @example
 * // User dengan role [1,2,3] bisa akses endpoint ini
 * router.get('/unit-rental', authenticateToken, verifyRole([1]), getUnitRental);
 * 
 * // User dengan role [1,2,3] atau [4] bisa akses endpoint ini
 * router.get('/reports', authenticateToken, verifyRole([1, 4]), getReports);
 */
const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Pastikan user sudah terautentikasi
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      // Pastikan allowedRoles adalah array
      if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'Invalid role configuration'
        });
      }

      const userRoles = req.user.roles || [];

      // Check apakah user punya minimal 1 role yang diizinkan (OR logic)
      const hasPermission = userRoles.some(role => allowedRoles.includes(role));

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions',
        });
      }

      next();
    } catch (error) {
      console.error('Role verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Role verification failed'
      });
    }
  };
};

/**
 * Middleware untuk verifikasi role access dengan AND logic
 * User harus memiliki SEMUA role dari requiredRoles
 * 
 * @param {Array<number>} requiredRoles - Array role ID yang harus dimiliki semua
 * @returns {Function} Express middleware function
 * 
 * @example
 * // User HARUS punya role 1 DAN 2 untuk akses endpoint ini
 * router.delete('/critical-action', authenticateToken, verifyAllRoles([1, 2]), deleteCritical);
 */
const verifyAllRoles = (requiredRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'Invalid role configuration'
        });
      }

      const userRoles = req.user.roles || [];

      // Check apakah user punya SEMUA role yang dibutuhkan (AND logic)
      const hasAllPermissions = requiredRoles.every(role => userRoles.includes(role));

      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Missing required permissions',
        });
      }

      next();
    } catch (error) {
      console.error('Role verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Role verification failed'
      });
    }
  };
};

/**
 * Helper function untuk check role programmatically
 * Berguna untuk conditional logic di dalam controller
 * 
 * @param {Object} user - User object dari req.user
 * @param {Array<number>} allowedRoles - Array role yang diizinkan
 * @returns {boolean}
 * 
 * @example
 * if (hasRole(req.user, [1, 2])) {
 *   // Do something
 * }
 */
const hasRole = (user, allowedRoles) => {
  if (!user || !user.roles) return false;
  return user.roles.some(role => allowedRoles.includes(role));
};

/**
 * Helper function untuk check multiple roles (AND logic)
 * 
 * @param {Object} user - User object dari req.user
 * @param {Array<number>} requiredRoles - Array role yang harus dimiliki
 * @returns {boolean}
 */
const hasAllRoles = (user, requiredRoles) => {
  if (!user || !user.roles) return false;
  return requiredRoles.every(role => user.roles.includes(role));
};

// Middleware untuk verifikasi admin
const verifyAdmin = (req, res, next) => {
  verifyRole(['admin'])(req, res, next);
};

// Middleware untuk verifikasi user atau admin
const verifyUser = (req, res, next) => {
  verifyRole(['user', 'admin'])(req, res, next);
};

// Middleware optional token (tidak wajib ada token)
const optionalToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          req.user = decoded;
        } catch (error) {
          // Token invalid, tapi tetap lanjut tanpa user info
          req.user = null;
        }
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  verifyToken,
  verifyRole,
  verifyAllRoles,
  hasRole,
  hasAllRoles,
  verifyAdmin,
  verifyUser,
  optionalToken
};