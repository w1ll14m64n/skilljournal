import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { listSkills, resolveTriggeredSkills } from "../src/skills.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "skilljournal-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function createCodexSkill(dir, slug, content) {
  const skillDir = path.join(dir, ".codex", "skills", slug);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
}

async function createClaudeCommand(dir, slug, content) {
  const commandsDir = path.join(dir, ".claude", "commands");
  await mkdir(commandsDir, { recursive: true });
  await writeFile(path.join(commandsDir, `${slug}.md`), content, "utf8");
}

describe("listSkills", () => {
  it("returns empty when no skills exist", async () => {
    const skills = await listSkills(tmpDir, {
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(skills).toEqual([]);
  });

  it("discovers codex-style skills", async () => {
    await createCodexSkill(tmpDir, "deploy", "---\nname: Deploy\n---\n# Deploy");
    const skills = await listSkills(tmpDir, {
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(skills).toHaveLength(1);
    expect(skills[0].slug).toBe("deploy");
    expect(skills[0].name).toBe("Deploy");
    expect(skills[0].scope).toBe("project");
  });

  it("discovers claude command-style skills", async () => {
    await createClaudeCommand(tmpDir, "lint", "---\nname: Lint\n---\n# Lint");
    const skills = await listSkills(tmpDir, {
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(skills).toHaveLength(1);
    expect(skills[0].slug).toBe("lint");
    expect(skills[0].scope).toBe("project");
  });

  it("project skills override user skills with same slug", async () => {
    const userDir = path.join(tmpDir, "user-skills");
    const projectDir = path.join(tmpDir, "project-skills");
    await mkdir(path.join(userDir, "deploy"), { recursive: true });
    await writeFile(path.join(userDir, "deploy", "SKILL.md"), "---\nname: User Deploy\n---\n");
    await mkdir(path.join(projectDir, "deploy"), { recursive: true });
    await writeFile(path.join(projectDir, "deploy", "SKILL.md"), "---\nname: Project Deploy\n---\n");

    const skills = await listSkills(tmpDir, {
      userSkillsDir: userDir,
      projectSkillsDir: projectDir,
      userCommandsDir: path.join(tmpDir, "empty"),
      projectCommandsDir: path.join(tmpDir, "empty2"),
    });

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("Project Deploy");
  });

  it("sorts skills alphabetically by slug", async () => {
    await createCodexSkill(tmpDir, "zebra", "# Zebra");
    await createCodexSkill(tmpDir, "alpha", "# Alpha");
    const skills = await listSkills(tmpDir, {
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(skills.map((s) => s.slug)).toEqual(["alpha", "zebra"]);
  });
});

describe("resolveTriggeredSkills", () => {
  it("resolves explicit slugs", async () => {
    await createCodexSkill(tmpDir, "deploy", "---\nname: Deploy\n---\n# Deploy steps");
    const result = await resolveTriggeredSkills(tmpDir, "anything", {
      triggeredSkillSlugs: ["deploy"],
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].slug).toBe("deploy");
    expect(result.usedExplicitTriggers).toBe(true);
    expect(result.injectionText).toContain("Deploy steps");
  });

  it("matches skills by task text", async () => {
    await createCodexSkill(tmpDir, "deploy", '---\nname: Deploy\ntriggers: ["deploy to prod"]\n---\n# Steps');
    const result = await resolveTriggeredSkills(tmpDir, "I need to deploy to prod", {
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(result.skills).toHaveLength(1);
    expect(result.usedExplicitTriggers).toBe(false);
  });

  it("includes journal content in injection text", async () => {
    const { appendSkillLearning } = await import("../src/journal.js");
    await createCodexSkill(tmpDir, "deploy", "---\nname: Deploy\n---\n# Deploy");
    await appendSkillLearning(tmpDir, "deploy", {
      title: "Timeout fix",
      learning: "Increase timeout to 300s",
      date: "2026-04-09",
    });

    const result = await resolveTriggeredSkills(tmpDir, "run deploy now", {
      triggeredSkillSlugs: ["deploy"],
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(result.injectionText).toContain("Timeout fix");
    expect(result.injectionText).toContain("Increase timeout to 300s");
  });

  it("returns no skills when nothing matches", async () => {
    await createCodexSkill(tmpDir, "deploy", "---\nname: Deploy\n---\n# Deploy");
    const result = await resolveTriggeredSkills(tmpDir, "fix CSS layout bug", {
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(result.skills).toEqual([]);
    expect(result.injectionText).toContain("No triggered skills");
  });

  it("includes reflection prompt in injection text", async () => {
    await createCodexSkill(tmpDir, "deploy", "---\nname: Deploy\n---\n# Deploy");
    const result = await resolveTriggeredSkills(tmpDir, "run deploy", {
      triggeredSkillSlugs: ["deploy"],
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(result.injectionText).toContain("REFLECTION");
    expect(result.injectionText).toContain("record_skill_learning");
    expect(result.injectionText).toContain('"deploy"');
    expect(result.injectionText).toContain(tmpDir);
  });

  it("no reflection prompt when no skills match", async () => {
    await createCodexSkill(tmpDir, "deploy", "---\nname: Deploy\n---\n# Deploy");
    const result = await resolveTriggeredSkills(tmpDir, "fix CSS layout bug", {
      userSkillsDir: path.join(tmpDir, "empty"),
      userCommandsDir: path.join(tmpDir, "empty2"),
    });
    expect(result.injectionText).not.toContain("REFLECTION");
  });

  it("throws on unknown explicit slugs", async () => {
    await expect(
      resolveTriggeredSkills(tmpDir, "anything", {
        triggeredSkillSlugs: ["nonexistent"],
        userSkillsDir: path.join(tmpDir, "empty"),
        userCommandsDir: path.join(tmpDir, "empty2"),
      })
    ).rejects.toThrow("Unknown skill slugs: nonexistent");
  });
});
