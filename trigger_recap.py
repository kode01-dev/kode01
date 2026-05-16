import hashlib
import hmac
import json
import time
import uuid
import httpx
import os
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

# Configuration
API_URL = os.environ.get("MODAL_AGENT_API_URL", "https://simbourd--kode01-agent-runtime-sync-api.modal.run") + "/internal/jobs"
SECRET = os.environ.get("AGENT_INTERNAL_TOKEN", "64f1d9e2b1c4a5d8e7f9a0b1c2d3e4f5a6b7c8d9e0f1") # Default value for local dev only

def trigger_job():
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    method = "POST"
    path = "/internal/jobs"
    
    # Nouvelle logique de signature alignée sur runtime.py
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
        "force": True,
        "requestId": f"manual-{nonce[:8]}",
        "idempotencyKey": f"manual-{nonce[:8]}"
    }
    
    body_str = json.dumps(payload, separators=(',', ':'))
    
    print(f"Envoi de la requête à {API_URL}...")
    with httpx.Client() as client:
        response = client.post(API_URL, content=body_str, headers=headers)
        
    if response.status_code == 200:
        print("✅ Succès !")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"❌ Échec ({response.status_code})")
        print(response.text)

if __name__ == "__main__":
    trigger_job()
