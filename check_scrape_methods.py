import os
from dotenv import load_dotenv

load_dotenv(".env.production")

import sys
sys.path.append("services/modal-agent-runtime")
from recap_repository import RecapRepository

repo = RecapRepository.from_env()

# Use PostgREST to fetch distinct values
try:
    rows = repo._request("GET", "/rest/v1/ai_recap_documents", query={"select": "scrape_method"})
    methods = set(str(r.get("scrape_method")) for r in rows if isinstance(r, dict))
    print("Distinct scrape methods found:")
    for m in methods:
        print(f" - {m}")
except Exception as e:
    print(f"Error: {e}")
