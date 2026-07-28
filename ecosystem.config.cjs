/**
 * pm2 process definitions for the staging/production box.
 *
 * `cwd` matters for both apps: the API resolves `server/.env` relative to
 * its working directory, and the web app resolves `client/.env.production`
 * relative to its own. Neither env file is in git (`.gitignore`'s `.env*`),
 * so they're created once on the box and survive every deploy.
 *
 * The web app binds to 127.0.0.1 on purpose — nginx is the only thing that
 * should be able to reach it, and binding 0.0.0.0 would expose :3000
 * directly alongside the proxied :80.
 *
 * Usage on the box:
 *   pm2 start ecosystem.config.cjs     # first run
 *   pm2 restart homekrafted-api        # after a deploy (or use scripts/deploy.sh)
 *   pm2 save && pm2 startup systemd    # survive reboots
 */
const path = require("path");

const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: "homekrafted-api",
      cwd: path.join(ROOT, "server"),
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "600M",
    },
    {
      name: "homekrafted-web",
      cwd: path.join(ROOT, "client"),
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000 --hostname 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "800M",
    },
  ],
};
