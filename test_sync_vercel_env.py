import io
import os
import unittest
from contextlib import redirect_stdout
from unittest import mock

import sync_vercel_env


class SyncVercelEnvTest(unittest.TestCase):
    def test_build_vercel_env_args_keeps_metacharacters_in_single_args(self):
        key = 'API_KEY"; powershell -Command "New-Item pwned"; #'
        token = "token; Remove-Item important"

        args = sync_vercel_env.build_vercel_env_args(
            "rm",
            key,
            "production",
            token,
            ["--yes"],
        )

        self.assertEqual(
            args,
            [
                "vercel",
                "env",
                "rm",
                key,
                "production",
                "--yes",
                "--token",
                token,
            ],
        )

    def test_sync_vercel_uses_argv_without_shell_for_valid_key(self):
        token = "token; Write-Output pwned"
        popen_process = mock.Mock()
        popen_process.communicate.return_value = ("", "")
        popen_process.returncode = 0

        with mock.patch.dict(os.environ, {"VERCEL_TOKEN": token}, clear=True):
            with mock.patch("sync_vercel_env.Path.exists", return_value=True):
                with mock.patch(
                    "sync_vercel_env.dotenv_values",
                    return_value={"SAFE_KEY": "secret value"},
                ):
                    with mock.patch("sync_vercel_env.subprocess.run") as run:
                        with mock.patch(
                            "sync_vercel_env.subprocess.Popen",
                            return_value=popen_process,
                        ) as popen:
                            sync_vercel_env.sync_vercel()

        self.assertEqual(
            run.call_args.args[0],
            [
                "vercel",
                "env",
                "rm",
                "SAFE_KEY",
                "production",
                "--yes",
                "--token",
                token,
            ],
        )
        self.assertIs(run.call_args.kwargs["shell"], False)
        self.assertEqual(
            popen.call_args.args[0],
            [
                "vercel",
                "env",
                "add",
                "SAFE_KEY",
                "production",
                "--token",
                token,
            ],
        )
        self.assertIs(popen.call_args.kwargs["shell"], False)
        popen_process.communicate.assert_called_once_with(input="secret value")

    def test_sync_vercel_skips_invalid_key_before_subprocess(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("sync_vercel_env.Path.exists", return_value=True):
                with mock.patch(
                    "sync_vercel_env.dotenv_values",
                    return_value={'BAD_KEY"; Write-Output pwned; #': "secret"},
                ):
                    with mock.patch("sync_vercel_env.subprocess.run") as run:
                        with mock.patch("sync_vercel_env.subprocess.Popen") as popen:
                            output = io.StringIO()
                            with redirect_stdout(output):
                                sync_vercel_env.sync_vercel()

        run.assert_not_called()
        popen.assert_not_called()
        self.assertIn("Skipping invalid environment key", output.getvalue())


if __name__ == "__main__":
    unittest.main()
