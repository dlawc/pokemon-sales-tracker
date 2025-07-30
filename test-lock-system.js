#!/usr/bin/env node
/**
 * Test Lock System for Race Condition Prevention
 * This script simulates multiple processes trying to process the same email simultaneously
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const HISTORY_DIR = path.join(__dirname, 'history-data');
const LOCKS_DIR = path.join(HISTORY_DIR, 'locks');
const LOCK_TIMEOUT_MS = 30000; // 30 seconds

// Copy lock functions from main code for testing
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
    processName: processName,
    hostname: require('os').hostname()
  };
  
  try {
    // Check if lock file already exists
    const lockFileContent = await fs.readFile(lockFilePath, 'utf8');
    const lockData = JSON.parse(lockFileContent);
    const lockAge = Date.now() - lockData.timestamp;
    
    if (lockAge > LOCK_TIMEOUT_MS) {
      console.log(`[${processName}] 🔓 Found stale lock for ${messageId} (${Math.round(lockAge/1000)}s old), removing...`);
      await fs.unlink(lockFilePath);
    } else {
      console.log(`[${processName}] 🔒 Message ${messageId} is already locked by another process`);
      return false;
    }
  } catch (error) {
    // Lock file doesn't exist or is corrupted, proceed to create it
  }
  
  try {
    await fs.writeFile(lockFilePath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
    console.log(`[${processName}] ✅ Successfully acquired lock for ${messageId}`);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      console.log(`[${processName}] 🔒 Lock already exists for ${messageId}`);
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
    console.log(`[${processName}] 🔓 Released lock for ${messageId}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.log(`[${processName}] ⚠️  Error releasing lock: ${error.message}`);
    }
  }
}

// Simulate email processing with lock
async function simulateEmailProcessing(messageId, processName, delay = 0) {
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  console.log(`[${processName}] 📧 Attempting to process message: ${messageId}`);
  
  // Try to acquire lock
  const lockAcquired = await acquireLock(messageId, processName);
  
  if (!lockAcquired) {
    console.log(`[${processName}] ❌ Could not acquire lock - another process is handling this message`);
    return { processed: false, reason: 'lock_failed' };
  }
  
  try {
    console.log(`[${processName}] ⚡ Processing email ${messageId}...`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
    
    console.log(`[${processName}] 📲 [SIMULATED] Sending ${messageId} to Telegram`);
    console.log(`[${processName}] ✅ Processing completed for ${messageId}`);
    
    return { processed: true, reason: 'success' };
    
  } catch (error) {
    console.log(`[${processName}] ❌ Error processing ${messageId}: ${error.message}`);
    return { processed: false, reason: 'error' };
  } finally {
    // Always release lock
    await releaseLock(messageId, processName);
  }
}

// Test race condition scenario
async function testRaceCondition() {
  console.log('🧪 Testing Lock System for Race Conditions');
  console.log('=' * 50);
  
  const testMessageId = 'test-race-message-001';
  
  console.log(`\n🔄 Simulating 5 concurrent processes trying to process: ${testMessageId}`);
  console.log('Only ONE should succeed in processing, others should be blocked by locks.\n');
  
  // Start 5 concurrent "processes" trying to handle the same message
  const processes = [
    simulateEmailProcessing(testMessageId, 'Process-A', 0),
    simulateEmailProcessing(testMessageId, 'Process-B', 100),
    simulateEmailProcessing(testMessageId, 'Process-C', 200),
    simulateEmailProcessing(testMessageId, 'Process-D', 50),
    simulateEmailProcessing(testMessageId, 'Process-E', 150)
  ];
  
  // Wait for all processes to complete
  const results = await Promise.all(processes);
  
  // Analyze results
  const successCount = results.filter(r => r.processed).length;
  const lockFailedCount = results.filter(r => r.reason === 'lock_failed').length;
  
  console.log('\n' + '=' * 50);
  console.log('📊 RACE CONDITION TEST RESULTS:');
  console.log(`   Total processes: ${results.length}`);
  console.log(`   Successfully processed: ${successCount}`);
  console.log(`   Blocked by locks: ${lockFailedCount}`);
  console.log(`   Errors: ${results.filter(r => r.reason === 'error').length}`);
  
  if (successCount === 1) {
    console.log('\n✅ LOCK SYSTEM WORKING CORRECTLY!');
    console.log('   Only one process was able to handle the message.');
  } else {
    console.log('\n❌ LOCK SYSTEM FAILED!');
    console.log(`   Expected 1 success, got ${successCount}.`);
  }
  
  return successCount === 1;
}

// Test lock timeout functionality
async function testLockTimeout() {
  console.log('\n🧪 Testing Lock Timeout Functionality');
  console.log('-' * 30);
  
  const testMessageId = 'test-timeout-message-001';
  
  // Create a "stale" lock (simulate crashed process)
  await ensureLocksDirectory();
  const lockFilePath = getLockFilePath(testMessageId);
  const staleLockData = {
    messageId: testMessageId,
    timestamp: Date.now() - (LOCK_TIMEOUT_MS + 5000), // 5 seconds past timeout
    processId: 99999,
    processName: 'crashed-process'
  };
  
  await fs.writeFile(lockFilePath, JSON.stringify(staleLockData, null, 2));
  console.log(`📄 Created stale lock for ${testMessageId}`);
  
  // Try to acquire lock - should succeed by removing stale lock
  const result = await simulateEmailProcessing(testMessageId, 'Recovery-Process');
  
  if (result.processed) {
    console.log('✅ Lock timeout working correctly - stale lock was cleaned up');
    return true;
  } else {
    console.log('❌ Lock timeout failed - could not clean up stale lock');
    return false;
  }
}

// Clean up test locks
async function cleanupTestLocks() {
  try {
    const lockFiles = await fs.readdir(LOCKS_DIR);
    let cleaned = 0;
    
    for (const file of lockFiles) {
      if (file.startsWith('test-') && file.endsWith('.lock')) {
        await fs.unlink(path.join(LOCKS_DIR, file));
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} test lock file(s)`);
    }
  } catch (error) {
    // Directory might not exist
  }
}

// Main test function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--clean')) {
    console.log('🧹 Cleaning up test locks...');
    await cleanupTestLocks();
    console.log('✅ Cleanup completed');
    return;
  }
  
  try {
    console.log('🔧 Lock System Test Suite');
    console.log('========================\n');
    
    // Clean up any existing test locks
    await cleanupTestLocks();
    
    // Test 1: Race condition prevention
    const raceTestPassed = await testRaceCondition();
    
    // Test 2: Lock timeout handling
    const timeoutTestPassed = await testLockTimeout();
    
    // Final results
    console.log('\n' + '=' * 50);
    console.log('🏁 FINAL TEST RESULTS:');
    console.log(`   Race condition test: ${raceTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Lock timeout test: ${timeoutTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (raceTestPassed && timeoutTestPassed) {
      console.log('\n🎉 ALL TESTS PASSED! Lock system is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the lock system implementation.');
    }
    
    // Clean up
    await cleanupTestLocks();
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    await cleanupTestLocks();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  acquireLock,
  releaseLock,
  simulateEmailProcessing,
  cleanupTestLocks
}; 