import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { list, put } from "@vercel/blob";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env.local");
const backupRoot = path.join(projectRoot, "backups", "json");

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvFile() {
  const env = await readFile(envPath, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = parseEnvValue(match[2]);
  }
}

async function collectBlobs(prefix) {
  let cursor;
  const blobs = [];
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function readBlobText(blob) {
  const response = await fetch(blob.downloadUrl || blob.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to read ${blob.pathname}: HTTP ${response.status}`);
  }
  return response.text();
}

async function main() {
  await loadEnvFile();

  const stamp = timestamp();
  const tripBlobs = await collectBlobs("trips/");
  const legacyBlobs = (await collectBlobs("state.json")).filter((blob) => blob.pathname === "state.json");
  const sourceBlobs = [...tripBlobs, ...legacyBlobs].sort((a, b) => a.pathname.localeCompare(b.pathname));

  const localDir = path.join(backupRoot, stamp);
  await mkdir(localDir, { recursive: true });

  const manifest = {
    timestamp: stamp,
    createdAt: new Date().toISOString(),
    sourceCount: sourceBlobs.length,
    sources: [],
  };

  for (const blob of sourceBlobs) {
    const text = await readBlobText(blob);
    JSON.parse(text);

    const relativePath = blob.pathname;
    const localPath = path.join(localDir, relativePath);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, text, "utf8");

    const backupPathname = `backups/json/${stamp}/${relativePath}`;
    await put(backupPathname, text, {
      access: "public",
      allowOverwrite: false,
      contentType: "application/json",
    });

    manifest.sources.push({
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      localPath: path.relative(projectRoot, localPath),
      backupPathname,
    });
  }

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(localDir, "manifest.json"), manifestText, "utf8");
  await put(`backups/json/${stamp}/manifest.json`, manifestText, {
    access: "public",
    allowOverwrite: false,
    contentType: "application/json",
  });

  console.log(JSON.stringify({ ok: true, timestamp: stamp, sourceCount: sourceBlobs.length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
