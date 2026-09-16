const express = require('express');
const path = require('path');
const config = require('./config');
const campaignManager = require('./src/campaignManager');
const { renderEmail } = require('./src/templateRenderer');
const { verifyConnection, sendSingleEmail } = require('./src/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// API: Get campaign stats & configuration
app.get('/api/stats', (req, res) => {
  res.json(campaignManager.getStats());
});

// API: Get contacts list with pagination and search
app.get('/api/contacts', (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 30;
  const search = req.query.search || '';
  res.json(campaignManager.getContactsList(page, limit, search));
});

// API: Live preview of email template with real or sample data
app.get('/api/preview', (req, res) => {
  const contact = {
    email: req.query.email || 'recruiter@company.com',
    companyName: req.query.company || 'Innovatech Systems',
    location: req.query.location || 'Bengaluru',
    recipientName: req.query.name || '',
  };

  const rendered = renderEmail(contact);
  res.json({
    contact,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
});

// API: Verify SMTP credentials
app.post('/api/verify-smtp', async (req, res) => {
  const result = await verifyConnection();
  res.json(result);
});

// API: Send a single test email
app.post('/api/test-email', async (req, res) => {
  const { to, company, location } = req.body;
  if (!to) {
    return res.status(400).json({ success: false, message: 'Target email address is required.' });
  }

  try {
    const contact = {
      email: to,
      companyName: company || 'Test Organization',
      location: location || 'Remote',
    };
    const result = await sendSingleEmail(contact, { dryRun: false });
    res.json({ success: true, message: `Test email sent to ${to}`, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Start campaign on the entire CSV list
app.post('/api/campaign/start', async (req, res) => {
  const { dryRun, delayMs } = req.body;
  const result = await campaignManager.start({
    dryRun: dryRun !== undefined ? dryRun : false,
    delayMs: delayMs || 1000,
  });
  res.json(result);
});

/**
 * API: Start campaign ONLY on custom provided emails
 * Accepts:
 *   { emails: ["a@b.com", "c@d.com"], dryRun: false, delayMs: 1000 }
 *   OR
 *   { contacts: [{ email: "a@b.com", companyName: "Acme", location: "Delhi" }], dryRun: false }
 *   OR
 *   { rawText: "a@b.com, c@d.com", dryRun: false }
 */
app.post('/api/campaign/custom', async (req, res) => {
  const { emails, contacts, rawText, dryRun, delayMs } = req.body;
  const input = emails || contacts || rawText;

  if (!input || (Array.isArray(input) && input.length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a list of emails (e.g., { "emails": ["user1@example.com", "user2@example.com"] })',
    });
  }

  const result = await campaignManager.startCustom(input, {
    dryRun: dryRun !== undefined ? dryRun : false,
    delayMs: delayMs || 1000,
  });

  res.json(result);
});

// API: Pause campaign
app.post('/api/campaign/pause', (req, res) => {
  res.json(campaignManager.pause());
});

// API: Resume campaign
app.post('/api/campaign/resume', (req, res) => {
  res.json(campaignManager.resume());
});

// API: Stop campaign
app.post('/api/campaign/stop', (req, res) => {
  res.json(campaignManager.stop());
});

// API: Server-Sent Events (SSE) for live streaming logs & progress
app.get('/api/campaign/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial state
  res.write(`event: init\ndata: ${JSON.stringify(campaignManager.getStats())}\n\n`);

  campaignManager.subscribe(res);
});

// Start Express Server
app.listen(PORT, () => {
  console.log('====================================================');
  console.log('   🚀 COLD EMAIL OUTREACH WEB SERVER STARTED        ');
  console.log('====================================================');
  console.log(`🌐 Server running at : http://localhost:${PORT}`);
  console.log(`📊 Open dashboard    : http://localhost:${PORT}`);
  console.log(`⏱️  Default rate limit: 1 email / second (1000ms)`);
  console.log('🛡️  Status            : Server is UP. (No emails will be sent until you trigger a campaign)');
  console.log('----------------------------------------------------');
  console.log('💡 Quick Triggers:');
  console.log('   • Start Full CSV Campaign    : Click "Start Campaign" in Dashboard or run "npm run campaign"');
  console.log('   • Send to Custom Email List  : POST to /api/campaign/custom with { "emails": [...] }');
  console.log('====================================================\n');
});
