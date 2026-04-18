#!/usr/bin/env node
/**
 * Send Duck Dive Sales Report via Gmail (gog)
 * Usage: node send-duck-dive-report.js [--to email@example.com]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const reportDir = '/home/node/.openclaw/workspace/duck-dive-sales-report/reports';
const metaFile = path.join(reportDir, 'latest-meta.json');
const htmlFile = path.join(reportDir, 'latest.html');

// Parse args
const args = process.argv.slice(2);
let recipient = 'daniele.scaglia@womix.io'; // default

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--to' && args[i + 1]) {
    recipient = args[i + 1];
    i++;
  }
}

// Load metadata
let meta = {};
try {
  const raw = fs.readFileSync(metaFile, 'utf-8');
  meta = JSON.parse(raw);
} catch (e) {
  console.error('❌ Cannot read metadata:', e.message);
  process.exit(1);
}

// Load HTML
let html = '';
try {
  html = fs.readFileSync(htmlFile, 'utf-8');
} catch (e) {
  console.error('❌ Cannot read HTML:', e.message);
  process.exit(1);
}

// Send via gog — DISABLED
console.log('✅ Report loaded locally (email sending disabled)');
console.log('📋 Subject:', meta.subject);
console.log('📧 Would send to:', recipient);

// const cmd = `gog send-email \
//   --to "${recipient}" \
//   --subject "${meta.subject}" \
//   --body "${html}" \
//   --html`;
//
// try {
//   const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
//   console.log('✅ Email sent successfully!');
//   console.log(output);
// } catch (e) {
//   console.error('❌ Failed to send email:');
//   console.error(e.message);
//   process.exit(1);
// }
