import { readdir, readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const run = promisify(execFile);
const source = resolve(process.argv[3] ?? "../base");
const command = process.argv[2];
const coins = ["aave", "bnb", "btc", "eth", "link", "sol", "uni", "xaut"];
if (!["upload", "verify"].includes(command)) {
  throw new Error(
    "Usage: node scripts/sync-models.mjs upload|verify [source directory]",
  );
}

const files = [{ key: "SAMPLE.glb", path: join(source, "SAMPLE.glb") }];
for (const coin of coins) {
  const dir = join(source, coin);
  const names = (await readdir(dir)).sort();
  if (!names.length || names.some((name) => !name.endsWith(".glb"))) {
    throw new Error(`Unexpected contents in ${dir}`);
  }
  for (const name of names)
    files.push({ key: `${coin}/${name}`, path: join(dir, name) });
}
if (files.length !== 46)
  throw new Error(`Expected 46 GLB files; found ${files.length}`);

async function hash(path) {
  const bytes = await readFile(path);
  if (
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(8) !== bytes.length
  ) {
    throw new Error(`Invalid GLB: ${path}`);
  }
  return createHash("sha256").update(bytes).digest("hex");
}

let next = 0;
let completed = 0;
const errors = [];
async function worker() {
  while (next < files.length) {
    const file = files[next++];
    let destination;
    try {
      const expected = await hash(file.path);
      if (command === "verify") {
        const temporary = await mkdtemp(join(tmpdir(), "zahari-r2-verify-"));
        destination = join(temporary, "object.glb");
        try {
          await run(
            "pnpm",
            [
              "exec",
              "wrangler",
              "r2",
              "object",
              "get",
              `zahari-models/${file.key}`,
              "--remote",
              `--file=${destination}`,
            ],
            { maxBuffer: 4 * 1024 * 1024 },
          );
          const actual = await hash(destination);
          if (
            actual !== expected ||
            (await stat(destination)).size !== (await stat(file.path)).size
          ) {
            throw new Error("R2 content differs from source");
          }
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
      } else {
        await run(
          "pnpm",
          [
            "exec",
            "wrangler",
            "r2",
            "object",
            "put",
            `zahari-models/${file.key}`,
            "--remote",
            "--content-type=model/gltf-binary",
            `--file=${file.path}`,
          ],
          { maxBuffer: 4 * 1024 * 1024 },
        );
      }
      completed++;
      console.log(
        `PASS ${command} ${completed}/${files.length} ${file.key} ${expected}`,
      );
    } catch (error) {
      errors.push({
        key: file.key,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`FAIL ${command} ${file.key}: ${errors.at(-1).message}`);
    }
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
if (errors.length)
  throw new Error(
    `${errors.length} object(s) failed ${command}; source folder must be retained.`,
  );
console.log(
  `VERIFIED ${command}: ${completed}/${files.length} objects across eight coins plus SAMPLE.glb.`,
);
