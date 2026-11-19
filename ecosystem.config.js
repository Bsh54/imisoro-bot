// PM2 configuration for the Imisoro Guide bot.
// Two processes: the connect-server (HTTP + Baileys socket + QR page) and
// the curator (distills raw logs into clean facts every few minutes).
// Tweak paths and env flags to match the host, or just use the defaults.
module.exports = {
  apps: [
    {
      name: 'imisoro-bot',
      script: 'connect-server.js',
      node_args: '--env-file=.env',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      max_memory_restart: '600M',
      env: {
        CONNECT_PORT: '3010',
        LLM_CONCURRENCY: '4',
        DM_ALWAYS_OPEN: '1',
      },
      time: true,
    },
    {
      name: 'imisoro-curator',
      script: 'curator.js',
      node_args: '--env-file=.env',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 10000,
      max_memory_restart: '400M',
      env: {
        CURATOR_INTERVAL_MS: '300000',
      },
      time: true,
    },
  ],
}
