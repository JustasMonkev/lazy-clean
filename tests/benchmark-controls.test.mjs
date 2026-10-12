import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const controls = [
  ["train", "5360b1ccb8733245037b736956176e7f95ecb975444fb3c88d2a098d0e82cb01"],
  ["heldout", "430f0f9250c8a062da9bc8747f0f3127bf5fce1ef735ea51a3fb763ac892142a"],
];

for (const [variant, expected] of controls) {
  const file = new URL(`../benchmarks/results/skill-tokens-20261006/grading/known-good-${variant}.ts`, import.meta.url);
  const source = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  assert.equal(createHash("sha256").update(source).digest("hex"), expected,
    `${variant} control changed; review its contents and pinned hash before excluding it`);
}
