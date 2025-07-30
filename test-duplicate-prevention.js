#!/usr/bin/env node
/**
 * Test Duplicate Prevention Mechanism
 * This script tests the duplicate detection for Telegram messages
 */

const fs = require('fs').promises;
const path = require('path');

const HISTORY_DIR = path.join(__dirname, 'history-data');
const PROCESSED_IDS_FILE = path.join(HISTORY_DIR, 'processed-message-ids.json');

// Test data
const testMessageIds = [
  'test-message-001',
  'test-message-002', 
  'test-message-003',
  'test-message-001', // duplicate
  'test-message-004',
  'test-message-002', // duplicate
];

// Duplicate detection system (from main code)
let processedMessageIds = new Set();

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

// Simulate email processing with duplicate detection
async function simulateEmailProcessing(messageId) {
  console.log(`\n📧 Processing message: ${messageId}`);
  
  if (isMessageAlreadyProcessed(messageId)) {
    console.log(`🔄 DUPLICATE DETECTED - Message ${messageId} already processed, skipping Telegram send`);
    return false; // Not sent to Telegram
  }
  
  console.log(`✅ NEW MESSAGE - Sending ${messageId} to Telegram`);
  console.log(`📲 [TELEGRAM] Message sent: ${messageId}`);
  
  await markMessageAsProcessed(messageId);
  console.log(`✅ Message ${messageId} marked as processed`);
  return true; // Sent to Telegram
}

// Test the duplicate prevention
async function testDuplicatePrevention() {
  console.log('🧪 Testing Duplicate Prevention Mechanism');
  console.log('=' * 50);
  
  // Load existing processed IDs
  await loadProcessedMessageIds();
  
  let sentCount = 0;
  let duplicateCount = 0;
  
  for (const messageId of testMessageIds) {
    const wasSent = await simulateEmailProcessing(messageId);
    
    if (wasSent) {
      sentCount++;
    } else {
      duplicateCount++;
    }
  }
  
  console.log('\n' + '=' * 50);
  console.log('📊 TEST RESULTS:');
  console.log(`   Total messages processed: ${testMessageIds.length}`);
  console.log(`   Sent to Telegram: ${sentCount}`);
  console.log(`   Duplicates prevented: ${duplicateCount}`);
  console.log(`   Total unique messages: ${processedMessageIds.size}`);
  
  console.log('\n✅ Test completed! Check the results above.');
  
  // Display current processed IDs
  console.log('\n📋 Currently tracked message IDs:');
  console.log([...processedMessageIds].map((id, i) => `   ${i + 1}. ${id}`).join('\n'));
}

// Clean up function to reset processed IDs
async function cleanUpProcessedIds() {
  try {
    await fs.unlink(PROCESSED_IDS_FILE);
    console.log('🧹 Processed message IDs file deleted');
    processedMessageIds = new Set();
  } catch (error) {
    console.log('📋 No processed IDs file to delete');
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--clean')) {
    console.log('🧹 Cleaning up processed message IDs...');
    await cleanUpProcessedIds();
    console.log('✅ Cleanup completed');
    return;
  }
  
  if (args.includes('--show')) {
    await loadProcessedMessageIds();
    console.log('📋 Currently tracked message IDs:');
    if (processedMessageIds.size === 0) {
      console.log('   (No processed messages yet)');
    } else {
      console.log([...processedMessageIds].map((id, i) => `   ${i + 1}. ${id}`).join('\n'));
    }
    return;
  }
  
  await testDuplicatePrevention();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  loadProcessedMessageIds,
  saveProcessedMessageIds,
  isMessageAlreadyProcessed,
  markMessageAsProcessed,
  cleanUpProcessedIds
}; 