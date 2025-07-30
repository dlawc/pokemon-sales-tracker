const fs = require('fs').promises;
const path = require('path');
const {google} = require('googleapis');

const TOKEN_PATH = path.join(__dirname, 'token.json');

async function searchEmails(searchQuery = 'pokemon', maxResults = 10) {
  try {
    console.log(`🔍 Searching for emails containing: "${searchQuery}"`);
    console.log('=' + '='.repeat(50 + searchQuery.length));
    
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    const auth = google.auth.fromJSON(credentials);
    const gmail = google.gmail({version:'v1', auth});
    
    // Search for messages
    const searchResults = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
      q: searchQuery // Gmail search syntax: 'pokemon', 'from:alibaba', 'subject:sale', etc.
    });
    
    if (!searchResults.data.messages || searchResults.data.messages.length === 0) {
      console.log(`📭 No emails found matching: "${searchQuery}"`);
      return;
    }
    
    console.log(`✅ Found ${searchResults.data.messages.length} emails:\n`);
    
    for (let i = 0; i < searchResults.data.messages.length; i++) {
      const message = searchResults.data.messages[i];
      
      // Get detailed message info
      const messageDetails = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date', 'To']
      });
      
      const headers = messageDetails.data.payload.headers;
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const date = headers.find(h => h.name === 'Date')?.value || 'Unknown';
      const to = headers.find(h => h.name === 'To')?.value || 'Unknown';
      
      console.log(`📨 Email ${i + 1}:`);
      console.log(`   From: ${from}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Date: ${date}`);
      console.log(`   Message ID: ${message.id}`);
      console.log(`   Snippet: ${messageDetails.data.snippet || 'No preview available'}`);
      console.log(''); // Empty line for spacing
    }
    
    console.log('🔍 Search Tips:');
    console.log('   • "pokemon" - Find emails containing pokemon');
    console.log('   • "from:alibaba" - Find emails from Alibaba');
    console.log('   • "subject:sale" - Find emails with "sale" in subject');
    console.log('   • "is:unread" - Find unread emails');
    console.log('   • "newer_than:1d" - Find emails from last day');
    console.log('   • "pokemon OR card" - Find emails with pokemon OR card');
    
  } catch (error) {
    console.error('❌ Error searching emails:', error.message);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const searchQuery = args[0] || 'pokemon';
const maxResults = parseInt(args[1]) || 10;

console.log('📧 Gmail Email Search Tool');
console.log('Usage: node search-emails.js "search term" [max_results]');
console.log('Examples:');
console.log('  node search-emails.js "pokemon"');
console.log('  node search-emails.js "from:alibaba" 5');
console.log('  node search-emails.js "subject:sale"');
console.log('');

searchEmails(searchQuery, maxResults).catch(console.error); 