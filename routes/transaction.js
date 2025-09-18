const express = require('express');
const router = express.Router();

// Mock data
const transactions = [
  {
    id: 1,
    unitId: 1,
    unitName: 'PS-001',
    customerName: 'John Doe',
    startTime: new Date('2024-01-01T10:00:00'),
    endTime: new Date('2024-01-01T12:00:00'),
    duration: 2,
    pricePerHour: 15000,
    totalAmount: 30000,
    status: 'completed',
    createdAt: new Date('2024-01-01T10:00:00')
  }
];

// Get all transactions
router.get('/', (req, res) => {
  try {
    const { status, unitId, limit = 50, offset = 0 } = req.query;
    
    let filteredTransactions = [...transactions];
    
    if (status) {
      filteredTransactions = filteredTransactions.filter(t => t.status === status);
    }
    
    if (unitId) {
      filteredTransactions = filteredTransactions.filter(t => t.unitId === parseInt(unitId));
    }
    
    const paginatedTransactions = filteredTransactions.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    res.json({
      success: true,
      data: paginatedTransactions,
      total: filteredTransactions.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get transaction statistics (must come before /:id route)
router.get('/stats/daily', (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.createdAt);
      return transactionDate >= today && transactionDate < tomorrow;
    });

    const todayRevenue = todayTransactions
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + t.totalAmount, 0);

    res.json({
      success: true,
      data: {
        transactionCount: todayTransactions.length,
        revenue: todayRevenue,
        averageTransaction: todayTransactions.length > 0 
          ? todayRevenue / todayTransactions.length 
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get transaction by ID
router.get('/:id', (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const transaction = transactions.find(t => t.id === transactionId);
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Create new transaction (start session)
router.post('/', (req, res) => {
  try {
    const { unitId, customerName, pricePerHour } = req.body;
    
    if (!unitId || !customerName || !pricePerHour) {
      return res.status(400).json({ 
        success: false, 
        message: 'Unit ID, customer name, and price per hour are required' 
      });
    }

    const newTransaction = {
      id: transactions.length + 1,
      unitId: parseInt(unitId),
      unitName: `PS-${unitId.toString().padStart(3, '0')}`,
      customerName,
      startTime: new Date(),
      endTime: null,
      duration: 0,
      pricePerHour: parseFloat(pricePerHour),
      totalAmount: 0,
      status: 'active',
      createdAt: new Date()
    };

    transactions.push(newTransaction);

    res.status(201).json({
      success: true,
      message: 'Transaction started successfully',
      data: newTransaction
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// End transaction
router.put('/:id/end', (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const transactionIndex = transactions.findIndex(t => t.id === transactionId);
    
    if (transactionIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    const transaction = transactions[transactionIndex];
    
    if (transaction.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'Transaction is not active' 
      });
    }

    const endTime = new Date();
    const duration = Math.ceil((endTime - new Date(transaction.startTime)) / (1000 * 60 * 60));
    const totalAmount = duration * transaction.pricePerHour;

    transactions[transactionIndex] = {
      ...transaction,
      endTime,
      duration,
      totalAmount,
      status: 'completed'
    };

    res.json({
      success: true,
      message: 'Transaction ended successfully',
      data: transactions[transactionIndex]
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Update transaction
router.put('/:id', (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const transactionIndex = transactions.findIndex(t => t.id === transactionId);
    
    if (transactionIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    const { customerName, status } = req.body;
    
    if (customerName) {
      transactions[transactionIndex].customerName = customerName;
    }
    
    if (status) {
      transactions[transactionIndex].status = status;
    }

    res.json({
      success: true,
      message: 'Transaction updated successfully',
      data: transactions[transactionIndex]
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Delete transaction
router.delete('/:id', (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const transactionIndex = transactions.findIndex(t => t.id === transactionId);
    
    if (transactionIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    transactions.splice(transactionIndex, 1);

    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

module.exports = router;
