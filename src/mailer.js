const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { renderEmail } = require('./templateRenderer');

/**
 * Creates and configures the Nodemailer SMTP transport
 */
function createTransporter() {
  const options = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.auth.user,
      pass: config.smtp.auth.pass,
    },
    // Pool connections to avoid opening new TCP connections on every single email
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    rateLimit: 1, // max 1 message per second at transport level
  };

  return nodemailer.createTransport(options);
}

let transporterInstance = null;
function getTransporter() {
  if (!transporterInstance) {
    transporterInstance = createTransporter();
  }
  return transporterInstance;
}

/**
 * Verifies SMTP connection and authentication
 */
async function verifyConnection() {
  const transporter = getTransporter();
  try {
    await transporter.verify();
    return { success: true, message: 'SMTP connection verified successfully.' };
  } catch (error) {
    let hint = '';
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      hint = '\n💡 Tip: For Gmail, you must use a 16-character Google App Password (not your personal Google account password). Generate one at https://myaccount.google.com/apppasswords';
    } else if (error.code === 'ESOCKET' || error.code === 'ETIMEDOUT') {
      hint = '\n💡 Tip: Check your SMTP host and port. Port 465 requires SMTP_SECURE=true, Port 587 requires SMTP_SECURE=false.';
    }
    return {
      success: false,
      message: `SMTP Verification Failed: ${error.message}${hint}`,
      error,
    };
  }
}

/**
 * Sends a single email to a contact
 * @param {Object} contact - { email, companyName, location, recipientName }
 * @param {Object} options - { dryRun: boolean }
 */
async function sendSingleEmail(contact, options = {}) {
  const { subject, html, text } = renderEmail(contact);
  const isDryRun = options.dryRun !== undefined ? options.dryRun : config.dryRun;

  // Build attachments list
  const attachments = [];
  if (config.attachment.enabled) {
    if (fs.existsSync(config.attachment.filePath)) {
      attachments.push({
        filename: config.attachment.displayName,
        path: config.attachment.filePath,
      });
    } else {
      // Warning if attachment enabled but file missing
      if (!options.silent) {
        console.warn(`⚠️  Warning: Resume attachment file not found at: ${config.attachment.filePath}`);
      }
    }
  }

  const mailOptions = {
    from: `"${config.sender.name}" <${config.sender.email}>`,
    to: contact.email,
    subject: subject,
    text: text,
    html: html,
    attachments: attachments.length > 0 ? attachments : undefined,
    headers: {
      'X-Entity-Ref-ID': `cold-outreach-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      'Precedence': 'bulk',
    },
  };

  if (isDryRun) {
    return {
      success: true,
      dryRun: true,
      messageId: `mock-${Date.now()}`,
      contact,
      subject,
    };
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    dryRun: false,
    messageId: info.messageId,
    response: info.response,
    contact,
    subject,
  };
}

/**
 * CLI Test email sender: Sends 1 test email to verify end-to-end delivery
 */
async function runTestEmail() {
  const args = process.argv.slice(2);
  let targetEmail = '';

  for (const arg of args) {
    if (arg.startsWith('--to=')) {
      targetEmail = arg.replace('--to=', '').trim();
    }
  }

  if (!targetEmail) {
    targetEmail = config.sender.email;
  }

  console.log('====================================================');
  console.log('           🧪 SENDING TEST OUTREACH EMAIL           ');
  console.log('====================================================\n');
  console.log(`Target Recipient : ${targetEmail}`);
  console.log(`SMTP Host        : ${config.smtp.host}:${config.smtp.port}`);
  console.log(`SMTP User        : ${config.smtp.auth.user || '(Not Set)'}`);
  console.log(`Sender Name      : ${config.sender.name}`);
  console.log(`Attach Resume    : ${config.attachment.enabled ? 'Yes (' + config.attachment.displayName + ')' : 'No'}\n`);

  if (!config.smtp.auth.user || !config.smtp.auth.pass || config.smtp.auth.pass === 'your_app_password_here') {
    console.error('❌ Error: SMTP credentials are not configured in your .env file!');
    console.error('Please open .env and set your SMTP_USER and SMTP_PASS first.\n');
    process.exit(1);
  }

  console.log('1. Verifying SMTP connection...');
  const verifyResult = await verifyConnection();
  if (!verifyResult.success) {
    console.error(`❌ ${verifyResult.message}\n`);
    process.exit(1);
  }
  console.log('✅ SMTP connection verified successfully.\n');

  console.log(`2. Sending test email to ${targetEmail}...`);
  const testContact = {
    email: targetEmail,
    companyName: 'Test Corporation',
    location: 'Remote',
    recipientName: 'Test Recruiter',
  };

  try {
    const result = await sendSingleEmail(testContact, { dryRun: false });
    console.log('\n====================================================');
    console.log('  🎉 TEST EMAIL SENT SUCCESSFULLY!                  ');
    console.log('====================================================');
    console.log(`Message ID: ${result.messageId}`);
    console.log(`Response: ${result.response}`);
    console.log(`Please check your inbox at: ${targetEmail}\n`);
  } catch (err) {
    console.error(`\n❌ Failed to send test email: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

if (process.argv.includes('--test')) {
  runTestEmail();
}

module.exports = {
  createTransporter,
  getTransporter,
  verifyConnection,
  sendSingleEmail,
  runTestEmail,
};
