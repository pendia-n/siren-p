import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
const execute = promisify(execFile);
async function exec(...args) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await execute(...args);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}
const root = new URL("../", import.meta.url).pathname;
const source = new URL("../../preview/", import.meta.url).pathname;
const counts = {
  AAVE: 4,
  BNB: 6,
  BTC: 8,
  ETH: 8,
  LINK: 6,
  SOL: 6,
  UNI: 4,
  XAUT: 3,
};
const expected = Object.entries(counts).flatMap(([coin, n]) =>
  Array.from(
    { length: n },
    (_, i) => `${coin}${String(i + 1).padStart(2, "0")}.png`,
  ),
);
const files = await readdir(source);
if (expected.some((file) => !files.includes(file)))
  throw new Error("Missing preview");
const env = {
  ...process.env,
  WRANGLER_LOG_PATH: join(tmpdir(), "zahari-r2-previews.log"),
};
const directory = await mkdtemp(join(tmpdir(), "zahari-preview-verify-"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let next = 0;
try {
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < expected.length) {
        const file = expected[next++];
        const key = `zahari-models/preview/${file}`;
        await exec(
          join(root, "node_modules/.bin/wrangler"),
          [
            "r2",
            "object",
            "put",
            key,
            "--remote",
            "--file",
            join(source, file),
            "--content-type",
            "image/png",
          ],
          { cwd: root, env },
        );
        await exec(
          join(root, "node_modules/.bin/wrangler"),
          [
            "r2",
            "object",
            "get",
            key,
            "--remote",
            "--file",
            join(directory, file),
          ],
          { cwd: root, env },
        );
        if (
          hash(await readFile(join(source, file))) !==
          hash(await readFile(join(directory, file)))
        )
          throw new Error(`Mismatch: ${file}`);
        console.log(`Verified ${file}`);
      }
    }),
  );
  console.log(
    `All ${expected.length} previews uploaded and SHA-256 verified. Originals retained.`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
