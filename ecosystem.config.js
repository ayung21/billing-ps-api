module.exports = {
  apps: [
    {
      name: 'billing-ps-api',
      script: './app.js',
      instances: 'max',
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3003,
        STATUSTV_LOG_PATH: './logs/statustv.log'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003,
        STATUSTV_LOG_PATH: './logs/statustv.log'
      },
      
      // PM2 default logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart configuration
      watch: false,
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log'
      ],
      
      // Performance monitoring
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      
      // Advanced options
      restart_delay: 4000,
      autorestart: true,
      time: true,
      source_map_support: false,
      kill_timeout: 5000,
      listen_timeout: 8000,
      shutdown_with_message: true,
      exp_backoff_restart_delay: 100
    }
  ]
};