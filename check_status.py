import hashlib
import hmac
import json
import time
import uuid
import httpx
import sys

# Configuration
API_BASE_URL = "https://simbourd--kode01-agent-runtime-sync-api.modal.run"
SECRET = "64f1d9e2b1c4a5d8e7f9a0b1c2d3e4f5a6b7c8d9e0f1"
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
