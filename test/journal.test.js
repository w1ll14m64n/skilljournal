import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readJournal, appendSkillLearning, renderJournalEntry } from "../src/journal.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "skilljournal-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("readJournal", () => {
  it("returns empty content when journal does not exist", async () => {
    const result = await readJournal(tmpDir, "nonexistent");
    expect(result.journalExists).toBe(false);
    expect(result.content).toBe("");
    expect(result.journalPath).toBe(path.join(tmpDir, ".journal", "nonexistent.md"));
  });
});

describe("appendSkillLearning", () => {
  it("creates journal dir and file, appends entry", async () => {
    const journalPath = await appendSkillLearning(tmpDir, "deploy", {
      title: "Timeout issue",
      learning: "Need longer timeout for large bundles",
      date: "2026-04-09",
    });

    expect(journalPath).toBe(path.join(tmpDir, ".journal", "deploy.md"));
    const content = await readFile(journalPath, "utf8");
    expect(content).toContain("## 2026-04-09 - Timeout issue");
    expect(content).toContain("Learning: Need longer timeout for large bundles");
  });

  it("appends multiple entries", async () => {
    await appendSkillLearning(tmpDir, "deploy", {
      title: "First",
      learning: "First learning",
      date: "2026-04-01",
    });
    await appendSkillLearning(tmpDir, "deploy", {
      title: "Second",
      learning: "Second learning",
      date: "2026-04-02",
    });

    const content = await readFile(path.join(tmpDir, ".journal", "deploy.md"), "utf8");
    expect(content).toContain("## 2026-04-01 - First");
    expect(content).toContain("## 2026-04-02 - Second");
  });

  it("includes action and context when provided", async () => {
    await appendSkillLearning(tmpDir, "deploy", {
      title: "Fix",
      learning: "Something broke",
      action: "Added flag",
      context: "Production deploy",
      date: "2026-04-09",
    });

    const content = await readFile(path.join(tmpDir, ".journal", "deploy.md"), "utf8");
    expect(content).toContain("Action: Added flag");
    expect(content).toContain("Context: Production deploy");
  });
});

describe("renderJournalEntry", () => {
  it("renders minimal entry", () => {
    const result = renderJournalEntry({
      title: "Bug found",
      learning: "Off by one error",
      date: "2026-01-15",
    });
    expect(result).toBe("## 2026-01-15 - Bug found\nLearning: Off by one error\n\n");
  });

  it("renders full entry with action and context", () => {
    const result = renderJournalEntry({
      title: "Deploy fix",
      learning: "Timeout was too short",
      action: "Bumped to 300s",
      context: "Q2 release",
      date: "2026-04-09",
    });
    expect(result).toContain("Action: Bumped to 300s");
    expect(result).toContain("Context: Q2 release");
  });

  it("extracts date from ISO string", () => {
    const result = renderJournalEntry({
      title: "Test",
      learning: "Test",
      date: "2026-04-09T14:30:00Z",
    });
    expect(result).toContain("## 2026-04-09 - Test");
  });
});

describe("readJournal after append", () => {
  it("returns existing journal content", async () => {
    await appendSkillLearning(tmpDir, "auth", {
      title: "Token expiry",
      learning: "Tokens expire after 1h",
      date: "2026-03-01",
    });

    const result = await readJournal(tmpDir, "auth");
    expect(result.journalExists).toBe(true);
    expect(result.content).toContain("Token expiry");
  });
});
