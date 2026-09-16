const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const config = require('../config');

// Cache compiled templates
let cachedHtmlTemplate = null;
let cachedTxtTemplate = null;

function loadTemplates() {
  if (!cachedHtmlTemplate && fs.existsSync(config.htmlTemplatePath)) {
    const htmlSource = fs.readFileSync(config.htmlTemplatePath, 'utf8');
    cachedHtmlTemplate = ejs.compile(htmlSource);
  }

  if (!cachedTxtTemplate && fs.existsSync(config.txtTemplatePath)) {
    const txtSource = fs.readFileSync(config.txtTemplatePath, 'utf8');
    cachedTxtTemplate = ejs.compile(txtSource);
  }
}

/**
 * Renders the email subject with recipient variables
 */
function renderSubject(contact) {
  try {
    const compiled = ejs.compile(config.subjectTemplate);
    return compiled({
      companyName: contact.companyName || 'your company',
      location: contact.location || '',
      sender: config.sender,
    });
  } catch (err) {
    return config.subjectTemplate.replace('<%= companyName %>', contact.companyName || 'your company');
  }
}

/**
 * Renders HTML and plain-text versions of the email template
 * @param {Object} contact - The recipient contact details
 * @returns {{ html: string, text: string, subject: string }}
 */
function renderEmail(contact) {
  loadTemplates();

  const subject = renderSubject(contact);
  const data = {
    recipientEmail: contact.email,
    companyName: contact.companyName || '',
    location: contact.location || '',
    recipientName: contact.recipientName || '',
    subject: subject,
    sender: config.sender,
  };

  const html = cachedHtmlTemplate ? cachedHtmlTemplate(data) : '';
  const text = cachedTxtTemplate ? cachedTxtTemplate(data) : '';

  return { subject, html, text };
}

/**
 * Preview helper to generate a sample rendered HTML file for review
 */
function previewSample() {
  const sampleContact = {
    email: 'hr@example.com',
    companyName: 'Google',
    location: 'Bengaluru',
    recipientName: 'Alex',
  };

  const { subject, html, text } = renderEmail(sampleContact);

  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }

  const previewHtmlPath = path.join(config.logsDir, 'preview_email.html');
  fs.writeFileSync(previewHtmlPath, html, 'utf8');

  console.log('====================================================');
  console.log('            📧 EMAIL TEMPLATE PREVIEW               ');
  console.log('====================================================\n');
  console.log(`📌 Subject: ${subject}`);
  console.log(`\n--- 📄 Plain Text Preview ---`);
  console.log(text);
  console.log(`\n--- 🌐 HTML Preview Saved ---`);
  console.log(`Saved rendered HTML file to: ${previewHtmlPath}`);
  console.log('You can open this file in any web browser to view the design.\n');
}

if (process.argv.includes('--preview')) {
  previewSample();
}

module.exports = {
  renderEmail,
  renderSubject,
  previewSample,
};
