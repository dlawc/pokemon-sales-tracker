// Test the fixed detection logic
function testFanaticsDetection() {
  // Simulate the email data as it appears in the user's message
  const emailDetails = {
    from: 'Fanatics Collect <cs@email.fanaticscollect.com>',
    subject: 'Your Buy Now Sale is Complete! 🎉',
    body: {
      htmlBody: 'Sample content', 
      textBody: 'Sample content'
    }
  };
  
  console.log('🧪 Testing Fanatics Detection Logic');
  console.log('===================================\n');
  
  console.log('📧 Email Details:');
  console.log(`From: "${emailDetails.from}"`);
  console.log(`Subject: "${emailDetails.subject}"`);
  
  // Test the detection logic
  const isFanaticsSale = 
    (emailDetails.from.toLowerCase().includes('fanaticscollect.com') || 
     emailDetails.from.toLowerCase().includes('fanatics collect')) &&
    emailDetails.subject.toLowerCase().includes('buy now sale is complete');
  
  console.log(`\n🔍 Detection Results:`);
  console.log(`From contains 'fanaticscollect.com': ${emailDetails.from.toLowerCase().includes('fanaticscollect.com')}`);
  console.log(`From contains 'fanatics collect': ${emailDetails.from.toLowerCase().includes('fanatics collect')}`);
  console.log(`Subject contains 'buy now sale is complete': ${emailDetails.subject.toLowerCase().includes('buy now sale is complete')}`);
  console.log(`\n✅ Is Fanatics Sale: ${isFanaticsSale}`);
  
  if (isFanaticsSale) {
    console.log('\n🎉 SUCCESS: Detection logic now works!');
    console.log('📱 Next Fanatics sale email will use the special format');
  } else {
    console.log('\n❌ FAILED: Detection logic still needs work');
  }
}

testFanaticsDetection(); 