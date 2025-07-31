from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime
from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
import gspread
from google.oauth2.service_account import Credentials

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for cross-origin requests


# Create the LLM with optional reasoning suppression
llm = ChatGroq(
    api_key=api_key,
    model="deepseek-r1-distill-llama-70b",
    temperature=0.3,
    reasoning_format="hidden"
)

# Define the structured output schema
class PayoutInfo(BaseModel):
    pokemon_name: str = Field(..., description="Name of the Pokémon mentioned")
    payout: str = Field(..., description="Total payout or amount in dollars")

# Initialize parser
payout_parser = JsonOutputParser(pydantic_object=PayoutInfo)

# Create the prompt
payout_prompt = ChatPromptTemplate.from_messages([
    ("system", 
     "You will extract structured info from an email body. "
     "Return a JSON object with the Pokémon name and the total payout (dollar amount). "
     "Return the JSON using the exact field names: pokemon_name, payout. "
     "NOTE: For the pokemon name, return the entire string and title of the pokemon name. "
     "For example, if the email body mentions 'Hydrapple #68 Heat Wave Arena CGC 10 NM-MT+' and '150', return "
     "'pokemon_name': 'Hydrapple #68 Heat Wave Arena CGC 10 NM-MT+', 'payout': '150'"),
    ("user", "{email_body}")
])

# Create chain
payout_chain = payout_prompt | llm | payout_parser

# Initialize Google Sheets connection
def initialize_google_sheets():
    """Initialize Google Sheets connection"""
    try:
        scope = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        
        # Check if service account file exists
        if not os.path.exists("service_account.json"):
            print("❌ service_account.json file not found!")
            return None, None
        
        # Use the modern Google auth library
        creds = Credentials.from_service_account_file("service_account.json", scopes=scope)
        client = gspread.authorize(creds)
        
        spreadsheet = client.open_by_url("")
        worksheet = spreadsheet.worksheet("Sale List")
        
        # Test the connection by trying to read the first row
        try:
            worksheet.row_count
            print("✅ Google Sheets connection successful")
        except Exception as e:
            print(f"❌ Google Sheets connection test failed: {str(e)}")
            return None, None
        
        return client, worksheet
        
    except Exception as e:
        print(f"❌ Error initializing Google Sheets: {str(e)}")
        return None, None

def test_google_sheets_connection():
    """Test Google Sheets connection and return status"""
    try:
        client, worksheet = initialize_google_sheets()
        if worksheet is not None:
            # Try to append a test row
            test_row = [
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "TEST_POKEMON",
                "0",
            ]
            worksheet.append_row(test_row)
            print("✅ Google Sheets append test successful")
            return True
        else:
            print("❌ Google Sheets connection failed")
            return False
    except Exception as e:
        print(f"❌ Google Sheets test failed: {str(e)}")
        return False

def analyze_with_llm(email_details, parsed_data):
    """Analyze the email data with LLM and append to Google Sheets"""
    try:
        # Extract email body content
        email_body = email_details.get('body', {}).get('textBody', '') or email_details.get('body', {}).get('htmlBody', '')
        
        if not email_body:
            return {
                "email_type": "no_content",
                "confidence": 0.0,
                "error": "No email body content found"
            }
        
        print(f"📧 Processing email body: {email_body[:200]}...")
        
        # Extract payout information using LLM with retry logic
        max_retries = 3
        email_response = None
        
        for attempt in range(max_retries):
            try:
                email_response = payout_chain.invoke({"email_body": email_body})
                print(f"🤖 LLM extracted (attempt {attempt + 1}): {email_response}")
                
                # Validate the response
                if not email_response or not email_response.get("pokemon_name") or not email_response.get("payout"):
                    raise ValueError("Invalid LLM response - missing pokemon_name or payout")
                
                break  # Success, exit retry loop
                
            except Exception as e:
                print(f"❌ LLM extraction attempt {attempt + 1} failed: {str(e)}")
                if attempt == max_retries - 1:  # Last attempt
                    return {
                        "email_type": "llm_error",
                        "confidence": 0.0,
                        "error": f"LLM extraction failed after {max_retries} attempts: {str(e)}"
                    }
                continue
        
        # Initialize Google Sheets with retry logic
        client, worksheet = None, None
        for attempt in range(max_retries):
            try:
                client, worksheet = initialize_google_sheets()
                if worksheet is not None:
                    break
                else:
                    raise Exception("Failed to initialize Google Sheets")
            except Exception as e:
                print(f"❌ Google Sheets connection attempt {attempt + 1} failed: {str(e)}")
                if attempt == max_retries - 1:  # Last attempt
                    return {
                        "email_type": "sheets_error",
                        "confidence": 0.8,
                        "extracted_data": {
                            "pokemon_name": email_response["pokemon_name"],
                            "payout": email_response["payout"]
                        },
                        "error": f"Google Sheets connection failed after {max_retries} attempts: {str(e)}"
                    }
                continue
        
        # Append to Google Sheets with retry logic
        if worksheet is not None:
            try:
                # Get current timestamp
                current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                # Clean and validate data
                pokemon_name = str(email_response["pokemon_name"]).strip()
                payout_amount = str(email_response["payout"]).strip()
                email_from = str(email_details.get('from', 'N/A')).strip()
                email_subject = str(email_details.get('subject', 'N/A')).strip()
                
                # Validate required fields
                if not pokemon_name or pokemon_name == 'N/A':
                    pokemon_name = "Unknown Pokemon"
                if not payout_amount or payout_amount == 'N/A':
                    payout_amount = "0"
                
                # Prepare row data to append
                row_data = [
                    current_time,  # Timestamp
                    pokemon_name,  # Pokemon Name
                    payout_amount,  # Payout Amount
                ]
                
                print(f"📊 Attempting to append row: {row_data}")
                
                # Append the new row to the sheet with retry
                for attempt in range(max_retries):
                    try:
                        worksheet.append_row(row_data)
                        print(f"✅ New sale appended to Google Sheet: {pokemon_name} - ${payout_amount}")
                        break
                    except Exception as e:
                        print(f"❌ Append attempt {attempt + 1} failed: {str(e)}")
                        if attempt == max_retries - 1:  # Last attempt
                            return {
                                "email_type": "append_error",
                                "confidence": 0.8,
                                "extracted_data": {
                                    "pokemon_name": pokemon_name,
                                    "payout": payout_amount
                                },
                                "error": f"Failed to append to Google Sheets after {max_retries} attempts: {str(e)}"
                            }
                        continue
                
                return {
                    "email_type": "pokemon_sale",
                    "confidence": 0.95,
                    "extracted_data": {
                        "pokemon_name": pokemon_name,
                        "payout": payout_amount,
                        "timestamp": current_time,
                    },
                    "key_insights": [
                        f"Pokemon card sold: {pokemon_name}",
                        f"Payout amount: ${payout_amount}",
                        f"Sale recorded at: {current_time}"
                    ],
                    "financial_data": {
                        "payout": payout_amount,
                        "currency": "USD"
                    },
                    "product_info": {
                        "product_name": pokemon_name,
                        "category": "pokemon_card"
                    },
                    "recommendations": [
                        "Sale recorded successfully in Google Sheets",
                        "Track similar sales for market analysis"
                    ],
                    "risk_assessment": "low",
                    "market_analysis": "Sale completed and recorded"
                }
                
            except Exception as e:
                print(f"❌ Error in Google Sheets append: {str(e)}")
                return {
                    "email_type": "append_error",
                    "confidence": 0.8,
                    "extracted_data": {
                        "pokemon_name": email_response["pokemon_name"],
                        "payout": email_response["payout"]
                    },
                    "error": f"Google Sheets append error: {str(e)}"
                }
        else:
            return {
                "email_type": "sheets_error",
                "confidence": 0.8,
                "extracted_data": {
                    "pokemon_name": email_response["pokemon_name"],
                    "payout": email_response["payout"]
                },
                "error": "Google Sheets connection failed"
            }
            
    except Exception as e:
        print(f"❌ Error in LLM analysis: {str(e)}")
        return {
            "email_type": "error",
            "confidence": 0.0,
            "error": f"LLM Analysis Error: {str(e)}"
        }

@app.route('/process', methods=['POST'])
def process():
    try:
        data = request.json
        
        # Extract the data from JavaScript
        email_details = data.get('email_details', {})
        parsed_data = data.get('parsed_data', {})
        timestamp = data.get('timestamp', '')
        
        print(f"📧 Received email data at {timestamp}")
        print(f"From: {email_details.get('from', 'N/A')}")
        print(f"Subject: {email_details.get('subject', 'N/A')}")
        print(f"Email Type: {parsed_data.get('emailType', 'unknown')}")
        
        # Send to LLM for analysis
        llm_analysis = analyze_with_llm(email_details, parsed_data)
        
        # Log the analysis
        print(f"🤖 LLM Analysis completed")
        
        return jsonify({
            "status": "success",
            "received_data": {
                "email_details": email_details,
                "parsed_data": parsed_data,
                "timestamp": timestamp
            },
            "llm_analysis": llm_analysis
        })
        
    except Exception as e:
        print(f"❌ Error processing request: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    # Test Google Sheets connection
    sheets_status = test_google_sheets_connection()
    
    return jsonify({
        "status": "healthy", 
        "service": "email-llm-processor",
        "timestamp": datetime.now().isoformat(),
        "google_sheets": "connected" if sheets_status else "disconnected",
        "groq_llm": "available"
    })

@app.route('/test', methods=['POST'])
def test():
    """Test endpoint for development"""
    test_data = {
        "email_details": {
            "from": "cs@email.fanaticscollect.com",
            "to": "user@gmail.com",
            "subject": "Your Buy Now Sale is Complete! 🎉",
            "date": "2024-01-15T10:30:00Z",
            "messageId": "test123",
            "body": {
                "textBody": "Your Pokemon Charizard VMAX sale is complete. Sale Price: $150.00, Seller Fees: $15.00, Total Payout: $135.00",
                "htmlBody": "<strong>Pokemon Charizard VMAX</strong><br>SALE PRICE: $150.00<br>SELLER FEES: $15.00<br>TOTAL PAYOUT: $135.00"
            },
            "attachments": []
        },
        "parsed_data": {
            "emailType": "fanatics_sale",
            "isFanaticsSale": True,
            "saleDetails": {
                "productName": "Pokemon Charizard VMAX",
                "salePrice": "$150.00",
                "sellerFees": "$15.00",
                "totalPayout": "$135.00"
            },
            "isPokemonRelated": True
        },
        "timestamp": datetime.now().isoformat()
    }
    
    llm_analysis = analyze_with_llm(test_data["email_details"], test_data["parsed_data"])
    
    return jsonify({
        "status": "test_success",
        "test_data": test_data,
        "llm_analysis": llm_analysis
    })

if __name__ == "__main__":
    print("🤖 Starting Email LLM Processor with Groq...")
    print("🌐 Server will run on http://localhost:5000")
    print("🔗 Endpoints:")
    print("   POST /process - Process email data")
    print("   GET  /health  - Health check")
    print("   POST /test    - Test with sample data")
    print("")
    print("📊 Google Sheets append mode enabled")
    print("")
    
    app.run(port=5000, debug=True, host='0.0.0.0') 