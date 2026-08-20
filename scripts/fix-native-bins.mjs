#!/usr/bin/env node
/**
 * Restore the execute bit on native binaries inside node_modules.
 *
 * Some hosts (Hostinger's build container among them) extract packages without
 * preserving file modes, so anything that shells out to a platform binary —
 * turbo, esbuild, prisma's query engine — dies with EACCES:
 *
 *   Error: spawn .../@turbo/linux-64/bin/turbo EACCES
 *
 * Two kinds of files need fixing, in two different places:
 *   1. CLI shims, which live in bin/ and .bin/ directories.
 *   2. Prisma's engines, which do NOT live in a bin/ directory — they sit
 *      beside the package source (e.g. .prisma/client/libquery_engine-*.node
 *      and @prisma/engines/schema-engine-*). Walking only bin/ misses these
 *      entirely, which left the query engine unexecutable on hosts that drop
 *      modes.
 *
 * Node scripts are unaffected because `node file.js` needs no execute bit, so
 * this runs fine even when the binaries it is fixing do not.
 *
 * Safe to run anywhere: it only ever adds permissions, and never fails the
 * build — a host that already sets modes correctly just sees "0 fixed".
 */
import { chmodSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'node_modules';
const MAX_DEPTH = 8;
let fixed = 0;

// Prisma ships its engines outside any bin/ directory.
const NATIVE_FILE = /^(libquery_engine|query-engine-|schema-engine-|libquery_engine-)/;

function isNativeBinary(name) {
  return NATIVE_FILE.test(name);
}

function chmodFilesIn(dir, filter) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (filter && !filter(entry.name)) continue;
    const file = join(dir, entry.name);
    try {
      const mode = statSync(file).mode & 0o777;
      if ((mode & 0o111) === 0o111) continue;
      chmodSync(file, mode | 0o755);
      fixed += 1;
    } catch {
      // Symlink to a missing target, or a read-only file we do not control.
    }
  }
}

function walk(dir, depth) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    if (entry.name === 'bin' || entry.name === '.bin') {
      chmodFilesIn(child);
      continue;
    }
    chmodFilesIn(child, isNativeBinary);
    walk(child, depth + 1);
  }
}

walk(ROOT, 0);
console.log(`[fix-native-bins] restored execute bit on ${fixed} file(s)`);
