import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Compatibility is deliberately confined to persisted data and old settings. */
export function applyLegacyEnvironment(env: NodeJS.ProcessEnv = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("PANEL_") && value !== undefined) {
      env[`DREVI_${key.slice(6)}`] ??= value;
    }
  }
}

export function defaultDataDirectory(root = process.cwd()) {
  const current = resolve(root, ".drevi");
  const legacy = resolve(root, ".panel");
  // A staged CUA driver alone is not a new user profile.
  const hasProfile = (path: string) =>
    [
      "state.json",
      "model-providers.json",
      "subagent-settings.json",
      "workspaces",
    ].some((entry) => existsSync(resolve(path, entry)));
  return !hasProfile(current) && hasProfile(legacy) ? legacy : current;
}
