import httpx
import json
import os
import time

# Configuration (Project noemwcxtlibtimusldyn)
SUPABASE_FUNCTIONS_URL = os.getenv("SUPABASE_FUNCTIONS_URL")
# Service Role Key for privileged auth
SRK = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
# Modern Internal Token
INTERNAL_TOKEN = os.getenv("EDGE_INTERNAL_AUTH_TOKEN")

if not SUPABASE_FUNCTIONS_URL:
    raise RuntimeError("Missing required environment variable: SUPABASE_FUNCTIONS_URL")

if not SRK:
    raise RuntimeError("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY")

if not INTERNAL_TOKEN:
    raise RuntimeError("Missing required environment variable: EDGE_INTERNAL_AUTH_TOKEN")

EDGE_URL = SUPABASE_FUNCTIONS_URL.rstrip("/") + "/weekly-ai-recap-cron"

def launch_production_recap():
    print("🚀 Lancement de la synthèse RÉELLE d'article (mode build_article)...")
    headers = {
        "Authorization": f"Bearer {SRK}",
        "x-internal-auth": INTERNAL_TOKEN, # Alternative auth check in _shared/http.ts
        "Content-Type": "application/json"
    }
    
    # 1. Trigger Article Synthesis
    payload_build = {
        "mode": "build_article",
        "trigger": "manual",
        "force": True
    }
    
    # Using a long timeout for the initial synthesis request to handle Modal cold start
    with httpx.Client(timeout=300.0) as client:
        try:
            resp = client.post(EDGE_URL, json=payload_build, headers=headers)
            print(f"Status Synthèse: {resp.status_code}")
            if resp.status_code < 400:
                print("✅ Synthèse en cours sur Modal.")
                print(json.dumps(resp.json(), indent=2))
            else:
                print("❌ Échec de la synthèse.")
                print(resp.text)
                return
        except Exception as e:
            print(f"❌ Erreur: {e}")
            return

    print("\n⏳ Attente de 15 secondes pour laisser Modal démarrer la synthèse avant de programmer l'infolettre...")
    time.sleep(15)

    # 2. Trigger Newsletter (Note: normally depends on build_article completion, but we queue it)
    print("🚀 Programmation de l'envoi de l'INFOLETTRE (mode send_newsletter)...")
    payload_send = {
        "mode": "send_newsletter",
        "trigger": "manual"
    }
    
    with httpx.Client(timeout=60.0) as client:
        try:
            resp = client.post(EDGE_URL, json=payload_send, headers=headers)
            print(f"Status Infolettre: {resp.status_code}")
            if resp.status_code < 400:
                print("✅ Infolettre programmée sur Modal.")
                print(json.dumps(resp.json(), indent=2))
            else:
                print("❌ Échec de la programmation de l'infolettre.")
                print(resp.text)
        except Exception as e:
            print(f"❌ Erreur: {e}")

if __name__ == "__main__":
    launch_production_recap()
