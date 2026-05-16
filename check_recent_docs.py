import os
from dotenv import load_dotenv

load_dotenv(".env.production")

import sys
sys.path.append("services/modal-agent-runtime")
from recap_repository import RecapRepository

repo = RecapRepository.from_env()

try:
    # Just select the last 5 rows
    rows = repo._request("GET", "/rest/v1/ai_recap_documents", query={"select": "id,scrape_method,source_url,created_at", "order": "created_at.desc", "limit": "5"})
    print(f"Most recent 5 documents in production:")
    for r in rows:
        print(f" - {r.get('id')} | {r.get('scrape_method')} | {r.get('created_at')} | {r.get('source_url')[:50]}...")
except Exception as e:
    print(f"Error: {e}")
