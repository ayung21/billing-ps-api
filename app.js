const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { testConnection, sequelize } = require('./config/database');

// Load environment variables
dotenv.config();

// Create Express application
const app = express();

// Initialize database and sync models
const initializeDatabase = async () => {
  const connected = await testConnection();
  if (connected) {
    try {
      // Sync all models
      await sequelize.sync({ alter: true });
      console.log('✅ All models synchronized successfully.');
    } catch (error) {
      console.error('❌ Model synchronization failed:', error.message);
    }
  }
};

// Initialize database on startup
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
const authRoutes = require('./routes/auth');
const unitRoutes = require('./routes/unit');
const cabangRoutes = require('./routes/cabang');
const transactionRoutes = require('./routes/transaction');
const PromoRoutes = require('./routes/promo');
const ProdukRoutes = require('./routes/produk');
const MemberRoutes = require('./routes/member');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/unit', unitRoutes);
app.use('/api/cabang', cabangRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/promo', PromoRoutes);
app.use('/api/produk', ProdukRoutes);
app.use('/api/member', MemberRoutes);

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
});

module.exports = app;
