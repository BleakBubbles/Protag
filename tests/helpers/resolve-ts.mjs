// Node resolve hook so tests can load app code written in Metro's import style.
//
// The app imports siblings without extensions ('./types') and uses the `@/`
// alias for src/. Metro resolves both natively; Node's ESM loader resolves
// neither, so this maps them to real `.ts` files. Test-only — nothing here
// ships, and app code stays idiomatic.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = new URL('../../src/', import.meta.url);
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts'];

export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (target.startsWith('@/')) target = new URL(target.slice(2), SRC).href;

  const isLocal = target.startsWith('./') || target.startsWith('../') || target.startsWith('file:');
  if (isLocal && context.parentURL) {
    const base = new URL(target, context.parentURL);
    if (!isFile(fileURLToPath(base))) {
      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = fileURLToPath(base) + suffix;
        if (isFile(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  return nextResolve(target, context);
}
