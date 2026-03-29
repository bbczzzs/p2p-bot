const Jimp = require('jimp');
const jsQR = require('jsqr');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Decode QR code from an image buffer or URL
 * Returns the decoded text (UPI ID/URL) or null
 */
async function decodeQR(source) {
  try {
    let imageBuffer;

    if (Buffer.isBuffer(source)) {
      imageBuffer = source;
    } else if (typeof source === 'string') {
      // It's a URL — download the image
      const response = await axios.get(source, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(response.data);
    } else {
      return null;
    }

    // Read image with Jimp
    const image = await Jimp.read(imageBuffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    // Get raw RGBA pixel data
    const imageData = new Uint8ClampedArray(image.bitmap.data);

    // Decode QR
    const qrCode = jsQR(imageData, width, height);

    if (qrCode) {
      return qrCode.data;
    }

    // Try with enhanced contrast
    image.contrast(0.5);
    image.greyscale();
    const enhancedData = new Uint8ClampedArray(image.bitmap.data);
    const qrCode2 = jsQR(enhancedData, width, height);

    if (qrCode2) {
      return qrCode2.data;
    }

    return null;
  } catch (e) {
    console.error('QR decode error:', e.message);
    return null;
  }
}

/**
 * Extract UPI ID from QR data
 * UPI QR codes typically contain: upi://pay?pa=user@upi&pn=Name&am=Amount
 */
function extractUPIFromQR(qrData) {
  if (!qrData) return null;

  try {
    // Check if it's a UPI URL
    if (qrData.toLowerCase().startsWith('upi://')) {
      const url = new URL(qrData);
      const params = url.searchParams;

      return {
        upiId: params.get('pa') || null,
        name: params.get('pn') || null,
        amount: params.get('am') || null,
        raw: qrData,
      };
    }

    // Check if it's a direct UPI ID (user@bank)
    if (qrData.includes('@') && !qrData.includes('://')) {
      return {
        upiId: qrData.trim(),
        name: null,
        amount: null,
        raw: qrData,
      };
    }

    // Unknown format
    return {
      upiId: null,
      name: null,
      amount: null,
      raw: qrData,
    };
  } catch (e) {
    return { upiId: null, name: null, amount: null, raw: qrData };
  }
}

/**
 * Download a file from Telegram
 */
async function downloadTelegramFile(bot, fileId) {
  try {
    const fileLink = await bot.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (e) {
    console.error('Download file error:', e.message);
    return null;
  }
}

module.exports = {
  decodeQR,
  extractUPIFromQR,
  downloadTelegramFile,
};
