const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const router = express.Router();

// Mock data
const units = [
  {
    id: 1,
    name: 'PS-001',
    type: 'PlayStation 5',
    status: 'available',
    pricePerHour: 15000,
    location: 'Area A'
  },
  {
    id: 2,
    name: 'PS-002',
    type: 'PlayStation 4',
    status: 'occupied',
    pricePerHour: 10000,
    location: 'Area B'
  }
];

// Get all units (protected)
router.get('/', verifyToken, verifyUser, (req, res) => {
  try {
    res.json({
      success: true,
      data: units,
      total: units.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get units stats/overview (admin only)
router.get('/stats/overview', verifyToken, verifyAdmin, (req, res) => {
  try {
    const totalUnits = units.length;
    const availableUnits = units.filter(unit => unit.status === 'available').length;
    const occupiedUnits = units.filter(unit => unit.status === 'occupied').length;
    const maintenanceUnits = units.filter(unit => unit.status === 'maintenance').length;

    res.json({
      success: true,
      data: {
        total: totalUnits,
        available: availableUnits,
        occupied: occupiedUnits,
        maintenance: maintenanceUnits
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get unit by ID (protected)
router.get('/:id', verifyToken, verifyUser, (req, res) => {
  try {
    const unitId = parseInt(req.params.id);
    const unit = units.find(u => u.id === unitId);
    
    if (!unit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Unit not found' 
      });
    }

    res.json({
      success: true,
      data: unit
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Create new unit (admin only)
router.post('/', verifyToken, verifyAdmin, (req, res) => {
  try {
    const { name, type, pricePerHour, location } = req.body;
    
    if (!name || !type || !pricePerHour) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, type, and price per hour are required' 
      });
    }

    const newUnit = {
      id: units.length + 1,
      name,
      type,
      status: 'available',
      pricePerHour: parseFloat(pricePerHour),
      location: location || 'Area A'
    };

    units.push(newUnit);

    res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      data: newUnit
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Update unit (admin only)
router.put('/:id', verifyToken, verifyAdmin, (req, res) => {
  try {
    const unitId = parseInt(req.params.id);
    const unitIndex = units.findIndex(u => u.id === unitId);
    
    if (unitIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Unit not found' 
      });
    }

    const { name, type, status, pricePerHour, location } = req.body;
    
    if (name) units[unitIndex].name = name;
    if (type) units[unitIndex].type = type;
    if (status) units[unitIndex].status = status;
    if (pricePerHour) units[unitIndex].pricePerHour = parseFloat(pricePerHour);
    if (location) units[unitIndex].location = location;

    res.json({
      success: true,
      message: 'Unit updated successfully',
      data: units[unitIndex]
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Delete unit (admin only)
router.delete('/:id', verifyToken, verifyAdmin, (req, res) => {
  try {
    const unitId = parseInt(req.params.id);
    const unitIndex = units.findIndex(u => u.id === unitId);
    
    if (unitIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Unit not found' 
      });
    }

    units.splice(unitIndex, 1);

    res.json({
      success: true,
      message: 'Unit deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

module.exports = router;
