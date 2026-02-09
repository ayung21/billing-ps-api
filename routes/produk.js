const express = require('express');
const { verifyToken, verifyRole, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { PERMISSIONS, PERMISSION_GROUPS } = require('../constants/permissions');
const { Op } = require('sequelize');

const router = express.Router();

// Import model produk
let Produk, Cabang, HistoryProduk, Access;
try {
    const initModels = require('../models/init-models');
    const models = initModels(sequelize);
    Produk = models.produk;
    Cabang = models.cabang;
    HistoryProduk = models.history_produk;
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
router.get('/', verifyToken, verifyRole([PERMISSIONS.VIEW_REPORT_PRODUCT,PERMISSIONS.VIEW_PRODUCT]), async (req, res) => {
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
            order: [['id', 'ASC']],
            include: [
                {
                    model: Cabang,
                    as: 'cabang_detail', // pastikan alias sesuai relasi di model
                    attributes: ['name']
                }
            ]
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

router.get('/cabang/:id', verifyToken, async (req, res) => {
    const cabangId = parseInt(req.params.id);
    try {
        let cabangaccess = [];
        if(cabangId == 0){
            const _access = await Access.findAll({
                where: {
                    userId: req.user.userId
                }
            });
            
            for (const __access of _access) {
                cabangaccess.push(__access.cabangid);
            }
        }else{
            cabangaccess.push(cabangId);
        }

        const produk = await sequelize.query(`
            SELECT p.id, hp.token, hp.type, IF(hp.type = 1, 'Makanan', 'Minuman') AS category, hp.name, p.stok, hp.harga_beli, hp.harga_jual, hp.cabangid, hp.status, hp.desc
            FROM history_produk hp
            JOIN (
            SELECT produkid, MAX(createdAt) AS max_created
            FROM history_produk
            GROUP BY produkid
            ) h2 ON hp.produkid = h2.produkid AND hp.createdAt = h2.max_created
            join produk p on p.id = hp.produkid
            WHERE hp.cabangid IN (:cabangaccess)`,
            {
                replacements: { cabangaccess },
                type: sequelize.QueryTypes.SELECT
            }
        );

        res.json({
            success: true,
            data: produk
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

})

router.post('/report', verifyToken, async (req, res) => {
    try {
        const { start_date, end_date, cabang_id, category } = req.body;

        // Validasi required fields
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'start_date and end_date are required'
            });
        }

        // Build dynamic WHERE conditions
        let whereConditions = [
            'td.status = 1',
            'td.unit_token IS NULL',
            'td.name IS NOT NULL',
            "td.name != ''",
            'DATE(td.createdAt) BETWEEN ? AND ?'
        ];

        let replacements = [start_date, end_date];

        // Add cabang filter only if cabang_id is provided and not null
        if (cabang_id !== null && cabang_id !== undefined && cabang_id !== '') {
            whereConditions.push('t.cabangid = ?');
            replacements.push(cabang_id);
        }

        // Add category filter only if category is provided and not null
        if (category !== null && category !== undefined && category !== '') {
            whereConditions.push('hp.type = ?');
            replacements.push(category);
        }

        const whereClause = whereConditions.join(' AND ');

        const results = await sequelize.query(`
            SELECT 
                td.name as productName,
                IF(hp.type = 1, 'Makanan', 'Minuman') as category,
                hp.type,
                td.harga as pricePerUnit,
                DATE(td.createdAt) as date,
                SUM(td.qty) as quantity,
                SUM(td.total) as revenue
            FROM transaksi_detail td
            JOIN history_produk hp ON hp.token = td.produk_token 
            JOIN transaksi t ON t.code = td.code
            WHERE ${whereClause}
            GROUP BY td.name, td.harga, hp.type, DATE(td.createdAt)
            ORDER BY td.name, td.harga, DATE(td.createdAt)
        `, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Transform data ke format yang diinginkan
        const productMap = new Map();

        results.forEach(row => {
            // Key unik untuk setiap kombinasi produk dan harga
            const key = `${row.productName}_${row.pricePerUnit}`;
            
            if (!productMap.has(key)) {
                productMap.set(key, {
                    productName: row.productName,
                    category: row.category,
                    type: row.type,
                    totalSold: 0,
                    pricePerUnit: parseInt(row.pricePerUnit),
                    totalRevenue: 0,
                    salesData: []
                });
            }

            const product = productMap.get(key);
            product.totalSold += parseInt(row.quantity);
            product.totalRevenue += parseInt(row.revenue);
            product.salesData.push({
                date: row.date,
                quantity: parseInt(row.quantity),
                revenue: parseInt(row.revenue)
            });
        });

        // Convert Map to Array
        const reportData = Array.from(productMap.values());

        res.json({
            success: true,
            data: reportData,
            filters: {
                start_date,
                end_date,
                cabang_id: cabang_id || 'all',
                category: category || 'all'
            },
            total_records: reportData.length
        });

    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating sales report',
            error: error.message
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

        const { type, name, stok, warning_level, harga_jual, harga_beli, cabang, status } = req.body;

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

        const token = 'PRD-' + Math.random().toString(36).substring(2, 15); // Generate random token

        const newProduk = await Produk.create({
            token: token,
            type: parseInt(type),
            name,
            stok: parseInt(stok),
            warning_level: warning_level !== undefined ? parseInt(warning_level) : 5,
            cabang: cabang ? parseInt(cabang) : null,
            status: status !== undefined ? parseInt(status) : 1,
            harga_beli: parseInt(harga_beli),
            harga_jual: parseInt(harga_jual),
            created_by: req.user?.userId || null,
            updated_by: req.user?.userId || null
        });

        const historyProduk = await HistoryProduk.create({
            token: token,
            produkid: newProduk.id,
            type: parseInt(type),
            name,
            stok: parseInt(stok),
            warning_level: warning_level !== undefined ? parseInt(warning_level) : 5,
            status: status !== undefined ? parseInt(status) : 1,
            desc: 'Created',
            harga_beli: parseInt(harga_beli),
            harga_jual: parseInt(harga_jual),
            created_by: req.user?.userId || null,
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

        const { type, name, stok, warning_level, harga_beli, harga_jual, cabang, status } = req.body;

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

        const _token ='PRD-' + Math.random().toString(36).substring(2, 15); // Generate random token
        
        await HistoryProduk.create({
            token: _token,
            produkid: produk.id,
            type: type !== undefined ? parseInt(type) : produk.type,
            name: name || produk.name,
            stok: stok !== undefined ? parseInt(stok) : produk.stok,
            cabangid: cabang !== undefined ? (cabang ? parseInt(cabang) : null) : produk.cabang,
            status: status !== undefined ? parseInt(status) : produk.status,
            desc: 'Updated',
            harga_beli: harga_beli !== undefined ? parseInt(harga_beli) : produk.harga_beli,
            harga_jual: harga_jual !== undefined ? parseInt(harga_jual) : produk.harga_jual,
            created_by: req.user?.userId || null
        });
        
        await produk.update({
            token: _token,
            type: type !== undefined ? parseInt(type) : produk.type,
            name: name || produk.name,
            stok: stok !== undefined ? parseInt(stok) : produk.stok,
            warning_level: warning_level !== undefined ? parseInt(warning_level) : produk.warning_level,
            cabang: cabang !== undefined ? (cabang ? parseInt(cabang) : null) : produk.cabang,
            harga_beli: harga_beli !== undefined ? parseInt(harga_beli) : produk.harga_beli,
            harga_jual: harga_jual !== undefined ? parseInt(harga_jual) : produk.harga_jual,
            status: status !== undefined ? parseInt(status) : produk.status,
            updated_by: req.user?.userId || produk.updated_by
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
        const _token ='PRD-' + Math.random().toString(36).substring(2, 15); // Generate random token
        
        await produk.update({
            token: _token,
            status: 0,
            updated_by: req.user?.userId || null
        });


        await HistoryProduk.create({
            token: _token,
            produkid: produk.id,
            type: produk.type,
            name: produk.name,
            stok: produk.stok,
            cabangid: produk.cabang,
            status: 0,
            desc: 'Deleted',
            harga_beli: produk.harga_beli,
            harga_jual: produk.harga_jual,
            created_by: req.user?.userId || null
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