// Narrows an already-read env var to a definite `string`, throwing if it's
// missing. A plain `process.env.X` check narrows to `string` only within the
// same lexical scope -- once read inside a client-factory function,
// TypeScript widens it back to `string | undefined` and every downstream
// `.from(...).select(...)` call loses its Database-typed result (silently
// collapsing to SelectQueryError). Returning through this function keeps the
// type as `string` everywhere.
//
// Callers MUST pass the value via a static `process.env.NEXT_PUBLIC_X`
// (or plain `process.env.X`) expression at the call site, never
// `process.env[name]` here -- Next.js only inlines NEXT_PUBLIC_* vars into
// the browser bundle when it can statically match that literal dot-access
// pattern during compilation. A dynamic lookup by variable name is invisible
// to that step, so it silently resolves to undefined in every browser and
// this function would always throw client-side, even though the exact same
// code works fine server-side (where process.env is a real object).
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
