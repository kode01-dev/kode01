import subprocess
import os

def sync_secrets_cli():
    env_path = ".env.production"
    if not os.path.exists(env_path):
        print(f"Error: {env_path} not found.")
        return

    secret_names = ["kode01-secrets", "kode01-agent-runtime-secrets"]
    
    for secret_name in secret_names:
        print(f"Syncing to Modal secret: {secret_name}...")
        args = [
            "py",
            "-3.12",
            "-m",
            "modal",
            "secret",
            "create",
            "--force",
            "--from-dotenv",
            env_path,
            secret_name,
        ]
            
        try:
            result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8')
            if result.returncode == 0:
                print(f"SUCCESS: Secret '{secret_name}' updated.")
            else:
                print(f"FAILURE: Error syncing '{secret_name}': {result.stderr}")
        except Exception as e:
            print(f"Error executing for '{secret_name}': {e}")

if __name__ == "__main__":
    sync_secrets_cli()
