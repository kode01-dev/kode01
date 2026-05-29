import hashlib
import hmac
import json
import os
import time
import uuid
import httpx
from dotenv import load_dotenv

# Load production env
load_dotenv(".env.production")

# Configuration (Direct to Modal - Production Project)
MODAL_BASE_URL = os.getenv("MODAL_AGENT_API_URL")
# Internal Token (AGENT_INTERNAL_TOKEN)
SECRET = os.getenv("AGENT_INTERNAL_TOKEN")

if not MODAL_BASE_URL:
    raise RuntimeError("Missing required environment variable: MODAL_AGENT_API_URL")

if not SECRET:
    raise RuntimeError("Missing required environment variable: AGENT_INTERNAL_TOKEN")

API_URL = MODAL_BASE_URL.rstrip("/") + "/internal/jobs"

def launch_newsletter_direct():
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    method = "POST"
    path = "/internal/jobs"
    
    # Signature matching runtime.py verify_internal_auth
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
    
    # Payload for NEWSLETTER distribution
    payload = {
        "flow": "weekly-ai-recap",
        "mode": "send_newsletter",
        "trigger": "manual",
        "requestId": f"prod-news-{nonce[:8]}",
        "idempotencyKey": f"prod-news-{nonce[:8]}"
    }
    
    print(f"🚀 Lancement DIRECT de la Newsletter sur Modal ({path}, timeout 300s)...")
    with httpx.Client(timeout=300.0, follow_redirects=True) as client:
        try:
            response = client.post(API_URL, json=payload, headers=headers)
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                print("✅ RÉUSSITE (Distribution en cours sur Modal)")
                print(json.dumps(response.json(), indent=2))
            else:
                print(f"❌ ÉCHEC ({response.status_code})")
                print(response.text)
        except Exception as e:
            print(f"❌ ERREUR: {e}")

if __name__ == "__main__":
    launch_newsletter_direct()
