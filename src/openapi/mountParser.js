import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, "..", "index.js");
const ROUTES_DIR = path.join(__dirname, "..", "routes");

/**
 * Parse backend/src/index.js for app.use("/api/...", variable) mounts.
 * @returns {Map<string, string>} mountPath -> routes/*.js filename
 */
export function parseRouteMountsFromIndex() {
  const source = fs.readFileSync(INDEX_PATH, "utf8");
  const importMap = new Map();

  for (const match of source.matchAll(
    /import\s+(\w+)\s+from\s+["']\.\/routes\/([^"']+)["']/g,
  )) {
    importMap.set(match[1], match[2]);
  }

  const mounts = new Map();
  for (const match of source.matchAll(
    /app\.use\(\s*["'](\/api\/[^"']+)["']\s*,\s*(\w+)\s*\)/g,
  )) {
    const mountPath = match[1];
    const importName = match[2];
    const routeFile = importMap.get(importName);
    if (routeFile) {
      mounts.set(mountPath, routeFile);
    }
  }

  return mounts;
}

/**
 * @returns {Set<string>} mount paths that apply requireAuthUser (router-level or per-route)
 */
export function scanSecuredMountPaths() {
  const mounts = parseRouteMountsFromIndex();
  const secured = new Set();

  for (const [mountPath, routeFile] of mounts) {
    const filePath = path.join(ROUTES_DIR, routeFile);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (content.includes("requireAuthUser")) {
      secured.add(mountPath);
    }
  }

  return secured;
}
