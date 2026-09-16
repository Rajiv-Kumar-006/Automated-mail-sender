const fs = require('fs');
const path = require('path');
const config = require('../config');
const { parseAndCleanContacts } = require('./cleaner');
const { verifyConnection, sendSingleEmail } = require('./mailer');

// Helper to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Loads previously sent emails history
 */
function loadSentHistory() {
  if (fs.existsSync(config.sentHistoryPath)) {
    try {
      const data = fs.readFileSync(config.sentHistoryPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.warn('⚠️  Could not read sent history file, starting fresh.');
      return {};
    }
  }
  return {};
}

/**
 * Saves sent history
 */
function saveSentHistory(history) {
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }
  fs.writeFileSync(config.sentHistoryPath, JSON.stringify(history, null, 2), 'utf8');
}

/**
 * Appends a failed email entry
 */
function logFailedEmail(contact, error) {
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }

  let failedList = [];
  if (fs.existsSync(config.failedLogPath)) {
    try {
      failedList = JSON.parse(fs.readFileSync(config.failedLogPath, 'utf8'));
    } catch (e) {
      failedList = [];
    }
  }

  failedList.push({
    timestamp: new Date().toISOString(),
    email: contact.email,
    company: contact.companyName,
    location: contact.location,
    error: error.message || error.toString(),
  });

  fs.writeFileSync(config.failedLogPath, JSON.stringify(failedList, null, 2), 'utf8');
}

/**
 * Formats current timestamp
 */
function getTimestamp() {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

/**
 * Main dispatcher
 */
async function main() {
  const isDryRun = process.argv.includes('--dry-run') || config.dryRun;
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const maxEmails = limitArg ? parseInt(limitArg.replace('--limit=', ''), 10) : config.maxEmails;

  console.log('====================================================');
  console.log('    🚀 COLD EMAIL OUTREACH DISPATCHER ENGINE       ');
  console.log('====================================================');
  console.log(`⏱️  Rate Limit Delay : ${config.delayMs}ms (1 email/sec)`);
  console.log(`🛡️  Mode              : ${isDryRun ? 'DRY RUN (Simulation)' : 'LIVE SENDING'}`);
  console.log(`📎 Attach Resume     : ${config.attachment.enabled ? 'Yes (' + config.attachment.displayName + ')' : 'No'}`);
  if (maxEmails > 0) {
    console.log(`🎯 Email Send Limit  : ${maxEmails} emails`);
  }
  console.log('----------------------------------------------------\n');

  // Parse contacts
  console.log('📂 Parsing and deduplicating CSV contacts...');
  const { contacts, stats } = parseAndCleanContacts(config.csvFilePath);
  console.log(`✅ Loaded ${contacts.length.toLocaleString()} unique, clean contacts (from ${stats.totalLines.toLocaleString()} CSV rows).\n`);

  // Load sent history
  const sentHistory = loadSentHistory();
  const previouslySentCount = Object.keys(sentHistory).length;
  if (previouslySentCount > 0) {
    console.log(`ℹ️  Found ${previouslySentCount.toLocaleString()} previously sent emails in history (will skip to prevent duplicates).\n`);
  }

  // Filter out already sent contacts
  const queue = contacts.filter((c) => !sentHistory[c.email.toLowerCase()]);
  const totalToProcess = maxEmails > 0 ? Math.min(queue.length, maxEmails) : queue.length;

  if (totalToProcess === 0) {
    console.log('🎉 All contacts in the CSV have already been emailed! Nothing left in queue.');
    process.exit(0);
  }

  console.log(`📬 Prepared Queue: ${totalToProcess.toLocaleString()} emails to send.\n`);

  // Verify SMTP in live mode
  if (!isDryRun) {
    if (!config.smtp.auth.user || !config.smtp.auth.pass || config.smtp.auth.pass === 'your_app_password_here') {
      console.error('❌ Error: SMTP credentials are not configured in .env!');
      console.error('Please configure SMTP_USER and SMTP_PASS in your .env file, or run in dry-run mode with:');
      console.error('  npm run dry-run\n');
      process.exit(1);
    }

    console.log('🔌 Verifying SMTP server connection...');
    const verifyResult = await verifyConnection();
    if (!verifyResult.success) {
      console.error(`❌ ${verifyResult.message}\n`);
      process.exit(1);
    }
    console.log('✅ SMTP connection verified.\n');
  }

  console.log('====================================================');
  console.log('             📤 DISPATCHING CAMPAIGN                ');
  console.log('====================================================\n');

  let sentCount = 0;
  let failedCount = 0;
  const startTime = Date.now();

  // Handle graceful exit on Ctrl+C
  let isInterrupted = false;
  process.on('SIGINT', () => {
    console.log('\n\n⚠️  Graceful shutdown requested (Ctrl+C). Saving state...');
    isInterrupted = true;
  });

  for (let i = 0; i < totalToProcess; i++) {
    if (isInterrupted) {
      console.log('🛑 Process stopped by user.');
      break;
    }

    const contact = queue[i];
    const emailNum = i + 1;
    const timeStr = getTimestamp();
    const companyDisplay = contact.companyName || 'General';

    process.stdout.write(`[${timeStr}] [${emailNum}/${totalToProcess}] Sending to: ${contact.email.padEnd(32)} (${companyDisplay.substring(0, 20)})... `);

    try {
      const sendStart = Date.now();
      const result = await sendSingleEmail(contact, { dryRun: isDryRun, silent: true });
      const sendDuration = Date.now() - sendStart;

      sentCount++;
      console.log(`✅ OK (${sendDuration}ms)${isDryRun ? ' [DRY-RUN]' : ''}`);

      // Record in history if not dry run
      if (!isDryRun) {
        sentHistory[contact.email.toLowerCase()] = {
          sentAt: new Date().toISOString(),
          companyName: contact.companyName,
          location: contact.location,
          messageId: result.messageId,
        };
        // Auto-save history every 10 emails
        if (sentCount % 10 === 0) {
          saveSentHistory(sentHistory);
        }
      }
    } catch (err) {
      failedCount++;
      console.log(`❌ FAILED: ${err.message}`);
      if (!isDryRun) {
        logFailedEmail(contact, err);
      }
    }

    // Rate limiting: wait exact delay (default 1000ms = 1 second) before next email
    if (i < totalToProcess - 1 && !isInterrupted) {
      await sleep(config.delayMs);
    }
  }

  // Final save
  if (!isDryRun) {
    saveSentHistory(sentHistory);
  }

  const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n====================================================');
  console.log('             🏁 DISPATCH SUMMARY                    ');
  console.log('====================================================');
  console.log(`• Mode                : ${isDryRun ? 'DRY-RUN SIMULATION' : 'LIVE DISPATCH'}`);
  console.log(`• Total Processed     : ${sentCount + failedCount}`);
  console.log(`• Successfully Sent   : ${sentCount}`);
  console.log(`• Failed              : ${failedCount}`);
  console.log(`• Total Time Elapsed  : ${totalElapsedSec}s`);
  console.log(`• Average Rate        : ${(sentCount / (totalElapsedSec || 1)).toFixed(2)} emails/sec`);
  if (!isDryRun) {
    console.log(`• Sent History File   : ${config.sentHistoryPath}`);
    if (failedCount > 0) {
      console.log(`• Failed Log File     : ${config.failedLogPath}`);
    }
  }
  console.log('====================================================\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { main };
