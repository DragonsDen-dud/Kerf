/**
 * Test-only module resolution.
 *
 * Node's ESM loader demands explicit file extensions, but the app source uses
 * bundler-style extensionless imports (`./pricing`) because that is what
 * Next.js expects. This hook fills the gap for `node --test` so the source can
 * stay idiomatic.
 */
import { existsSync } from "node:fs";

const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

export function resolve(specifier, context, next) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    for (const extension of EXTENSIONS) {
      const candidate = new URL(specifier + extension, context.parentURL);
      if (existsSync(candidate)) return next(specifier + extension, context);
    }
  }
  return next(specifier, context);
}
