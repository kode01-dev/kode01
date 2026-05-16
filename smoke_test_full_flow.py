import httpx
import json
import os

# Configuration (Project zboonzqhrbuueqqzzrgn)
SUPABASE_FUNCTIONS_URL = os.getenv("SUPABASE_FUNCTIONS_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_FUNCTIONS_URL:
    raise RuntimeError("Missing required environment variable: SUPABASE_FUNCTIONS_URL")

if not SERVICE_ROLE_KEY:
    raise RuntimeError("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY")

EDGE_URL = SUPABASE_FUNCTIONS_URL.rstrip("/") + "/weekly-ai-recap-cron"

def smoke_test_full_flow():
    headers = {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "mode": "tick",
        "trigger": "manual"
    }
    
    print(f"Triggering FULL DELEGATION FLOW: Edge -> Modal (Service Role Auth, timeout 180s)...")
    with httpx.Client(timeout=180.0) as client:
        try:
            response = client.post(EDGE_URL, json=payload, headers=headers)
            print(f"Status: {response.status_code}")
            if response.status_code < 400:
                print("✅ SUCCESS (Full Flow Initiated)")
                print(json.dumps(response.json(), indent=2))
            else:
                print("❌ FAILED")
                print(response.text)
        except Exception as e:
            print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    smoke_test_full_flow()
