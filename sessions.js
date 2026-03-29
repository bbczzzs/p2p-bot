const puppeteer = require('puppeteer');

// Store active browser sessions per user
const sessions = new Map();

// Session timeout (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * Get or create a browser session for a user
 */
async function getSession(userId) {
  if (sessions.has(userId)) {
    const session = sessions.get(userId);
    session.lastActive = Date.now();
    return session;
  }
  return null;
}

/**
 * Create a new browser session for a user
 */
async function createSession(userId) {
  // Close existing session if any
  await closeSession(userId);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
    ],
  });

  const page = await browser.newPage();
  
  // Set viewport to mobile size (P2P.me is mobile-optimized)
  await page.setViewport({ width: 430, height: 932 });
  
  // Set user agent to look like a real mobile browser
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  );

  const session = {
    browser,
    page,
    userId,
    loggedIn: false,
    lastActive: Date.now(),
    state: 'idle', // idle, awaiting_email, awaiting_otp, awaiting_amount, awaiting_qr
    tempData: {},
  };

  sessions.set(userId, session);

  // Auto-cleanup after timeout
  session.timeout = setTimeout(() => {
    closeSession(userId);
  }, SESSION_TIMEOUT);

  return session;
}

/**
 * Close and cleanup a user's session
 */
async function closeSession(userId) {
  if (sessions.has(userId)) {
    const session = sessions.get(userId);
    clearTimeout(session.timeout);
    try {
      await session.browser.close();
    } catch (e) {
      // Browser may already be closed
    }
    sessions.delete(userId);
  }
}

/**
 * Reset session timeout
 */
function refreshTimeout(userId) {
  if (sessions.has(userId)) {
    const session = sessions.get(userId);
    clearTimeout(session.timeout);
    session.lastActive = Date.now();
    session.timeout = setTimeout(() => {
      closeSession(userId);
    }, SESSION_TIMEOUT);
  }
}

/**
 * Get count of active sessions
 */
function getActiveCount() {
  return sessions.size;
}

module.exports = {
  getSession,
  createSession,
  closeSession,
  refreshTimeout,
  getActiveCount,
};
