import os
import re
import subprocess
from pathlib import Path
from dotenv import dotenv_values

ENV_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def build_vercel_env_args(action, key, environment, token=None, extra_args=None):
    args = ["vercel", "env", action, key, environment]
    if extra_args:
        args.extend(extra_args)
    if token:
        args.extend(["--token", token])
    return args


def is_valid_env_key(key):
    return bool(ENV_KEY_PATTERN.fullmatch(key))


def sync_vercel():
    env_path = Path(".env.production")
    if not env_path.exists():
        print(f"Error: {env_path} not found.")
        return

    # Use the token from the environment if available
    token = os.environ.get("VERCEL_TOKEN")

    print(f"Loading secrets from {env_path}...")
    env_vars = dotenv_values(env_path)

    # We'll just try to remove and re-add all keys to ensure they are up to date
    # except for those we specifically want to keep or exclude.
    blacklist_prefixes = ["VERCEL_", "TURBO_"]
    
    sync_count = 0
    for key, value in env_vars.items():
        if value is None or not str(value).strip():
            continue
            
        key = str(key).strip()
        value = str(value).strip()
        
        # Skip blacklisted keys
        if any(key.startswith(p) for p in blacklist_prefixes):
            continue

        if not is_valid_env_key(key):
            print(f"Skipping invalid environment key: {key!r}")
            continue

        print(f"Syncing {key} on Vercel Production...")
        
        # 1. Attempt to remove existing key (ignore error if it doesn't exist)
        try:
            subprocess.run(
                build_vercel_env_args("rm", key, "production", token, ["--yes"]),
                shell=False,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
        except Exception:
            pass
            
        # 2. Add the key
        try:
            process = subprocess.Popen(
                build_vercel_env_args("add", key, "production", token),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                shell=False
            )
            stdout, stderr = process.communicate(input=value)
            if process.returncode == 0:
                print(f"Success: {key} synced.")
                sync_count += 1
            else:
                # If error is about the key already existing (shouldn't happen with rm), we'll log it
                print(f"Error syncing {key}: {stderr.strip()}")
        except Exception as e:
            print(f"Failed to run vercel for {key}: {e}")

    print(f"Vercel sync complete. {sync_count} keys synchronized.")

if __name__ == "__main__":
    sync_vercel()
