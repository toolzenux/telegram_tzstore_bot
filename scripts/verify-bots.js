#!/usr/bin/env node
/**
 * Telegram Bot Token & Admin ID Diagnostic Verification Tool
 * Run: npm run bot:verify or node scripts/verify-bots.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

// Load environment variables
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {}

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m && !process.env[m[1]]) {
        let val = (m[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[m[1]] = val;
      }
    }
  }
} catch {}

async function checkBot(name, token) {
  if (!token) {
    return { ok: false, error: 'Token is empty or not set in .env' };
  }
  return new Promise((resolve) => {
    const req = https.get(`https://api.telegram.org/bot${token}/getMe`, { family: 4, timeout: 10000 }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.ok) {
            resolve({
              ok: true,
              id: data.result.id,
              username: data.result.username,
              firstName: data.result.first_name,
              canJoinGroups: data.result.can_join_groups,
            });
          } else {
            resolve({ ok: false, error: data.description || 'API request rejected' });
          }
        } catch {
          resolve({ ok: false, error: 'Invalid response from Telegram API' });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Connection timed out' });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

async function main() {
  console.log('\n======================================================');
  console.log('🤖 TZ Store — Telegram Bot & Admin Diagnostics');
  console.log('======================================================\n');

  // 1. Customer Store Bot Check
  const customerToken = process.env.BOT_TOKEN;
  process.stdout.write('1. Checking Customer Store Bot (BOT_TOKEN)... ');
  const customerCheck = await checkBot('Customer Bot', customerToken);
  if (customerCheck.ok) {
    console.log('✅ VALID');
    console.log(`   • Bot Name:     ${customerCheck.firstName}`);
    console.log(`   • Username:     @${customerCheck.username}`);
    console.log(`   • Telegram ID:  ${customerCheck.id}`);
  } else {
    console.log('❌ FAILED');
    console.log(`   • Reason:       ${customerCheck.error}`);
    console.log(`   • Instruction:  Create a new bot via @BotFather in Telegram and update BOT_TOKEN in .env`);
  }

  console.log('');

  // 2. Admin Operations Bot Check
  const adminToken = process.env.ADMIN_BOT_TOKEN;
  process.stdout.write('2. Checking Admin Operations Bot (ADMIN_BOT_TOKEN)... ');
  const adminCheck = await checkBot('Admin Bot', adminToken);
  if (adminCheck.ok) {
    console.log('✅ VALID');
    console.log(`   • Bot Name:     ${adminCheck.firstName}`);
    console.log(`   • Username:     @${adminCheck.username}`);
    console.log(`   • Telegram ID:  ${adminCheck.id}`);
  } else {
    console.log('⚠️ NOT CONFIGURED / INVALID');
    console.log(`   • Reason:       ${adminCheck.error}`);
    console.log(`   • Note:         Create a second bot via @BotFather (e.g. @YourStoreAdmin_Bot) and set ADMIN_BOT_TOKEN in .env`);
  }

  console.log('');

  // 3. Admin User IDs Check
  const adminIds = [
    process.env.ADMIN_NOTIFY_CHAT_ID,
    ...(process.env.ADMIN_USER_IDS || '').split(','),
    ...(process.env.ADMIN_TG_IDS || '').split(','),
  ]
    .map((s) => s?.trim())
    .filter(Boolean);

  process.stdout.write('3. Checking Admin Authorization IDs... ');
  if (adminIds.length > 0) {
    console.log(`✅ CONFIGURED (${adminIds.length} ID${adminIds.length > 1 ? 's' : ''})`);
    for (const id of adminIds) {
      console.log(`   • Authorized Admin ID: ${id}`);
    }
  } else {
    console.log('⚠️ NONE CONFIGURED');
    console.log(`   • Instruction:  Send /id to @userinfobot to get your numeric ID.`);
    console.log(`   • Update:       Add ADMIN_TG_IDS="YOUR_ID" and ADMIN_NOTIFY_CHAT_ID="YOUR_ID" in .env`);
  }

  console.log('');

  // 4. Summary & Readiness
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (customerCheck.ok && adminCheck.ok && adminIds.length > 0) {
    console.log('🎉 ALL BOT CHECKS PASSED! Ready for live polling or deployment.');
    console.log('   Run: npm run bot:user   (Launch Customer Bot)');
    console.log('   Run: npm run bot:admin  (Launch Admin Bot)');
    console.log('   Run: npm run start:all  (Launch Everything)');
  } else {
    console.log('📋 Next Action Needed:');
    console.log('   Please obtain valid tokens from @BotFather and update your .env file.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
