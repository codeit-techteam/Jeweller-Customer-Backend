// PM2 process definition. Kept as .cjs because package.json sets "type": "module".
// This gives the process a stable, predictable name so deploy scripts/CI can
// always target it reliably with `pm2 startOrReload ecosystem.config.cjs`.
module.exports = {
  apps: [
    {
      name: "jeweller-customer-backend",
      script: "src/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
