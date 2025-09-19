const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('✅ Logs directory created:', logsDir);
} else {
  console.log('✅ Logs directory already exists:', logsDir);
}

// Create log files
const logFiles = ['combined.log', 'out.log', 'error.log'];

logFiles.forEach(logFile => {
  const logPath = path.join(logsDir, logFile);
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '');
    console.log('✅ Log file created:', logPath);
  }
});

console.log('✅ Log setup completed!');