#!/usr/bin/env node
/**
 * Render Unified Process Runner
 * Starts Next.js Web App (Frontend + API Routes) on $PORT
 * Simultaneously runs Telegram Bot (grammy polling) in the background
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// Load .env for local running
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch { }

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m) {
        let val = (m[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[m[1]] = val;
      }
    }
  }
} catch { }

const port = process.env.PORT || '3000';
console.log(`[Render Runner] Starting tz-store services...`);
console.log(`[Render Runner] Port configured: ${port}`);

const children = [];

function runProcess(name, cmd, args, env = {}) {
  console.log(`[Render Runner] Spawning ${name}: ${cmd} ${args.join(' ')}`);
  const proc = spawn(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: true,
  });

  proc.on('error', (err) => {
    console.error(`[Render Runner] ${name} error:`, err);
  });

  proc.on('exit', (code, signal) => {
    console.log(`[Render Runner] ${name} exited with code ${code} signal ${signal}`);
    if (name === 'Next.js Web App' && code !== 0) {
      // If primary web server exits with error, terminate runner
      process.exit(code || 1);
    }
  });

  children.push(proc);
  return proc;
}

// 1. Start Next.js Web App (Listens on Render's required PORT and binds to 0.0.0.0)
const nextProc = runProcess('Next.js Web App', 'npx', ['next', 'start', '-H', '0.0.0.0', '-p', port]);

// 2. Configure Telegram Bot Menu Buttons
if (process.env.BOT_TOKEN) {
  console.log(`[Render Runner] Setting up Telegram Bot Menu Buttons...`);
  runProcess('Bot Menu Setup', 'npx', ['tsx', 'bot/menu-button.ts']);
}

// 3. Start User Telegram Bot (Customer Storefront)
if (process.env.BOT_TOKEN) {
  console.log(`[Render Runner] BOT_TOKEN found. Launching User Store Bot...`);
  runProcess('User Store Bot', 'npx', ['tsx', 'bot/bot.ts']);
} else {
  console.warn(`[Render Runner] WARNING: BOT_TOKEN not found in environment. User Store Bot will not start.`);
}

// 4. Start Dedicated Admin Telegram Bot (Admin Management & Alerts)
if (process.env.ADMIN_BOT_TOKEN && process.env.ADMIN_BOT_TOKEN !== process.env.BOT_TOKEN) {
  console.log(`[Render Runner] ADMIN_BOT_TOKEN found. Launching Admin Operations Bot...`);
  runProcess('Admin Operations Bot', 'npx', ['tsx', 'bot/admin-bot.ts']);
} else {
  console.log(`[Render Runner] Note: ADMIN_BOT_TOKEN not set or identical to BOT_TOKEN.`);
}

// Graceful shutdown handling
function shutdown(signal) {
  console.log(`[Render Runner] Received ${signal}. Shutting down all services...`);
  for (const child of children) {
    try {
      child.kill(signal);
    } catch { }
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
