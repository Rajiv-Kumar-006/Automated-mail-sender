# 🚀 Cold Email Outreach Automation Engine

A high-performance, rate-limited cold email dispatch engine built with **Node.js**, **Nodemailer**, and **EJS**. Designed specifically for sending personalized outreach to HR & recruiter contact lists safely and reliably.

---

## 📊 CSV Analysis & Clean Data Summary

From the provided dataset:
* **Total CSV Rows**: 2,795
* **Total Emails Found**: 2,847
* **Clean & Unique Contacts**: **1,915**
* **Duplicates Removed**: 876
* **Non-Email / Form Links Filtered**: 30

---

## 🌟 Key Features

* ⏱️ **1-Second Rate Limiting**: Sends exactly 1 email every 1,000ms (1 second) to protect domain reputation and prevent SMTP throttling.
* 🎨 **Responsive EJS Email Template**: Clean HTML email template (`views/email-template.ejs`) with custom styling, skills badges, social links, and call-to-action buttons.
* 📄 **Multipart Plain Text Fallback**: Automatic plain text version (`views/email-template.txt.ejs`) for spam score minimization and maximum deliverability.
* 🧹 **Smart Data Sanitization**:
  * Strips header disclaimers.
  * Normalizes Unicode bold/italic characters (e.g. `𝗟𝗲𝗮𝗿𝗻𝗶𝗻𝗴...` $\to$ `Learning...`).
  * Splits comma-separated multiple emails per row.
  * Deduplicates contacts while retaining company and location metadata.
* 🛡️ **Dry-Run Mode**: Test template rendering and queue execution without sending actual emails.
* 🧪 **Single Test Email**: Send 1 test email directly to your inbox to review layout before broadcasting.
* 💾 **State Tracking & Resume**: Saves every sent email into `logs/sent_history.json`. If stopped, it automatically resumes from where it left off without sending duplicates.
* 📎 **Resume PDF Attachment**: Easily attach your resume from `attachments/Resume.pdf`.

---

## 📂 Project Structure

```
script/
├── package.json                   # Dependencies and scripts
├── .env.example                   # Environment configuration template
├── .env                          # Your local SMTP credentials (private)
├── config.js                      # Configuration loader
├── src/
│   ├── index.js                   # Main rate-limited dispatcher (1 mail/sec)
│   ├── cleaner.js                 # CSV parser, deduplicator & normalizer
│   ├── analyzer.js                # CSV dataset analytics & exporter
│   ├── templateRenderer.js        # EJS template compiler & preview generator
│   └── mailer.js                  # Nodemailer transport & connection tester
├── views/
│   ├── email-template.ejs         # Responsive HTML email template
│   └── email-template.txt.ejs     # Plaintext fallback template
├── attachments/
│   └── README.md                  # Place your Resume.pdf here
└── logs/
    ├── cleaned_contacts.json      # Deduplicated contacts list
    ├── sent_history.json          # Sent emails record (for resume safety)
    ├── failed_emails.json         # Error logs
    └── preview_email.html         # Template preview HTML
```

---

## 🚀 Getting Started

### Step 1: Configure SMTP in `.env`

Open `.env` and fill in your email credentials.

#### For Gmail:
1. Enable 2-Step Verification on your Google Account: [myaccount.google.com/security](https://myaccount.google.com/security)
2. Generate a 16-character **App Password**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   * Select App: *Mail*
   * Select Device: *Windows Computer*
3. Paste the generated 16-character password into `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx

# Your Details
SENDER_NAME=Rajiv Kumar
SENDER_EMAIL=your_email@gmail.com
SENDER_TITLE=Software Engineer / Full Stack Developer
SENDER_PHONE=+91 9876543210
SENDER_LINKEDIN=https://www.linkedin.com/in/yourprofile
SENDER_PORTFOLIO=https://yourportfolio.dev
SENDER_KEY_SKILLS=Node.js, React, JavaScript, TypeScript, REST APIs, MongoDB, SQL
```

---

## 🛠️ CLI Commands & Workflows

### 1. 📊 Analyze the CSV Dataset
Analyzes the entire CSV, shows domain distribution, and exports `logs/cleaned_contacts.json`:
```bash
npm run analyze
```

### 2. 👁️ Preview Email Template
Compiles your EJS template with sample data and creates `logs/preview_email.html` so you can view the design in your browser:
```bash
npm run preview
```

### 3. 🧪 Send a Test Email to Your Inbox
Send a single test email to your own email address to verify delivery and inbox formatting:
```bash
npm run test-mail -- --to=your_email@gmail.com
```

### 4. 🛡️ Run in Dry-Run Mode (Simulation)
Simulates sending the queue with the 1-second delay without actually transmitting emails:
```bash
npm run dry-run
# Or test a small batch of 10 emails:
node src/index.js --dry-run --limit=10
```

### 5. 🚀 Start Live Outreach Campaign (1 Email Per Second)
When you are ready, start the real email dispatching queue:
```bash
npm start
```

*To limit the number of emails sent in one session (e.g. 50 emails):*
```bash
node src/index.js --limit=50
```

---

## 📎 Adding Your Resume

1. Copy your PDF resume into the `attachments/` folder as `Resume.pdf` (e.g. `attachments/Resume.pdf`).
2. In `.env`, set:
   ```env
   ATTACH_RESUME=true
   RESUME_FILE_PATH=./attachments/Resume.pdf
   RESUME_DISPLAY_NAME=Rajiv_Kumar_Resume.pdf
   ```

---

## ⏸️ Pausing and Resuming

* You can safely stop the script anytime by pressing `Ctrl + C`.
* The script automatically saves progress to `logs/sent_history.json`.
* When you run `npm start` again, it will automatically skip contacts that have already received an email.
