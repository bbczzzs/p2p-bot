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
    // Wait for the email input to appear
    await sleep(1000);

    // Look for email input field
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.click();
      await emailInput.type(email, { delay: 50 });
      await sleep(500);

      // Click the arrow/submit button next to email
      const submitBtns = await page.$$('button');
      for (const btn of submitBtns) {
        const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label') || '', btn);
        const text = await page.evaluate(el => el.textContent.trim(), btn);
        if (ariaLabel.includes('submit') || text.includes('→') || text === '') {
          // Check if this button is near the email input
          const btnBox = await btn.boundingBox();
          const inputBox = await emailInput.boundingBox();
          if (btnBox && inputBox && Math.abs(btnBox.y - inputBox.y) < 50) {
            await btn.click();
            await sleep(2000);
            return true;
          }
        }
      }

      // Try pressing Enter instead
      await page.keyboard.press('Enter');
      await sleep(2000);
      return true;
    }

    // Alternative: look for any text input in the modal
    const inputs = await page.$$('input[type="text"], input:not([type])');
    for (const input of inputs) {
      const placeholder = await page.evaluate(el => el.placeholder || '', input);
      if (placeholder.toLowerCase().includes('email')) {
        await input.click();
        await input.type(email, { delay: 50 });
        await page.keyboard.press('Enter');
        await sleep(2000);
        return true;
      }
    }

    return false;
  } catch (e) {
    console.error('Enter email error:', e.message);
    return false;
  }
}

/**
 * Enter OTP code
 */
async function enterOTP(page, otp) {
  try {
    await sleep(1000);

    // Look for OTP input fields (could be individual digit inputs or one field)
    const otpInputs = await page.$$('input[type="text"], input[type="number"], input[type="tel"]');

    if (otpInputs.length >= 4) {
      // Individual digit inputs
      const digits = otp.split('');
      for (let i = 0; i < Math.min(digits.length, otpInputs.length); i++) {
        await otpInputs[i].click();
        await otpInputs[i].type(digits[i], { delay: 30 });
        await sleep(100);
      }
    } else if (otpInputs.length === 1) {
      // Single input field
      await otpInputs[0].click();
      await otpInputs[0].type(otp, { delay: 50 });
    } else {
      // Try typing directly (some OTP fields auto-focus)
      await page.keyboard.type(otp, { delay: 50 });
    }

    await sleep(1000);

    // Look for verify/confirm button
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent.trim().toLowerCase(), btn);
      if (text.includes('verify') || text.includes('confirm') || text.includes('submit') || text.includes('continue')) {
        await btn.click();
        await sleep(3000);
        break;
      }
    }

    // Check if we're now on the dashboard
    await sleep(3000);
    const url = page.url();
    return !url.includes('/login');
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
