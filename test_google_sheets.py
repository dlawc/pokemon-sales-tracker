#!/usr/bin/env python3
"""
Google Sheets Connection Test Script
This script will help diagnose and fix Google Sheets connection issues
"""

import gspread
from google.oauth2.service_account import Credentials
import os
from datetime import datetime

def test_google_sheets_connection():
    """Test Google Sheets connection and diagnose issues"""
    
    print("🔍 Starting Google Sheets Diagnostic Test")
    print("=" * 50)
    
    # Step 1: Check if service account file exists
    print("\n1. Checking service account file...")
    if not os.path.exists("service_account.json"):
        print("❌ service_account.json file not found!")
        print("   Please make sure the file exists in the current directory")
        return False
    else:
        print("✅ service_account.json file found")
    
    try:
        # Step 2: Initialize credentials
        print("\n2. Initializing Google credentials...")
        scope = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        
        creds = Credentials.from_service_account_file("service_account.json", scopes=scope)
        client = gspread.authorize(creds)
        print("✅ Google credentials initialized successfully")
        
        # Step 3: Test opening the spreadsheet
        print("\n3. Testing spreadsheet access...")
        spreadsheet_url = ""
        
        try:
            spreadsheet = client.open_by_url(spreadsheet_url)
            print(f"✅ Successfully opened spreadsheet: '{spreadsheet.title}'")
        except Exception as e:
            print(f"❌ Failed to open spreadsheet: {str(e)}")
            print("   Please check:")
            print("   - The spreadsheet URL is correct")
            print("   - The service account has access to the spreadsheet")
            return False
        
        # Step 4: List all available worksheets
        print("\n4. Listing available worksheets...")
        worksheets = spreadsheet.worksheets()
        print(f"   Found {len(worksheets)} worksheet(s):")
        
        for i, ws in enumerate(worksheets, 1):
            print(f"   {i}. '{ws.title}' (ID: {ws.id}, {ws.row_count} rows, {ws.col_count} cols)")
        
        # Step 5: Check if Sheet5 exists
        print("\n5. Checking for 'Sheet5'...")
        sheet5_exists = False
        sheet5 = None
        
        for ws in worksheets:
            if ws.title == "Sheet5":
                sheet5_exists = True
                sheet5 = ws
                break
        
        if sheet5_exists:
            print("✅ Sheet5 found!")
        else:
            print("❌ Sheet5 NOT found!")
            print("   Creating Sheet5...")
            try:
                sheet5 = spreadsheet.add_worksheet(title="Sheet5", rows=1000, cols=10)
                print("✅ Sheet5 created successfully!")
                
                # Add headers
                headers = ["Timestamp", "Pokemon Name", "Payout Amount"]
                sheet5.insert_row(headers, 1)
                print("✅ Headers added to Sheet5")
                
            except Exception as e:
                print(f"❌ Failed to create Sheet5: {str(e)}")
                return False
        
        # Step 6: Test reading from Sheet5
        print("\n6. Testing read access to Sheet5...")
        try:
            all_values = sheet5.get_all_values()
            print(f"✅ Successfully read {len(all_values)} rows from Sheet5")
            
            if len(all_values) > 0:
                print(f"   First row: {all_values[0]}")
            
        except Exception as e:
            print(f"❌ Failed to read from Sheet5: {str(e)}")
            return False
        
        # Step 7: Test writing to Sheet5
        print("\n7. Testing write access to Sheet5...")
        try:
            test_row = [
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "TEST_POKEMON_CHARIZARD",
                "999.99"
            ]
            
            sheet5.append_row(test_row)
            print("✅ Successfully wrote test data to Sheet5")
            print(f"   Test row: {test_row}")
            
        except Exception as e:
            print(f"❌ Failed to write to Sheet5: {str(e)}")
            return False
        
        # Step 8: Verify the write operation
        print("\n8. Verifying write operation...")
        try:
            all_values = sheet5.get_all_values()
            last_row = all_values[-1] if all_values else []
            
            if len(last_row) >= 3 and "TEST_POKEMON_CHARIZARD" in last_row[1]:
                print("✅ Write operation verified successfully!")
                print(f"   Last row: {last_row}")
            else:
                print("⚠️  Write operation completed but verification failed")
                
        except Exception as e:
            print(f"❌ Failed to verify write operation: {str(e)}")
            return False
        
        print("\n" + "=" * 50)
        print("🎉 ALL TESTS PASSED! Google Sheets connection is working!")
        print("=" * 50)
        return True
        
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        print("\nCommon solutions:")
        print("1. Make sure you've shared the spreadsheet with the service account email")
        print("2. Check that the service account has 'Editor' permissions")
        print("3. Verify the spreadsheet URL is correct")
        print("4. Ensure you have the latest version of gspread installed")
        return False

def print_service_account_info():
    """Print service account information for debugging"""
    try:
        import json
        with open("service_account.json", "r") as f:
            service_data = json.load(f)
        
        print("\n📧 Service Account Information:")
        print(f"   Email: {service_data.get('client_email', 'Not found')}")
        print(f"   Project ID: {service_data.get('project_id', 'Not found')}")
        print(f"   Type: {service_data.get('type', 'Not found')}")
        
        print("\n🔗 TO FIX ACCESS ISSUES:")
        print(f"   1. Open your Google Sheet in browser")
        print(f"   2. Click 'Share' button")
        print(f"   3. Add this email: {service_data.get('client_email', 'EMAIL_NOT_FOUND')}")
        print(f"   4. Set permission to 'Editor'")
        print(f"   5. Click 'Send'")
        
    except Exception as e:
        print(f"❌ Could not read service account info: {str(e)}")

if __name__ == "__main__":
    print("🤖 Google Sheets Connection Diagnostic Tool")
    print("This tool will help identify and fix Google Sheets connection issues")
    
    # Print service account info first
    print_service_account_info()
    
    # Run the comprehensive test
    success = test_google_sheets_connection()
    
    if success:
        print("\n✅ Your Google Sheets connection is ready!")
        print("   You can now run your Flask server without issues.")
    else:
        print("\n❌ Google Sheets connection needs fixing.")
        print("   Please follow the suggestions above and run this test again.") 