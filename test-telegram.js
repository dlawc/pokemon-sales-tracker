// Send message to Telegram group
async function sendToTelegram(message, options = {}) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
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
      console.log('✅ Successfully sent to Telegram PokeSales group');
      console.log('📨 Message ID:', result.result.message_id);
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

// Test with sample Pokemon email
async function testPokemonEmail() {
  const sampleMessage = `🎮⚡ <b>POKEMON EMAIL ALERT!</b> ⚡🎮

<b>From:</b> Fanatics Collect cs@email.fanaticscollect.com
<b>To:</b> pokeemail77@gmail.com
<b>Subject:</b> Your Buy Now Sale is Complete! 🎉
<b>Date:</b> Thu, 24 Jul 2025 03:55:10 +0000 (UTC)

<b>Content Preview:</b>
<i>Funds will be applied to your account soon. Great news, your Buy Now sale is complete and funds will be applied to your Fanatics Collect account within 1-2 business days.</i>

<b>📊 Info:</b> 12534 bytes | ID: 1983a922...`;

  console.log('🧪 Testing Telegram integration...');
  console.log('📧 Sending sample Pokemon email notification...\n');
  
  const success = await sendToTelegram(sampleMessage);
  
  if (success) {
    console.log('\n🎉 Telegram integration test PASSED!');
    console.log('💡 Your Pokemon email notifications will now be sent to PokeSales group');
  } else {
    console.log('\n❌ Telegram integration test FAILED!');
    console.log('🔧 Check your bot token and chat ID');
  }
}

// Test with regular email
async function testRegularEmail() {
  const sampleMessage = `📧 <b>New Email Received</b>

<b>From:</b> LinkedIn Job Alerts jobalerts-noreply@linkedin.com
<b>To:</b> pokeemail77@gmail.com
<b>Subject:</b> Java Software Engineer: New opportunities
<b>Date:</b> Thu, 24 Jul 2025 05:36:24 +0000 (UTC)

<b>Content Preview:</b>
<i>New job opportunities matching your profile. Software Engineer positions available at leading tech companies...</i>

<b>📊 Info:</b> 8432 bytes | ID: 1983aeed...`;

  console.log('📧 Sending sample regular email notification...\n');
  
  const success = await sendToTelegram(sampleMessage);
  
  if (success) {
    console.log('\n✅ Regular email test PASSED!');
  } else {
    console.log('\n❌ Regular email test FAILED!');
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Gmail → Telegram Integration Test');
  console.log('===================================\n');
  
  await testPokemonEmail();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testRegularEmail();
  
  console.log('\n🎯 Integration tests complete!');
  console.log('🔄 Ready to start your enhanced Gmail monitoring server');
}

runTests(); 