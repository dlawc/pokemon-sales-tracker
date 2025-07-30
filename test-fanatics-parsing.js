// Test Fanatics sale email parsing
const fs = require('fs');

// Extract Fanatics sale details from email content
function extractFanaticsSaleDetails(emailContent) {
  const content = emailContent || '';
  
  // Look for product name (between <strong> tags or after ** in text)
  let productName = '';
  const productRegex = /<strong>([^<]*(?:Pokemon|Pokémon)[^<]*)<\/strong>/i;
  const productMatch = content.match(productRegex);
  if (productMatch) {
    productName = productMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/=/g, '') // Remove = characters from quoted-printable encoding
      .trim();
  }
  
  // If no HTML match, try text format
  if (!productName) {
    const textProductRegex = /\*([^*]*(?:Pokemon|Pokémon)[^*]*)\*/i;
    const textMatch = content.match(textProductRegex);
    if (textMatch) {
      productName = textMatch[1].trim();
    }
  }
  
  // Extract sale price - more robust regex to handle complex HTML structure
  let salePrice = '';
  const salePriceRegex = /SALE PRICE:[\s\S]*?>\$?([0-9,]+\.?[0-9]*)</i;
  const salePriceMatch = content.match(salePriceRegex);
  if (salePriceMatch) {
    salePrice = `$${salePriceMatch[1]}`;
  }
  
  // Extract seller fees - more robust regex to handle complex HTML structure
  let sellerFees = '';
  const sellerFeesRegex = /SELLER FEES:[\s\S]*?>\$?([0-9,]+\.?[0-9]*)</i;
  const sellerFeesMatch = content.match(sellerFeesRegex);
  if (sellerFeesMatch) {
    sellerFees = `$${sellerFeesMatch[1]}`;
  }
  
  // Extract total payout - more robust regex to handle HTML and <strong> tags
  let totalPayout = '';
  const totalPayoutRegex = /TOTAL PAYOUT:[\s\S]*?>(?:<strong>)?\$?([0-9,]+\.?[0-9]*)(?:<\/strong>)?</i;
  const totalPayoutMatch = content.match(totalPayoutRegex);
  if (totalPayoutMatch) {
    totalPayout = `$${totalPayoutMatch[1]}`;
  }
  
  return {
    productName,
    salePrice,
    sellerFees,
    totalPayout,
    isValid: !!(productName && salePrice && totalPayout)
  };
}

// Format Fanatics sale for Telegram
function formatFanaticsSale(saleDetails) {
  if (!saleDetails.isValid) return null;
  
  let message = '🎮💰 <b>POKEMON CARD SALE COMPLETED!</b> 💰🎮\n\n';
  message += `<b>${saleDetails.productName}</b>\n\n`;
  message += `<b>SALE PRICE:</b>\n${saleDetails.salePrice}\n`;
  message += `<b>SELLER FEES:</b>\n${saleDetails.sellerFees}\n`;
  message += `<b>TOTAL PAYOUT:</b>\n<b>${saleDetails.totalPayout}</b>\n\n`;
  message += `🎯 <i>Sale processed through Fanatics Collect</i>`;
  
  return message;
}

// Test with the actual email file
async function testFanaticsEmailParsing() {
  try {
    console.log('🧪 Testing Fanatics Sale Email Parsing');
    console.log('=====================================\n');
    
    // Read the actual .eml file
    const emailContent = fs.readFileSync('Your Buy Now Sale is Complete! 🎉.eml', 'utf8');
    
    console.log('📄 Email file loaded successfully');
    console.log(`📏 Email size: ${emailContent.length} characters\n`);
    
    // Test the parsing
    const saleDetails = extractFanaticsSaleDetails(emailContent);
    
    console.log('🔍 Extracted Sale Details:');
    console.log('---------------------------');
    console.log(`✅ Product Name: "${saleDetails.productName}"`);
    console.log(`💰 Sale Price: "${saleDetails.salePrice}"`);
    console.log(`💸 Seller Fees: "${saleDetails.sellerFees}"`);
    console.log(`💵 Total Payout: "${saleDetails.totalPayout}"`);
    console.log(`✔️  Is Valid: ${saleDetails.isValid}\n`);
    
    if (saleDetails.isValid) {
      console.log('📱 Formatted Telegram Message:');
      console.log('==============================');
      const telegramMessage = formatFanaticsSale(saleDetails);
      console.log(telegramMessage);
      console.log('\n✅ SUCCESS: Fanatics sale parsing works perfectly!');
      console.log('🎉 This message will be sent to your PokeSales Telegram group');
    } else {
      console.log('❌ FAILED: Could not extract all required sale details');
      console.log('🔧 Check the regex patterns and email structure');
    }
    
  } catch (error) {
    console.error('❌ Error testing email parsing:', error.message);
  }
}

// Run the test
testFanaticsEmailParsing(); 