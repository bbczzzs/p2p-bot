require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createSession, getSession, closeSession, refreshTimeout, getActiveCount } = require('./sessions');
const p2p = require('./p2p');
const { decodeQR, extractUPIFromQR, downloadTelegramFile } = require('./qr');

// Validate required env vars
if (!process.env.BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN environment variable is not set!');
  console.error('Available env vars:', Object.keys(process.env).filter(k => !k.startsWith('npm')).join(', '));
  process.exit(1);
}

console.log('BOT_TOKEN found, starting bot...');
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// ============ KEYBOARDS ============

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('🔐 Login', 'login')],
  [Markup.button.callback('💳 Scan & Pay', 'pay')],
  [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📥 Deposit', 'deposit')],
  [Markup.button.callback('💰 Balance', 'balance'), Markup.button.callback('📊 Rates', 'rates')],
  [Markup.button.callback('🚪 Logout', 'logout')],
]);

const backMenu = Markup.inlineKeyboard([
  [Markup.button.callback('⬅️ Back to Menu', 'menu')],
]);

// ============ /start COMMAND ============

bot.start((ctx) => {
  ctx.reply(
    `🔄 *P2P\\.me Scan & Pay Bot*\n\n` +
    `Pay anyone with USDC via UPI QR\\.\n\n` +
    `*How it works:*\n` +
    `1️⃣ Login with your email\n` +
    `2️⃣ Enter amount in INR\n` +
    `3️⃣ Send the vendor's UPI QR\n` +
    `4️⃣ Payment done\\! ✅\n\n` +
    `Choose an option below:`,
    { parse_mode: 'MarkdownV2', ...mainMenu }
  );
});

// ============ MENU ============

bot.action('menu', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText(
    `🔄 *P2P\\.me Scan & Pay Bot*\n\nChoose an option:`,
    { parse_mode: 'MarkdownV2', ...mainMenu }
  );
});

// ============ LOGIN FLOW ============

bot.action('login', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const existing = await getSession(userId);

  if (existing && existing.loggedIn) {
    return ctx.editMessageText('✅ You are already logged in!\n\nUse /pay to make a payment.', mainMenu);
  }

  ctx.editMessageText(
    '🔐 *Login to P2P\\.me*\n\n' +
    'Send me your *email address* to receive a login code\\.',
    { parse_mode: 'MarkdownV2' }
  );

  // Create a new browser session
  const session = await createSession(userId);
  session.state = 'awaiting_email';

  // Navigate to P2P.me login page
  try {
    await p2p.navigateToLogin(session.page);
    await p2p.clickLogin(session.page);
    console.log(`[${userId}] Login page loaded, awaiting email`);
  } catch (e) {
    console.error(`[${userId}] Failed to load login page:`, e.message);
    ctx.reply('❌ Failed to connect to P2P.me. Try again later.', backMenu);
    await closeSession(userId);
  }
});

// ============ PAY FLOW ============

bot.action('pay', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Please login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);

  ctx.editMessageText(
    '💳 *Scan & Pay*\n\n' +
    'Enter the amount in *INR* you want to pay:',
    { parse_mode: 'MarkdownV2' }
  );

  session.state = 'awaiting_amount';
});

// ============ BALANCE ============

bot.action('balance', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Please login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Fetching balance...');

  try {
    const info = await p2p.getDashboardInfo(session.page);
    ctx.editMessageText(
      `💰 *Your Balance*\n\n` +
      `💵 Balance: \\$${info.balance}\n` +
      `📈 Buy Price: ₹${info.buyPrice}\n` +
      `📉 Sell Price: ₹${info.sellPrice}`,
      { parse_mode: 'MarkdownV2', ...backMenu }
    );
  } catch (e) {
    ctx.editMessageText('❌ Failed to fetch balance.', backMenu);
  }
});

// ============ RATES ============

bot.action('rates', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Please login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Fetching rates...');

  try {
    const info = await p2p.getDashboardInfo(session.page);
    ctx.editMessageText(
      `📊 *Current Rates*\n\n` +
      `📈 Buy: ₹${info.buyPrice}/USDC\n` +
      `📉 Sell: ₹${info.sellPrice}/USDC`,
      { parse_mode: 'MarkdownV2', ...backMenu }
    );
  } catch (e) {
    ctx.editMessageText('❌ Failed to fetch rates.', backMenu);
  }
});

// ============ WALLET ============

bot.action('wallet', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Please login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Loading wallet...');

  try {
    const walletInfo = await p2p.getWalletInfo(session.page);
    const screenshot = await p2p.takeScreenshot(session.page);

    if (walletInfo.address) {
      const msg = `👛 *Your Wallet*\n\n` +
        `📋 Address:\n\`${walletInfo.address}\`\n\n` +
        `Send USDC \(Base network\) to this address to fund your account\.`;
      
      if (screenshot) {
        await ctx.replyWithPhoto({ source: screenshot }, { caption: `Wallet Address: ${walletInfo.address}` });
      }
      ctx.reply(msg, { parse_mode: 'MarkdownV2', ...backMenu });
    } else {
      if (screenshot) {
        await ctx.replyWithPhoto({ source: screenshot }, { caption: '👛 Your Wallet' });
      }
      ctx.reply('👛 Wallet loaded. Check the screenshot above.', backMenu);
    }
  } catch (e) {
    ctx.reply('❌ Failed to load wallet.', backMenu);
  }
});

// ============ DEPOSIT ============

bot.action('deposit', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Please login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Loading deposit page...');

  try {
    const depositInfo = await p2p.goToDeposit(session.page);
    const screenshot = await p2p.takeScreenshot(session.page);

    if (screenshot) {
      await ctx.replyWithPhoto({ source: screenshot }, {
        caption: depositInfo.address
          ? `📥 Deposit USDC (Base Network)\n\nAddress: ${depositInfo.address}`
          : '📥 Deposit - See details above'
      });
    }

    if (depositInfo.address) {
      ctx.reply(
        `📥 *Deposit USDC*\n\n` +
        `📋 Address:\n\`${depositInfo.address}\`\n\n` +
        `⚠️ *Send only USDC on Base network\!*\n` +
        `Sending other tokens will result in loss\.`,
        { parse_mode: 'MarkdownV2', ...backMenu }
      );
    } else {
      ctx.reply('📥 Deposit page loaded. Follow the instructions in the screenshot.', backMenu);
    }
  } catch (e) {
    ctx.reply('❌ Failed to load deposit page.', backMenu);
  }
});

// ============ LOGOUT ============

bot.action('logout', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  await closeSession(userId);
  ctx.editMessageText('🚪 Logged out successfully!', Markup.inlineKeyboard([
    [Markup.button.callback('🔐 Login Again', 'login')],
  ]));
});

// ============ TEXT MESSAGE HANDLER ============

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const session = await getSession(userId);

  if (!session) return;

  refreshTimeout(userId);

  // ---- EMAIL STEP ----
  if (session.state === 'awaiting_email') {
    // Validate email format
    if (!text.includes('@') || !text.includes('.')) {
      return ctx.reply('❌ Invalid email. Please enter a valid email address:');
    }

    ctx.reply('⏳ Entering email on P2P.me...');

    try {
      const success = await p2p.enterEmail(session.page, text);
      if (success) {
        session.state = 'awaiting_otp';
        session.tempData.email = text;
        ctx.reply(
          `📧 OTP sent to *${text.replace(/[._@]/g, '\\$&')}*\\!\n\n` +
          `Check your email and send me the *verification code*:`,
          { parse_mode: 'MarkdownV2' }
        );
      } else {
        ctx.reply('❌ Failed to enter email. Try again:', backMenu);
        session.state = 'idle';
      }
    } catch (e) {
      console.error(`[${userId}] Email entry failed:`, e.message);
      ctx.reply('❌ Something went wrong. Try /start again.', backMenu);
      session.state = 'idle';
    }
  }

  // ---- OTP STEP ----
  else if (session.state === 'awaiting_otp') {
    ctx.reply('⏳ Verifying OTP...');

    try {
      const success = await p2p.enterOTP(session.page, text);
      if (success) {
        session.loggedIn = true;
        session.state = 'idle';
        ctx.reply(
          '✅ *Login successful\\!*\n\n' +
          'You can now use Scan & Pay\\.',
          { parse_mode: 'MarkdownV2', ...mainMenu }
        );
        console.log(`[${userId}] Logged in successfully`);
      } else {
        ctx.reply('❌ Invalid OTP or verification failed. Try again:');
      }
    } catch (e) {
      console.error(`[${userId}] OTP verification failed:`, e.message);
      ctx.reply('❌ Verification failed. Try /start again.', backMenu);
      session.state = 'idle';
    }
  }

  // ---- AMOUNT STEP ----
  else if (session.state === 'awaiting_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Enter a valid number in INR:');
    }

    ctx.reply(`⏳ Setting amount to ₹${amount}...`);

    try {
      // Navigate to Scan & Pay page
      await p2p.goToScanAndPay(session.page);

      // Enter amount using keypad
      const conversionInfo = await p2p.enterAmount(session.page, amount);

      if (conversionInfo) {
        session.tempData.amount = amount;
        session.tempData.usdc = conversionInfo.usdc;
        session.state = 'awaiting_confirm';

        ctx.reply(
          `💳 *Order Summary*\n\n` +
          `💵 Amount: ₹${amount}\n` +
          `🪙 USDC: ${conversionInfo.usdc}\n\n` +
          `Confirm order?`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm & Place Order', 'confirm_order')],
              [Markup.button.callback('❌ Cancel', 'menu')],
            ]),
          }
        );
      } else {
        ctx.reply('❌ Failed to enter amount. Try again.', backMenu);
        session.state = 'idle';
      }
    } catch (e) {
      console.error(`[${userId}] Amount entry failed:`, e.message);
      ctx.reply('❌ Something went wrong.', backMenu);
      session.state = 'idle';
    }
  }
});

// ============ CONFIRM ORDER ============

bot.action('confirm_order', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || session.state !== 'awaiting_confirm') {
    return ctx.editMessageText('❌ No pending order.', backMenu);
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Placing order on P2P.me...');

  try {
    const success = await p2p.placeOrder(session.page);
    if (success) {
      session.state = 'awaiting_qr';

      // Take screenshot to show user what P2P.me shows
      const screenshot = await p2p.takeScreenshot(session.page);
      if (screenshot) {
        await ctx.replyWithPhoto({ source: screenshot }, {
          caption: '📸 Order placed! Now send the vendor\'s UPI QR code as a photo.'
        });
      } else {
        ctx.reply('✅ Order placed! Now send the vendor\'s UPI QR code as a photo.');
      }
    } else {
      ctx.editMessageText('❌ Failed to place order. You may need more USDC balance.', backMenu);
      session.state = 'idle';
    }
  } catch (e) {
    console.error(`[${userId}] Place order failed:`, e.message);
    ctx.editMessageText('❌ Order failed.', backMenu);
    session.state = 'idle';
  }
});

// ============ PHOTO HANDLER (QR CODE) ============

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session) {
    return ctx.reply('❌ Please /start first.');
  }

  if (session.state !== 'awaiting_qr') {
    return ctx.reply('❌ No pending order. Use Scan & Pay first.');
  }

  refreshTimeout(userId);
  ctx.reply('⏳ Reading QR code...');

  try {
    // Get the highest resolution photo
    const photos = ctx.message.photo;
    const biggestPhoto = photos[photos.length - 1];

    // Download the image
    const imageBuffer = await downloadTelegramFile(bot, biggestPhoto.file_id);
    if (!imageBuffer) {
      return ctx.reply('❌ Failed to download image. Send the QR again.');
    }

    // Decode QR
    const qrData = await decodeQR(imageBuffer);
    if (!qrData) {
      return ctx.reply('❌ Could not read QR code. Make sure the image is clear and try again.');
    }

    // Extract UPI info
    const upiInfo = extractUPIFromQR(qrData);
    if (!upiInfo || !upiInfo.upiId) {
      return ctx.reply(
        `⚠️ QR decoded but no UPI ID found.\n\nRaw data: ${qrData}\n\nPlease send a valid UPI QR code.`
      );
    }

    ctx.reply(
      `✅ QR Code Decoded!\n\n` +
      `📱 UPI ID: ${upiInfo.upiId}\n` +
      `👤 Name: ${upiInfo.name || 'N/A'}\n\n` +
      `⏳ Submitting to P2P.me...`
    );

    // TODO: Enter UPI details on P2P.me page
    // This part needs to be refined based on what P2P.me shows after "Place Order"
    // For now, take a screenshot to show the current state
    const screenshot = await p2p.takeScreenshot(session.page);
    if (screenshot) {
      await ctx.replyWithPhoto({ source: screenshot }, {
        caption: `📸 Current P2P.me state after QR submission`
      });
    }

    // Start polling for payment status
    session.state = 'payment_processing';
    session.tempData.upiId = upiInfo.upiId;
    pollPaymentStatus(ctx, userId);

  } catch (e) {
    console.error(`[${userId}] QR processing failed:`, e.message);
    ctx.reply('❌ Failed to process QR. Try again.', backMenu);
  }
});

// ============ PAYMENT STATUS POLLING ============

async function pollPaymentStatus(ctx, userId) {
  const MAX_POLLS = 30; // 30 * 10s = 5 minutes
  let pollCount = 0;

  const interval = setInterval(async () => {
    pollCount++;
    const session = await getSession(userId);

    if (!session || session.state !== 'payment_processing') {
      clearInterval(interval);
      return;
    }

    try {
      const pageText = await p2p.getPageText(session.page);
      const lowerText = pageText.toLowerCase();

      // Check for success indicators
      if (lowerText.includes('success') || lowerText.includes('completed') || lowerText.includes('paid')) {
        clearInterval(interval);
        session.state = 'idle';
        session.tempData = {};

        const screenshot = await p2p.takeScreenshot(session.page);
        if (screenshot) {
          await ctx.replyWithPhoto({ source: screenshot }, {
            caption: '✅ Payment Successful!'
          });
        }
        ctx.reply('✅ Payment completed successfully! 🎉', mainMenu);
        return;
      }

      // Check for failure indicators
      if (lowerText.includes('failed') || lowerText.includes('expired') || lowerText.includes('cancelled')) {
        clearInterval(interval);
        session.state = 'idle';
        session.tempData = {};

        const screenshot = await p2p.takeScreenshot(session.page);
        if (screenshot) {
          await ctx.replyWithPhoto({ source: screenshot }, {
            caption: '❌ Payment Failed/Expired'
          });
        }
        ctx.reply('❌ Payment failed or expired. Try again.', mainMenu);
        return;
      }
    } catch (e) {
      console.error(`[${userId}] Poll error:`, e.message);
    }

    // Timeout after 5 minutes
    if (pollCount >= MAX_POLLS) {
      clearInterval(interval);
      if (session) {
        session.state = 'idle';
        session.tempData = {};
      }
      ctx.reply('⏰ Payment status check timed out. Use /screenshot to check manually.', mainMenu);
    }
  }, 10000); // Check every 10 seconds
}

// ============ SCREENSHOT COMMAND (DEBUG) ============

bot.command('screenshot', async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session) {
    return ctx.reply('❌ No active session. Use /start first.');
  }

  try {
    const screenshot = await p2p.takeScreenshot(session.page);
    if (screenshot) {
      const pageUrl = session.page.url();
      await ctx.replyWithPhoto({ source: screenshot }, {
        caption: `📸 Current page: ${pageUrl}`
      });
    } else {
      ctx.reply('❌ Failed to take screenshot.');
    }
  } catch (e) {
    ctx.reply('❌ Screenshot failed: ' + e.message);
  }
});

// ============ STATUS COMMAND ============

bot.command('status', async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session) {
    return ctx.reply('❌ No active session.');
  }

  ctx.reply(
    `📋 Session Status\n\n` +
    `Logged in: ${session.loggedIn ? '✅' : '❌'}\n` +
    `State: ${session.state}\n` +
    `Current page: ${session.page.url()}`
  );
});

// ============ ADMIN COMMANDS ============

bot.command('stats', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply(
    `📊 *Bot Stats*\n\n` +
    `Active Sessions: ${getActiveCount()}\n` +
    `Uptime: ${Math.floor(process.uptime() / 60)} minutes`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const msg = ctx.message.text.replace('/broadcast ', '');
  if (msg === '/broadcast') return ctx.reply('Usage: /broadcast <message>');
  ctx.reply(`📢 Broadcast sent: ${msg}`);
});

// ============ HELP ============

bot.help((ctx) => {
  ctx.reply(
    `ℹ️ *P2P\\.me Scan & Pay Bot*\n\n` +
    `*Commands:*\n` +
    `/start \\- Main menu\n` +
    `/help \\- Show this help\n\n` +
    `*How to use:*\n` +
    `1\\. Login with email \\+ OTP\n` +
    `2\\. Choose Scan & Pay\n` +
    `3\\. Enter INR amount\n` +
    `4\\. Send vendor's UPI QR photo\n` +
    `5\\. Payment done\\! ✅`,
    { parse_mode: 'MarkdownV2' }
  );
});

// ============ ERROR HANDLING ============

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An error occurred. Try /start again.');
});

// ============ LAUNCH ============

bot.launch().then(() => {
  console.log('🤖 P2P.me Scan & Pay Bot is running!');
  console.log(`Admin ID: ${ADMIN_ID}`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
