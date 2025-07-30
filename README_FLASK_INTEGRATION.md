# Email LLM Processor - Flask Integration with Groq & Google Sheets

This integration allows the JavaScript email automation system to send parsed email data to a Python Flask server for LLM analysis using Groq, and automatically appends sale information to Google Sheets.

## 🚀 Setup Instructions

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Up Google Sheets Service Account

1. Create a Google Cloud Project
2. Enable Google Sheets API
3. Create a service account and download the JSON key file
4. Save the JSON file as `service_account.json` in the project directory
5. Share your Google Sheet with the service account email

### 3. Configure Google Sheet

Make sure your Google Sheet has the following structure in Sheet5:
- Column A: Timestamp
- Column B: Pokemon Name
- Column C: Payout Amount
- Column D: Email From
- Column E: Email Subject

The system will automatically append new rows with sale information.

### 4. Start the Flask Server

```bash
python flask_server.py
```

The server will start on `http://localhost:5000`

### 5. Test the Integration

You can test the Flask server with:

```bash
curl -X POST http://localhost:5000/test
```

Or test the health endpoint:
```bash
curl http://localhost:5000/health
```

## 🔄 How It Works

1. **JavaScript** receives email notifications from Gmail
2. **JavaScript** parses emails using existing functions
3. **JavaScript** sends parsed data to Flask server at `http://localhost:5000/process`
4. **Flask** uses Groq LLM to extract Pokemon name and payout amount
5. **Flask** appends the extracted data as a new row to Google Sheet
6. **Flask** returns analysis back to JavaScript
7. **JavaScript** continues with Telegram notifications

## 📊 Data Flow

### JavaScript → Flask
```javascript
{
  "email_details": {
    "from": "cs@email.fanaticscollect.com",
    "subject": "Your Buy Now Sale is Complete! 🎉",
    "body": { "textBody": "...", "htmlBody": "..." },
    "attachments": []
  },
  "parsed_data": {
    "emailType": "fanatics_sale",
    "isFanaticsSale": true,
    "saleDetails": {
      "productName": "Pokemon Charizard VMAX",
      "salePrice": "$150.00",
      "totalPayout": "$135.00"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Flask → Groq LLM → Google Sheets → Response
```json
{
  "status": "success",
  "llm_analysis": {
    "email_type": "pokemon_sale",
    "confidence": 0.95,
    "extracted_data": {
      "pokemon_name": "Charizard VMAX",
      "payout": "135",
      "timestamp": "2024-01-15 10:30:45",
      "email_from": "cs@email.fanaticscollect.com",
      "email_subject": "Your Buy Now Sale is Complete! 🎉"
    },
    "key_insights": [
      "Pokemon card sold: Charizard VMAX",
      "Payout amount: $135",
      "Sale recorded at: 2024-01-15 10:30:45"
    ],
    "financial_data": {
      "payout": "135",
      "currency": "USD"
    },
    "product_info": {
      "product_name": "Charizard VMAX",
      "category": "pokemon_card"
    },
    "recommendations": [
      "Sale recorded successfully in Google Sheets",
      "Track similar sales for market analysis"
    ],
    "risk_assessment": "low",
    "market_analysis": "Sale completed and recorded"
  }
}
```

## 🔗 Endpoints

- `POST /process` - Process email data with Groq LLM and append to Google Sheets
- `GET /health` - Health check
- `POST /test` - Test with sample data

## 🤖 LLM Features

### Groq Integration
- Uses `deepseek-r1-distill-llama-70b` model
- Extracts Pokemon name and payout amount from email content
- Simple and efficient data extraction

### Google Sheets Integration
- Automatically appends new rows to Sheet5
- Includes timestamp, Pokemon name, payout, email details
- No need to read existing data or match rows

## 🛠️ Troubleshooting

### Common Issues:

1. **Google Sheets Connection Errors**: 
   - Check `service_account.json` file exists
   - Verify service account has access to the sheet
   - Ensure sheet URL is correct

2. **Groq API Errors**: 
   - Check API key is valid
   - Verify model name is correct

3. **CORS Errors**: Make sure Flask-CORS is installed and enabled

4. **Connection Refused**: Ensure Flask server is running on port 5000

### Debug Mode:

The Flask server runs in debug mode by default. Check the console for detailed error messages.

## 📝 Example Usage

The JavaScript code will automatically send data to the Flask server when emails are processed. You'll see output like:

```
🤖 Sending email to Flask LLM processor...
✅ Flask LLM processor completed successfully.
📊 LLM Analysis Summary: {"email_type": "pokemon_sale", "confidence": 0.95, ...}
📧 Processing email body: Your Pokemon Charizard VMAX sale is complete...
🤖 LLM extracted: {'pokemon_name': 'Charizard VMAX', 'payout': '135'}
✅ New sale appended to Google Sheet: Charizard VMAX - $135
```

## 🔧 Customization

You can modify:
- **LLM prompts** in `flask_server.py` for different extraction patterns
- **Google Sheet structure** by updating the row_data array
- **Error handling** for different failure scenarios
- **Analysis output** format for different use cases

## 📊 Google Sheet Structure

Your Google Sheet will automatically receive new rows with this structure in Sheet5:

| Timestamp | Pokemon Name | Payout Amount | Email From | Email Subject |
|-----------|--------------|---------------|------------|---------------|
| 2024-01-15 10:30:45 | Charizard VMAX | 135 | cs@email.fanaticscollect.com | Your Buy Now Sale is Complete! 🎉 |
| 2024-01-15 11:15:22 | Pikachu V | 75 | cs@email.fanaticscollect.com | Your Buy Now Sale is Complete! 🎉 |

The system will automatically append new rows when a sale is detected. 