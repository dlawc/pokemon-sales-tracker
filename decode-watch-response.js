const fs = require('fs').promises;
const path = require('path');
const {google} = require('googleapis');

const TOKEN_PATH = path.join(__dirname, 'token.json');

// Sample watch response (replace with your actual response)
const watchResponse = {
  historyId: '5641874',
  expiration: '1753945824088'
};

async function decodeWatchResponse(response) {
  console.log('🔍 Gmail Watch Response Decoder');
  console.log('================================\n');
  
  // Decode expiration timestamp
  const expirationMs = parseInt(response.expiration);
  const expirationDate = new Date(expirationMs);
  const now = new Date();
  const timeUntilExpiry = expirationMs - now.getTime();
  const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
  const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));
  
  console.log('📊 Watch Information:');
  console.log(`   History ID: ${response.historyId}`);
  console.log(`   Expiration: ${expirationDate.toLocaleString()}`);
  console.log(`   Time until expiry: ${hoursUntilExpiry}h ${minutesUntilExpiry}m`);
  console.log(`   Raw expiration: ${response.expiration}ms\n`);
  
  // Explain what this means
  console.log('📝 What this means:');
  console.log('   • History ID: Starting point for tracking email changes');
  console.log('   • Expiration: When Gmail will stop sending notifications');
  console.log('   • You\'ll need to renew the watch before it expires\n');
  
  // Try to get recent emails using the history ID
  try {
    console.log('📧 Getting recent email activity...');
    
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    const auth = google.auth.fromJSON(credentials);
    const gmail = google.gmail({version:'v1', auth});
    
    // Get recent messages
    const messages = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
      q: 'in:inbox'
    });
    
    if (messages.data.messages && messages.data.messages.length > 0) {
      console.log(`✅ Found ${messages.data.messages.length} recent inbox messages:`);
      
      for (let i = 0; i < Math.min(3, messages.data.messages.length); i++) {
        const message = messages.data.messages[i];
        
        // Get message details
        const messageDetails = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date']
        });
        
        const headers = messageDetails.data.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const date = headers.find(h => h.name === 'Date')?.value || 'Unknown';
        
        console.log(`\n   📨 Message ${i + 1}:`);
        console.log(`      From: ${from}`);
        console.log(`      Subject: ${subject}`);
        console.log(`      Date: ${date}`);
        console.log(`      ID: ${message.id}`);
      }
    } else {
      console.log('📭 No recent messages found in inbox');
    }
    
    // Show how to use history API
    console.log('\n🔄 To get changes since this watch started:');
    console.log(`   Use: gmail.users.history.list({`);
    console.log(`     userId: 'me',`);
    console.log(`     startHistoryId: '${response.historyId}'`);
    console.log(`   })`);
    
  } catch (error) {
    console.log('❌ Could not get recent emails:', error.message);
  }
}

// You can replace this with your actual watch response
console.log('🔧 Using sample watch response. Replace with your actual response:');
console.log(JSON.stringify(watchResponse, null, 2));
console.log();

decodeWatchResponse(watchResponse).catch(console.error); 