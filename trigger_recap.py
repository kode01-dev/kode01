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

def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value

API_URL = required_env("MODAL_AGENT_API_URL").rstrip("/") + "/internal/jobs"
SECRET = required_env("AGENT_INTERNAL_TOKEN")

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
