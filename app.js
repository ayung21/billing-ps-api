const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { testConnection, sequelize } = require('./config/database');
const { logError, logInfo, requestLogger } = require('./middleware/logger');

// Load environment variables
dotenv.config();

// Create Express application
const app = express();

// Initialize database and sync models
// app.js
const initializeDatabase = async () => {
  const connected = await testConnection();
  if (connected) {
    try {
      // ✅ Gunakan force: false untuk development, atau hilangkan alter: true
      await sequelize.sync({ force: false }); // atau sync() saja
      console.log('✅ All models synchronized successfully.');
      logInfo('Database models synchronized successfully');
    } catch (error) {
      console.error('❌ Model synchronization failed:', error.message);
      logError(error);
    }
  }
};

// Initialize database on startup
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add request logging middleware
app.use(requestLogger);

// Import routes
const authRoutes = require('./routes/auth');
const unitRoutes = require('./routes/unit');
const cabangRoutes = require('./routes/cabang');
const promoRoutes = require('./routes/promo');
const produkRoutes = require('./routes/produk');
const memberRoutes = require('./routes/member');
const transaksiRoutes = require('./routes/transaksi');
const _process = require('./routes/process');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/unit', unitRoutes);
app.use('/api/cabang', cabangRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/transaksi', transaksiRoutes);
app.use('/api/processcode', _process);

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'Billing PS API Server is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  logError(err, req);
  
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({
//     message: 'Route not found',
//     path: req.originalUrl
//   });
// });

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access the API at http://localhost:${PORT}`);
  logInfo(`Server started on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
});

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  logInfo('Server shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  logInfo('Server shutting down gracefully');
  process.exit(0);
});

module.exports = app;
