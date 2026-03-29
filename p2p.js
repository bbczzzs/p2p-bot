const P2P_URL = process.env.P2P_URL || 'https://app.p2p.lol';

/**
 * Navigate to P2P.me login page and select INR
 */
async function navigateToLogin(page) {
  await page.goto(`${P2P_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  // Select INR currency
  try {
    // Click currency dropdown
    const currencyBtn = await page.$('button[role="combobox"]');
    if (currencyBtn) {
      await currencyBtn.click();
      await sleep(1000);

      // Look for INR option and click it
      const options = await page.$$('[role="option"]');
      for (const option of options) {
        const text = await page.evaluate(el => el.textContent, option);
        if (text.includes('INR')) {
          await option.click();
          await sleep(500);
          break;
        }
      }
    }
  } catch (e) {
    console.log('Currency selection:', e.message);
  }

  return true;
}

/**
 * Click the Login button to open the sign-in modal
 */
async function clickLogin(page) {
  await sleep(1000);

  // Find and click the Login button
  const buttons = await page.$$('button');
  for (const button of buttons) {
    const text = await page.evaluate(el => el.textContent.trim(), button);
    if (text === 'Login') {
      await button.click();
      await sleep(2000);
      return true;
    }
  }
  return false;
}

/**
 * Enter email address in the login modal
 */
async function enterEmail(page, email) {
  try {
    await sleep(2000);

    // Strategy 1: Look for email input directly
    let emailInput = await page.$('input[type="email"]');
    
    // Strategy 2: Look for input with email placeholder
    if (!emailInput) {
      const inputs = await page.$$('input');
      for (const input of inputs) {
        const placeholder = await page.evaluate(el => (el.placeholder || '').toLowerCase(), input);
        const type = await page.evaluate(el => el.type || '', input);
        if (placeholder.includes('email') || placeholder.includes('mail') || type === 'email') {
          emailInput = input;
          break;
        }
      }
    }

    // Strategy 3: Check inside iframes (Thirdweb sometimes uses iframes)
    if (!emailInput) {
      const frames = page.frames();
      for (const frame of frames) {
        try {
          emailInput = await frame.$('input[type="email"], input[placeholder*="email" i]');
          if (emailInput) {
            console.log('Found email input inside iframe');
            break;
          }
        } catch (e) {}
      }
    }

    if (!emailInput) {
      console.error('No email input found on page');
      return false;
    }

    // Clear and type email
    await emailInput.click({ clickCount: 3 });
    await sleep(200);
    await emailInput.type(email, { delay: 80 });
    await sleep(500);

    // Try submitting: look for arrow button, submit button, or press Enter
    // Strategy 1: Find a nearby submit/arrow button
    const allButtons = await page.$$('button, [role="button"], svg');
    let submitted = false;

    for (const btn of allButtons) {
      try {
        const box = await btn.boundingBox();
        const inputBox = await emailInput.boundingBox();
        if (!box || !inputBox) continue;
        
        // Button should be on the same row as email input (within 30px vertically)
        if (Math.abs(box.y - inputBox.y) < 30 && box.x > inputBox.x) {
          await btn.click();
          submitted = true;
          console.log('Clicked submit button next to email');
          break;
        }
      } catch (e) {}
    }

    // Strategy 2: Press Enter
    if (!submitted) {
      await page.keyboard.press('Enter');
      console.log('Pressed Enter to submit email');
    }

    await sleep(3000);
    console.log('Email submitted, current URL:', page.url());
    return true;
  } catch (e) {
    console.error('Enter email error:', e.message);
    return false;
  }
}

/**
 * Enter OTP code - tries multiple strategies
 */
async function enterOTP(page, otp) {
  try {
    await sleep(2000);
    console.log('Entering OTP:', otp);
    console.log('Current URL:', page.url());

    // Get all visible inputs
    const findInputs = async (context) => {
      return await context.$$('input:not([type="hidden"]):not([type="email"])');
    };

    let inputs = await findInputs(page);
    let targetContext = page;

    // Check iframes if no inputs found
    if (inputs.length === 0) {
      console.log('No inputs in main page, checking iframes...');
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const frameInputs = await findInputs(frame);
          if (frameInputs.length > 0) {
            inputs = frameInputs;
            targetContext = frame;
            console.log(`Found ${inputs.length} inputs in iframe`);
            break;
          }
        } catch (e) {}
      }
    }

    console.log(`Found ${inputs.length} input fields`);

    if (inputs.length === 0) {
      // Last resort: just type the OTP (some fields auto-focus)
      console.log('No inputs found, trying direct keyboard type');
      await page.keyboard.type(otp, { delay: 100 });
      await sleep(3000);
      const url = page.url();
      return !url.includes('/login');
    }

    const digits = otp.toString().split('');

    if (inputs.length >= 4) {
      // Multiple individual digit inputs (common OTP pattern)
      console.log('Using individual digit input strategy');
      
      // Click first input to focus
      await inputs[0].click();
      await sleep(300);

      // Try typing all digits at once (many OTP fields auto-advance)
      for (const digit of digits) {
        await page.keyboard.type(digit, { delay: 100 });
        await sleep(150);
      }
    } else {
      // Single or few inputs — type into the first one
      console.log('Using single input strategy');
      await inputs[0].click({ clickCount: 3 });
      await sleep(200);
      await inputs[0].type(otp, { delay: 80 });
    }

    await sleep(2000);

    // Look for verify/confirm/submit button
    const buttons = await (targetContext === page ? page : page).$$('button');
    for (const btn of buttons) {
      try {
        const text = await page.evaluate(el => el.textContent.trim().toLowerCase(), btn);
        const isVisible = await page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, btn);
        
        if (isVisible && (
          text.includes('verify') || text.includes('confirm') || 
          text.includes('submit') || text.includes('continue') ||
          text.includes('log in') || text.includes('sign in')
        )) {
          console.log('Clicking verify button:', text);
          await btn.click();
          await sleep(4000);
          break;
        }
      } catch (e) {}
    }

    // Wait a bit more and check URL
    await sleep(3000);
    const finalUrl = page.url();
    console.log('After OTP, URL:', finalUrl);
    
    // Also check page content for success indicators
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const isSuccess = !finalUrl.includes('/login') || 
                      pageText.includes('Balance') || 
                      pageText.includes('Wallet') ||
                      pageText.includes('Scan');
    
    console.log('Login success:', isSuccess);
    return isSuccess;
  } catch (e) {
    console.error('Enter OTP error:', e.message);
    return false;
  }
}

/**
 * Check if currently logged in
 */
async function isLoggedIn(page) {
  try {
    const url = page.url();
    return !url.includes('/login');
  } catch (e) {
    return false;
  }
}

/**
 * Get dashboard info (balance, prices)
 */
async function getDashboardInfo(page) {
  try {
    await page.goto(`${P2P_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);

    const info = await page.evaluate(() => {
      const body = document.body.innerText;

      // Extract sell price
      const sellPriceMatch = body.match(/Sell Price\s*₹([\d.]+)/);
      const buyPriceMatch = body.match(/Buy Price\s*₹([\d.]+)/);
      const balanceMatch = body.match(/\$([\d.]+)/);

      return {
        sellPrice: sellPriceMatch ? sellPriceMatch[1] : 'N/A',
        buyPrice: buyPriceMatch ? buyPriceMatch[1] : 'N/A',
        balance: balanceMatch ? balanceMatch[1] : '0.00',
      };
    });

    return info;
  } catch (e) {
    console.error('Dashboard info error:', e.message);
    return { sellPrice: 'N/A', buyPrice: 'N/A', balance: '0.00' };
  }
}

/**
 * Navigate to Scan & Pay page
 */
async function goToScanAndPay(page) {
  try {
    await page.goto(`${P2P_URL}/pay`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);

    // Check if we're on the pay page
    const text = await page.evaluate(() => document.body.innerText);
    return text.includes('Scan & Pay') || text.includes('INR');
  } catch (e) {
    console.error('Navigate to pay error:', e.message);
    return false;
  }
}

/**
 * Enter amount using the on-screen keypad
 */
async function enterAmount(page, amount) {
  try {
    // First clear any existing amount
    const clearBtn = await findButtonByText(page, 'Clear');
    if (clearBtn) {
      await clearBtn.click();
      await sleep(300);
    }

    // Type each digit by clicking keypad buttons
    const digits = amount.toString().split('');
    for (const digit of digits) {
      if (digit === '.') {
        const dotBtn = await findButtonByText(page, '.');
        if (dotBtn) {
          await dotBtn.click();
          await sleep(200);
        }
      } else {
        const numBtn = await findButtonByText(page, digit);
        if (numBtn) {
          await numBtn.click();
          await sleep(200);
        }
      }
    }

    await sleep(500);

    // Get the converted USDC amount from the page
    const conversionInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const usdcMatch = body.match(/([\d.]+)\s*USDC/);
      return {
        usdc: usdcMatch ? usdcMatch[1] : 'N/A',
      };
    });

    return conversionInfo;
  } catch (e) {
    console.error('Enter amount error:', e.message);
    return null;
  }
}

/**
 * Click "Place Order" button
 */
async function placeOrder(page) {
  try {
    const placeBtn = await findButtonByText(page, 'Place Order');
    if (placeBtn) {
      await placeBtn.click();
      await sleep(3000);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Place order error:', e.message);
    return false;
  }
}

/**
 * Take a screenshot and return the buffer
 */
async function takeScreenshot(page) {
  try {
    const screenshot = await page.screenshot({ type: 'png' });
    return screenshot;
  } catch (e) {
    console.error('Screenshot error:', e.message);
    return null;
  }
}

/**
 * Get current page status/text
 */
async function getPageText(page) {
  try {
    return await page.evaluate(() => document.body.innerText);
  } catch (e) {
    return '';
  }
}

// ============ Helper Functions ============

async function findButtonByText(page, text) {
  const buttons = await page.$$('button, div[role="button"]');
  for (const btn of buttons) {
    const btnText = await page.evaluate(el => el.textContent.trim(), btn);
    if (btnText === text) {
      return btn;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Navigate to wallet page and get wallet address
 */
async function getWalletInfo(page) {
  try {
    // Click on Wallet button from dashboard
    await page.goto(`${P2P_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);

    // Look for Wallet button and click it
    const walletBtn = await findButtonByText(page, 'Wallet');
    if (walletBtn) {
      await walletBtn.click();
      await sleep(3000);
    }

    // Extract wallet info from page
    const info = await page.evaluate(() => {
      const body = document.body.innerText;
      // Look for wallet address pattern (0x...)
      const addressMatch = body.match(/0x[a-fA-F0-9]{40}/);
      return {
        address: addressMatch ? addressMatch[0] : null,
        pageText: body.substring(0, 500),
      };
    });

    return info;
  } catch (e) {
    console.error('Wallet info error:', e.message);
    return { address: null, pageText: '' };
  }
}

/**
 * Navigate to deposit page
 */
async function goToDeposit(page) {
  try {
    await page.goto(`${P2P_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);

    // Click Deposit button
    const depositBtn = await findButtonByText(page, 'Deposit');
    if (depositBtn) {
      await depositBtn.click();
      await sleep(3000);
    }

    // Get deposit info and screenshot
    const info = await page.evaluate(() => {
      const body = document.body.innerText;
      const addressMatch = body.match(/0x[a-fA-F0-9]{40}/);
      return {
        address: addressMatch ? addressMatch[0] : null,
        pageText: body.substring(0, 500),
      };
    });

    return info;
  } catch (e) {
    console.error('Deposit page error:', e.message);
    return { address: null, pageText: '' };
  }
}

module.exports = {
  navigateToLogin,
  clickLogin,
  enterEmail,
  enterOTP,
  isLoggedIn,
  getDashboardInfo,
  goToScanAndPay,
  enterAmount,
  placeOrder,
  takeScreenshot,
  getPageText,
  getWalletInfo,
  goToDeposit,
  sleep,
};
