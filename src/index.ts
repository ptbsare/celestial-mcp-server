import { MCPServer } from "mcp-framework";
import { initializeCatalogs, reloadCatalogsIfNeeded } from "./utils/astronomy.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read our own package.json for name/version (works in npx context)
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

await initializeCatalogs();

const server = new MCPServer({
  basePath: __dirname,
  name: pkg.name,
  version: pkg.version,
});
server.start();

// Schedule periodic catalog hot-reload checks every 10 seconds
setInterval(() => {
  reloadCatalogsIfNeeded();
}, 10_000);
