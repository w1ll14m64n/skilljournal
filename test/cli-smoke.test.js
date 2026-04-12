import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const repoRoot = path.dirname(fileURLToPath(new URL("../server.mjs", import.meta.url)));
const codexBin = "/opt/homebrew/bin/codex";
const claudeBin = "/opt/homebrew/bin/claude";
const hasCodex = existsSync(codexBin);
const hasClaude = existsSync(claudeBin);

let tmpHome;

beforeEach(async () => {
  tmpHome = await mkdtemp(path.join(os.tmpdir(), "skilljournal-cli-smoke-"));
});

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true });
});

async function run(command, args) {
  return execFileAsync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: tmpHome,
      XDG_CONFIG_HOME: path.join(tmpHome, ".config"),
      XDG_STATE_HOME: path.join(tmpHome, ".local", "state"),
    },
  });
}

describe("real client smoke", () => {
  it.skipIf(!hasCodex)("registers the server in Codex using an isolated home directory", async () => {
    await run(codexBin, ["mcp", "add", "skilljournal-smoke", "--", "node", path.join(repoRoot, "server.mjs")]);
    const { stdout } = await run(codexBin, ["mcp", "list", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.some((server) => server.name === "skilljournal-smoke")).toBe(true);

    const { stdout: details } = await run(codexBin, ["mcp", "get", "skilljournal-smoke"]);
    expect(details).toContain("skilljournal-smoke");
  });

  it.skipIf(!hasClaude)("registers the server in Claude using an isolated home directory", async () => {
    await run(claudeBin, ["mcp", "add", "--scope", "user", "skilljournal-smoke", "node", path.join(repoRoot, "server.mjs")]);
    const { stdout } = await run(claudeBin, ["mcp", "list"]);
    expect(stdout).toContain("skilljournal-smoke");

    const { stdout: details } = await run(claudeBin, ["mcp", "get", "skilljournal-smoke"]);
    expect(details).toContain("skilljournal-smoke");
  });
});
