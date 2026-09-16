const fs = require('fs');
const path = require('path');
const config = require('../config');
const { parseAndCleanContacts, normalizeUnicodeText, cleanCompanyName, cleanLocation } = require('./cleaner');
const { sendSingleEmail, verifyConnection } = require('./mailer');

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EXTRACT_EMAILS_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

class CampaignManager {
  constructor() {
    this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'stopped'
    this.campaignType = 'csv'; // 'csv' | 'custom'
    this.contacts = [];
    this.customContacts = [];
    this.sentHistory = {};
    this.failedList = [];
    this.currentIndex = 0;
    this.queue = [];
    this.subscribers = new Set();
    this.stats = {
      total: 0,
      sent: 0,
      failed: 0,
      pending: 0,
      startTime: null,
      elapsedSec: 0,
    };
    this.isDryRun = false;
    this.delayMs = config.delayMs || 1000;
    this.timer = null;

    this.init();
  }

  init() {
    try {
      const parsed = parseAndCleanContacts(config.csvFilePath);
      this.contacts = parsed.contacts;
      this.loadSentHistory();
      this.loadFailedList();
      this.updateQueue();
    } catch (e) {
      console.error('Failed to initialize CampaignManager:', e);
    }
  }

  loadSentHistory() {
    if (fs.existsSync(config.sentHistoryPath)) {
      try {
        this.sentHistory = JSON.parse(fs.readFileSync(config.sentHistoryPath, 'utf8'));
      } catch (e) {
        this.sentHistory = {};
      }
    } else {
      this.sentHistory = {};
    }
  }

  saveSentHistory() {
    if (!fs.existsSync(config.logsDir)) {
      fs.mkdirSync(config.logsDir, { recursive: true });
    }
    fs.writeFileSync(config.sentHistoryPath, JSON.stringify(this.sentHistory, null, 2), 'utf8');
  }

  loadFailedList() {
    if (fs.existsSync(config.failedLogPath)) {
      try {
        this.failedList = JSON.parse(fs.readFileSync(config.failedLogPath, 'utf8'));
      } catch (e) {
        this.failedList = [];
      }
    } else {
      this.failedList = [];
    }
  }

  saveFailedList() {
    if (!fs.existsSync(config.logsDir)) {
      fs.mkdirSync(config.logsDir, { recursive: true });
    }
    fs.writeFileSync(config.failedLogPath, JSON.stringify(this.failedList, null, 2), 'utf8');
  }

  updateQueue() {
    this.loadSentHistory();
    if (this.campaignType === 'custom') {
      this.queue = this.customContacts;
      this.stats.total = this.customContacts.length;
      this.stats.sent = 0;
      this.stats.failed = 0;
      this.stats.pending = this.queue.length;
    } else {
      this.queue = this.contacts.filter((c) => !this.sentHistory[c.email.toLowerCase()]);
      this.stats.total = this.contacts.length;
      this.stats.sent = Object.keys(this.sentHistory).length;
      this.stats.failed = this.failedList.length;
      this.stats.pending = this.queue.length;
    }
  }

  subscribe(res) {
    this.subscribers.add(res);
    res.on('close', () => {
      this.subscribers.delete(res);
    });
  }

  broadcast(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.subscribers) {
      try {
        res.write(message);
      } catch (e) {
        // ignore closed connections
      }
    }
  }

  /**
   * Parses raw custom email inputs (array of strings, array of objects, or raw text)
   */
  parseCustomInput(input) {
    const parsedContacts = [];
    const seen = new Set();

    if (Array.isArray(input)) {
      for (const item of input) {
        if (typeof item === 'string') {
          const matches = normalizeUnicodeText(item).match(EXTRACT_EMAILS_REGEX);
          if (matches) {
            for (const email of matches) {
              const clean = email.toLowerCase().trim();
              if (EMAIL_REGEX.test(clean) && !seen.has(clean)) {
                seen.add(clean);
                parsedContacts.push({ email: clean, companyName: '', location: '' });
              }
            }
          }
        } else if (typeof item === 'object' && item !== null && item.email) {
          const clean = normalizeUnicodeText(item.email).toLowerCase().trim();
          if (EMAIL_REGEX.test(clean) && !seen.has(clean)) {
            seen.add(clean);
            parsedContacts.push({
              email: clean,
              companyName: cleanCompanyName(item.companyName || item.company || ''),
              location: cleanLocation(item.location || ''),
              recipientName: item.recipientName || item.name || '',
            });
          }
        }
      }
    } else if (typeof input === 'string') {
      const normalized = normalizeUnicodeText(input);
      const matches = normalized.match(EXTRACT_EMAILS_REGEX);
      if (matches) {
        for (const email of matches) {
          const clean = email.toLowerCase().trim();
          if (EMAIL_REGEX.test(clean) && !seen.has(clean)) {
            seen.add(clean);
            parsedContacts.push({ email: clean, companyName: '', location: '' });
          }
        }
      }
    }

    return parsedContacts;
  }

  /**
   * Starts campaign for the full CSV contact list
   */
  async start(options = {}) {
    if (this.status === 'running') return { success: false, message: 'A campaign is already running.' };

    this.campaignType = 'csv';
    this.isDryRun = options.dryRun !== undefined ? options.dryRun : config.dryRun;
    if (options.delayMs) this.delayMs = parseInt(options.delayMs, 10);

    if (!this.isDryRun) {
      const verify = await verifyConnection();
      if (!verify.success) {
        return { success: false, message: verify.message };
      }
    }

    this.updateQueue();
    if (this.queue.length === 0) {
      return { success: false, message: 'All contacts in the CSV have already been emailed.' };
    }

    this.status = 'running';
    this.stats.startTime = Date.now();
    this.currentIndex = 0;

    this.broadcast('status', {
      status: this.status,
      campaignType: this.campaignType,
      isDryRun: this.isDryRun,
      stats: this.stats,
    });

    this.broadcast('log', {
      type: 'info',
      message: `🚀 CSV Campaign started! Queue: ${this.queue.length} emails | Mode: ${this.isDryRun ? 'DRY-RUN' : 'LIVE'} | Rate: 1 mail per ${this.delayMs}ms`,
      timestamp: new Date().toLocaleTimeString(),
    });

    this.runLoop();
    return { success: true, message: 'Campaign started successfully.', totalInQueue: this.queue.length };
  }

  /**
   * Starts campaign strictly for the provided custom list of emails
   */
  async startCustom(customInput, options = {}) {
    if (this.status === 'running') return { success: false, message: 'A campaign is already running.' };

    const parsed = this.parseCustomInput(customInput);
    if (!parsed || parsed.length === 0) {
      return { success: false, message: 'No valid email addresses found in the provided input.' };
    }

    this.campaignType = 'custom';
    this.customContacts = parsed;
    this.queue = parsed;
    this.isDryRun = options.dryRun !== undefined ? options.dryRun : config.dryRun;
    if (options.delayMs) this.delayMs = parseInt(options.delayMs, 10);

    if (!this.isDryRun) {
      const verify = await verifyConnection();
      if (!verify.success) {
        return { success: false, message: verify.message };
      }
    }

    this.status = 'running';
    this.currentIndex = 0;
    this.stats.total = parsed.length;
    this.stats.sent = 0;
    this.stats.failed = 0;
    this.stats.pending = parsed.length;
    this.stats.startTime = Date.now();

    this.broadcast('status', {
      status: this.status,
      campaignType: this.campaignType,
      isDryRun: this.isDryRun,
      stats: this.stats,
    });

    this.broadcast('log', {
      type: 'info',
      message: `🎯 Custom Email Campaign started! Target count: ${parsed.length} emails | Mode: ${this.isDryRun ? 'DRY-RUN' : 'LIVE'} | Rate: 1 mail per ${this.delayMs}ms`,
      timestamp: new Date().toLocaleTimeString(),
    });

    this.runLoop();
    return {
      success: true,
      message: `Custom campaign started for ${parsed.length} emails.`,
      recipientCount: parsed.length,
      recipients: parsed.map((p) => p.email),
    };
  }

  pause() {
    if (this.status !== 'running') return { success: false, message: 'Campaign is not running.' };
    this.status = 'paused';
    if (this.timer) clearTimeout(this.timer);

    this.broadcast('status', { status: this.status, stats: this.stats });
    this.broadcast('log', {
      type: 'warning',
      message: `⏸️  Campaign paused by user. Processed ${this.stats.sent} emails so far.`,
      timestamp: new Date().toLocaleTimeString(),
    });

    return { success: true, message: 'Campaign paused.' };
  }

  resume() {
    if (this.status !== 'paused') return { success: false, message: 'Campaign is not paused.' };
    this.status = 'running';

    this.broadcast('status', { status: this.status, stats: this.stats });
    this.broadcast('log', {
      type: 'info',
      message: `▶️  Campaign resumed. Remaining: ${this.queue.length - this.currentIndex}`,
      timestamp: new Date().toLocaleTimeString(),
    });

    this.runLoop();
    return { success: true, message: 'Campaign resumed.' };
  }

  stop() {
    this.status = 'stopped';
    if (this.timer) clearTimeout(this.timer);

    this.saveSentHistory();
    this.updateQueue();

    this.broadcast('status', { status: this.status, stats: this.stats });
    this.broadcast('log', {
      type: 'warning',
      message: `🛑 Campaign stopped.`,
      timestamp: new Date().toLocaleTimeString(),
    });

    return { success: true, message: 'Campaign stopped.' };
  }

  async runLoop() {
    if (this.status !== 'running') return;

    if (this.currentIndex >= this.queue.length) {
      this.status = 'idle';
      this.saveSentHistory();
      this.broadcast('status', { status: this.status, stats: this.stats });
      this.broadcast('log', {
        type: 'success',
        message: `🎉 All ${this.queue.length} target emails have been processed successfully!`,
        timestamp: new Date().toLocaleTimeString(),
      });
      return;
    }

    const contact = this.queue[this.currentIndex];
    const itemNum = this.currentIndex + 1;
    const totalItems = this.queue.length;
    const sendStart = Date.now();

    try {
      const result = await sendSingleEmail(contact, { dryRun: this.isDryRun, silent: true });
      const duration = Date.now() - sendStart;

      if (!this.isDryRun) {
        this.sentHistory[contact.email.toLowerCase()] = {
          sentAt: new Date().toISOString(),
          companyName: contact.companyName,
          location: contact.location,
          messageId: result.messageId,
          campaignType: this.campaignType,
        };
        this.stats.sent++;
        this.stats.pending--;
        this.saveSentHistory();
      } else {
        this.stats.sent++;
        this.stats.pending--;
      }

      this.broadcast('email_sent', {
        index: itemNum,
        total: totalItems,
        email: contact.email,
        company: contact.companyName,
        location: contact.location,
        duration,
        isDryRun: this.isDryRun,
        timestamp: new Date().toLocaleTimeString(),
      });

      this.broadcast('log', {
        type: 'success',
        message: `[${itemNum}/${totalItems}] Sent to: ${contact.email} (${contact.companyName || 'General'}) - 200 OK (${duration}ms)${this.isDryRun ? ' [DRY-RUN]' : ''}`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      this.failedList.push({
        timestamp: new Date().toISOString(),
        email: contact.email,
        company: contact.companyName,
        location: contact.location,
        error: err.message || err.toString(),
      });
      this.stats.failed++;
      this.saveFailedList();

      this.broadcast('log', {
        type: 'error',
        message: `[${itemNum}/${totalItems}] ❌ Failed: ${contact.email} - ${err.message}`,
        timestamp: new Date().toLocaleTimeString(),
      });
    }

    this.currentIndex++;
    this.broadcast('stats', this.getStats());

    // Rate limit: wait exactly delayMs (1000ms = 1 second) before next iteration
    if (this.status === 'running') {
      this.timer = setTimeout(() => {
        this.runLoop();
      }, this.delayMs);
    }
  }

  getStats() {
    return {
      status: this.status,
      campaignType: this.campaignType,
      isDryRun: this.isDryRun,
      totalContacts: this.campaignType === 'custom' ? this.customContacts.length : this.contacts.length,
      sentCount: this.stats.sent,
      pendingCount: this.stats.pending,
      failedCount: this.stats.failed,
      delayMs: this.delayMs,
      smtpConfigured: Boolean(config.smtp.auth.user && config.smtp.auth.pass && config.smtp.auth.pass !== 'your_app_password_here'),
      sender: config.sender,
      subjectTemplate: config.subjectTemplate,
      attachment: config.attachment,
    };
  }

  getContactsList(page = 1, limit = 50, search = '') {
    const sourceList = this.campaignType === 'custom' ? this.customContacts : this.contacts;

    let list = sourceList.map((c) => {
      const isSent = Boolean(this.sentHistory[c.email.toLowerCase()]);
      const failed = this.failedList.find((f) => f.email.toLowerCase() === c.email.toLowerCase());
      return {
        ...c,
        status: isSent ? 'sent' : failed ? 'failed' : 'pending',
        sentAt: isSent ? this.sentHistory[c.email.toLowerCase()].sentAt : null,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) => c.email.toLowerCase().includes(q) || (c.companyName && c.companyName.toLowerCase().includes(q)) || (c.location && c.location.toLowerCase().includes(q))
      );
    }

    const total = list.length;
    const start = (page - 1) * limit;
    const paginated = list.slice(start, start + limit);

    return {
      contacts: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}

const campaignManager = new CampaignManager();
module.exports = campaignManager;
