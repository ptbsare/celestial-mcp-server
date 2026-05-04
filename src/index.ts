import { MCPServer } from "mcp-framework";
import { initializeCatalogs } from "./utils/astronomy.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await initializeCatalogs();
const server = new MCPServer({ basePath: __dirname });
server.start();
