const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'cred.json');
const HISTORY_DIR = path.join(__dirname, 'history-data');
const PORT = process.env.PORT || 3000;

// Global object to store history IDs per email address
let historyIds = {};

// Add duplicate detection - track processed message IDs
let processedMessageIds = new Set();
const PROCESSED_IDS_FILE = path.join(HISTORY_DIR, 'processed-message-ids.json');

// Add file-based lock system for race condition prevention
const LOCKS_DIR = path.join(HISTORY_DIR, 'locks');
const LOCK_TIMEOUT_MS = 30000; // 30 seconds timeout for locks

// Ensure locks directory exists
async function ensureLocksDirectory() {
  try {
    await fs.mkdir(LOCKS_DIR, { recursive: true });
  } catch (error) {
    console.log(`⚠️  Could not create locks directory: ${error.message}`);
  }
}

// Generate lock file path for a message ID
function getLockFilePath(messageId) {
  const safeMessageId = messageId.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(LOCKS_DIR, `${safeMessageId}.lock`);
}

// Acquire lock for processing a specific message
async function acquireLock(messageId) {
  await ensureLocksDirectory();
  
  const lockFilePath = getLockFilePath(messageId);
  const lockData = {
    messageId: messageId,
    timestamp: Date.now(),
    processId: process.pid,
    hostname: require('os').hostname()
  };
  
  try {
    // Check if lock file already exists
    const lockFileContent = await fs.readFile(lockFilePath, 'utf8');
    const lockData = JSON.parse(lockFileContent);
    const lockAge = Date.now() - lockData.timestamp;
    
    if (lockAge > LOCK_TIMEOUT_MS) {
      console.log(`🔓 Found stale lock for ${messageId} (${Math.round(lockAge/1000)}s old), removing...`);
      await fs.unlink(lockFilePath);
    } else {
      // Lock exists and is not stale
      console.log(`🔒 Message ${messageId} is already being processed by another instance`);
      return false;
    }
  } catch (error) {
    // Lock file doesn't exist or is corrupted, proceed to create it
  }
  
  try {
    // Use writeFile with 'wx' flag to fail if file exists (atomic operation)
    await fs.writeFile(lockFilePath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
    console.log(`🔒 Acquired lock for message ${messageId}`);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      console.log(`🔒 Message ${messageId} is already being processed (lock exists)`);
      return false;
    } else {
      console.log(`⚠️  Error acquiring lock for ${messageId}: ${error.message}`);
      return false;
    }
  }
}

// Release lock for a specific message
async function releaseLock(messageId) {
  const lockFilePath = getLockFilePath(messageId);
  
  try {
    await fs.unlink(lockFilePath);
    console.log(`🔓 Released lock for message ${messageId}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.log(`⚠️  Error releasing lock for ${messageId}: ${error.message}`);
    }
  }
}

// Clean up old/stale locks on startup
async function cleanupStaleLocks() {
  try {
    await ensureLocksDirectory();
    const lockFiles = await fs.readdir(LOCKS_DIR);
    let cleanedCount = 0;
    
    for (const lockFile of lockFiles) {
      if (lockFile.endsWith('.lock')) {
        const lockFilePath = path.join(LOCKS_DIR, lockFile);
        try {
          const lockFileContent = await fs.readFile(lockFilePath, 'utf8');
          const lockData = JSON.parse(lockFileContent);
          const lockAge = Date.now() - lockData.timestamp;
          
          if (lockAge > LOCK_TIMEOUT_MS) {
            await fs.unlink(lockFilePath);
            cleanedCount++;
            console.log(`🧹 Cleaned stale lock: ${lockFile} (${Math.round(lockAge/1000)}s old)`);
          }
        } catch (error) {
          // File might have been deleted by another process or is corrupted
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} stale lock(s)`);
    } else {
      console.log(`✅ No stale locks found`);
    }
  } catch (error) {
    console.log(`⚠️  Error cleaning stale locks: ${error.message}`);
  }
}

// Load processed message IDs from file
async function loadProcessedMessageIds() {
  try {
    const data = await fs.readFile(PROCESSED_IDS_FILE, 'utf8');
    const ids = JSON.parse(data);
    processedMessageIds = new Set(ids);
    console.log(`📋 Loaded ${processedMessageIds.size} processed message IDs`);
  } catch (error) {
    console.log('📋 No existing processed message IDs file found - starting fresh');
    processedMessageIds = new Set();
  }
}

// Save processed message IDs to file
async function saveProcessedMessageIds() {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    await fs.writeFile(PROCESSED_IDS_FILE, JSON.stringify([...processedMessageIds], null, 2));
  } catch (error) {
    console.log(`⚠️  Could not save processed message IDs: ${error.message}`);
  }
}

// Check if message has already been processed
function isMessageAlreadyProcessed(messageId) {
  return processedMessageIds.has(messageId);
}

// Mark message as processed
async function markMessageAsProcessed(messageId) {
  processedMessageIds.add(messageId);
  
  // Keep only the last 1000 processed IDs to prevent memory issues
  if (processedMessageIds.size > 1000) {
    const idsArray = [...processedMessageIds];
    processedMessageIds = new Set(idsArray.slice(-1000));
  }
  
  await saveProcessedMessageIds();
}

// Create safe filename from email address
function createSafeFilename(email) {
  return email.replace(/[@.]/g, '_');
}

// Load all history IDs for all email accounts
async function loadAllHistoryIds() {
  try {
    // Ensure history directory exists
    try {
      await fs.mkdir(HISTORY_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Try to load the main history file (all emails in one file)
    const mainHistoryPath = path.join(HISTORY_DIR, 'all-emails-history.json');
    try {
      const content = await fs.readFile(mainHistoryPath);
      historyIds = JSON.parse(content);
      console.log('📊 Loaded history IDs for emails:', Object.keys(historyIds));
      
      // Display current history for each email
      Object.entries(historyIds).forEach(([email, data]) => {
        console.log(`   📧 ${email}: ${data.historyId} (${data.timestamp})`);
      });
    } catch (error) {
      console.log('📊 No previous history data found, starting fresh');
      historyIds = {};
    }
  } catch (error) {
    console.log(`⚠️  Error loading history IDs: ${error.message}`);
    historyIds = {};
  }
}

// Save history ID for specific email address
async function saveHistoryId(email, historyId) {
  try {
    // Ensure history directory exists
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString();
    
    // Update in-memory storage
    historyIds[email] = {
      historyId: historyId,
      timestamp: timestamp,
      lastUpdated: timestamp
    };
    
    // Save to main file
    const mainHistoryPath = path.join(HISTORY_DIR, 'all-emails-history.json');
    await fs.writeFile(mainHistoryPath, JSON.stringify(historyIds, null, 2));
    
    // Also save individual file for backup
    const safeFilename = createSafeFilename(email);
    const individualPath = path.join(HISTORY_DIR, `${safeFilename}-history.json`);
    await fs.writeFile(individualPath, JSON.stringify(historyIds[email], null, 2));
    
    console.log(`💾 Saved history ID for ${email}: ${historyId}`);
  } catch (error) {
    console.log(`⚠️  Could not save history ID for ${email}: ${error.message}`);
  }
}

// Get last history ID for specific email address
function getLastHistoryId(email) {
  if (historyIds[email]) {
    return historyIds[email].historyId;
  }
  return null;
}

// Display status of all tracked email accounts
function displayEmailStatus() {
  console.log('\n📊 EMAIL ACCOUNT STATUS:');
  console.log('========================');
  
  if (Object.keys(historyIds).length === 0) {
    console.log('   No email accounts being tracked yet');
  } else {
    Object.entries(historyIds).forEach(([email, data]) => {
      console.log(`   📧 ${email}:`);
      console.log(`      History ID: ${data.historyId}`);
      console.log(`      Last Updated: ${data.timestamp}`);
    });
  }
  console.log('========================\n');
}

// Send message to Telegram group
async function sendToTelegram(message, options = {}) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML', // Enable HTML formatting
      disable_web_page_preview: true, // Disable link previews for cleaner messages
      ...options
    };
    
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('📲 Successfully sent to Telegram PokeSales group');
      return true;
    } else {
      console.log('❌ Telegram API error:', result.description);
      return false;
    }
  } catch (error) {
    console.log('❌ Error sending to Telegram:', error.message);
    return false;
  }
}

// Send data to Python Flask server for LLM processing
async function sendToFlaskServer(emailDetails, parsedData) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const payload = {
      email_details: {
        from: emailDetails.from,
        to: emailDetails.to,
        subject: emailDetails.subject,
        date: emailDetails.date,
        messageId: emailDetails.messageId,
        threadId: emailDetails.threadId,
        snippet: emailDetails.snippet,
        sizeEstimate: emailDetails.sizeEstimate,
        historyId: emailDetails.historyId,
        internalDate: emailDetails.internalDate,
        labels: emailDetails.labels,
        body: {
          textBody: emailDetails.body.textBody,
          htmlBody: emailDetails.body.htmlBody
        },
        attachments: emailDetails.attachments
      },
      parsed_data: parsedData,
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch("http://localhost:5000/process", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      console.log('🤖 Successfully sent to Flask LLM processor');
      console.log('📊 LLM Analysis:', result.llm_analysis);
      return result;
    } else {
      console.log('❌ Flask server error:', result.error);
      return null;
    }
  } catch (error) {
    console.log('❌ Error sending to Flask server:', error.message);
    return null;
  }
}

// Extract Fanatics sale details from email content
function extractFanaticsSaleDetails(emailContent) {
  const content = emailContent || '';
  
  // Look for product name (between <strong> tags or after ** in text)
  let productName = '';
  const productRegex = /<strong>([^<]*(?:Pokemon|Pokémon)[^<]*)<\/strong>/i;
  const productMatch = content.match(productRegex);
  if (productMatch) {
    productName = productMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/=/g, '') // Remove = characters from quoted-printable encoding
      .trim();
  }
  
  // If no HTML match, try text format
  if (!productName) {
    const textProductRegex = /\*([^*]*(?:Pokemon|Pokémon)[^*]*)\*/i;
    const textMatch = content.match(textProductRegex);
    if (textMatch) {
      productName = textMatch[1].trim();
    }
  }
  
  // Extract sale price - more robust regex to handle complex HTML structure
  let salePrice = '';
  const salePriceRegex = /SALE PRICE:[\s\S]*?>\$?([0-9,]+\.?[0-9]*)</i;
  const salePriceMatch = content.match(salePriceRegex);
  if (salePriceMatch) {
    salePrice = `$${salePriceMatch[1]}`;
  }
  
  // Extract seller fees - more robust regex to handle complex HTML structure
  let sellerFees = '';
  const sellerFeesRegex = /SELLER FEES:[\s\S]*?>\$?([0-9,]+\.?[0-9]*)</i;
  const sellerFeesMatch = content.match(sellerFeesRegex);
  if (sellerFeesMatch) {
    sellerFees = `$${sellerFeesMatch[1]}`;
  }
  
  // Extract total payout - more robust regex to handle HTML and <strong> tags
  let totalPayout = '';
  const totalPayoutRegex = /TOTAL PAYOUT:[\s\S]*?>(?:<strong>)?\$?([0-9,]+\.?[0-9]*)(?:<\/strong>)?</i;
  const totalPayoutMatch = content.match(totalPayoutRegex);
  if (totalPayoutMatch) {
    totalPayout = `$${totalPayoutMatch[1]}`;
  }
  
  return {
    productName,
    salePrice,
    sellerFees,
    totalPayout,
    isValid: !!(productName && salePrice && totalPayout)
  };
}

// Format email content for Telegram
function formatEmailForTelegram(emailDetails) {
  // Clean and truncate text for Telegram
  const cleanText = (text, maxLength = 500) => {
    if (!text) return 'N/A';
    return text
      .replace(/&[#\w]+;/g, '') // Remove HTML entities
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, maxLength) + (text.length > maxLength ? '...' : '');
  };
  
  // Check if this is a Fanatics sale completion email
  const isFanaticsSale = 
    (emailDetails.from.toLowerCase().includes('fanaticscollect.com') || 
     emailDetails.from.toLowerCase().includes('fanatics collect')) &&
    emailDetails.subject.toLowerCase().includes('buy now sale is complete');
  
  // Handle Fanatics sale completion emails specially
  if (isFanaticsSale) {
    const emailContent = emailDetails.body.htmlBody || emailDetails.body.textBody || '';
    
    // DEBUG: Log the content being passed to Fanatics parsing
    console.log('\n🔧 DEBUG: FANATICS PARSING INPUT');
    console.log('==================================');
    console.log('Email Content Length:', emailContent.length);
    console.log('Has HTML Body:', !!emailDetails.body.htmlBody);
    console.log('Has Text Body:', !!emailDetails.body.textBody);
    console.log('FULL EMAIL CONTENT:');
    console.log(emailContent);
    console.log('==================================\n');
    
    const saleDetails = extractFanaticsSaleDetails(emailContent);
    
    // DEBUG: Log the parsing results
    console.log('\n🔧 DEBUG: FANATICS PARSING OUTPUT');
    console.log('==================================');
    console.log('Parsed Results:', JSON.stringify(saleDetails, null, 2));
    console.log('==================================\n');
    
    if (saleDetails.isValid) {
      // Format exactly as user requested
      let message = '🎮💰 <b>POKEMON CARD SALE COMPLETED!</b> 💰🎮\n\n';
      message += `<b>${saleDetails.productName}</b>\n\n`;
      message += `<b>SALE PRICE:</b>\n${saleDetails.salePrice}\n`;
      message += `<b>SELLER FEES:</b>\n${saleDetails.sellerFees}\n`;
      message += `<b>TOTAL PAYOUT:</b>\n<b>${saleDetails.totalPayout}</b>\n\n`;
      message += `🎯 <i>Sale processed through Fanatics Collect</i>`;
      
      return message;
    }
    // If we can't extract details, fall through to regular format
  }
  
  // Check if this is Pokemon-related (for other emails)
  const isPokemonEmail = 
    emailDetails.subject.toLowerCase().includes('pokemon') ||
    emailDetails.from.toLowerCase().includes('pokemon') ||
    emailDetails.body.textBody.toLowerCase().includes('pokemon') ||
    emailDetails.body.htmlBody.toLowerCase().includes('pokemon');
  
  // Create formatted message for regular emails
  let message = '';
  
  // Header with icon based on content
  if (isPokemonEmail) {
    message += '🎮⚡ <b>POKEMON EMAIL ALERT!</b> ⚡🎮\n\n';
  } else {
    message += '📧 <b>New Email Received</b>\n\n';
  }
  
  // Basic email info
  message += `<b>From:</b> ${cleanText(emailDetails.from, 100)}\n`;
  message += `<b>To:</b> ${cleanText(emailDetails.to, 100)}\n`;
  message += `<b>Subject:</b> ${cleanText(emailDetails.subject, 150)}\n`;
  message += `<b>Date:</b> ${emailDetails.date}\n\n`;
  
  // Email content preview
  const bodyText = emailDetails.body.textBody || emailDetails.body.htmlBody || emailDetails.snippet;
  if (bodyText) {
    message += `<b>Content Preview:</b>\n`;
    message += `<i>${cleanText(bodyText, 800)}</i>\n\n`;
  }
  
  // Attachments
  if (emailDetails.attachments.length > 0) {
    message += `<b>📎 Attachments:</b>\n`;
    emailDetails.attachments.slice(0, 3).forEach(attachment => {
      message += `• ${attachment.filename} (${attachment.mimeType})\n`;
    });
    if (emailDetails.attachments.length > 3) {
      message += `• ... and ${emailDetails.attachments.length - 3} more\n`;
    }
    message += '\n';
  }
  
  // Technical info
  message += `<b>📊 Info:</b> ${emailDetails.sizeEstimate} bytes | ID: ${emailDetails.messageId.substring(0, 8)}...`;
  
  // Telegram has a 4096 character limit
  if (message.length > 4000) {
    message = message.substring(0, 3900) + '...\n\n<i>[Message truncated]</i>';
  }
  
  return message;
}

// Load saved OAuth tokens if available
async function loadSaved() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    
    // Check if this is a service account file (not what we want for OAuth)
    if (credentials.type === 'service_account') {
      console.log('Found service account credentials in token.json, but we need OAuth tokens. Starting OAuth flow...');
      return null;
    }
    
    return google.auth.fromJSON(credentials);
  } catch {
    return null;
  }
}

// Save OAuth credentials
async function save(client) {
  const creds = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
  const key = creds.installed || creds.web;
  const payload = {
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token
  };
  await fs.writeFile(TOKEN_PATH, JSON.stringify(payload));
}

// Perform OAuth flow
async function authorize() {
  let client = await loadSaved();
  if (!client) {
    client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH
    });
    if (client.credentials) await save(client);
  }
  return client;
}

// Set up Gmail watch
async function startWatch(auth) {
  const gmail = google.gmail({version:'v1', auth});
  
  // Updated with actual project ID from credentials
  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: 'projects/pokemon77/topics/gmail-watch-topic',
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE'
    }
  });
  console.log('✅ Gmail watch started successfully!');
  
  // Decode and display watch response details
  const response = res.data;
  const expirationMs = parseInt(response.expiration);
  const expirationDate = new Date(expirationMs);
  const now = new Date();
  const timeUntilExpiry = expirationMs - now.getTime();
  const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
  const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));
  
  console.log('\n📊 Watch Details:');
  console.log(`   History ID: ${response.historyId}`);
  console.log(`   Expires: ${expirationDate.toLocaleString()}`);
  console.log(`   Time until expiry: ${hoursUntilExpiry}h ${minutesUntilExpiry}m`);
  console.log(`   Raw response: ${JSON.stringify(response)}\n`);
  
  // Get the current user's email to save history ID
  const profile = await gmail.users.getProfile({
    userId: 'me'
  });
  const userEmail = profile.data.emailAddress;
  
  // Save the initial history ID for this email if we don't have one
  if (!getLastHistoryId(userEmail)) {
    console.log(`🔄 Setting initial history ID for ${userEmail}: ${response.historyId}`);
    await saveHistoryId(userEmail, response.historyId);
  } else {
    console.log(`📊 Using existing history ID for ${userEmail}: ${getLastHistoryId(userEmail)}`);
  }
  
  return gmail;
}

// Function to extract email body content
function extractEmailBody(payload) {
  let textBody = '';
  let htmlBody = '';
  
  // Function to recursively extract body from parts
  function extractFromParts(parts) {
    if (!parts) return;
    
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        textBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  }
  
  // Check if message has parts (multipart)
  if (payload.parts) {
    extractFromParts(payload.parts);
  } else if (payload.body?.data) {
    // Single part message
    const bodyData = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/plain') {
      textBody = bodyData;
    } else if (payload.mimeType === 'text/html') {
      htmlBody = bodyData;
    }
  }
  
  return { textBody, htmlBody };
}

// Function to extract attachments information
function extractAttachments(payload) {
  const attachments = [];
  
  function findAttachments(parts) {
    if (!parts) return;
    
    for (const part of parts) {
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body?.size || 0,
          attachmentId: part.body?.attachmentId
        });
      } else if (part.parts) {
        findAttachments(part.parts);
      }
    }
  }
  
  if (payload.parts) {
    findAttachments(payload.parts);
  }
  
  return attachments;
}

// Comprehensive email logging function
async function logEmailDetails(messageData, messageInfo) {
  const messageId = messageData.id;
  
  // **STEP 1: EARLY DUPLICATE CHECK** - Fast exit if already processed
  if (isMessageAlreadyProcessed(messageId)) {
    console.log(`🔄 DUPLICATE DETECTED - Message ${messageId} already processed, skipping entirely...`);
    return;
  }
  
  // **STEP 2: ACQUIRE LOCK** - Prevent race conditions with multiple processes
  const lockAcquired = await acquireLock(messageId);
  if (!lockAcquired) {
    console.log(`🔒 LOCK FAILED - Message ${messageId} is being processed by another instance, skipping...`);
    return;
  }
  
  try {
    // **STEP 3: DOUBLE-CHECK DUPLICATE** - In case it was processed while waiting for lock
    if (isMessageAlreadyProcessed(messageId)) {
      console.log(`🔄 DUPLICATE DETECTED AFTER LOCK - Message ${messageId} was processed while waiting, skipping...`);
      return; // Lock will be released in finally block
    }
    
    // **STEP 4: MARK AS PROCESSED IMMEDIATELY** - Prevent other instances from processing
    await markMessageAsProcessed(messageId);
    console.log(`✅ NEW MESSAGE - Processing ${messageId} for the first time (marked as processed)`);
    
    const timestamp = new Date().toISOString();
    const headers = messageData.payload.headers;
  
  // Extract all important headers
  const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || 'N/A';
  
  // DEBUG: Log the full raw email content for debugging
  console.log('\n🔧 DEBUG: FULL EMAIL CONTENT FOR PARSING');
  console.log('==========================================');
  console.log('Raw messageData payload:');
  console.log(JSON.stringify(messageData.payload, null, 2));
  console.log('==========================================\n');
  
  const emailDetails = {
    messageId: messageData.id,
    threadId: messageData.threadId,
    snippet: messageData.snippet,
    sizeEstimate: messageData.sizeEstimate,
    historyId: messageData.historyId,
    internalDate: new Date(parseInt(messageData.internalDate)).toISOString(),
    labels: messageData.labelIds || [],
    
    // Header information
    from: getHeader('From'),
    to: getHeader('To'),
    cc: getHeader('Cc'),
    bcc: getHeader('Bcc'),
    replyTo: getHeader('Reply-To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    messageIdHeader: getHeader('Message-ID'),
    references: getHeader('References'),
    inReplyTo: getHeader('In-Reply-To'),
    
    // Additional headers
    contentType: getHeader('Content-Type'),
    mimeVersion: getHeader('MIME-Version'),
    xMailer: getHeader('X-Mailer'),
    listUnsubscribe: getHeader('List-Unsubscribe'),
    returnPath: getHeader('Return-Path'),
    deliveredTo: getHeader('Delivered-To'),
    received: headers.filter(h => h.name.toLowerCase() === 'received').map(h => h.value),
    
    // Body content
    body: extractEmailBody(messageData.payload),
    
    // Attachments
    attachments: extractAttachments(messageData.payload)
  };
  
  // Create separator line
  const separator = '='.repeat(100);
  
  console.log(`\n${separator}`);
  console.log(`🚨 NEW EMAIL RECEIVED - ${timestamp}`);
  console.log(`${separator}`);
  
  // Basic Information
  console.log('📋 BASIC INFORMATION:');
  console.log(`   📧 From: ${emailDetails.from}`);
  console.log(`   📬 To: ${emailDetails.to}`);
  if (emailDetails.cc !== 'N/A') console.log(`   📋 CC: ${emailDetails.cc}`);
  if (emailDetails.bcc !== 'N/A') console.log(`   📋 BCC: ${emailDetails.bcc}`);
  console.log(`   📝 Subject: ${emailDetails.subject}`);
  console.log(`   📅 Date: ${emailDetails.date}`);
  console.log(`   🕐 Internal Date: ${emailDetails.internalDate}`);
  
  // Technical Details
  console.log('\n🔧 TECHNICAL DETAILS:');
  console.log(`   🆔 Message ID: ${emailDetails.messageId}`);
  console.log(`   🧵 Thread ID: ${emailDetails.threadId}`);
  console.log(`   📊 History ID: ${emailDetails.historyId}`);
  console.log(`   📏 Size: ${emailDetails.sizeEstimate} bytes`);
  console.log(`   🏷️  Labels: ${emailDetails.labels.join(', ')}`);
  console.log(`   📎 MIME Type: ${emailDetails.contentType}`);
  
  // Headers
  console.log('\n📨 EMAIL HEADERS:');
  console.log(`   Message-ID: ${emailDetails.messageIdHeader}`);
  if (emailDetails.replyTo !== 'N/A') console.log(`   Reply-To: ${emailDetails.replyTo}`);
  if (emailDetails.references !== 'N/A') console.log(`   References: ${emailDetails.references}`);
  if (emailDetails.inReplyTo !== 'N/A') console.log(`   In-Reply-To: ${emailDetails.inReplyTo}`);
  if (emailDetails.xMailer !== 'N/A') console.log(`   X-Mailer: ${emailDetails.xMailer}`);
  if (emailDetails.returnPath !== 'N/A') console.log(`   Return-Path: ${emailDetails.returnPath}`);
  if (emailDetails.deliveredTo !== 'N/A') console.log(`   Delivered-To: ${emailDetails.deliveredTo}`);
  
  // Body Content
  console.log('\n📄 EMAIL CONTENT:');
  console.log(`   📝 Snippet: ${emailDetails.snippet}`);
  
  if (emailDetails.body.textBody) {
    const textPreview = emailDetails.body.textBody.substring(0, 500);
    console.log(`   📜 Text Body (first 500 chars):\n   ${textPreview.replace(/\n/g, '\n   ')}${emailDetails.body.textBody.length > 500 ? '...' : ''}`);
  }
  
  if (emailDetails.body.htmlBody) {
    const htmlPreview = emailDetails.body.htmlBody.substring(0, 300);
    console.log(`   🌐 HTML Body (first 300 chars):\n   ${htmlPreview.replace(/\n/g, '\n   ')}${emailDetails.body.htmlBody.length > 300 ? '...' : ''}`);
  }
  
  // Attachments
  if (emailDetails.attachments.length > 0) {
    console.log('\n📎 ATTACHMENTS:');
    emailDetails.attachments.forEach((attachment, index) => {
      console.log(`   ${index + 1}. ${attachment.filename}`);
      console.log(`      Type: ${attachment.mimeType}`);
      console.log(`      Size: ${attachment.size} bytes`);
      console.log(`      ID: ${attachment.attachmentId}`);
    });
  } else {
    console.log('\n📎 ATTACHMENTS: None');
  }
  
  // Received Headers (Email Route)
  if (emailDetails.received.length > 0) {
    console.log('\n🛤️  EMAIL ROUTE (Received Headers):');
    emailDetails.received.forEach((received, index) => {
      console.log(`   ${index + 1}. ${received}`);
    });
  }
  
  // Special notifications for Pokemon-related emails
  if (emailDetails.subject.toLowerCase().includes('pokemon') || 
      emailDetails.from.toLowerCase().includes('pokemon') ||
      emailDetails.body.textBody.toLowerCase().includes('pokemon') ||
      emailDetails.body.htmlBody.toLowerCase().includes('pokemon')) {
    console.log('\n🎮 ⚡ POKEMON ALERT! ⚡ 🎮');
    console.log('   This email contains Pokemon-related content!');
  }
  
  console.log(`\n${separator}\n`);
  
  // Also save to file for permanent logging
  await saveEmailToFile(emailDetails, timestamp);
  
  // Send to Telegram PokeSales group
  console.log('📲 Sending email to Telegram...');
  const telegramMessage = formatEmailForTelegram(emailDetails);
  const telegramSuccess = await sendToTelegram(telegramMessage);
  
  if (!telegramSuccess) {
    console.log('⚠️  Failed to send to Telegram, but continuing...');
  }

  // Send data to Flask server for LLM processing
  console.log('🤖 Sending email to Flask LLM processor...');
  
  // Check if this is a Fanatics sale email
  const isFanaticsSale = 
    (emailDetails.from.toLowerCase().includes('fanaticscollect.com') || 
     emailDetails.from.toLowerCase().includes('fanatics collect')) &&
    emailDetails.subject.toLowerCase().includes('buy now sale is complete');
  
  // Extract sale details if it's a Fanatics sale
  let saleDetails = null;
  if (isFanaticsSale) {
    saleDetails = extractFanaticsSaleDetails(emailDetails.body.htmlBody || emailDetails.body.textBody);
  }
  
  // Prepare parsed data for Flask
  const parsedData = {
    emailType: isFanaticsSale ? 'fanatics_sale' : 'regular_email',
    isFanaticsSale: isFanaticsSale,
    saleDetails: saleDetails,
    isPokemonRelated: emailDetails.subject.toLowerCase().includes('pokemon') || 
                     emailDetails.from.toLowerCase().includes('pokemon') ||
                     (emailDetails.body.textBody && emailDetails.body.textBody.toLowerCase().includes('pokemon')) ||
                     (emailDetails.body.htmlBody && emailDetails.body.htmlBody.toLowerCase().includes('pokemon'))
  };
  
  const flaskResponse = await sendToFlaskServer(emailDetails, parsedData);

  if (flaskResponse) {
    console.log('✅ Flask LLM processor completed successfully.');
    console.log('📊 LLM Analysis Summary:', flaskResponse.llm_analysis);
  } else {
    console.log('❌ Flask LLM processor failed or returned no data.');
  }
  
  console.log(`✅ Message ${messageId} processing completed - marked as processed at start to prevent duplicates`);
  
  } finally {
    // **STEP 5: RELEASE LOCK** - Always release lock, even if processing failed
    await releaseLock(messageId);
  }
}

// Save email details to a log file
async function saveEmailToFile(emailDetails, timestamp) {
  try {
    const fs = require('fs').promises;
    const logEntry = {
      timestamp,
      ...emailDetails
    };
    
    const logData = JSON.stringify(logEntry, null, 2) + '\n,\n';
    await fs.appendFile('email-log.json', logData);
  } catch (error) {
    console.log('⚠️  Could not save email to file:', error.message);
  }
}

// Process Gmail notifications
async function processNotification(gmail, message) {
  try {
    console.log('📧 New Gmail notification received!');
    
    // Decode the Pub/Sub message
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    console.log('Notification data:', data);
    
    if (data.historyId && data.emailAddress) {
      const newHistoryId = data.historyId;
      const emailAddress = data.emailAddress;
      
      // Get the LAST KNOWN history ID for THIS specific email address
      const lastKnownHistoryId = getLastHistoryId(emailAddress);
      const startHistoryId = lastKnownHistoryId || newHistoryId;
      
      console.log(`🔍 History ID Logic for ${emailAddress}:`);
      console.log(`   Last known ID: ${lastKnownHistoryId}`);
      console.log(`   New ID from notification: ${newHistoryId}`);
      console.log(`   Using startHistoryId: ${startHistoryId}`);
      
      if (lastKnownHistoryId && lastKnownHistoryId === newHistoryId) {
        console.log(`📭 No new changes for ${emailAddress} - history ID unchanged`);
        return;
      }
      
      // Get the recent changes using the PREVIOUS history ID
      const history = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: startHistoryId,
        maxResults: 10
      });
      
      if (history.data.history) {
        console.log(`📝 Found ${history.data.history.length} recent changes`);
        
        for (const historyItem of history.data.history) {
          console.log(`🔍 Processing history item: ${historyItem.id}`);
          console.log(`   Available properties: ${Object.keys(historyItem).join(', ')}`);
          
          if (historyItem.messagesAdded) {
            console.log(`   📨 Found ${historyItem.messagesAdded.length} new messages`);
            for (const messageAdded of historyItem.messagesAdded) {
              console.log(`   📧 Processing message ID: ${messageAdded.message.id}`);
              
              try {
                // Get comprehensive message details
                const messageDetails = await gmail.users.messages.get({
                  userId: 'me',
                  id: messageAdded.message.id,
                  format: 'full' // Get full message including body
                });
                
                console.log(`   ✅ Retrieved message details, calling logEmailDetails...`);
                // Log comprehensive email details
                await logEmailDetails(messageDetails.data, messageAdded.message);
                
              } catch (error) {
                console.log(`   ❌ Error getting message details: ${error.message}`);
              }
            }
          } else {
            console.log(`   📭 No messagesAdded in this history item`);
          }
          
          // Check for other types of changes
          if (historyItem.messagesDeleted) {
            console.log(`   🗑️  Found ${historyItem.messagesDeleted.length} deleted messages`);
          }
          if (historyItem.labelsAdded) {
            console.log(`   🏷️  Found ${historyItem.labelsAdded.length} label additions`);
          }
                     if (historyItem.labelsRemoved) {
             console.log(`   🏷️  Found ${historyItem.labelsRemoved.length} label removals`);
           }
         }
         
         // IMPORTANT: Save the new history ID for this email AFTER processing changes
         await saveHistoryId(emailAddress, newHistoryId);
         console.log(`✅ Successfully processed changes for ${emailAddress} and updated history ID to: ${newHistoryId}`);
         
       } else {
         console.log(`📭 No new messages in this notification for ${emailAddress}`);
         // Still update the history ID even if no changes
         await saveHistoryId(emailAddress, newHistoryId);
       }
     } else if (data.historyId && !data.emailAddress) {
       console.log('⚠️  Received notification without emailAddress field');
       console.log('   This might be an older notification format');
       console.log('   Raw data:', JSON.stringify(data, null, 2));
     } else {
       console.log('❓ Notification missing historyId or emailAddress');
       console.log('   Raw data:', JSON.stringify(data, null, 2));
     }
   } catch (error) {
     console.error('❌ Error processing notification:', error.message);
   }
 }

// Create Express server
async function createServer(gmail) {
  const app = express();
  
  // Middleware for Pub/Sub webhook verification
  app.use(bodyParser.raw({ type: 'application/json' }));
  
  // Health check endpoint
  app.get('/', (req, res) => {
    console.log('📊 Health check requested');
    res.json({ 
      status: 'Gmail notification server running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  // Gmail notification webhook endpoint
  app.post('/webhook', async (req, res) => {
    try {
      console.log('📥 Webhook received');
      // Parse Pub/Sub message
      const pubsubMessage = JSON.parse(req.body.toString());
      
      if (pubsubMessage.message) {
        await processNotification(gmail, pubsubMessage.message);
      }
      
      // Acknowledge the message
      res.status(200).send('OK');
    } catch (error) {
      console.error('❌ Webhook error:', error.message);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Error handling for Express
  app.use((err, req, res, next) => {
    console.error('❌ Express error:', err.message);
    res.status(500).send('Internal Server Error');
  });
  
  // Start server and return promise
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`🚀 Gmail notification server running on port ${PORT}`);
        console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
        console.log('💡 Tip: Use ngrok or similar to expose this for Gmail notifications');
        console.log('\n🔄 Server is now listening for Gmail notifications...');
        console.log('⚡ Process will stay alive - press Ctrl+C to stop');
        resolve(server);
      }
    });

    server.on('error', (err) => {
      console.error('❌ Server error:', err.message);
      reject(err);
    });
  });
}

// Main function
async function main() {
  try {
    console.log('🔐 Authenticating with Gmail...');
    const auth = await authorize();
    console.log('✅ Authentication completed');
    
    console.log('📊 Loading history IDs for all email accounts...');
    await loadAllHistoryIds();
    displayEmailStatus();
    
    console.log('🔄 Loading processed message IDs to prevent duplicates...');
    await loadProcessedMessageIds();
    
    console.log('🧹 Cleaning up stale locks from previous runs...');
    await cleanupStaleLocks();
    
    console.log('📧 Setting up Gmail watch...');
    const gmail = await startWatch(auth);
    console.log('✅ Gmail watch setup completed');
    
    console.log('🖥️  Starting notification server...');
    const server = await createServer(gmail);
    console.log('✅ Server started successfully');
    
    // Keep the process alive
    console.log('🔒 Main function completed - server should now run indefinitely');
    
  } catch (error) {
    console.error('❌ Error in main function:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  console.log('🔄 Server will continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('🔄 Server will continue running...');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Gmail notification server...');
  process.exit(0);
});

// Start the application
main().catch((error) => {
  console.error('❌ Fatal error in main:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});
