const path = require('path');
require('dotenv').config();

module.exports = {
  // SMTP settings
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 465,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // Sender details
  sender: {
    name: process.env.SENDER_NAME || 'Applicant',
    email: process.env.SENDER_EMAIL || process.env.SMTP_USER || '',
    title: process.env.SENDER_TITLE || 'Software Engineer',
    phone: process.env.SENDER_PHONE || '',
    linkedin: process.env.SENDER_LINKEDIN || '',
    portfolio: process.env.SENDER_PORTFOLIO || '',
    github: process.env.SENDER_GITHUB || '',
    yearsOfExp: process.env.SENDER_YEARS_OF_EXP || '2+ years',
    skills: process.env.SENDER_KEY_SKILLS || 'JavaScript, Node.js, React',
  },

  // Email subject template
  subjectTemplate: process.env.EMAIL_SUBJECT || 'Application for Software Engineer Opportunities - <%= companyName %>',

  // Throttling / Rate limit (ms)
  delayMs: parseInt(process.env.DELAY_BETWEEN_EMAILS_MS, 10) || 1000,

  // Limit / Dry-run controls
  dryRun: process.env.DRY_RUN === 'true',
  maxEmails: parseInt(process.env.MAX_EMAILS_TO_SEND, 10) || 0,

  // Attachment settings
  attachment: {
    enabled: process.env.ATTACH_RESUME === 'true',
    filePath: path.resolve(process.cwd(), process.env.RESUME_FILE_PATH || './attachments/Resume.pdf'),
    displayName: process.env.RESUME_DISPLAY_NAME || 'Resume.pdf',
  },

  // File paths
  csvFilePath: path.resolve(
    process.cwd(),
    process.env.CSV_FILE_PATH || './23800+ Ultimate HR Outreach List - DataNiti - 3000+ HR\'s with Profiles - Weekly Updates.csv'
  ),
  logsDir: path.resolve(process.cwd(), './logs'),
  sentHistoryPath: path.resolve(process.cwd(), './logs/sent_history.json'),
  failedLogPath: path.resolve(process.cwd(), './logs/failed_emails.json'),
  htmlTemplatePath: path.resolve(process.cwd(), './views/email-template.ejs'),
  txtTemplatePath: path.resolve(process.cwd(), './views/email-template.txt.ejs'),
};
