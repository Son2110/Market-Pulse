import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { capabilitySnapshot, type CapabilityInputs } from "../src/platform/health/capability-state.js";
import { createBoundedEnqueue } from "../src/ingestion-api.js";

const healthy: CapabilityInputs = {
  fixtureReady: true, mongoInitialized: true, mongoReady: true, redisReady: true,
  queueReady: true, observedEnabled: true, goldEnabled: true, ingestionEnabled: true,
  ingestionInitialized: true, shuttingDown: false,
};

test("A4-T01 pure capability policy distinguishes disabled, unavailable, queue dispatch and unknown worker", () => {
  assert.equal(capabilitySnapshot(healthy).status, "ready");
  const cold = capabilitySnapshot({ ...healthy, redisReady: false, queueReady: false });
  assert.equal(cold.status, "degraded");
  assert.equal(cold.capabilities.fixtureRead, "ready");
  assert.equal(cold.capabilities.ingestionAcceptance, "ready");
  assert.equal(cold.capabilities.queueDispatch, "unavailable");
  assert.equal(cold.capabilities.worker, "unknown");
  const disabled = capabilitySnapshot({ ...healthy, observedEnabled: false, goldEnabled: false, ingestionEnabled: false });
  for (const key of ["observedRead", "goldRead", "ingestionAcceptance", "queueDispatch"] as const) assert.equal(disabled.capabilities[key], "disabled");
  const mongo = capabilitySnapshot({ ...healthy, mongoReady: false });
  assert.equal(mongo.capabilities.account, "unavailable");
  assert.equal(mongo.capabilities.fixtureRead, "ready");
  assert.equal(capabilitySnapshot({ ...healthy, shuttingDown: true }).capabilities.fixtureRead, "unavailable");
});

test("A4-T10 enqueue deadlines retain capacity until underlying work settles and cancel late continuation", async () => {
  const pending: Array<() => void> = [];
  let started = 0;
  let lateWrites = 0;
  const enqueue = createBoundedEnqueue(async (_id, _digest, signal) => {
    started += 1;
    await new Promise<void>(resolvePromise => pending.push(resolvePromise));
    signal.throwIfAborted();
    lateWrites += 1;
  }, 15, 2);
  await Promise.all([assert.rejects(enqueue("one", "digest")), assert.rejects(enqueue("two", "digest"))]);
  for (let i = 0; i < 20; i += 1) await assert.rejects(enqueue("burst", "digest"), /capacity/);
  assert.equal(started, 2);
  pending.splice(0).forEach(release => release());
  await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
  assert.equal(lateWrites, 0);
  const recovery = enqueue("recovered", "digest");
  await new Promise(resolvePromise => setTimeout(resolvePromise, 1));
  pending.pop()!();
  await recovery;
  assert.equal(lateWrites, 1);
});

test("A4-T19 platform runtime graph has no cycle or reverse entrypoint imports", () => {
  const root = resolve("apps/api/src");
  const paths: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith(".ts")) paths.push(path);
    }
  };
  walk(root);
  const graph = new Map<string, string[]>();
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    for (const node of parsed.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      const specifier = node.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith(".")) continue;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) continue;
        const named = clause?.namedBindings;
        if (named && ts.isNamedImports(named) && !clause?.name && named.elements.every(element => element.isTypeOnly)) continue;
      } else if (node.isTypeOnly) continue;
      imports.push(resolve(dirname(path), specifier.text.replace(/\.js$/, ".ts")));
    }
    graph.set(path, imports);
    if (!/[/\\](server|worker)\.ts$/.test(path)) assert(!imports.some(target => /[/\\](server|worker)\.ts$/.test(target)), path);
    if (path.includes(`${join("platform", "")}`)) {
      assert(imports.every(target => target.includes(`${join(root, "platform")}`)), `Platform points outside platform: ${path}`);
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (path: string) => {
    assert(!visiting.has(path), `Import cycle at ${path}`);
    if (visited.has(path)) return;
    visiting.add(path);
    for (const dep of graph.get(path) ?? []) visit(dep);
    visiting.delete(path); visited.add(path);
  };
  paths.filter(path => path.startsWith(join(root, "platform"))).forEach(visit);
  const pure = readFileSync(join(root, "platform/health/capability-state.ts"), "utf8");
  assert(!/\b(import|fetch|process|console)\b/.test(pure.replace(/\/\/[^\n]*/g, "")), "Capability policy must be pure");
});
