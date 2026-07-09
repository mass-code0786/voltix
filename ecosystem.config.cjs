module.exports = {
  apps: [
    {
      name: "voltix-web",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "voltix-ai-auto-trade-worker",
      script: "node_modules/tsx/dist/cli.cjs",
      args: "scripts/ai-auto-trade-worker.ts",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        AI_AUTO_TRADE_INTERVAL_MS: "30000",
      },
    },
  ],
};
