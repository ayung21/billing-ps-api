const express = require('express');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Mock database for units - In production, replace with actual database
let units = [
  {
    id: 1,
    unitNumber: 'PS-001',
    unitName: 'PlayStation 5 Unit 1',
    type: 'PS5',
    hourlyRate: 15000,
    status: 'available', // available, occupied, maintenance
    description: 'PlayStation 5 dengan controller DualSense',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 2,
    unitNumber: 'PS-002',
    unitName: 'PlayStation 4 Unit 1',
    type: 'PS4',
    hourlyRate: 10000,
    status: 'available',
    description: 'PlayStation 4 dengan controller DualShock 4',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 3,
    unitNumber: 'PS-003',
    unitName: 'PlayStation 5 Unit 2',
    type: 'PS5',
    hourlyRate: 15000,
    status: 'occupied',
    description: 'PlayStation 5 dengan controller DualSense',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }
];

// Get unit statistics
router.get('/stats/overview', authenticateToken, (req, res) => {
  try {
    const stats = {
      total: units.length,
      available: units.filter(u => u.status === 'available').length,
      occupied: units.filter(u => u.status === 'occupied').length,
      maintenance: units.filter(u => u.status === 'maintenance').length,
      byType: {}
    };

    // Count by type
    units.forEach(unit => {
      if (stats.byType[unit.type]) {
        stats.byType[unit.type]++;
      } else {
        stats.byType[unit.type] = 1;
      }
    });

    res.json({
      message: 'Unit statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    console.error('Get unit stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all units
router.get('/', (req, res) => {
  try {
    const { status, type } = req.query;
    let filteredUnits = units;

    // Filter by status if provided
    if (status) {
      filteredUnits = filteredUnits.filter(unit => unit.status === status);
    }

    // Filter by type if provided
    if (type) {
      filteredUnits = filteredUnits.filter(unit => unit.type === type);
    }

    res.json({
      message: 'Units retrieved successfully',
      data: filteredUnits,
      total: filteredUnits.length
    });

  } catch (error) {
    console.error('Get units error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get unit by ID
router.get('/:id', (req, res) => {
  try {
    const unitId = parseInt(req.params.id);
    const unit = units.find(u => u.id === unitId);

    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    res.json({
      message: 'Unit retrieved successfully',
      data: unit
    });

  } catch (error) {
    console.error('Get unit error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new unit (Admin only)
router.post('/', authenticateToken, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { unitNumber, unitName, type, hourlyRate, description } = req.body;

    // Validation
    if (!unitNumber || !unitName || !type || !hourlyRate) {
      return res.status(400).json({
        message: 'Unit number, name, type, and hourly rate are required'
      });
    }

    // Check if unit number already exists
    const existingUnit = units.find(u => u.unitNumber === unitNumber);
    if (existingUnit) {
      return res.status(409).json({
        message: 'Unit number already exists'
      });
    }

    // Create new unit
    const newUnit = {
      id: units.length + 1,
      unitNumber,
      unitName,
      type,
      hourlyRate: parseInt(hourlyRate),
      status: 'available',
      description: description || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    units.push(newUnit);

    res.status(201).json({
      message: 'Unit created successfully',
      data: newUnit
    });

  } catch (error) {
    console.error('Create unit error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update unit (Admin only)
router.put('/:id', authenticateToken, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const unitId = parseInt(req.params.id);
    const { unitNumber, unitName, type, hourlyRate, status, description } = req.body;

    // Find unit
    const unitIndex = units.findIndex(u => u.id === unitId);
    if (unitIndex === -1) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    // Check if new unit number already exists (if unitNumber is being updated)
    if (unitNumber && unitNumber !== units[unitIndex].unitNumber) {
      const existingUnit = units.find(u => u.unitNumber === unitNumber && u.id !== unitId);
      if (existingUnit) {
        return res.status(409).json({
          message: 'Unit number already exists'
        });
      }
    }

    // Update unit
    if (unitNumber) units[unitIndex].unitNumber = unitNumber;
    if (unitName) units[unitIndex].unitName = unitName;
    if (type) units[unitIndex].type = type;
    if (hourlyRate) units[unitIndex].hourlyRate = parseInt(hourlyRate);
    if (status) units[unitIndex].status = status;
    if (description !== undefined) units[unitIndex].description = description;
    units[unitIndex].updatedAt = new Date();

    res.json({
      message: 'Unit updated successfully',
      data: units[unitIndex]
    });

  } catch (error) {
    console.error('Update unit error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update unit status
router.patch('/:id/status', authenticateToken, (req, res) => {
  try {
    const unitId = parseInt(req.params.id);
    const { status } = req.body;

    // Validation
    const validStatuses = ['available', 'occupied', 'maintenance'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Valid status is required (available, occupied, maintenance)'
      });
    }

    // Find unit
    const unitIndex = units.findIndex(u => u.id === unitId);
    if (unitIndex === -1) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    // Update status
    units[unitIndex].status = status;
    units[unitIndex].updatedAt = new Date();

    res.json({
      message: 'Unit status updated successfully',
      data: units[unitIndex]
    });

  } catch (error) {
    console.error('Update unit status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete unit (Admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const unitId = parseInt(req.params.id);

    // Find unit
    const unitIndex = units.findIndex(u => u.id === unitId);
    if (unitIndex === -1) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    // Check if unit is currently occupied
    if (units[unitIndex].status === 'occupied') {
      return res.status(400).json({
        message: 'Cannot delete unit that is currently occupied'
      });
    }

    // Remove unit
    const deletedUnit = units.splice(unitIndex, 1)[0];

    res.json({
      message: 'Unit deleted successfully',
      data: deletedUnit
    });

  } catch (error) {
    console.error('Delete unit error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
