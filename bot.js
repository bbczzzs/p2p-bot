require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createSession, getSession, closeSession, refreshTimeout, getActiveCount } = require('./sessions');
const p2p = require('./p2p');
const { decodeQR, extractUPIFromQR, downloadTelegramFile } = require('./qr');

if (!process.env.BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN not set!');
  process.exit(1);
}

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

// ============ /start ============

bot.start((ctx) => {
  ctx.reply(
    `💳 *USDC Pay Bot*\n\n` +
    `Pay anyone with USDC via UPI QR\\.\n\n` +
    `*How it works:*\n` +
    `1️⃣ Login with your email\n` +
    `2️⃣ Enter amount in INR\n` +
    `3️⃣ Send the vendor's UPI QR\n` +
    `4️⃣ Payment done\\! ✅\n\n` +
    `Choose an option:`,
    { parse_mode: 'MarkdownV2', ...mainMenu }
  );
});

// ============ MENU ============

bot.action('menu', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText(
    `💳 *USDC Pay Bot*\n\nChoose an option:`,
    { parse_mode: 'MarkdownV2', ...mainMenu }
  );
});

// ============ LOGIN ============

bot.action('login', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const existing = await getSession(userId);

  if (existing && existing.loggedIn) {
    return ctx.editMessageText('✅ Already logged in!', mainMenu);
  }

  ctx.editMessageText('🔐 Send me your *email address*:', { parse_mode: 'Markdown' });

  const session = await createSession(userId);
  session.state = 'awaiting_email';

  try {
    await p2p.navigateToLogin(session.page);
    await p2p.clickLogin(session.page);
    console.log(`[${userId}] Ready for email`);
  } catch (e) {
    console.error(`[${userId}] Login page error:`, e.message);
    ctx.reply('❌ Connection failed. Try again.', backMenu);
    await closeSession(userId);
  }
});

// ============ PAY ============

bot.action('pay', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('💳 Enter amount in *INR*:', { parse_mode: 'Markdown' });
  session.state = 'awaiting_amount';
});

// ============ BALANCE ============

bot.action('balance', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Fetching...');

  try {
    const info = await p2p.getDashboardInfo(session.page);
    ctx.editMessageText(
      `💰 *Balance*\n\n` +
      `💵 $${info.balance}\n` +
      `📈 Buy: ₹${info.buyPrice}/USDC\n` +
      `📉 Sell: ₹${info.sellPrice}/USDC`,
      { parse_mode: 'Markdown', ...backMenu }
    );
  } catch (e) {
    ctx.editMessageText('❌ Failed to fetch.', backMenu);
  }
});

// ============ RATES ============

bot.action('rates', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Fetching...');

  try {
    const info = await p2p.getDashboardInfo(session.page);
    ctx.editMessageText(
      `📊 *Rates*\n\n📈 Buy: ₹${info.buyPrice}/USDC\n📉 Sell: ₹${info.sellPrice}/USDC`,
      { parse_mode: 'Markdown', ...backMenu }
    );
  } catch (e) {
    ctx.editMessageText('❌ Failed to fetch.', backMenu);
  }
});

// ============ WALLET ============

bot.action('wallet', async (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session || !session.loggedIn) {
    return ctx.editMessageText('❌ Login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Loading wallet...');

  try {
    const walletInfo = await p2p.getWalletInfo(session.page);
    const screenshot = await p2p.takeScreenshot(session.page);

    if (screenshot) {
      await ctx.replyWithPhoto({ source: screenshot });
    }

    if (walletInfo.address) {
      ctx.reply(
        `👛 *Wallet*\n\n📋 Address:\n\`${walletInfo.address}\`\n\n⚠️ Send only USDC (Base network)`,
        { parse_mode: 'Markdown', ...backMenu }
      );
    } else {
      ctx.reply('👛 Wallet loaded. See screenshot above.', backMenu);
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
    return ctx.editMessageText('❌ Login first!', Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Login', 'login')],
      [Markup.button.callback('⬅️ Back', 'menu')],
    ]));
  }

  refreshTimeout(userId);
  ctx.editMessageText('⏳ Loading...');

  try {
    const depositInfo = await p2p.goToDeposit(session.page);
    const screenshot = await p2p.takeScreenshot(session.page);

    if (screenshot) {
      await ctx.replyWithPhoto({ source: screenshot });
    }

    if (depositInfo.address) {
      ctx.reply(
        `📥 *Deposit USDC*\n\n📋 Address:\n\`${depositInfo.address}\`\n\n⚠️ *Base network only!*`,
        { parse_mode: 'Markdown', ...backMenu }
      );
    } else {
      ctx.reply('📥 Deposit info loaded. See screenshot above.', backMenu);
    }
  } catch (e) {
    ctx.reply('❌ Failed to load.', backMenu);
  }
});

// ============ LOGOUT ============

bot.action('logout', async (ctx) => {
  ctx.answerCbQuery();
  await closeSession(ctx.from.id);
  ctx.editMessageText('🚪 Logged out!', Markup.inlineKeyboard([
    [Markup.button.callback('🔐 Login Again', 'login')],
  ]));
});

// ============ TEXT HANDLER ============

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const session = await getSession(userId);

  if (!session) return;
  refreshTimeout(userId);

  // ---- EMAIL ----
  if (session.state === 'awaiting_email') {
    if (!text.includes('@') || !text.includes('.')) {
      return ctx.reply('❌ Invalid email. Try again:');
    }

    ctx.reply('⏳ Sending verification code...');

    try {
      const success = await p2p.enterEmail(session.page, text);
      if (success) {
        session.state = 'awaiting_otp';
        session.tempData.email = text;
        ctx.reply(`📧 Code sent to ${text}\n\nEnter the verification code:`);
      } else {
        // Take debug screenshot
        const screenshot = await p2p.takeScreenshot(session.page);
        if (screenshot) {
          await ctx.replyWithPhoto({ source: screenshot }, { caption: '❌ Failed. Debug screenshot.' });
        }
        ctx.reply('❌ Failed. Try again.', backMenu);
        session.state = 'idle';
      }
    } catch (e) {
      console.error(`[${userId}] Email error:`, e.message);
      ctx.reply('❌ Error. Try /start again.', backMenu);
      session.state = 'idle';
    }
  }

  // ---- OTP ----
  else if (session.state === 'awaiting_otp') {
    ctx.reply('⏳ Verifying...');

    try {
      const success = await p2p.enterOTP(session.page, text);

      if (success) {
        session.loggedIn = true;
        session.state = 'idle';
        // Try screenshot but don't fail if it errors
        try {
          const screenshot = await p2p.takeScreenshot(session.page);
          if (screenshot && screenshot.length > 0) {
            await ctx.replyWithPhoto({ source: screenshot });
          }
        } catch (se) { console.log('Screenshot skipped'); }
        ctx.reply('✅ Login successful!', mainMenu);
        console.log(`[${userId}] Logged in`);
      } else {
        try {
          const screenshot = await p2p.takeScreenshot(session.page);
          if (screenshot && screenshot.length > 0) {
            await ctx.replyWithPhoto({ source: screenshot });
          }
        } catch (se) {}
        ctx.reply('❌ Invalid code. Try again:');
      }
    } catch (e) {
      console.error(`[${userId}] OTP error:`, e.message);
      try {
        const screenshot = await p2p.takeScreenshot(session.page);
        if (screenshot && screenshot.length > 0) {
          await ctx.replyWithPhoto({ source: screenshot });
        }
      } catch (se) {}
      ctx.reply(`❌ OTP failed: ${e.message}`, backMenu);
      session.state = 'idle';
    }
  }

  // ---- AMOUNT ----
  else if (session.state === 'awaiting_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Enter a number:');
    }

    ctx.reply(`⏳ Processing ₹${amount}...`);

    try {
      await p2p.goToScanAndPay(session.page);
      const conversionInfo = await p2p.enterAmount(session.page, amount);

      if (conversionInfo) {
        session.tempData.amount = amount;
        session.tempData.usdc = conversionInfo.usdc;
        session.state = 'awaiting_confirm';

        ctx.reply(
          `💳 *Order*\n\n💵 ₹${amount}\n🪙 ${conversionInfo.usdc} USDC\n\nConfirm?`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm', 'confirm_order')],
              [Markup.button.callback('❌ Cancel', 'menu')],
            ]),
          }
        );
      } else {
        ctx.reply('❌ Failed. Try again.', backMenu);
        session.state = 'idle';
      }
    } catch (e) {
      console.error(`[${userId}] Amount error:`, e.message);
      ctx.reply('❌ Error.', backMenu);
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
  ctx.editMessageText('⏳ Placing order...');

  try {
    const success = await p2p.placeOrder(session.page);
    if (success) {
      session.state = 'awaiting_qr';

      const screenshot = await p2p.takeScreenshot(session.page);
      if (screenshot) {
        await ctx.replyWithPhoto({ source: screenshot }, {
          caption: '✅ Order placed! Send the UPI QR code as a photo.'
        });
      } else {
        ctx.reply('✅ Order placed! Send the UPI QR code as a photo.');
      }
    } else {
      ctx.editMessageText('❌ Failed. Check your USDC balance.', backMenu);
      session.state = 'idle';
    }
  } catch (e) {
    console.error(`[${userId}] Order error:`, e.message);
    ctx.editMessageText('❌ Order failed.', backMenu);
    session.state = 'idle';
  }
});

// ============ PHOTO (QR) ============

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(userId);

  if (!session) return ctx.reply('❌ Use /start first.');
  if (session.state !== 'awaiting_qr') return ctx.reply('❌ No pending order.');

  refreshTimeout(userId);
  ctx.reply('⏳ Reading QR...');

  try {
    const photos = ctx.message.photo;
    const biggestPhoto = photos[photos.length - 1];
    const imageBuffer = await downloadTelegramFile(bot, biggestPhoto.file_id);

    if (!imageBuffer) return ctx.reply('❌ Download failed. Send again.');

    const qrData = await decodeQR(imageBuffer);
    if (!qrData) return ctx.reply('❌ QR not readable. Send a clearer image.');

    const upiInfo = extractUPIFromQR(qrData);
    if (!upiInfo || !upiInfo.upiId) {
      return ctx.reply(`⚠️ No UPI ID found in QR.\nRaw: ${qrData}`);
    }

    ctx.reply(
      `✅ QR Decoded!\n\n📱 UPI: ${upiInfo.upiId}\n👤 ${upiInfo.name || 'N/A'}\n\n⏳ Processing payment...`
    );

    const screenshot = await p2p.takeScreenshot(session.page);
    if (screenshot) {
      await ctx.replyWithPhoto({ source: screenshot });
    }

    session.state = 'payment_processing';
    session.tempData.upiId = upiInfo.upiId;
    pollPaymentStatus(ctx, userId);

  } catch (e) {
    console.error(`[${userId}] QR error:`, e.message);
    ctx.reply('❌ QR processing failed.', backMenu);
  }
});

// ============ PAYMENT POLLING ============

async function pollPaymentStatus(ctx, userId) {
  const MAX_POLLS = 30;
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
      const lower = pageText.toLowerCase();

      if (lower.includes('success') || lower.includes('completed') || lower.includes('paid')) {
        clearInterval(interval);
        session.state = 'idle';
        session.tempData = {};
        const screenshot = await p2p.takeScreenshot(session.page);
        if (screenshot) await ctx.replyWithPhoto({ source: screenshot });
        ctx.reply('✅ Payment successful! 🎉', mainMenu);
        return;
      }

      if (lower.includes('failed') || lower.includes('expired') || lower.includes('cancelled')) {
        clearInterval(interval);
        session.state = 'idle';
        session.tempData = {};
        const screenshot = await p2p.takeScreenshot(session.page);
        if (screenshot) await ctx.replyWithPhoto({ source: screenshot });
        ctx.reply('❌ Payment failed/expired.', mainMenu);
        return;
      }
    } catch (e) {
      console.error(`[${userId}] Poll error:`, e.message);
    }

    if (pollCount >= MAX_POLLS) {
      clearInterval(interval);
      if (session) { session.state = 'idle'; session.tempData = {}; }
      ctx.reply('⏰ Timed out. Use /screenshot to check.', mainMenu);
    }
  }, 10000);
}

// ============ DEBUG COMMANDS ============

bot.command('screenshot', async (ctx) => {
  const session = await getSession(ctx.from.id);
  if (!session) return ctx.reply('❌ No session.');
  try {
    const screenshot = await p2p.takeScreenshot(session.page);
    if (screenshot) await ctx.replyWithPhoto({ source: screenshot }, { caption: session.page.url() });
  } catch (e) { ctx.reply('❌ ' + e.message); }
});

bot.command('status', async (ctx) => {
  const session = await getSession(ctx.from.id);
  if (!session) return ctx.reply('❌ No session.');
  ctx.reply(`📋 Logged in: ${session.loggedIn ? '✅' : '❌'}\nState: ${session.state}`);
});

// ============ ADMIN ============

bot.command('stats', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply(`📊 Sessions: ${getActiveCount()}\nUptime: ${Math.floor(process.uptime() / 60)}m`);
});

// ============ HELP ============

bot.help((ctx) => {
  ctx.reply(
    `💳 *USDC Pay Bot*\n\n` +
    `/start - Main menu\n` +
    `/help - Help\n` +
    `/screenshot - Debug view\n` +
    `/status - Session info`,
    { parse_mode: 'Markdown' }
  );
});

// ============ ERROR & LAUNCH ============

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Error. Try /start.');
});

bot.launch().then(() => console.log('🤖 Bot running!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
