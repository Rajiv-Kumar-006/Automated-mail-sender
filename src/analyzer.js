const fs = require('fs');
const path = require('path');
const config = require('../config');
const { parseAndCleanContacts } = require('./cleaner');

function runAnalysis() {
  console.log('====================================================');
  console.log('       📊 HR OUTREACH CSV DATASET ANALYSIS         ');
  console.log('====================================================\n');
  console.log(`Analyzing file: ${config.csvFilePath}\n`);

  const startTime = Date.now();
  const { contacts, stats, skippedRows } = parseAndCleanContacts(config.csvFilePath);
  const elapsed = Date.now() - startTime;

  console.log(`⏱️  Parsed and analyzed in: ${elapsed}ms\n`);
  console.log('--- 📈 Overall Summary ---');
  console.log(`• Total Raw CSV Lines        : ${stats.totalLines.toLocaleString()}`);
  console.log(`• Total Email Occurrences    : ${stats.totalRawEmailsFound.toLocaleString()}`);
  console.log(`• Total Unique Clean Emails  : ${stats.uniqueValidEmails.toLocaleString()}`);
  console.log(`• Duplicates Identified      : ${stats.duplicateEmailsRemoved.toLocaleString()}`);
  console.log(`• Non-Email / Invalid Rows   : ${stats.skippedRowsCount.toLocaleString()}\n`);

  // Domain breakdown
  const domainMap = {};
  contacts.forEach((c) => {
    const domain = c.email.split('@')[1] || 'unknown';
    domainMap[domain] = (domainMap[domain] || 0) + 1;
  });

  const sortedDomains = Object.entries(domainMap).sort((a, b) => b[1] - a[1]);
  const publicWebmails = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'rediffmail.com'];
  const webmailCount = contacts.filter((c) => publicWebmails.includes(c.email.split('@')[1])).length;
  const corporateCount = contacts.length - webmailCount;

  console.log('--- 🏢 Domain Breakdown ---');
  console.log(`• Corporate / Company Emails : ${corporateCount.toLocaleString()} (${((corporateCount / contacts.length) * 100).toFixed(1)}%)`);
  console.log(`• Public Webmails (Gmail etc): ${webmailCount.toLocaleString()} (${((webmailCount / contacts.length) * 100).toFixed(1)}%)\n`);

  console.log('Top 15 Most Common Email Domains:');
  console.table(
    sortedDomains.slice(0, 15).map(([domain, count], idx) => ({
      Rank: idx + 1,
      Domain: domain,
      Count: count,
      Share: `${((count / contacts.length) * 100).toFixed(2)}%`,
    }))
  );

  // Sample contacts
  console.log('\n--- 📋 Sample Cleaned Contacts (First 5) ---');
  contacts.slice(0, 5).forEach((c, idx) => {
    console.log(`[${idx + 1}] Email: ${c.email.padEnd(35)} | Company: ${(c.companyName || 'N/A').padEnd(25)} | Location: ${c.location || 'N/A'}`);
  });

  // Ensure logs directory exists
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }

  // Export cleaned contacts to JSON for reference
  const exportPath = path.join(config.logsDir, 'cleaned_contacts.json');
  fs.writeFileSync(exportPath, JSON.stringify(contacts, null, 2), 'utf8');
  console.log(`\n💾 Cleaned contact list exported to: ${exportPath}`);

  if (skippedRows.length > 0) {
    const skippedPath = path.join(config.logsDir, 'skipped_rows.json');
    fs.writeFileSync(skippedPath, JSON.stringify(skippedRows, null, 2), 'utf8');
    console.log(`⚠️  Skipped non-email rows logged to: ${skippedPath}`);
  }

  console.log('\n====================================================');
  console.log('  ✅ Dataset is ready for cold outreach dispatch!   ');
  console.log('====================================================\n');
}

if (require.main === module) {
  runAnalysis();
}

module.exports = { runAnalysis };
