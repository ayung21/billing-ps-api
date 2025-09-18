const jwt = require('jsonwebtoken');

// Middleware untuk verifikasi JWT token
const verifyToken = (req, res, next) => {
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
    
    // Tambahkan user info ke request object
    req.user = decoded;
    
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
      return res.status(500).json({
        success: false,
        message: 'Token verification failed'
      });
    }
  }
};

// Middleware untuk verifikasi role
const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const userRole = req.user.role;
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions'
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Role verification failed'
      });
    }
  };
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
  verifyAdmin,
  verifyUser,
  optionalToken
};