import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { spawnOwnedNode, stopOwnedNode } from "./owned-process.js";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const sentinel = "synthetic-e2e-credential-must-stay-private";
const invalidConfigurations = [
  { E2E_MONGODB_URL: `mongodb://e2e:${sentinel}@127.0.0.1:bad` },
  { E2E_REDIS_URL: `redis://e2e:${sentinel}@127.0.0.1:bad` },
  { E2E_MONGODB_URL: `mongodb://e2e:${sentinel}@127.0.0.1/ignored?unsupportedOption=${sentinel}` },
];

for (const [index, invalid] of invalidConfigurations.entries()) {
  test(`dependency configuration failure ${index + 1} is sanitized before connecting`, async () => {
    let failed = false;
    try {
      await execute(process.execPath, ["--import", "tsx", "tests/e2e/run.ts"], {
        cwd: root,
        env: { ...process.env, E2E_MONGODB_URL: "mongodb://127.0.0.1:1", E2E_REDIS_URL: "redis://127.0.0.1:1", ...invalid },
        windowsHide: true,
        timeout: 10_000,
      });
    } catch (error) {
      failed = true;
      const result = error as { code?: number; stdout?: string; stderr?: string };
      assert.equal(result.code, 1);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.equal(output.includes(sentinel), false, "Credential sentinel must not appear in process output");
      assert.equal(output.trim(), "E2E dependency configuration is invalid; use single loopback MongoDB/Redis URLs.");
    }
    assert.equal(failed, true, "Malformed configuration must fail");
  });
}

test("supervisor refuses an unowned process and leaves it alive", async () => {
  const unowned = spawn(process.execPath, ["--eval", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  const exit = once(unowned, "exit");
  try {
    await assert.rejects(stopOwnedNode(unowned), /not created by the E2E supervisor/);
    assert.equal(unowned.exitCode, null);
    assert.ok(unowned.pid);
    process.kill(unowned.pid, 0);
  } finally { unowned.kill("SIGKILL"); await exit; }
});

if (process.platform === "linux") {
  for (const parentExitsFirst of [true, false]) {
    test(parentExitsFirst ? "Linux cleanup stops an owned descendant after its parent exited" : "Linux cleanup escalates when a descendant ignores SIGTERM after its parent stops", { timeout: 12_000 }, async () => {
      const descendant = `${parentExitsFirst ? "" : "process.on('SIGTERM', () => {});"} process.stdout.write(String(process.pid) + '\\n'); setInterval(() => {}, 1000);`;
      const parent = `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['--eval', ${JSON.stringify(descendant)}], { stdio: ['ignore', 'inherit', 'ignore'] }); child.unref(); ${parentExitsFirst ? "process.exit(0);" : "setInterval(() => {}, 1000);"}`;
      const child = spawnOwnedNode(["--eval", parent], { stdio: ["ignore", "pipe", "ignore"] });
      const exit = once(child, "exit");
      try {
        const pid = await new Promise<number>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error("Owned test descendant did not become ready.")), 5000);
        child.stdout?.on("data", (value: Buffer) => {
          output += value.toString();
          if (/^\d+\n$/.test(output)) { clearTimeout(timer); resolve(Number(output.trim())); }
        });
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        });
        if (parentExitsFirst) { await exit; assert.equal(child.exitCode, 0); }
        process.kill(pid, 0);
        await stopOwnedNode(child);
        await exit;
        assert.ok(child.pid);
        assert.throws(() => process.kill(-child.pid!, 0), { code: "ESRCH" });
        // Allow the container init to reap a descendant orphaned by its parent.
        for (let n = 0; n < 20; n++) {
          try { process.kill(pid, 0); await delay(50); } catch { break; }
        }
        assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      } finally { await stopOwnedNode(child); }
    });
  }
}
