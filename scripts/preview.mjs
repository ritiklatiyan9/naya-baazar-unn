// Keep the local database connection out of process arguments and project files.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.stdin.isTTY) {
  process.stdout.write("Enter your Neon connection string (input hidden):\n");
  process.stdin.setRawMode(true);
  let input = "";
  try {
    for await (const block of process.stdin) {
      input += block.toString();
      if (input.includes("\u0003")) process.exit(130);
      if (input.length > 8192) throw new Error("Connection string too long.");
      if (/[\n\r]/.test(input)) break;
    }
  } finally { process.stdin.setRawMode(false); }
  databaseUrl = input.trim();
}
if (!databaseUrl) throw new Error("Set DATABASE_URL or start the preview from an interactive terminal.");
const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.argv[2] === "dev" ? "dev" : "start";
const child = spawn("npm", ["run", command], {cwd:root, env:{...process.env,DATABASE_URL:databaseUrl}, stdio:"inherit"});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal,()=>child.kill(signal));
child.on("exit", code=>process.exit(code ?? 1));
