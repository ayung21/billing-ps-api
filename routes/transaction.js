const express = require('express');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Mock database for transactions - In production, replace with actual database
let transactions = [
  {
    id: 1,
    unitId: 1,
    unitNumber: 'PS-001',
    customerName: 'John Doe',
    customerPhone: '081234567890',
    startTime: new Date('2024-09-17T10:00:00Z'),
    endTime: new Date('2024-09-17T12:00:00Z'),
    duration: 2, // hours
    hourlyRate: 15000,
    totalAmount: 30000,
    paymentStatus: 'paid', // pending, paid, cancelled
    paymentMethod: 'cash', // cash, transfer, e-wallet
    notes: 'Regular customer',
    createdAt: new Date('2024-09-17T10:00:00Z'),
    updatedAt: new Date('2024-09-17T12:00:00Z')
  },
  {
    id: 2,
    unitId: 2,
    unitNumber: 'PS-002',
    customerName: 'Jane Smith',
    customerPhone: '081234567891',
    startTime: new Date('2024-09-17T14:00:00Z'),
    endTime: null, // ongoing session
    duration: null,
    hourlyRate: 10000,
    totalAmount: 0,
    paymentStatus: 'pending',
    paymentMethod: null,
    notes: 'Birthday party session',
    createdAt: new Date('2024-09-17T14:00:00Z'),
    updatedAt: new Date('2024-09-17T14:00:00Z')
  }
];

// Helper function to calculate session duration and amount
const calculateSessionAmount = (startTime, endTime, hourlyRate) => {
  if (!endTime) {
    return { duration: null, amount: 0 };
  }
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end - start;
  const durationHours = Math.ceil(durationMs / (1000 * 60 * 60)); // Round up to nearest hour
  const amount = durationHours * hourlyRate;
  
  return { duration: durationHours, amount };
};

// Get transaction statistics
router.get('/stats/overview', authenticateToken, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let filteredTransactions = transactions;

    // Filter by date range if provided
    if (startDate || endDate) {
      filteredTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.createdAt);
        const start = startDate ? new Date(startDate) : new Date('1970-01-01');
        const end = endDate ? new Date(endDate) : new Date();
        return transactionDate >= start && transactionDate <= end;
      });
    }

    const stats = {
      totalTransactions: filteredTransactions.length,
      totalRevenue: filteredTransactions
        .filter(t => t.paymentStatus === 'paid')
        .reduce((sum, t) => sum + t.totalAmount, 0),
      pendingPayments: filteredTransactions.filter(t => t.paymentStatus === 'pending').length,
      completedPayments: filteredTransactions.filter(t => t.paymentStatus === 'paid').length,
      cancelledTransactions: filteredTransactions.filter(t => t.paymentStatus === 'cancelled').length,
      ongoingSessions: filteredTransactions.filter(t => !t.endTime && t.paymentStatus !== 'cancelled').length,
      averageSessionDuration: 0,
      paymentMethods: {}
    };

    // Calculate average session duration
    const completedSessions = filteredTransactions.filter(t => t.duration);
    if (completedSessions.length > 0) {
      const totalDuration = completedSessions.reduce((sum, t) => sum + t.duration, 0);
      stats.averageSessionDuration = Math.round((totalDuration / completedSessions.length) * 100) / 100;
    }

    // Count by payment methods
    filteredTransactions
      .filter(t => t.paymentMethod)
      .forEach(t => {
        if (stats.paymentMethods[t.paymentMethod]) {
          stats.paymentMethods[t.paymentMethod]++;
        } else {
          stats.paymentMethods[t.paymentMethod] = 1;
        }
      });

    res.json({
      message: 'Transaction statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    console.error('Get transaction stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get daily revenue report
router.get('/reports/daily', authenticateToken, (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    
    // Set to start and end of day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const dailyTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.createdAt);
      return transactionDate >= startOfDay && transactionDate <= endOfDay;
    });

    const report = {
      date: targetDate.toISOString().split('T')[0],
      totalTransactions: dailyTransactions.length,
      totalRevenue: dailyTransactions
        .filter(t => t.paymentStatus === 'paid')
        .reduce((sum, t) => sum + t.totalAmount, 0),
      sessionsStarted: dailyTransactions.length,
      sessionsCompleted: dailyTransactions.filter(t => t.endTime).length,
      averageSessionValue: 0,
      transactions: dailyTransactions
    };

    // Calculate average session value
    const paidTransactions = dailyTransactions.filter(t => t.paymentStatus === 'paid');
    if (paidTransactions.length > 0) {
      report.averageSessionValue = Math.round((report.totalRevenue / paidTransactions.length) * 100) / 100;
    }

    res.json({
      message: 'Daily report generated successfully',
      data: report
    });

  } catch (error) {
    console.error('Get daily report error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all transactions
router.get('/', authenticateToken, (req, res) => {
  try {
    const { paymentStatus, unitId, startDate, endDate } = req.query;
    let filteredTransactions = transactions;

    // Filter by payment status
    if (paymentStatus) {
      filteredTransactions = filteredTransactions.filter(t => t.paymentStatus === paymentStatus);
    }

    // Filter by unit ID
    if (unitId) {
      filteredTransactions = filteredTransactions.filter(t => t.unitId === parseInt(unitId));
    }

    // Filter by date range
    if (startDate) {
      filteredTransactions = filteredTransactions.filter(t => 
        new Date(t.startTime) >= new Date(startDate)
      );
    }
    if (endDate) {
      filteredTransactions = filteredTransactions.filter(t => 
        new Date(t.startTime) <= new Date(endDate)
      );
    }

    // Sort by most recent
    filteredTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      message: 'Transactions retrieved successfully',
      data: filteredTransactions,
      total: filteredTransactions.length
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get transaction by ID
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const transaction = transactions.find(t => t.id === transactionId);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({
      message: 'Transaction retrieved successfully',
      data: transaction
    });

  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Start new session
router.post('/start-session', authenticateToken, (req, res) => {
  try {
    const { unitId, customerName, customerPhone, notes } = req.body;

    // Validation
    if (!unitId || !customerName) {
      return res.status(400).json({
        message: 'Unit ID and customer name are required'
      });
    }

    // Check if unit exists and is available
    // This would normally check the units database
    const unitInfo = {
      1: { unitNumber: 'PS-001', hourlyRate: 15000, status: 'available' },
      2: { unitNumber: 'PS-002', hourlyRate: 10000, status: 'available' },
      3: { unitNumber: 'PS-003', hourlyRate: 15000, status: 'occupied' }
    };

    const unit = unitInfo[unitId];
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    if (unit.status !== 'available') {
      return res.status(400).json({ message: 'Unit is not available' });
    }

    // Check if there's already an ongoing session for this unit
    const ongoingSession = transactions.find(t => 
      t.unitId === parseInt(unitId) && !t.endTime
    );
    if (ongoingSession) {
      return res.status(400).json({ message: 'Unit already has an ongoing session' });
    }

    // Create new transaction
    const newTransaction = {
      id: transactions.length + 1,
      unitId: parseInt(unitId),
      unitNumber: unit.unitNumber,
      customerName,
      customerPhone: customerPhone || '',
      startTime: new Date(),
      endTime: null,
      duration: null,
      hourlyRate: unit.hourlyRate,
      totalAmount: 0,
      paymentStatus: 'pending',
      paymentMethod: null,
      notes: notes || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    transactions.push(newTransaction);

    res.status(201).json({
      message: 'Session started successfully',
      data: newTransaction
    });

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// End session
router.post('/end-session/:id', authenticateToken, (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const { endTime } = req.body;

    // Find transaction
    const transactionIndex = transactions.findIndex(t => t.id === transactionId);
    if (transactionIndex === -1) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const transaction = transactions[transactionIndex];

    // Check if session is already ended
    if (transaction.endTime) {
      return res.status(400).json({ message: 'Session already ended' });
    }

    // Set end time
    const sessionEndTime = endTime ? new Date(endTime) : new Date();
    
    // Calculate duration and amount
    const { duration, amount } = calculateSessionAmount(
      transaction.startTime, 
      sessionEndTime, 
      transaction.hourlyRate
    );

    // Update transaction
    transactions[transactionIndex].endTime = sessionEndTime;
    transactions[transactionIndex].duration = duration;
    transactions[transactionIndex].totalAmount = amount;
    transactions[transactionIndex].updatedAt = new Date();

    res.json({
      message: 'Session ended successfully',
      data: transactions[transactionIndex]
    });

  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Process payment
router.post('/payment/:id', authenticateToken, (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const { paymentMethod, amountPaid, notes } = req.body;

    // Validation
    if (!paymentMethod) {
      return res.status(400).json({
        message: 'Payment method is required'
      });
    }

    const validPaymentMethods = ['cash', 'transfer', 'e-wallet', 'card'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        message: 'Invalid payment method'
      });
    }

    // Find transaction
    const transactionIndex = transactions.findIndex(t => t.id === transactionId);
    if (transactionIndex === -1) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const transaction = transactions[transactionIndex];

    // Check if session is ended
    if (!transaction.endTime) {
      return res.status(400).json({ message: 'Session must be ended before payment' });
    }

    // Check if already paid
    if (transaction.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Transaction already paid' });
    }

    // Validate amount paid
    const expectedAmount = transaction.totalAmount;
    const paidAmount = amountPaid || expectedAmount;

    if (paidAmount < expectedAmount) {
      return res.status(400).json({
        message: `Insufficient payment. Expected: ${expectedAmount}, Received: ${paidAmount}`
      });
    }

    // Update transaction
    transactions[transactionIndex].paymentStatus = 'paid';
    transactions[transactionIndex].paymentMethod = paymentMethod;
    transactions[transactionIndex].amountPaid = paidAmount;
    transactions[transactionIndex].change = paidAmount - expectedAmount;
    if (notes) transactions[transactionIndex].paymentNotes = notes;
    transactions[transactionIndex].paidAt = new Date();
    transactions[transactionIndex].updatedAt = new Date();

    res.json({
      message: 'Payment processed successfully',
      data: transactions[transactionIndex]
    });

  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Cancel transaction
router.post('/cancel/:id', authenticateToken, (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const { reason } = req.body;

    // Find transaction
    const transactionIndex = transactions.findIndex(t => t.id === transactionId);
    if (transactionIndex === -1) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const transaction = transactions[transactionIndex];

    // Check if already paid
    if (transaction.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Cannot cancel paid transaction' });
    }

    // Update transaction
    transactions[transactionIndex].paymentStatus = 'cancelled';
    transactions[transactionIndex].cancelReason = reason || 'No reason provided';
    transactions[transactionIndex].cancelledAt = new Date();
    transactions[transactionIndex].updatedAt = new Date();

    // If session was ongoing, end it
    if (!transaction.endTime) {
      transactions[transactionIndex].endTime = new Date();
      transactions[transactionIndex].totalAmount = 0;
    }

    res.json({
      message: 'Transaction cancelled successfully',
      data: transactions[transactionIndex]
    });

  } catch (error) {
    console.error('Cancel transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
