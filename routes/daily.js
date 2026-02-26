const express = require("express");
const router = express.Router();
const { verifyToken, verifyRole, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require("../config/database"); // ✅ sesuai unit.js
const { Op } = require("sequelize");

/**
 * GET /api/report/daily
 * Query params:
 * - startdate (YYYY-MM-DD)
 * - enddate   (YYYY-MM-DD)
 * - cabangid  (optional)
 * - period    (daily | monthly | yearly)
 */
router.get("/", verifyToken, async (req, res) => {
  try {
    const {
      startdate,
      enddate,
      cabangid,
      period = "daily",
    } = req.query;

    const user_cabang_access = req.user.cabang_access || [];

    // Validasi tanggal
    if (!startdate || !enddate) {
      return res.status(400).json({
        success: false,
        message: "startdate dan enddate wajib diisi",
      });
    }

    // Format group by berdasarkan period
    let dateFormat;
    let dateLabel;
    switch (period) {
      case "monthly":
        dateFormat = "%Y-%m";
        dateLabel = "DATE_FORMAT(dt.createdAt, '%b')";
        break;
      case "yearly":
        dateFormat = "%Y";
        dateLabel = "DATE_FORMAT(dt.createdAt, '%Y')";
        break;
      default: // daily
        dateFormat = "%Y-%m-%d";
        dateLabel = "DATE_FORMAT(dt.createdAt, '%a')";
    }

    // Build filter cabang
    let cabangFilter = "";
    const params = [startdate, enddate];

    if (cabangid) {
      cabangFilter = "AND u.cabangid = ?";
      params.push(parseInt(cabangid));
    } else if (user_cabang_access.length > 0) {
      cabangFilter = `AND u.cabangid IN (${user_cabang_access.map(() => "?").join(",")})`;
      params.push(...user_cabang_access);
    }

    // ✅ sesuai unit.js: gunakan sequelize.query + tabel yang benar
    const rows = await sequelize.query(`
      SELECT
        u.id         AS unit_id,
        u.name       AS unit_name,
        u.token      AS unit_token,
        u.cabangid,
        c.name       AS cabang_name,
        ${dateLabel} AS label,
        DATE_FORMAT(dt.createdAt, '${dateFormat}') AS period_key,
        COUNT(dt.id) AS count_pemakaian,
        SUM(dt.hours) AS total_hours
      FROM transaksi_detail dt
      INNER JOIN units u
        ON u.token = dt.unit_token
      INNER JOIN cabang c
        ON c.id = u.cabangid
      INNER JOIN transaksi t
        ON t.code = dt.code
      WHERE
        dt.createdAt BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
        AND dt.unit_token IS NOT NULL
        AND dt.status = 1
        AND t.status = 0
        ${cabangFilter}
      GROUP BY
        u.id,
        u.name,
        u.token,
        u.cabangid,
        c.name,
        period_key,
        label
      ORDER BY
        period_key ASC,
        u.name ASC
    `, {
      replacements: params, // ✅ sesuai unit.js
      type: sequelize.QueryTypes.SELECT
    });

    // ✅ sesuai unit.js: ambil semua unit
    let unitQueryStr = `
      SELECT
        u.id,
        u.name,
        u.token,
        u.cabangid,
        c.name AS cabang_name
      FROM units u
      INNER JOIN cabang c ON c.id = u.cabangid
      WHERE u.status = 1
    `;
    const unitParams = [];

    if (cabangid) {
      unitQueryStr += " AND u.cabangid = ?";
      unitParams.push(parseInt(cabangid));
    } else if (user_cabang_access.length > 0) {
      unitQueryStr += ` AND u.cabangid IN (${user_cabang_access.map(() => "?").join(",")})`;
      unitParams.push(...user_cabang_access);
    }

    unitQueryStr += " ORDER BY u.name ASC";

    const units = await sequelize.query(unitQueryStr, {
      replacements: unitParams, // ✅ sesuai unit.js
      type: sequelize.QueryTypes.SELECT
    });

    // Ambil semua period label (kategori sumbu X)
    const periodLabels = [...new Set(rows.map((r) => r.label))];

    // Build series per unit
    const series = units.map((unit) => {
      const data = periodLabels.map((label) => {
        const found = rows.find(
          (r) => r.unit_token === unit.token && r.label === label
        );
        return found ? Number(found.count_pemakaian) : 0;
      });

      return {
        unit_id: unit.id,
        unit_name: unit.name,
        unit_token: unit.token,
        cabang_name: unit.cabang_name,
        data,
      };
    });

    return res.json({
      success: true,
      period,
      categories: periodLabels,
      series,
      raw: rows,
    });

  } catch (error) {
    console.error("Error report daily:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined // ✅ sesuai unit.js
    });
  }
});

router.get("/top5menu", verifyToken, async (req, res) => {
  try {
    const { startdate, enddate, cabangid } = req.query;
    const user_cabang_access = req.user.cabang_access || [];

    // Default: bulan ini
    const now = new Date();
    const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const start = startdate || defaultStart;
    const end = enddate || defaultEnd;

    // ✅ Build filter cabang
    let cabangFilter = "";
    const params = [start, end];

    if (cabangid) {
      cabangFilter = "AND p.cabang = ?";
      params.push(parseInt(cabangid)); // ✅ parseInt sesuai route /
    } else if (user_cabang_access.length > 0) {
      cabangFilter = `AND p.cabang IN (${user_cabang_access.map(() => "?").join(",")})`;
      params.push(...user_cabang_access);
    }

    // ✅ Gunakan sequelize.query + tabel yang benar (transaksi_detail, bukan detail_transaksi)
    const rows = await sequelize.query(`
      SELECT
        p.id                              AS produk_id,
        p.name                            AS name,
        p.type                            AS category,
        p.harga_jual                      AS price,
        p.token                           AS produk_token,
        c.name                            AS cabang,
        COUNT(dt.id)                      AS sold,
        SUM(dt.qty)                       AS total_qty,
        SUM(dt.qty * dt.harga)            AS total_revenue
      FROM transaksi_detail dt
      INNER JOIN produk p
        ON p.token = dt.produk_token
      INNER JOIN cabang c
        ON c.id = p.cabang
      INNER JOIN transaksi t
        ON t.code = dt.code
      WHERE
        dt.createdAt BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
        AND dt.produk_token IS NOT NULL
        AND dt.status = 1
        AND t.status  = 0
        AND p.status  = 1
        ${cabangFilter}
      GROUP BY
        p.id,
        p.name,
        p.type,
        p.harga_jual,
        p.token,
        c.name
      ORDER BY
        total_qty DESC
      LIMIT 5
    `, {
      replacements: params, // ✅ sesuai route /
      type: sequelize.QueryTypes.SELECT // ✅ sesuai route /
    });

    // Hitung maxQty untuk % progress bar di frontend
    const maxQty = rows.length > 0 ? Number(rows[0].total_qty) : 0;
    const totalSold = rows.reduce((sum, r) => sum + Number(r.total_qty), 0);

    const data = rows.map((row, index) => ({
      rank: index + 1,
      produk_id: row.produk_id,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      price_formatted: new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      }).format(row.price),
      cabang: row.cabang,
      sold: Number(row.total_qty),
      total_revenue: Number(row.total_revenue),
      percentage: maxQty > 0 ? Math.round((Number(row.total_qty) / maxQty) * 100) : 0,
    }));

    return res.json({
      success: true,
      data,
      summary: {
        total_sold: totalSold,
        period: { start, end },
      },
    });

  } catch (error) {
    console.error("Error top5menu:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined // ✅ sesuai route /
    });
  }
});

router.get("/promoaktif", verifyToken, async (req, res) => {
  try {
    const { cabangid } = req.query;
    const user_cabang_access = req.user.cabang_access || [];

    // ✅ Build filter cabang
    let cabangFilter = "";
    const params = [];

    if (cabangid) {
      cabangFilter = "AND p.cabangid = ?";
      params.push(parseInt(cabangid)); // ✅ parseInt sesuai route /
    } else if (user_cabang_access.length > 0) {
      cabangFilter = `AND p.cabangid IN (${user_cabang_access.map(() => "?").join(",")})`;
      params.push(...user_cabang_access);
    }

    // ✅ sequelize.query + tabel yang benar (units, bukan unit)
    const promos = await sequelize.query(`
      SELECT
        p.id,
        p.token,
        p.name,
        p.unitid,
        p.cabangid,
        p.discount_percent,
        p.discount_nominal,
        p.hours,
        p.status,
        u.name        AS unit_name,
        u.price       AS unit_price,
        c.name        AS cabang_name,
        CASE
          WHEN p.discount_percent IS NOT NULL
            THEN ROUND(u.price - (u.price * p.discount_percent / 100))
          WHEN p.discount_nominal IS NOT NULL
            THEN ROUND(u.price - p.discount_nominal)
          ELSE u.price
        END AS harga_setelah_diskon,
        CASE
          WHEN p.discount_percent IS NOT NULL
            THEN CONCAT(p.discount_percent, '%')
          WHEN p.discount_nominal IS NOT NULL
            THEN CONCAT('Rp ', FORMAT(p.discount_nominal, 0))
          ELSE '0%'
        END AS discount_label
      FROM promo p
      INNER JOIN units u
        ON u.id = p.unitid
      INNER JOIN cabang c
        ON c.id = p.cabangid
      WHERE
        p.status = 1
        ${cabangFilter}
      ORDER BY
        p.cabangid ASC,
        p.name ASC
    `, {
      replacements: params, // ✅ sesuai route /
      type: sequelize.QueryTypes.SELECT // ✅ sesuai route /
    });

    if (promos.length === 0) {
      return res.json({
        success: true,
        data: [],
        summary: { total_promo: 0, total_pengguna: 0 },
      });
    }

    // ✅ Query pemakaian promo (transaksi_detail, bukan detail_transaksi)
    const promoTokens = promos.map((p) => p.token);

    const pemakaianRows = await sequelize.query(`
      SELECT
        dt.promo_token,
        COUNT(DISTINCT t.code)  AS total_transaksi,
        COUNT(dt.id)          AS total_pemakaian
      FROM transaksi_detail dt
      INNER JOIN transaksi t
        ON t.code = dt.code
      WHERE
        dt.promo_token IN (${promoTokens.map(() => "?").join(",")})
        AND dt.promo_token IS NOT NULL
        AND dt.status  = 1
        AND t.status   = 0
      GROUP BY
        dt.promo_token
    `, {
      replacements: promoTokens, // ✅ sesuai route /
      type: sequelize.QueryTypes.SELECT // ✅ sesuai route /
    });

    // ✅ Map pemakaian ke masing-masing promo
    const pemakaianMap = {};
    pemakaianRows.forEach((row) => {
      pemakaianMap[row.promo_token] = {
        total_transaksi: Number(row.total_transaksi),
        total_pemakaian: Number(row.total_pemakaian),
      };
    });

    // ✅ Build response data
    const data = promos.map((promo) => {
      const pemakaian = pemakaianMap[promo.token] || {
        total_transaksi: 0,
        total_pemakaian: 0,
      };

      return {
        id: promo.id,
        token: promo.token,
        name: promo.name,
        unit_name: promo.unit_name,
        unit_price: Number(promo.unit_price),
        unit_price_formatted: new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          minimumFractionDigits: 0,
        }).format(promo.unit_price),
        cabang: promo.cabang_name,
        hours: promo.hours,
        discount_percent: promo.discount_percent ? Number(promo.discount_percent) : null,
        discount_nominal: promo.discount_nominal ? Number(promo.discount_nominal) : null,
        discount_label: promo.discount_label,
        harga_setelah_diskon: Number(promo.harga_setelah_diskon),
        harga_setelah_diskon_formatted: new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          minimumFractionDigits: 0,
        }).format(promo.harga_setelah_diskon),
        total_pengguna: pemakaian.total_transaksi,
        total_pemakaian: pemakaian.total_pemakaian,
      };
    });

    const totalPengguna = data.reduce((sum, p) => sum + p.total_pengguna, 0);

    return res.json({
      success: true,
      data,
      summary: {
        total_promo: data.length,
        total_pengguna: totalPengguna,
      },
    });

  } catch (error) {
    console.error("Error promoaktif:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined // ✅ sesuai route /
    });
  }
});


module.exports = router;