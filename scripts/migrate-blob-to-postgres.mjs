import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { list } from "@vercel/blob";

import { createState, readState } from "../api/db.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env.local");
const defaultTripId = "OC64-LBTRKJqjxMHWnQQHkjuAustdgE7";

function parseEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvFile() {
  try {
    const env = await readFile(envPath, "utf8");
    for (const line of env.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = parseEnvValue(match[2]);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readTripBlob(tripId) {
  const pathname = `trips/${tripId}.json`;
  const result = await list({ prefix: pathname, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === pathname);
  if (!blob) throw new Error(`Trip blob not found: ${pathname}`);
  const response = await fetch(blob.downloadUrl || blob.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to read ${pathname}: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  await loadEnvFile();
  const tripId = process.argv[2] || defaultTripId;
  const existing = await readState(tripId);
  if (existing) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "already_imported", tripId, version: existing.version }));
    return;
  }

  const state = await readTripBlob(tripId);
  const imported = await createState(state, tripId);
  console.log(
    JSON.stringify({
      ok: true,
      tripId,
      people: imported.state.people.length,
      expenses: imported.state.expenses.length,
      version: imported.state.version,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
