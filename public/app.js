// State
let currentPage = 1;
let currentSearch = '';
let currentDelay = 1000;
let eventSource = null;

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const smtpStatusBadge = document.getElementById('smtpStatusBadge');
const smtpStatusText = document.getElementById('smtpStatusText');
const btnVerifySmtp = document.getElementById('btnVerifySmtp');

const statTotal = document.getElementById('statTotal');
const statSent = document.getElementById('statSent');
const statPending = document.getElementById('statPending');
const statSentPercent = document.getElementById('statSentPercent');
const statRate = document.getElementById('statRate');
const tabContactsCount = document.getElementById('tabContactsCount');

const campaignStatusPill = document.getElementById('campaignStatusPill');
const progressPercentageText = document.getElementById('progressPercentageText');
const progressFill = document.getElementById('progressFill');

const btnStartCampaign = document.getElementById('btnStartCampaign');
const btnPauseCampaign = document.getElementById('btnPauseCampaign');
const btnResumeCampaign = document.getElementById('btnResumeCampaign');
const btnStopCampaign = document.getElementById('btnStopCampaign');
const chkDryRun = document.getElementById('chkDryRun');
const rangeDelay = document.getElementById('rangeDelay');
const valDelay = document.getElementById('valDelay');

const terminalWindow = document.getElementById('terminalWindow');
const btnClearLogs = document.getElementById('btnClearLogs');

const formCustomList = document.getElementById('formCustomList');
const textareaCustomEmails = document.getElementById('textareaCustomEmails');
const inputCustomCompany = document.getElementById('inputCustomCompany');
const inputCustomLocation = document.getElementById('inputCustomLocation');
const chkCustomDryRun = document.getElementById('chkCustomDryRun');
const btnSubmitCustom = document.getElementById('btnSubmitCustom');
const customResultMsg = document.getElementById('customResultMsg');

const previewSubject = document.getElementById('previewSubject');
const previewIframe = document.getElementById('previewIframe');
const btnRefreshPreview = document.getElementById('btnRefreshPreview');

const contactsTableBody = document.getElementById('contactsTableBody');
const inputSearchContacts = document.getElementById('inputSearchContacts');
const btnPrevPage = document.getElementById('btnPrevPage');
const btnNextPage = document.getElementById('btnNextPage');
const pageIndicator = document.getElementById('pageIndicator');

const formTestEmail = document.getElementById('formTestEmail');
const btnSubmitTest = document.getElementById('btnSubmitTest');
const testResultMsg = document.getElementById('testResultMsg');

// Initialize Tabs
tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    tabPanes.forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    const targetId = `tab-${btn.getAttribute('data-tab')}`;
    const targetPane = document.getElementById(targetId);
    if (targetPane) targetPane.classList.add('active');

    if (btn.getAttribute('data-tab') === 'contacts') {
      loadContacts(currentPage, currentSearch);
    }
    if (btn.getAttribute('data-tab') === 'preview') {
      loadPreview();
    }
  });
});

// Append log to terminal
function appendLog(message, type = 'info', timestamp = new Date().toLocaleTimeString()) {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${timestamp}] ${message}`;
  terminalWindow.appendChild(line);
  terminalWindow.scrollTop = terminalWindow.scrollHeight;
}

btnClearLogs.addEventListener('click', () => {
  terminalWindow.innerHTML = '';
});

// Update UI with Stats
function updateStatsUI(stats) {
  if (!stats) return;

  const total = stats.totalContacts || 0;
  const sent = stats.sentCount || 0;
  const pending = stats.pendingCount || 0;
  const percent = total > 0 ? ((sent / total) * 100).toFixed(1) : '0.0';

  statTotal.textContent = total.toLocaleString();
  statSent.textContent = sent.toLocaleString();
  statPending.textContent = pending.toLocaleString();
  statSentPercent.textContent = `${percent}% of current queue`;
  tabContactsCount.textContent = (stats.campaignType === 'csv' ? total : (stats.totalContacts || 1915)).toLocaleString();

  progressPercentageText.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;

  // Status badge & buttons
  campaignStatusPill.className = `status-pill status-${stats.status || 'idle'}`;
  campaignStatusPill.textContent = `${(stats.status || 'IDLE').toUpperCase()}${stats.campaignType === 'custom' ? ' (CUSTOM)' : ''}`;

  if (stats.status === 'running') {
    btnStartCampaign.style.display = 'none';
    btnResumeCampaign.style.display = 'none';
    btnPauseCampaign.style.display = 'inline-flex';
    btnPauseCampaign.disabled = false;
    btnStopCampaign.disabled = false;
  } else if (stats.status === 'paused') {
    btnStartCampaign.style.display = 'none';
    btnPauseCampaign.style.display = 'none';
    btnResumeCampaign.style.display = 'inline-flex';
    btnResumeCampaign.disabled = false;
    btnStopCampaign.disabled = false;
  } else {
    btnStartCampaign.style.display = 'inline-flex';
    btnResumeCampaign.style.display = 'none';
    btnPauseCampaign.style.display = 'none';
    btnStartCampaign.disabled = false;
    btnStopCampaign.disabled = true;
  }

  // SMTP status
  if (stats.smtpConfigured) {
    smtpStatusBadge.className = 'smtp-badge connected';
    smtpStatusText.textContent = 'SMTP Ready';
  } else {
    smtpStatusBadge.className = 'smtp-badge disconnected';
    smtpStatusText.textContent = 'Configure .env';
  }
}

// Fetch Initial Stats
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    updateStatsUI(data);
  } catch (err) {
    appendLog('Failed to connect to server stats.', 'error');
  }
}

// Server-Sent Events (SSE) stream for live updates
function connectSSE() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource('/api/campaign/stream');

  eventSource.addEventListener('init', (e) => {
    const data = JSON.parse(e.data);
    updateStatsUI(data);
  });

  eventSource.addEventListener('stats', (e) => {
    const data = JSON.parse(e.data);
    updateStatsUI(data);
  });

  eventSource.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    updateStatsUI(data);
  });

  eventSource.addEventListener('log', (e) => {
    const data = JSON.parse(e.data);
    appendLog(data.message, data.type, data.timestamp);
  });

  eventSource.addEventListener('email_sent', (e) => {
    const data = JSON.parse(e.data);
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'contacts') {
      loadContacts(currentPage, currentSearch);
    }
  });

  eventSource.onerror = () => {
    console.warn('SSE stream disconnected, reconnecting...');
  };
}

// Controls: Range delay
rangeDelay.addEventListener('input', (e) => {
  currentDelay = parseInt(e.target.value, 10);
  valDelay.textContent = currentDelay;
  statRate.textContent = `${(currentDelay / 1000).toFixed(1)}s / mail`;
});

// Controls: Start CSV Campaign
btnStartCampaign.addEventListener('click', async () => {
  const isDryRun = chkDryRun.checked;
  btnStartCampaign.disabled = true;

  try {
    const res = await fetch('/api/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: isDryRun, delayMs: currentDelay }),
    });
    const result = await res.json();
    if (!result.success) {
      appendLog(`Error: ${result.message}`, 'error');
      alert(`Could not start campaign: ${result.message}`);
      btnStartCampaign.disabled = false;
    }
  } catch (e) {
    appendLog(`Network error starting campaign: ${e.message}`, 'error');
    btnStartCampaign.disabled = false;
  }
});

// Controls: Pause
btnPauseCampaign.addEventListener('click', async () => {
  await fetch('/api/campaign/pause', { method: 'POST' });
});

// Controls: Resume
btnResumeCampaign.addEventListener('click', async () => {
  await fetch('/api/campaign/resume', { method: 'POST' });
});

// Controls: Stop
btnStopCampaign.addEventListener('click', async () => {
  if (confirm('Are you sure you want to stop the campaign?')) {
    await fetch('/api/campaign/stop', { method: 'POST' });
  }
});

// Custom Email List Submit
formCustomList.addEventListener('submit', async (e) => {
  e.preventDefault();
  const rawEmails = textareaCustomEmails.value.trim();
  const defaultCompany = inputCustomCompany.value.trim();
  const defaultLocation = inputCustomLocation.value.trim();
  const isDryRun = chkCustomDryRun.checked;

  if (!rawEmails) return;

  btnSubmitCustom.disabled = true;
  btnSubmitCustom.textContent = 'Starting Custom Campaign...';
  customResultMsg.style.display = 'none';

  try {
    const res = await fetch('/api/campaign/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: rawEmails,
        companyName: defaultCompany,
        location: defaultLocation,
        dryRun: isDryRun,
        delayMs: currentDelay,
      }),
    });
    const data = await res.json();
    customResultMsg.style.display = 'block';

    if (data.success) {
      customResultMsg.className = 'result-box success';
      customResultMsg.textContent = `🚀 Started! Dispatching to ${data.recipientCount} emails at 1 mail per second. Switch to Dashboard tab to monitor progress.`;
      appendLog(`Custom campaign started for ${data.recipientCount} target emails`, 'success');
      
      // Switch to dashboard tab to watch the live progress
      setTimeout(() => {
        document.querySelector('.tab-btn[data-tab="dashboard"]').click();
      }, 1500);
    } else {
      customResultMsg.className = 'result-box error';
      customResultMsg.textContent = `❌ Error: ${data.message}`;
      appendLog(`Custom campaign failed: ${data.message}`, 'error');
    }
  } catch (err) {
    customResultMsg.style.display = 'block';
    customResultMsg.className = 'result-box error';
    customResultMsg.textContent = `❌ Network Error: ${err.message}`;
  } finally {
    btnSubmitCustom.disabled = false;
    btnSubmitCustom.textContent = 'Dispatch Custom Emails (1 sec/mail)';
  }
});

// Verify SMTP Button
btnVerifySmtp.addEventListener('click', async () => {
  btnVerifySmtp.disabled = true;
  btnVerifySmtp.textContent = 'Verifying...';
  appendLog('🔌 Testing SMTP connection...', 'info');

  try {
    const res = await fetch('/api/verify-smtp', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      appendLog('✅ SMTP Connection verified successfully!', 'success');
      smtpStatusBadge.className = 'smtp-badge connected';
      smtpStatusText.textContent = 'SMTP Ready';
      alert('✅ SMTP Connection verified successfully!');
    } else {
      appendLog(`❌ SMTP Verification failed: ${data.message}`, 'error');
      smtpStatusBadge.className = 'smtp-badge disconnected';
      smtpStatusText.textContent = 'Auth Failed';
      alert(`❌ SMTP Verification Failed:\n\n${data.message}`);
    }
  } catch (err) {
    appendLog(`❌ Error verifying SMTP: ${err.message}`, 'error');
  } finally {
    btnVerifySmtp.disabled = false;
    btnVerifySmtp.textContent = 'Verify SMTP';
  }
});

// Preview Tab loader
async function loadPreview() {
  try {
    const res = await fetch('/api/preview');
    const data = await res.json();
    previewSubject.textContent = data.subject;
    const iframeDoc = previewIframe.contentDocument || previewIframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(data.html);
    iframeDoc.close();
  } catch (err) {
    previewSubject.textContent = 'Failed to load preview';
  }
}
btnRefreshPreview.addEventListener('click', loadPreview);

// Contacts Table loader
let searchTimeout = null;
inputSearchContacts.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  currentSearch = e.target.value;
  searchTimeout = setTimeout(() => {
    currentPage = 1;
    loadContacts(currentPage, currentSearch);
  }, 300);
});

async function loadContacts(page = 1, search = '') {
  contactsTableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px; color: var(--text-muted);">Loading contacts...</td></tr>';
  try {
    const res = await fetch(`/api/contacts?page=${page}&limit=25&search=${encodeURIComponent(search)}`);
    const data = await res.json();

    if (data.contacts.length === 0) {
      contactsTableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px; color: var(--text-muted);">No contacts found matching your query.</td></tr>';
      pageIndicator.textContent = 'Page 0 of 0';
      btnPrevPage.disabled = true;
      btnNextPage.disabled = true;
      return;
    }

    contactsTableBody.innerHTML = data.contacts
      .map((c, idx) => {
        const rowNum = (page - 1) * 25 + idx + 1;
        const badgeClass = c.status === 'sent' ? 'badge-sent' : c.status === 'failed' ? 'badge-failed' : 'badge-pending';
        const badgeText = c.status === 'sent' ? 'Sent' : c.status === 'failed' ? 'Failed' : 'Pending';
        return `
          <tr>
            <td style="color: var(--text-muted);">${rowNum}</td>
            <td style="font-weight: 600;">${c.email}</td>
            <td>${c.companyName || '<span style="color:var(--text-muted)">N/A</span>'}</td>
            <td>${c.location || '<span style="color:var(--text-muted)">N/A</span>'}</td>
            <td><span class="${badgeClass}">${badgeText}</span></td>
          </tr>
        `;
      })
      .join('');

    pageIndicator.textContent = `Page ${data.page} of ${data.totalPages || 1} (${data.total.toLocaleString()} contacts)`;
    btnPrevPage.disabled = data.page <= 1;
    btnNextPage.disabled = data.page >= data.totalPages;
  } catch (err) {
    contactsTableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: var(--danger);">Failed to load contacts.</td></tr>';
  }
}

btnPrevPage.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    loadContacts(currentPage, currentSearch);
  }
});

btnNextPage.addEventListener('click', () => {
  currentPage++;
  loadContacts(currentPage, currentSearch);
});

// Test Email Form submit
formTestEmail.addEventListener('submit', async (e) => {
  e.preventDefault();
  const to = document.getElementById('inputTestTo').value.trim();
  const company = document.getElementById('inputTestCompany').value.trim();
  const location = document.getElementById('inputTestLocation').value.trim();

  btnSubmitTest.disabled = true;
  btnSubmitTest.textContent = 'Sending Test Email...';
  testResultMsg.style.display = 'none';

  try {
    const res = await fetch('/api/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, company, location }),
    });
    const data = await res.json();
    testResultMsg.style.display = 'block';

    if (data.success) {
      testResultMsg.className = 'result-box success';
      testResultMsg.textContent = `🎉 Success: ${data.message}! Please check your inbox at ${to}.`;
      appendLog(`Test email successfully delivered to ${to}`, 'success');
    } else {
      testResultMsg.className = 'result-box error';
      testResultMsg.textContent = `❌ Error: ${data.message}`;
      appendLog(`Test email delivery failed to ${to}: ${data.message}`, 'error');
    }
  } catch (err) {
    testResultMsg.style.display = 'block';
    testResultMsg.className = 'result-box error';
    testResultMsg.textContent = `❌ Network Error: ${err.message}`;
  } finally {
    btnSubmitTest.disabled = false;
    btnSubmitTest.textContent = 'Send Test Email Now';
  }
});

// Initial boot
fetchStats();
connectSSE();
loadPreview();
