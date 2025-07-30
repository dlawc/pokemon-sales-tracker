const {google} = require('googleapis');
const {GoogleAuth} = require('google-auth-library');

async function setupGmailPermissions() {
  console.log('🔧 Gmail Push Notification Setup Helper');
  console.log('======================================\n');
  
  console.log('To enable Gmail push notifications, you need to grant permissions to the Gmail API service account.\n');
  
  console.log('📋 REQUIRED STEPS:');
  console.log('1. Go to Google Cloud Console: https://console.cloud.google.com/');
  console.log('2. Navigate to: Pub/Sub > Topics');
  console.log('3. Click on your topic: gmail-watch-topic');
  console.log('4. Click "PERMISSIONS" tab');
  console.log('5. Click "ADD PRINCIPAL"');
  console.log('6. Add this email: gmail-api@system.gserviceaccount.com');
  console.log('7. Select role: "Pub/Sub Publisher"');
  console.log('8. Click "SAVE"\n');
  
  console.log('🔄 Alternative: Use this gcloud command:');
  console.log(`gcloud pubsub topics add-iam-policy-binding gmail-watch-topic \\
  --member="serviceAccount:gmail-api@system.gserviceaccount.com" \\
  --role="roles/pubsub.publisher" \\
  --project=pokemon77\n`);
  
  console.log('📧 Your OAuth user also needs permissions:');
  try {
    // Load OAuth credentials to get the user email
    const fs = require('fs').promises;
    const tokenContent = await fs.readFile('token.json');
    const token = JSON.parse(tokenContent);
    console.log('   Add your OAuth user email to the topic with "Pub/Sub Subscriber" role');
    console.log('   (This will be displayed after OAuth flow completes)\n');
  } catch (error) {
    console.log('   Complete OAuth flow first, then check token.json for your email\n');
  }
  
  console.log('✅ After completing these steps, run: node index.js');
}

// Helper function to check current topic permissions
async function checkTopicPermissions() {
  try {
    const auth = new GoogleAuth({
      keyFile: 'service-account.json',
      scopes: ['https://www.googleapis.com/auth/pubsub']
    });
    
    const pubsub = google.pubsub({version: 'v1', auth});
    
    const topicName = 'projects/pokemon77/topics/gmail-watch-topic';
    
    console.log('🔍 Checking current topic permissions...');
    
    const [policy] = await pubsub.projects.topics.getIamPolicy({
      resource: topicName
    });
    
    console.log('Current IAM Policy:');
    console.log(JSON.stringify(policy.data, null, 2));
    
  } catch (error) {
    console.log('❌ Could not check permissions (this is normal if service account lacks admin access)');
    console.log('Error:', error.message);
  }
}

// Run setup
setupGmailPermissions().catch(console.error);

// Uncomment the line below if you want to check current permissions:
// checkTopicPermissions().catch(console.error); 