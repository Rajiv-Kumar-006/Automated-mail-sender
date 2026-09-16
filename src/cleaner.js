const fs = require('fs');
const path = require('path');

/**
 * Normalizes Unicode text (such as mathematical bold/italic fonts used in some HR emails)
 */
function normalizeUnicodeText(text) {
  if (!text) return '';
  return text.normalize('NFKC').trim();
}

/**
 * Cleans duplicated words in company names (e.g. "Apna Mart apna mart" -> "Apna Mart")
 */
function cleanCompanyName(company) {
  if (!company) return '';
  let cleaned = normalizeUnicodeText(company);

  // Remove trailing comma, periods, or quotes
  cleaned = cleaned.replace(/^["'\s]+|["',\s]+$/g, '');

  // If company has repeated case-insensitive tokens (e.g., "E-solutions E-Solutions" or "Apna Mart apna mart")
  const parts = cleaned.split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    cleaned = parts[0];
  } else if (parts.length === 4 && `${parts[0]} ${parts[1]}`.toLowerCase() === `${parts[2]} ${parts[3]}`.toLowerCase()) {
    cleaned = `${parts[0]} ${parts[1]}`;
  }

  return cleaned;
}

/**
 * Cleans location text
 */
function cleanLocation(location) {
  if (!location) return '';
  let cleaned = normalizeUnicodeText(location);
  return cleaned.replace(/^["'\s]+|["',\s]+$/g, '');
}

/**
 * Standard RFC-compliant email regex
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EXTRACT_EMAILS_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Robust CSV line splitter that respects quoted strings
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses and cleans the HR email CSV file
 * @param {string} filePath - Absolute or relative path to CSV file
 * @returns {Array<Object>} List of deduplicated, cleaned contacts
 */
function parseAndCleanContacts(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const contactsMap = new Map(); // email -> contact object
  const skippedRows = [];
  let totalRawEmailsFound = 0;

  let headerFound = false;
  let colIndex = { company: 0, location: 1, email: 2 };

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].trim();
    if (!lineText) continue;

    // Detect header row specifically: Must start with Company (or Company Name) and contain Location & Email as columns
    if (!headerFound) {
      const parsed = parseCsvLine(lineText);
      const lowerCols = parsed.map((c) => c.toLowerCase());
      
      const isHeader = lowerCols.length >= 3 &&
        lowerCols[0].includes('company') &&
        lowerCols.some((c) => c.includes('location')) &&
        lowerCols.some((c) => c.includes('email'));

      if (isHeader) {
        headerFound = true;
        colIndex.company = lowerCols.findIndex((c) => c.includes('company'));
        colIndex.location = lowerCols.findIndex((c) => c.includes('location'));
        colIndex.email = lowerCols.findIndex((c) => c.includes('email'));
        if (colIndex.company === -1) colIndex.company = 0;
        if (colIndex.location === -1) colIndex.location = 1;
        if (colIndex.email === -1) colIndex.email = 2;
        continue;
      }
      // Skip disclaimer/intro lines before header
      continue;
    }

    const cols = parseCsvLine(lineText);
    const rawCompany = cols[colIndex.company] || '';
    const rawLocation = cols[colIndex.location] || '';
    const rawEmailField = cols[colIndex.email] || '';

    // Normalize Unicode before regex matching
    const normalizedEmailField = normalizeUnicodeText(rawEmailField);
    const normalizedLine = normalizeUnicodeText(lineText);

    // Extract all valid emails from the email column or entire row
    let emails = normalizedEmailField.match(EXTRACT_EMAILS_REGEX);
    if (!emails || emails.length === 0) {
      emails = normalizedLine.match(EXTRACT_EMAILS_REGEX);
    }

    if (!emails || emails.length === 0) {
      skippedRows.push({
        line: i + 1,
        reason: 'No valid email address found (URL or instruction row)',
        content: lineText.substring(0, 100),
      });
      continue;
    }

    const companyName = cleanCompanyName(rawCompany);
    const location = cleanLocation(rawLocation);

    for (const email of emails) {
      const cleanEmail = email.toLowerCase().trim();
      totalRawEmailsFound++;

      if (!EMAIL_REGEX.test(cleanEmail)) {
        continue;
      }

      // If already present, keep the one with a better company name or location
      if (contactsMap.has(cleanEmail)) {
        const existing = contactsMap.get(cleanEmail);
        if ((!existing.companyName || existing.companyName === '') && companyName) {
          existing.companyName = companyName;
        }
        if (!existing.location && location) {
          existing.location = location;
        }
      } else {
        contactsMap.set(cleanEmail, {
          email: cleanEmail,
          companyName: companyName,
          location: location,
          sourceLine: i + 1,
        });
      }
    }
  }

  const uniqueContacts = Array.from(contactsMap.values());

  return {
    contacts: uniqueContacts,
    stats: {
      totalLines: lines.length,
      totalRawEmailsFound: totalRawEmailsFound,
      uniqueValidEmails: uniqueContacts.length,
      duplicateEmailsRemoved: totalRawEmailsFound - uniqueContacts.length,
      skippedRowsCount: skippedRows.length,
    },
    skippedRows: skippedRows,
  };
}

module.exports = {
  parseAndCleanContacts,
  cleanCompanyName,
  cleanLocation,
  normalizeUnicodeText,
  parseCsvLine,
};
