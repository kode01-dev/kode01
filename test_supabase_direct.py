import os
import httpx
from dotenv import load_dotenv

def test_direct():
    load_dotenv(".env.production")
    
    url = "https://zboonzqhrbuueqqzzrgn.supabase.co/functions/v1/weekly-ai-recap-cron"
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not key:
        print("Erreur: SUPABASE_SERVICE_ROLE_KEY manquante dans .env.production")
        return

    # Nettoyage manuel au cas où
    key = key.strip()
    
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "mode": "tick",
        "trigger": "manual"
    }
    
    print(f"Test d'appel direct Supabase...")
    with httpx.Client() as client:
        try:
            response = client.post(url, headers=headers, json=payload)
            print(f"Statut: {response.status_code}")
            print(f"Réponse: {response.text}")
        except Exception as e:
            print(f"Erreur de connexion: {e}")

if __name__ == "__main__":
    test_direct()
