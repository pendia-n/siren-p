import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const app = fileURLToPath(new URL("../", import.meta.url));
const secret = readFileSync(join(app, ".env"), "utf8").match(
  /^ZAHARI_JWT_SECRET=([a-f0-9]{64})$/m,
)?.[1];
if (!secret) throw new Error("Project signing secret is missing or invalid.");
execFileSync("git", ["check-ignore", "--quiet", join(app, ".env")], {
  cwd: app,
  stdio: "ignore",
});
const names = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "."],
  { cwd: app, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
for (const name of names) {
  if (/^\.env(?:\.|$)/.test(name) && !name.endsWith(".example"))
    throw new Error("A secret file is not excluded from Git.");
  if (readFileSync(join(app, name)).includes(Buffer.from(secret)))
    throw new Error("A source file contains the signing secret.");
}
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (readFileSync(path).includes(Buffer.from(secret)))
      throw new Error("A public build artifact contains the signing secret.");
  }
}
scan(join(app, "dist/client"));
console.log(
  "PASS: ignored signing secret is absent from source and all public build files.",
);
