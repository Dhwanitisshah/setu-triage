// Reads a required env var as a definite `string`. A plain `process.env.X`
// check narrows to `string` only within the same lexical scope — once read
// inside a client-factory function, TypeScript widens it back to
// `string | undefined` and every downstream `.from(...).select(...)` call
// loses its Database-typed result (silently collapsing to SelectQueryError).
// Returning through this function keeps the type as `string` everywhere.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
