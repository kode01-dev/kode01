import modal
import time
import os
from typing import Any

# Reuse the image and configuration from the main runtime if possible
# Or redefine it here for a self-contained test
APP_NAME = "recap-manual-test"
app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements("services/modal-agent-runtime/requirements.txt")
    .add_local_dir("services/modal-agent-runtime", remote_path="/root")
)

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("kode01-agent-runtime-secrets")],
    timeout=1800
)

def run_stage(mode: str, edition_key: str = None):
    from recap_pipeline import run_modal_native_recap
    import os
    print(f"DEBUG: Available env keys: {sorted(os.environ.keys())}")
    
    if not edition_key:
        edition_key = f"test-run-{int(time.time())}"
        
    print(f"[START] Starting AI Recap Test Stage: {mode} (Edition: {edition_key})")
    
    # If mode is tick, we actually want to test build_article manually
    if mode == "tick":
        mode = "build_article"
        print(f"[INFO] 'tick' mode redirected to 'build_article' for manual testing.")

    payload = {
        "flow": "weekly-ai-recap",
        "mode": mode,
        "trigger": "manual",
        "editionKey": edition_key,
        "testMode": False  # Set to False for real execution
    }
    
    try:
        # Fixed: Added shadow_mode=False keyword argument
        result = run_modal_native_recap(payload, shadow_mode=False)
        print(f"[SUCCESS] Stage {mode} completed successfully.")
        return result
    except Exception as e:
        print(f"[ERROR] Stage {mode} failed: {str(e)}")
        raise

@app.local_entrypoint()
def main(mode: str = "tick", edition: str = None):
    result = run_stage.remote(mode, edition)
    print("\n--- TEST RESULT ---")
    import json
    print(json.dumps(result, indent=2))
