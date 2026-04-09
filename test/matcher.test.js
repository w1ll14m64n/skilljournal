import { describe, it, expect } from "vitest";
import { matchSkills } from "../src/matcher.js";

function skill(slug, opts = {}) {
  return {
    slug,
    name: opts.name || slug,
    scope: opts.scope || "project",
    skillPath: `/skills/${slug}/SKILL.md`,
    triggers: opts.triggers || [],
    content: opts.content || `# ${slug}`,
  };
}

describe("matchSkills", () => {
  it("returns empty for no match", () => {
    const skills = [skill("deploy-prod", { triggers: ["deploy"] })];
    expect(matchSkills("fix the CSS layout", skills)).toEqual([]);
  });

  it("matches on exact slug in task", () => {
    const skills = [skill("deploy-prod")];
    const result = matchSkills("run deploy-prod now", skills);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("deploy-prod");
    expect(result[0].score).toBeGreaterThanOrEqual(100);
  });

  it("matches on trigger phrase", () => {
    const skills = [skill("db-migrate", { triggers: ["database migration"] })];
    const result = matchSkills("I need to run a database migration", skills);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("db-migrate");
  });

  it("ranks higher-scoring skills first", () => {
    const skills = [
      skill("auth", { triggers: ["login"] }),
      skill("deploy-prod", { triggers: ["deploy to production"] }),
    ];
    const result = matchSkills("deploy to production", skills);
    expect(result[0].slug).toBe("deploy-prod");
  });

  it("matches on vocabulary overlap", () => {
    const skills = [skill("fix-auth", { name: "Fix Authentication" })];
    const result = matchSkills("authentication is broken", skills);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("fix-auth");
  });

  it("handles empty task", () => {
    const skills = [skill("deploy-prod")];
    expect(matchSkills("", skills)).toEqual([]);
    expect(matchSkills(null, skills)).toEqual([]);
  });

  it("handles empty skills list", () => {
    expect(matchSkills("deploy something", [])).toEqual([]);
  });

  it("matches slug tokens spread across task", () => {
    const skills = [skill("fix-auth")];
    const result = matchSkills("I need to fix the auth module", skills);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeGreaterThanOrEqual(90);
  });

  it("matches skill name longer than 4 chars", () => {
    const skills = [skill("lint", { name: "Run Linter" })];
    const result = matchSkills("run linter on the project", skills);
    expect(result).toHaveLength(1);
  });
});
