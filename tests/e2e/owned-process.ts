import { execFile, spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);
const owned = new WeakMap<ChildProcess, { group: number | undefined; stopping?: Promise<void> }>();

export function spawnOwnedNode(args: string[], options: SpawnOptions): ChildProcess {
  const child = spawn(process.execPath, args, { ...options, windowsHide: true, detached: process.platform !== "win32" });
  owned.set(child, { group: process.platform === "win32" ? undefined : child.pid });
  return child;
}

function exited(child: ChildProcess): boolean { return child.exitCode !== null || child.signalCode !== null; }

function groupAlive(group: number): boolean {
  try { process.kill(-group, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}

function signalGroup(group: number, signal: NodeJS.Signals): void {
  try { process.kill(-group, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}

async function waitUntilGone(alive: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (alive() && Date.now() < deadline) await delay(50);
  return !alive();
}

export async function stopOwnedNode(child: ChildProcess): Promise<void> {
  const ownership = owned.get(child);
  if (!ownership) throw new Error("Refusing to stop a process not created by the E2E supervisor.");
  ownership.stopping ??= (async () => {
    if (process.platform === "win32") {
      if (exited(child) || !child.pid) return;
      await execute(`${process.env.SystemRoot ?? "C:/Windows"}/System32/taskkill.exe`, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }).catch(() => {
        if (!exited(child)) throw new Error("Could not stop an owned E2E process tree.");
      });
      if (!await waitUntilGone(() => !exited(child), 3000)) throw new Error("An owned E2E child did not stop.");
      return;
    }
    const group = ownership.group;
    if (!group) return;
    if (group <= 1) throw new Error("Invalid owned E2E process group.");
    // The detached group remains owned while descendants outlive its original child.
    if (!groupAlive(group)) return;
    signalGroup(group, "SIGTERM");
    if (await waitUntilGone(() => groupAlive(group), 1500)) return;
    signalGroup(group, "SIGKILL");
    if (!await waitUntilGone(() => groupAlive(group), 3000)) throw new Error("An owned E2E process group did not stop.");
  })();
  await ownership.stopping;
}
