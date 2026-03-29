const P2P_URL = process.env.P2P_URL || 'https://app.p2p.lol';

/**
 * Navigate to P2P.me login page and select INR
 */
async function navigateToLogin(page) {
  await page.goto(`${P2P_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  // Select INR currency
  try {
    const currencyBtn = await page.$('button[role="combobox"]');
    if (currencyBtn) {
      await currencyBtn.click();
      await sleep(1000);
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
 * Click the Login button
 */
async function clickLogin(page) {
  await sleep(1000);
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
 * Enter email address
 */
async function enterEmail(page, email) {
  try {
    await sleep(2000);

    let emailInput = await page.$('input[type="email"]');
    if (!emailInput) {
      const inputs = await page.$$('input');
      for (const input of inputs) {
        const placeholder = await page.evaluate(el => (el.placeholder || '').toLowerCase(), input);
        if (placeholder.includes('email') || placeholder.includes('mail')) {
          emailInput = input;
          break;
        }
      }
    }
    if (!emailInput) {
      const frames = page.frames();
      for (const frame of frames) {
        try {
          emailInput = await frame.$('input[type="email"], input[placeholder*="email" i]');
          if (emailInput) break;
        } catch (e) {}
      }
    }

    if (!emailInput) {
      console.error('No email input found');
      return false;
    }

    await emailInput.click({ clickCount: 3 });
    await sleep(200);
    await emailInput.type(email, { delay: 80 });
    await sleep(500);

    // Find submit button near email input
    const allButtons = await page.$$('button, [role="button"]');
    let submitted = false;
    for (const btn of allButtons) {
      try {
        const box = await btn.boundingBox();
        const inputBox = await emailInput.boundingBox();
        if (!box || !inputBox) continue;
        if (Math.abs(box.y - inputBox.y) < 30 && box.x > inputBox.x) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch (e) {}
    }

    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    await sleep(3000);
    return true;
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
    await sleep(2000);
    console.log('Entering OTP:', otp);

    const findInputs = async (context) => {
      return await context.$$('input:not([type="hidden"]):not([type="email"])');
    };

    let inputs = await findInputs(page);

    if (inputs.length === 0) {
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const frameInputs = await findInputs(frame);
          if (frameInputs.length > 0) {
            inputs = frameInputs;
            break;
          }
        } catch (e) {}
      }
    }

    console.log(`Found ${inputs.length} input fields`);

    if (inputs.length === 0) {
      await page.keyboard.type(otp, { delay: 100 });
      await sleep(3000);
      const url = page.url();
      return !url.includes('/login');
    }

    const digits = otp.toString().split('');

    if (inputs.length >= 4) {
      await inputs[0].click();
      await sleep(300);
      for (const digit of digits) {
        await page.keyboard.type(digit, { delay: 100 });
        await sleep(150);
      }
    } else {
      await inputs[0].click({ clickCount: 3 });
      await sleep(200);
      await inputs[0].type(otp, { delay: 80 });
    }

    await sleep(2000);

    // Click verify button
    const buttons = await page.$$('button');
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
          await btn.click();
          await sleep(4000);
          break;
        }
      } catch (e) {}
    }

    await sleep(3000);
    const finalUrl = page.url();
    console.log('After OTP, URL:', finalUrl);
    
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
 * Go to dashboard
 */
async function goHome(page) {
  await page.goto(`${P2P_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(2000);
}

/**
 * Get dashboard info
 */
async function getDashboardInfo(page) {
  try {
    await goHome(page);
    const info = await page.evaluate(() => {
      const body = document.body.innerText;
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
    console.error('Dashboard error:', e.message);
    return { sellPrice: 'N/A', buyPrice: 'N/A', balance: '0.00' };
  }
}

/**
 * Open wallet modal by clicking "Wallet" button on dashboard
 * Wallet is a Thirdweb modal, not a separate page
 */
async function getWalletInfo(page) {
  try {
    await goHome(page);

    // Find and click Wallet button (it has icon + text "Wallet")
    const clicked = await clickDashboardButton(page, 'Wallet');
    if (!clicked) {
      console.log('Wallet button not found');
      return { address: null, pageText: '' };
    }

    await sleep(3000);

    // Extract wallet info from the modal
    const info = await page.evaluate(() => {
      const body = document.body.innerText;
      const addressMatch = body.match(/0x[a-fA-F0-9]{40}/);
      return {
        address: addressMatch ? addressMatch[0] : null,
        pageText: body.substring(0, 800),
      };
    });

    return info;
  } catch (e) {
    console.error('Wallet error:', e.message);
    return { address: null, pageText: '' };
  }
}

/**
 * Open deposit sheet by clicking "Deposit" button, then "Deposit Base USDC"
 */
async function goToDeposit(page) {
  try {
    await goHome(page);

    // Click "Deposit" button on dashboard
    const clicked = await clickDashboardButton(page, 'Deposit');
    if (!clicked) {
      console.log('Deposit button not found');
      return { address: null, pageText: '' };
    }

    await sleep(2000);

    // Now click "Deposit Base USDC" in the bottom sheet
    const allElements = await page.$$('div, button, a');
    for (const el of allElements) {
      try {
        const text = await page.evaluate(e => e.textContent.trim(), el);
        if (text.includes('Deposit Base USDC')) {
          await el.click();
          await sleep(3000);
          break;
        }
      } catch (e) {}
    }

    // Extract wallet address from deposit page
    const info = await page.evaluate(() => {
      const body = document.body.innerText;
      const addressMatch = body.match(/0x[a-fA-F0-9]{40}/);
      return {
        address: addressMatch ? addressMatch[0] : null,
        pageText: body.substring(0, 800),
      };
    });

    return info;
  } catch (e) {
    console.error('Deposit error:', e.message);
    return { address: null, pageText: '' };
  }
}

/**
 * Click a button on the dashboard by its label text
 * Dashboard buttons have icon + text like "Wallet", "Deposit", "Withdraw", "Support"
 */
async function clickDashboardButton(page, label) {
  // Try finding by text content
  const allElements = await page.$$('button, div, a, span');
  for (const el of allElements) {
    try {
      const text = await page.evaluate(e => e.textContent.trim(), el);
      const isVisible = await page.evaluate(e => {
        const rect = e.getBoundingClientRect();
        return rect.width > 20 && rect.height > 20 && rect.width < 200;
      }, el);
      
      if (text === label && isVisible) {
        await el.click();
        console.log(`Clicked dashboard button: ${label}`);
        return true;
      }
    } catch (e) {}
  }
  
  console.log(`Dashboard button "${label}" not found`);
  return false;
}

/**
 * Navigate to Scan & Pay page
 */
async function goToScanAndPay(page) {
  try {
    await page.goto(`${P2P_URL}/pay`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);
    const text = await page.evaluate(() => document.body.innerText);
    return text.includes('Scan & Pay') || text.includes('INR') || text.includes('Place Order');
  } catch (e) {
    console.error('Go to pay error:', e.message);
    return false;
  }
}

/**
 * Enter amount using keypad buttons
 */
async function enterAmount(page, amount) {
  try {
    // Clear first
    const clearBtn = await findButtonByText(page, 'Clear');
    if (clearBtn) {
      await clearBtn.click();
      await sleep(300);
    }

    const digits = amount.toString().split('');
    for (const digit of digits) {
      const btn = await findButtonByText(page, digit === '.' ? '.' : digit);
      if (btn) {
        await btn.click();
        await sleep(200);
      }
    }

    await sleep(500);

    const conversionInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const usdcMatch = body.match(/([\d.]+)\s*USDC/);
      return { usdc: usdcMatch ? usdcMatch[1] : 'N/A' };
    });

    return conversionInfo;
  } catch (e) {
    console.error('Enter amount error:', e.message);
    return null;
  }
}

/**
 * Click Place Order
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
 * Take screenshot
 */
async function takeScreenshot(page) {
  try {
    return await page.screenshot({ type: 'png' });
  } catch (e) {
    console.error('Screenshot error:', e.message);
    return null;
  }
}

/**
 * Get page text
 */
async function getPageText(page) {
  try {
    return await page.evaluate(() => document.body.innerText);
  } catch (e) {
    return '';
  }
}

// ============ Helpers ============

async function findButtonByText(page, text) {
  const buttons = await page.$$('button, div[role="button"]');
  for (const btn of buttons) {
    const btnText = await page.evaluate(el => el.textContent.trim(), btn);
    if (btnText === text) return btn;
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  navigateToLogin,
  clickLogin,
  enterEmail,
  enterOTP,
  getDashboardInfo,
  goToScanAndPay,
  enterAmount,
  placeOrder,
  takeScreenshot,
  getPageText,
  getWalletInfo,
  goToDeposit,
  goHome,
  sleep,
};
