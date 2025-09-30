const express = require('express');
const { verifyToken, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const router = express.Router();

// Import model produk
let Produk, Cabang, HistoryUnit, Access;
try {
    const initModels = require('../models/init-models');
    const models = initModels(sequelize);
    Produk = models.produk;
    Cabang = models.cabang;
    HistoryUnit = models.history_produk;
    Access = models.access;

    if (!Produk) {
        console.error('❌ Produk model not found in models');
    } else {
        console.log('✅ Produk model loaded successfully');
    }
} catch (error) {
    console.error('❌ Error loading produk model:', error.message);
}

// Get all produk (protected)
router.get('/', verifyToken, async (req, res) => {
    try {
        const cabangaccess = [];
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const { status, type, cabang, limit = 50, offset = 0 } = req.query;
        // console.log(req.query);

        let whereClause = {};

        // Filter berdasarkan status (1 = active sebagai default jika tidak dispesifikasi)
        // if (status !== undefined) {
        //     whereClause.status = parseInt(status);
        // } else {
        //     whereClause.status = { [Op.ne]: 2 }; // Tampilkan yang bukan non-active
        // }

        // if (type !== undefined) {
        //     whereClause.type = parseInt(type);
        // }

        // if (cabang !== undefined) {
        //     whereClause.cabang = parseInt(cabang);
        // }

        const _access = await Access.findAll({
            where: {
                userId: req.user.userId
            }
        });
        
        for (const __access of _access) {
            cabangaccess.push(__access.cabangid);
        }

        whereClause.cabang = { [Op.in]: cabangaccess };

        const produk = await Produk.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['id', 'ASC']]
        });

        res.json({
            success: true,
            data: produk.rows,
            total: produk.count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Get produk error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get all produk (protected)
router.get('/allactive/:id', verifyToken, async (req, res) => {
    try {
        const cabangaccess = [];
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const { status, type, cabang, limit = 50, offset = 0 } = req.query;
        // console.log(req.query);

        let whereClause = {};

        // Filter berdasarkan status (1 = active sebagai default jika tidak dispesifikasi)
        // if (status !== undefined) {
        //     whereClause.status = parseInt(status);
        // } else {
        //     whereClause.status = { [Op.ne]: 2 }; // Tampilkan yang bukan non-active
        // }

        // if (type !== undefined) {
        //     whereClause.type = parseInt(type);
        // }

        // if (cabang !== undefined) {
        whereClause.status = 1;
        whereClause.cabang = req.params.id;
        // }

        const _access = await Access.findAll({
            where: {
                userId: req.user.userId
            }
        });
        
        // for (const __access of _access) {
        //     cabangaccess.push(__access.cabangid);
        // }

        // whereClause.cabang = { [Op.in]: cabangaccess };

        const produk = await Produk.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['id', 'ASC']]
        });

        res.json({
            success: true,
            data: produk.rows,
            total: produk.count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Get produk error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get produk by ID (protected)
router.get('/:id', verifyToken, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const produkId = parseInt(req.params.id);
        const produk = await Produk.findByPk(produkId);

        if (!produk) {
            return res.status(404).json({
                success: false,
                message: 'Produk not found'
            });
        }

        res.json({
            success: true,
            data: produk
        });
    } catch (error) {
        console.error('Get produk error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create new produk (admin only) - SINGLE PRODUK
router.post('/', verifyToken, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const { type, name, stok, harga_jual, harga_beli, cabang, status } = req.body;

        if (!type || !name || stok === undefined || harga_beli === undefined || harga_jual === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Type, name, stok, harga_beli, and harga_jual are required'
            });
        }

        if (![1, 2].includes(parseInt(type))) {
            return res.status(400).json({
                success: false,
                message: 'Type must be 1 (makanan) or 2 (minuman)'
            });
        }

        if (parseInt(stok) < 0) {
            return res.status(400).json({
                success: false,
                message: 'Stok cannot be negative'
            });
        }

        // Check if produk name already exists in same cabang
        const whereCondition = { name };
        if (cabang) {
            whereCondition.cabang = parseInt(cabang);
        }

        const existingProduk = await Produk.findOne({
            where: whereCondition
        });

        if (existingProduk) {
            return res.status(409).json({
                success: false,
                message: 'Produk name already exists in this cabang'
            });
        }

        // Validate cabang exists if provided
        if (cabang && Cabang) {
            const cabangExists = await Cabang.findOne({
                where: {
                    id: parseInt(cabang),
                    status: 1
                }
            });

            if (!cabangExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid cabang ID or cabang is inactive'
                });
            }
        }

        const newProduk = await Produk.create({
            type: parseInt(type),
            name,
            stok: parseInt(stok),
            cabang: cabang ? parseInt(cabang) : null,
            status: status !== undefined ? parseInt(status) : 1,
            harga_beli: parseInt(harga_beli),
            harga_jual: parseInt(harga_jual),
            created_by: req.user?.userId || null,
            updated_by: req.user?.userId || null
        });

        res.status(201).json({
            success: true,
            message: 'Produk created successfully',
            data: newProduk
        });
    } catch (error) {
        console.error('Create produk error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update produk (admin only)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const produkId = parseInt(req.params.id);
        const produk = await Produk.findByPk(produkId);

        if (!produk) {
            return res.status(404).json({
                success: false,
                message: 'Produk not found'
            });
        }

        const { type, name, stok, harga_beli, harga_jual, cabang, status } = req.body;

        // Validate type if provided
        if (type !== undefined && ![1, 2].includes(parseInt(type))) {
            return res.status(400).json({
                success: false,
                message: 'Type must be 1 (makanan) or 2 (minuman)'
            });
        }

        // Validate stok if provided
        if (stok !== undefined && parseInt(stok) < 0) {
            return res.status(400).json({
                success: false,
                message: 'Stok cannot be negative'
            });
        }

        // Check if new name already exists in same cabang (exclude current produk)
        if (name && name !== produk.name) {
            const whereCondition = {
                name,
                id: { [Op.ne]: produkId }
            };

            // Use new cabang if provided, otherwise use current cabang
            const targetCabang = cabang !== undefined ? cabang : produk.cabang;
            if (targetCabang) {
                whereCondition.cabang = parseInt(targetCabang);
            }

            const existingProduk = await Produk.findOne({
                where: whereCondition
            });

            if (existingProduk) {
                return res.status(409).json({
                    success: false,
                    message: 'Produk name already exists in this cabang'
                });
            }
        }

        // Validate cabang exists if provided
        if (cabang && Cabang) {
            const cabangExists = await Cabang.findOne({
                where: {
                    id: parseInt(cabang),
                    status: 1
                }
            });

            if (!cabangExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid cabang ID or cabang is inactive'
                });
            }
        }

        await produk.update({
            type: type !== undefined ? parseInt(type) : produk.type,
            name: name || produk.name,
            stok: stok !== undefined ? parseInt(stok) : produk.stok,
            cabang: cabang !== undefined ? (cabang ? parseInt(cabang) : null) : produk.cabang,
            harga_beli: harga_beli !== undefined ? parseInt(harga_beli) : produk.harga_beli,
            harga_jual: harga_jual !== undefined ? parseInt(harga_jual) : produk.harga_jual,
            status: status !== undefined ? parseInt(status) : produk.status,
            updated_by: req.user?.userId || produk.updated_by
        });

        await HistoryUnit.create({
            produkid: produk.id,
            type: type !== undefined ? parseInt(type) : produk.type,
            name: name || produk.name,
            stok: stok !== undefined ? parseInt(stok) : produk.stok,
            harga_beli: harga_beli !== undefined ? parseInt(harga_beli) : produk.harga_beli,
            harga_jual: harga_jual !== undefined ? parseInt(harga_jual) : produk.harga_jual,
            status: status !== undefined ? parseInt(status) : produk.status,
            created_by: req.user?.userId || null
        });

        res.json({
            success: true,
            message: 'Produk updated successfully',
            data: produk
        });
    } catch (error) {
        console.error('Update produk error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Delete produk (admin only) - Set status to inactive (2)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const produkId = parseInt(req.params.id);
        const produk = await Produk.findByPk(produkId);

        if (!produk) {
            return res.status(404).json({
                success: false,
                message: 'Produk not found'
            });
        }

        if (produk.status === 2) {
            return res.status(400).json({
                success: false,
                message: 'Produk is already inactive'
            });
        }

        // Set status to non-active (2)
        await produk.update({
            status: 0,
            updated_by: req.user?.userId || null
        });

        res.json({
            success: true,
            message: 'Produk deactivated successfully'
        });
    } catch (error) {
        console.error('Delete produk error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update produk status (admin only)
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const produkId = parseInt(req.params.id);
        const { status } = req.body;

        if (status === undefined || ![1, 2].includes(parseInt(status))) {
            return res.status(400).json({
                success: false,
                message: 'Valid status is required (1: active, 2: non-active)'
            });
        }

        const produk = await Produk.findByPk(produkId);

        if (!produk) {
            return res.status(404).json({
                success: false,
                message: 'Produk not found'
            });
        }

        await produk.update({
            status: parseInt(status),
            updated_by: req.user?.userId || null
        });

        res.json({
            success: true,
            message: 'Produk status updated successfully',
            data: produk
        });
    } catch (error) {
        console.error('Update produk status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update produk stock (admin only)
router.put('/:id/stock', verifyToken, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const produkId = parseInt(req.params.id);
        const { stok, operation = 'set' } = req.body; // operation: 'set', 'add', 'subtract'

        if (stok === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Stok value is required'
            });
        }

        if (!['set', 'add', 'subtract'].includes(operation)) {
            return res.status(400).json({
                success: false,
                message: 'Operation must be set, add, or subtract'
            });
        }

        const produk = await Produk.findByPk(produkId);

        if (!produk) {
            return res.status(404).json({
                success: false,
                message: 'Produk not found'
            });
        }

        let newStok = parseInt(stok);

        if (operation === 'add') {
            newStok = produk.stok + parseInt(stok);
        } else if (operation === 'subtract') {
            newStok = produk.stok - parseInt(stok);
        }

        if (newStok < 0) {
            return res.status(400).json({
                success: false,
                message: 'Stock cannot be negative'
            });
        }

        await produk.update({
            stok: newStok,
            updated_by: req.user?.userId || null
        });

        res.json({
            success: true,
            message: 'Produk stock updated successfully',
            data: {
                id: produk.id,
                nama: produk.nama,
                oldStock: operation === 'set' ? null : produk.stok - (newStok - produk.stok),
                newStock: newStok,
                operation,
                amount: parseInt(stok)
            }
        });
    } catch (error) {
        console.error('Update produk stock error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get produk by status
router.get('/status/:status', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const { status } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        const statusValue = parseInt(status);
        if (![1, 2].includes(statusValue)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status parameter (1: active, 2: non-active)'
            });
        }

        const produk = await Produk.findAndCountAll({
            where: {
                status: statusValue
            },
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['nama', 'ASC']]
        });

        const statusNames = {
            1: 'active',
            2: 'non-active'
        };

        res.json({
            success: true,
            data: produk.rows,
            total: produk.count,
            status: statusNames[statusValue],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Get produk by status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get produk by type
router.get('/type/:type', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const { type } = req.params;
        const { status, cabang, limit = 50, offset = 0 } = req.query;

        const typeValue = parseInt(type);
        if (![1, 2].includes(typeValue)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid type parameter (1: makanan, 2: minuman)'
            });
        }

        let whereClause = {
            type: typeValue
        };

        if (status !== undefined) {
            whereClause.status = parseInt(status);
        } else {
            whereClause.status = 1; // Only active by default
        }

        if (cabang !== undefined) {
            whereClause.cabang = parseInt(cabang);
        }

        const produk = await Produk.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['nama', 'ASC']]
        });

        const typeNames = {
            1: 'makanan',
            2: 'minuman'
        };

        res.json({
            success: true,
            data: produk.rows,
            total: produk.count,
            type: typeNames[typeValue],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Get produk by type error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get produk by cabang
router.get('/cabang/:cabang', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const { cabang } = req.params;
        const { status, type, limit = 50, offset = 0 } = req.query;

        let whereClause = {
            cabang: parseInt(cabang)
        };

        if (status !== undefined) {
            whereClause.status = parseInt(status);
        } else {
            whereClause.status = 1; // Only active by default
        }

        if (type !== undefined) {
            whereClause.type = parseInt(type);
        }

        const produk = await Produk.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['nama', 'ASC']]
        });

        res.json({
            success: true,
            data: produk.rows,
            total: produk.count,
            cabang: parseInt(cabang),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Get produk by cabang error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get low stock products
router.get('/stock/low', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!Produk) {
            return res.status(500).json({
                success: false,
                message: 'Produk model not available'
            });
        }

        const { threshold = 10, cabang, limit = 50, offset = 0 } = req.query;

        let whereClause = {
            stok: { [Op.lte]: parseInt(threshold) },
            status: 1 // Only active products
        };

        if (cabang !== undefined) {
            whereClause.cabang = parseInt(cabang);
        }

        const produk = await Produk.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['stok', 'ASC']]
        });

        res.json({
            success: true,
            data: produk.rows,
            total: produk.count,
            threshold: parseInt(threshold),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Get low stock produk error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;