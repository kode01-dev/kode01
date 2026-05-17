import hashlib
import hmac
import json
import os
import time
import uuid
import httpx
import sys

def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value

API_BASE_URL = required_env("MODAL_AGENT_API_URL").rstrip("/")
SECRET = required_env("AGENT_INTERNAL_TOKEN")
JOB_ID = sys.argv[1] if len(sys.argv) > 1 else 'manual-6ef3662d'

def check_status(job_id):
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    method = "GET"
    path = f"/internal/jobs/{job_id}"
    url = f"{API_BASE_URL}{path}"
    
    signature_payload = f"{method.upper()}\n{path}\n{timestamp}\n{nonce}"
    signature = hmac.new(
        SECRET.encode("utf-8"),
        signature_payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        "Authorization": f"Bearer {SECRET}",
        "x-kode01-internal-timestamp": timestamp,
        "x-kode01-internal-nonce": nonce,
        "x-kode01-internal-signature": signature
    }
    
    print(f"Vérification du statut pour {job_id}...")
    with httpx.Client() as client:
        response = client.get(url, headers=headers)
        
    if response.status_code == 200:
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"Erreur ({response.status_code}): {response.text}")

if __name__ == "__main__":
    check_status(JOB_ID)
