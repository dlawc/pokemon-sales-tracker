const fs = require('fs').promises;
const path = require('path');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'cred.json');

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

// Simple test to verify authentication
async function testAuth(auth) {
  console.log('Testing Gmail authentication...');
  const gmail = google.gmail({version:'v1', auth});
  
  try {
    // Simple test - get user profile
    const profile = await gmail.users.getProfile({
      userId: 'me'
    });
    console.log('✅ Authentication successful!');
    console.log(`Email: ${profile.data.emailAddress}`);
    console.log(`Total messages: ${profile.data.messagesTotal}`);
    
    // Test reading recent emails
    const messages = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5
    });
    console.log(`✅ Can access messages. Found ${messages.data.messages?.length || 0} recent messages.`);
    
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
  }
}

authorize().then(testAuth).catch(console.error); 