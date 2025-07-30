const fs = require('fs').promises;
const path = require('path');
const {google} = require('googleapis');

const TOKEN_PATH = path.join(__dirname, 'token.json');

async function showUserEmail() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    
    const auth = google.auth.fromJSON(credentials);
    const gmail = google.gmail({version:'v1', auth});
    
    const profile = await gmail.users.getProfile({
      userId: 'me'
    });
    
    console.log('📧 Your OAuth user email address:');
    console.log(`   ${profile.data.emailAddress}`);
    console.log('\n🔧 Add this email to your Pub/Sub topic with "Pub/Sub Subscriber" role');
    console.log('   (In addition to the gmail-api@system.gserviceaccount.com with Publisher role)');
    
  } catch (error) {
    console.error('❌ Could not get user email:', error.message);
  }
}

showUserEmail(); 