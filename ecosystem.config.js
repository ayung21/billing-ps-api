module.exports = {
  apps: [
    {
      name: 'billing-ps-api',
      script: './app.js',
      instances: 1, // atau 'max' untuk menggunakan semua CPU cores
      exec_mode: 'cluster', // atau 'fork' untuk single instance
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      
      // Logging configuration
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart configuration
      watch: false, // set true untuk development
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
      
      // Time configuration
      time: true,
      
      // Source map support
      source_map_support: false,
      
      // Kill timeout
      kill_timeout: 5000,
      
      // Listen timeout  
      listen_timeout: 8000,
      
      // Graceful shutdown
      shutdown_with_message: true,
      
      // Error handling
      exp_backoff_restart_delay: 100
    }
  ],
  
  // Deployment configuration (optional)
//   deploy: {
//     production: {
//       user: 'root',
//       host: 'your-server-ip',
//       ref: 'origin/main',
//       repo: 'git@github.com:username/billing-ps-api.git',
//       path: '/var/www/billing-ps-api',
//       'pre-deploy-local': '',
//       'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
//       'pre-setup': ''
//     }
//   }
};