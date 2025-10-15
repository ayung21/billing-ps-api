const fs = require('fs');
const path = require('path');

class TVStatusLogger {
  constructor() {
    this.logPath = process.env.STATUSTV_LOG_PATH || './logs/statustv.log';
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  formatLog(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };
    return JSON.stringify(logEntry) + '\n';
  }

  writeLog(level, message, data = {}) {
    try {
      const logEntry = this.formatLog(level, message, data);
      fs.appendFileSync(this.logPath, logEntry);
    } catch (error) {
      console.error('Failed to write to statustv.log:', error);
    }
  }

  logPing(tvId, ipAddress, userAgent) {
    this.writeLog('PING', 'TV Ping received', {
      tvId,
      ipAddress,
      userAgent,
      action: 'ping'
    });
  }

  logStatusCheck(onlineCount, totalCount) {
    this.writeLog('STATUS', 'TV Status checked', {
      onlineCount,
      totalCount,
      action: 'status_check'
    });
  }

  logTVOnline(tvId) {
    this.writeLog('ONLINE', 'TV came online', {
      tvId,
      action: 'tv_online'
    });
  }

  logTVOffline(tvId, lastSeenMinutes) {
    this.writeLog('OFFLINE', 'TV went offline', {
      tvId,
      lastSeenMinutes,
      action: 'tv_offline'
    });
  }

  logError(error, tvId = null) {
    this.writeLog('ERROR', 'TV Status error', {
      error: error.message,
      tvId,
      stack: error.stack,
      action: 'error'
    });
  }
}

module.exports = new TVStatusLogger();