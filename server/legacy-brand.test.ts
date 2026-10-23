import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyLegacyEnvironment,
  defaultDataDirectory,
} from "./legacy-brand.ts";

test("legacy provider and data settings remain usable; Drevi values win", () => {
  const env: NodeJS.ProcessEnv = {
    PANEL_DATA_DIR: "/old/data",
    PANEL_DEFAULT_MODEL: "old/model",
    DREVI_DEFAULT_MODEL: "new/model",
    HOME: "/home/test",
  };
  applyLegacyEnvironment(env);
  assert.equal(env.DREVI_DATA_DIR, "/old/data");
  assert.equal(env.DREVI_DEFAULT_MODEL, "new/model");
  assert.equal(env.HOME, "/home/test");
});

test("legacy storage is reused without moving files or overwriting a new directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "drevi-migration-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(defaultDataDirectory(root), join(root, ".drevi"));
  await mkdir(join(root, ".panel"));
  await writeFile(join(root, ".panel", "state.json"), "{}");
  assert.equal(defaultDataDirectory(root), join(root, ".panel"));
  await mkdir(join(root, ".drevi", "cua-driver"), { recursive: true });
  assert.equal(defaultDataDirectory(root), join(root, ".panel"));
  await writeFile(join(root, ".drevi", "state.json"), "{}");
  assert.equal(defaultDataDirectory(root), join(root, ".drevi"));
});
