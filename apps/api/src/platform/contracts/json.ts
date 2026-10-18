import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export class ContractError extends Error { constructor() { super("invalid_contract"); } }
function fail(): never { throw new ContractError(); }

// JSON primitives use ECMAScript serialization; key ordering is UTF-16 as required by JCS.
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
  if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) fail();
  if (typeof value === "string" && /[\uD800-\uDFFF]/u.test(value)) fail();
  return JSON.stringify(value);
}
export const digest = (value: Json): string => createHash("sha256").update(canonicalJson(value)).digest("hex");

export function strictJson(text: string): Json {
  let index = 0;
  const whitespace = () => { while (/[\t\n\r ]/.test(text[index] ?? "x")) index++; };
  const string = (): string => {
    const start = index++;
    while (index < text.length) {
      if (text[index] === "\\") { index += 2; continue; }
      if (text[index++] === '"') { const value: unknown = JSON.parse(text.slice(start, index)); if (typeof value !== "string") fail(); canonicalJson(value); return value; }
    }
    return fail();
  };
  const value = (depth: number): Json => {
    if (depth > 32) fail();
    whitespace();
    if (text[index] === '"') return string();
    if (text[index] === "{" || text[index] === "[") {
      const object = text[index++] === "{";
      const result: { [key: string]: Json } = Object.create(null) as { [key: string]: Json };
      const items: Json[] = [];
      whitespace();
      const end = object ? "}" : "]";
      if (text[index] === end) { index++; return object ? result : items; }
      while (index < text.length) {
        if (object) {
          if (text[index] !== '"') fail();
          const key = string(); whitespace();
          if (text[index++] !== ":" || Object.hasOwn(result, key)) fail();
          result[key] = value(depth + 1);
        } else items.push(value(depth + 1));
        whitespace();
        if (text[index] === end) { index++; return object ? result : items; }
        if (text[index++] !== ",") fail();
        whitespace();
      }
      return fail();
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index))?.[0];
    if (!token) return fail();
    index += token.length;
    const parsed = JSON.parse(token) as Json;
    canonicalJson(parsed);
    return parsed;
  };
  const result = value(0); whitespace();
  if (index !== text.length) fail();
  return result;
}
