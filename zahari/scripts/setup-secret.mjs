import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const path = fileURLToPath(new URL("../.env", import.meta.url));
execFileSync("git", ["check-ignore", "--quiet", path], {
  cwd: project,
  stdio: "ignore",
});
if (existsSync(path)) {
  console.log("Existing .env preserved. No secret was generated or rotated.");
} else {
  const secret = execFileSync("openssl", ["rand", "-hex", "32"], {
    encoding: "utf8",
  }).trim();
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new Error("OpenSSL did not generate a 32-byte key.");
  writeFileSync(path, `ZAHARI_JWT_SECRET=${secret}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  console.log(
    "ZAHARI_JWT_SECRET generated with OpenSSL and saved in ignored .env (mode 600).",
  );
}
