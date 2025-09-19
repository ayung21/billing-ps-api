const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logError = (error, req = null) => {
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    request: req ? {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId || null
    } : null
  };

  const logString = JSON.stringify(errorLog, null, 2) + '\n';
  
  // Write to error log file
  fs.appendFileSync(path.join(logsDir, 'error.log'), logString);
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ Error logged:', errorLog);
  }
};

const logInfo = (message, data = null) => {
  const timestamp = new Date().toISOString();
  const infoLog = {
    timestamp,
    level: 'info',
    message,
    data
  };

  const logString = JSON.stringify(infoLog, null, 2) + '\n';
  
  // Write to combined log file
  fs.appendFileSync(path.join(logsDir, 'combined.log'), logString);
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('ℹ️ Info logged:', infoLog);
  }
};

const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId || null
    };

    const logString = JSON.stringify(logData, null, 2) + '\n';
    fs.appendFileSync(path.join(logsDir, 'combined.log'), logString);
  });

  next();
};

module.exports = {
  logError,
  logInfo,
  requestLogger
};