import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testDir = "tests";
const testFilePattern = /\.test\.(mjs|ts)$/;

function listTestFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return listTestFiles(path);
      }

      return stat.isFile() && testFilePattern.test(entry) ? [path] : [];
    })
    .sort();
}

const testFiles = listTestFiles(testDir);

if (testFiles.length === 0) {
  console.error(`No test files found in ${testDir}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--experimental-test-module-mocks", "--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit" },
);

if (result.signal) {
  console.error(`Test runner terminated by ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
