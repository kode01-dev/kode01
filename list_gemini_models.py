import os
import httpx
from dotenv import load_dotenv

load_dotenv(".env.production")
api_key = os.getenv("GOOGLE_API_KEY")

try:
    response = httpx.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}")
    data = response.json()
    for model in data.get("models", []):
        if "gemini" in model.get("name", "").lower() and "flash" in model.get("name", "").lower():
            print(model.get("name"))
except Exception as e:
    print(f"Error: {e}")
