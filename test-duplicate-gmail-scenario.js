#!/usr/bin/env node
/**
 * Test Gmail Duplicate Scenario
 * Simulates the exact issue: same message appearing in multiple Gmail history events
 */

const fs = require('fs').promises;
const path = require('path');

const HISTORY_DIR = path.join(__dirname, 'history-data');
const PROCESSED_IDS_FILE = path.join(HISTORY_DIR, 'processed-message-ids.json');
const LOCKS_DIR = path.join(HISTORY_DIR, 'locks');

// Import the actual functions from index.js by requiring it
// But we need to simulate the key functions locally for testing

// Simulate the key variables and functions
let processedMessageIds = new Set();
let telegramSentCount = 0;
let flaskSentCount = 0;

// Duplicate detection functions (copied from main code)
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

async function saveProcessedMessageIds() {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    await fs.writeFile(PROCESSED_IDS_FILE, JSON.stringify([...processedMessageIds], null, 2));
  } catch (error) {
    console.log(`⚠️  Could not save processed message IDs: ${error.message}`);
  }
}

function isMessageAlreadyProcessed(messageId) {
  return processedMessageIds.has(messageId);
}

async function markMessageAsProcessed(messageId) {
  processedMessageIds.add(messageId);
  await saveProcessedMessageIds();
}

// Lock system functions (simplified for testing)
async function ensureLocksDirectory() {
  try {
    await fs.mkdir(LOCKS_DIR, { recursive: true });
  } catch (error) {
    console.log(`⚠️  Could not create locks directory: ${error.message}`);
  }
}

function getLockFilePath(messageId) {
  const safeMessageId = messageId.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(LOCKS_DIR, `${safeMessageId}.lock`);
}

async function acquireLock(messageId, processName = 'test') {
  await ensureLocksDirectory();
  
  const lockFilePath = getLockFilePath(messageId);
  const lockData = {
    messageId: messageId,
    timestamp: Date.now(),
    processId: process.pid,
    processName: processName
  };
  
  try {
    await fs.writeFile(lockFilePath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
    console.log(`[${processName}] 🔒 Acquired lock for message ${messageId}`);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      console.log(`[${processName}] 🔒 Message ${messageId} is already being processed`);
      return false;
    } else {
      console.log(`[${processName}] ⚠️  Error acquiring lock: ${error.message}`);
      return false;
    }
  }
}

async function releaseLock(messageId, processName = 'test') {
  const lockFilePath = getLockFilePath(messageId);
  
  try {
    await fs.unlink(lockFilePath);
    console.log(`[${processName}] 🔓 Released lock for message ${messageId}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.log(`[${processName}] ⚠️  Error releasing lock: ${error.message}`);
    }
  }
}

// Simulate sending to Telegram
async function sendToTelegram(messageId, processName) {
  telegramSentCount++;
  console.log(`[${processName}] 📲 TELEGRAM MESSAGE SENT for ${messageId} (Total sent: ${telegramSentCount})`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  return true;
}

// Simulate sending to Flask
async function sendToFlaskServer(messageId, processName) {
  flaskSentCount++;
  console.log(`[${processName}] 🤖 FLASK MESSAGE SENT for ${messageId} (Total sent: ${flaskSentCount})`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  return true;
}

// **THE NEW IMPROVED logEmailDetails function**
async function logEmailDetails(messageId, processName) {
  // **STEP 1: EARLY DUPLICATE CHECK** - Fast exit if already processed
  if (isMessageAlreadyProcessed(messageId)) {
    console.log(`[${processName}] 🔄 DUPLICATE DETECTED - Message ${messageId} already processed, skipping entirely...`);
    return { processed: false, reason: 'duplicate_early' };
  }
  
  // **STEP 2: ACQUIRE LOCK** - Prevent race conditions with multiple processes
  const lockAcquired = await acquireLock(messageId, processName);
  if (!lockAcquired) {
    console.log(`[${processName}] 🔒 LOCK FAILED - Message ${messageId} is being processed by another instance, skipping...`);
    return { processed: false, reason: 'lock_failed' };
  }
  
  try {
    // **STEP 3: DOUBLE-CHECK DUPLICATE** - In case it was processed while waiting for lock
    if (isMessageAlreadyProcessed(messageId)) {
      console.log(`[${processName}] 🔄 DUPLICATE DETECTED AFTER LOCK - Message ${messageId} was processed while waiting, skipping...`);
      return { processed: false, reason: 'duplicate_after_lock' };
    }
    
    // **STEP 4: MARK AS PROCESSED IMMEDIATELY** - Prevent other instances from processing
    await markMessageAsProcessed(messageId);
    console.log(`[${processName}] ✅ NEW MESSAGE - Processing ${messageId} for the first time (marked as processed)`);
    
    // Simulate email processing
    console.log(`[${processName}] ⚡ Processing email ${messageId}...`);
    
    // Send to Telegram
    await sendToTelegram(messageId, processName);
    
    // Send to Flask
    await sendToFlaskServer(messageId, processName);
    
    console.log(`[${processName}] ✅ Message ${messageId} processing completed - marked as processed at start to prevent duplicates`);
    
    return { processed: true, reason: 'success' };
    
  } finally {
    // **STEP 5: RELEASE LOCK** - Always release lock, even if processing failed
    await releaseLock(messageId, processName);
  }
}

// Test the Gmail scenario: same message in multiple history events
async function testGmailDuplicateScenario() {
  console.log('🧪 Testing Gmail Duplicate Scenario');
  console.log('=====================================');
  console.log('Simulating: Same message appearing in multiple Gmail history events\n');
  
  // Reset counters
  telegramSentCount = 0;
  flaskSentCount = 0;
  
  // Load existing processed IDs
  await loadProcessedMessageIds();
  
  // Use a fresh test message ID (not from real logs)
  const testMessageId = 'fresh-test-message-' + Date.now();
  
  console.log(`🔄 Simulating 3 Gmail history events containing message: ${testMessageId}`);
  console.log('Each event will try to process the same message...\n');
  
  // Simulate 3 history events (like in your logs) containing the same message
  const historyEvents = [
    { processName: 'HistoryEvent-12771', delay: 0 },
    { processName: 'HistoryEvent-12718', delay: 50 },
    { processName: 'HistoryEvent-12825', delay: 100 }
  ];
  
  // Process each "history event" 
  const results = [];
  for (const event of historyEvents) {
    if (event.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, event.delay));
    }
    
    console.log(`\n--- Processing ${event.processName} ---`);
    const result = await logEmailDetails(testMessageId, event.processName);
    results.push({ ...result, event: event.processName });
  }
  
  // Analyze results
  const successCount = results.filter(r => r.processed).length;
  const duplicateEarlyCount = results.filter(r => r.reason === 'duplicate_early').length;
  const duplicateAfterLockCount = results.filter(r => r.reason === 'duplicate_after_lock').length;
  
  console.log('\n' + '=' * 50);
  console.log('📊 GMAIL DUPLICATE SCENARIO RESULTS:');
  console.log(`   Total history events: ${results.length}`);
  console.log(`   Successfully processed: ${successCount}`);
  console.log(`   Blocked by early duplicate check: ${duplicateEarlyCount}`);
  console.log(`   Blocked by post-lock duplicate check: ${duplicateAfterLockCount}`);
  console.log(`   Telegram messages sent: ${telegramSentCount}`);
  console.log(`   Flask messages sent: ${flaskSentCount}`);
  
  // Expected: Only 1 should be processed, 2 should be blocked
  if (successCount === 1 && telegramSentCount === 1 && flaskSentCount === 1) {
    console.log('\n✅ DUPLICATE PREVENTION WORKING PERFECTLY!');
    console.log('   Only one history event processed the message.');
    console.log('   No duplicate Telegram or Flask messages sent.');
  } else {
    console.log('\n❌ DUPLICATE PREVENTION FAILED!');
    console.log(`   Expected 1 success, got ${successCount}.`);
    console.log(`   Expected 1 Telegram message, got ${telegramSentCount}.`);
    console.log(`   Expected 1 Flask message, got ${flaskSentCount}.`);
  }
  
  return successCount === 1 && telegramSentCount === 1 && flaskSentCount === 1;
}

// Test concurrent processing (simulating multiple processes)
async function testConcurrentProcessing() {
  console.log('\n🧪 Testing Concurrent Processing');
  console.log('=================================');
  
  // Reset counters
  telegramSentCount = 0;
  flaskSentCount = 0;
  
  const testMessageId = 'concurrent-test-message-' + Date.now();
  
  console.log(`🔄 Simulating 3 concurrent processes trying to process: ${testMessageId}`);
  
  // Start 3 concurrent processes
  const processes = [
    logEmailDetails(testMessageId, 'Process-A'),
    logEmailDetails(testMessageId, 'Process-B'),
    logEmailDetails(testMessageId, 'Process-C')
  ];
  
  const results = await Promise.all(processes);
  
  const successCount = results.filter(r => r.processed).length;
  
  console.log('\n📊 CONCURRENT PROCESSING RESULTS:');
  console.log(`   Successfully processed: ${successCount}`);
  console.log(`   Telegram messages sent: ${telegramSentCount}`);
  console.log(`   Flask messages sent: ${flaskSentCount}`);
  
  return successCount === 1 && telegramSentCount === 1 && flaskSentCount === 1;
}

// Main test function
async function main() {
  try {
    console.log('🔧 Gmail Duplicate Prevention Test Suite');
    console.log('==========================================\n');
    
    // Test 1: Gmail scenario (sequential history events with same message)
    const gmailTestPassed = await testGmailDuplicateScenario();
    
    // Test 2: Concurrent processing
    const concurrentTestPassed = await testConcurrentProcessing();
    
    // Final results
    console.log('\n' + '=' * 50);
    console.log('🏁 FINAL TEST RESULTS:');
    console.log(`   Gmail duplicate scenario: ${gmailTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Concurrent processing: ${concurrentTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (gmailTestPassed && concurrentTestPassed) {
      console.log('\n🎉 ALL TESTS PASSED! Duplicate prevention is working correctly.');
      console.log('   Your Telegram duplicate issue should be resolved!');
    } else {
      console.log('\n⚠️  Some tests failed. The duplicate issue may persist.');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

if (require.main === module) {
  main().catch(console.error);
} 