const express = require('express');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { exec } = require("child_process");

const router = express.Router();

// Import model cabang, users, dan access
let Transaksi;
try {
  const initModels = require('../models/init-models');
  const models = initModels(sequelize);
  Transaksi = models.transaksi;

  if (!Transaksi) {
    console.error('❌ Transaksi model not found in models');
  } else {
    console.log('✅ Transaksi model loaded successfully');
  }
} catch (error) {
  console.error('❌ Error loading models:', error.message);
}

const executeAdbControl = (ip, adbCommand, res) => {
    const fullAdbAddress = `${ip}:5555`;

    // 1. Coba KONEKSI (adb connect)
    // Koneksi ini akan memberikan error jika TV tidak merespons atau debugging tidak aktif.
    const connectCmd = `adb connect ${fullAdbAddress}`;
    
    exec(connectCmd, (connectError, connectStdout, connectStderr) => {
        if (connectError || connectStderr.includes("unable to connect")) {
            // Gagal terhubung atau error koneksi
            return res.status(503).json({
                success: false,
                message: `❌ Gagal terhubung ke TV (${ip}).`,
                details: "Pastikan TV menyala, Network Debugging/ADB aktif, dan tidak terhalang firewall/VPN.",
                adb_output: connectStderr.trim() || connectStdout.trim()
            });
        }
        
        // 2. KONEKSI BERHASIL, jalankan PERINTAH KONTROL
        const controlCmd = `adb -s ${fullAdbAddress} ${adbCommand}`;
        
        exec(controlCmd, (controlError, controlStdout, controlStderr) => {
            
            // Opsional: Coba putuskan koneksi setelah selesai
            exec(`adb disconnect ${fullAdbAddress}`); 
            
            if (controlError) {
                // Perintah kontrol (keyevent) gagal
                return res.status(500).json({ 
                    success: false, 
                    message: `⚠️ Terhubung, tetapi perintah kontrol gagal dijalankan.`,
                    error: controlStderr.trim(),
                    command_executed: adbCommand
                });
            }

            // 3. KONTROL BERHASIL
            res.json({ 
                success: true, 
                ip: ip, 
                message: `✅ Perintah '${adbCommand}' berhasil dikirim ke TV.`,
                command_executed: adbCommand, 
                output: controlStdout.trim()
            });
        });
    });
};

// --- ENDPOINTS KHUSUS UNTUK KONTROL TV ---

// Keycode 26: POWER (bersifat toggle)
app.post("/tv/:ip/toggle_power", (req, res) => {
    const ip = req.params.ip;
    const command = "shell input keyevent 26";
    executeAdbControl(ip, command, res);
});

// Keycode 24: VOLUME_UP
app.post("/tv/:ip/volume_up", (req, res) => {
    const ip = req.params.ip;
    const command = "shell input keyevent 24";
    executeAdbControl(ip, command, res);
});

// Keycode 25: VOLUME_DOWN
app.post("/tv/:ip/volume_down", (req, res) => {
    const ip = req.params.ip;
    const command = "shell input keyevent 25";
    executeAdbControl(ip, command, res);
});

// Keycode 164: VOLUME_MUTE
app.post("/tv/:ip/mute", (req, res) => {
    const ip = req.params.ip;
    const command = "shell input keyevent 164";
    executeAdbControl(ip, command, res);
});

module.exports = router;