import hashlib
import hmac
import json
import os
import time
import uuid
import httpx

# Configuration (Direct to Modal)
MODAL_BASE_URL = os.getenv("MODAL_AGENT_API_URL")
SECRET = os.getenv("AGENT_INTERNAL_TOKEN")

if not MODAL_BASE_URL:
    raise RuntimeError("Missing required environment variable: MODAL_AGENT_API_URL")

if not SECRET:
    raise RuntimeError("Missing required environment variable: AGENT_INTERNAL_TOKEN")

API_URL = MODAL_BASE_URL.rstrip("/") + "/jobs/enqueue"

def smoke_test_modal_direct():
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    method = "POST"
    path = "/jobs/enqueue"
    
    # Signature matching runtime.py
    signature_payload = f"{method.upper()}\n{path}\n{timestamp}\n{nonce}"
    signature = hmac.new(
        SECRET.encode("utf-8"),
        signature_payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SECRET}",
        "x-kode01-internal-timestamp": timestamp,
        "x-kode01-internal-nonce": nonce,
        "x-kode01-internal-signature": signature
    }
    
    payload = {
        "flow": "weekly-ai-recap",
        "mode": "build_article",
        "trigger": "manual",
        "requestId": f"smoke-{nonce[:8]}",
        "idempotencyKey": f"smoke-{nonce[:8]}"
    }
    
    print(f"Triggering MODAL DIRECT (Path: {path}, timeout 180s, follow_redirects=True)...")
    with httpx.Client(timeout=180.0, follow_redirects=True) as client:
        try:
            response = client.post(API_URL, json=payload, headers=headers)
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                print("✅ SUCCESS (Job Enqueued on Modal)")
                print(json.dumps(response.json(), indent=2))
            else:
                print(f"❌ FAILED ({response.status_code})")
                print(f"Final URL: {response.url}")
                print(f"History: {response.history}")
                print(response.text)
        except Exception as e:
            print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    smoke_test_modal_direct()
