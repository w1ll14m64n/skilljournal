import { describe, it, expect } from "vitest";
import matcherCorpus from "./fixtures/matcher-corpus.json";
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

  it("does not match on a single generic token overlap", () => {
    const skills = [skill("fix-auth")];
    expect(matchSkills("fix CSS layout bug", skills)).toEqual([]);
  });

  it("does not match unrelated tasks through stopword overlap in triggers", () => {
    const skills = [skill("deploy-prod", { triggers: ["deploy to production"] })];
    expect(matchSkills("I need to fix tests", skills)).toEqual([]);
  });

  it("stays stable against the matcher corpus", () => {
    const skills = [
      skill("deploy-prod", { name: "Deploy Prod", triggers: ["deploy to prod", "deploy to production"] }),
      skill("fix-auth", { name: "Fix Authentication" }),
      skill("lint", { name: "Run Linter" }),
    ];

    for (const testCase of matcherCorpus) {
      const result = matchSkills(testCase.task, skills).map((item) => item.slug);
      expect(result.slice(0, testCase.expected.length), testCase.task).toEqual(testCase.expected);
      if (testCase.expected.length === 0) {
        expect(result, testCase.task).toEqual([]);
      }
    }
  });

  it("respects maxResults", () => {
    const skills = [
      skill("deploy-prod", { triggers: ["deploy"] }),
      skill("deploy-stage", { triggers: ["deploy"] }),
      skill("deploy-dev", { triggers: ["deploy"] }),
      skill("deploy-qa", { triggers: ["deploy"] }),
    ];
    const result = matchSkills("deploy", skills, { maxResults: 2, minScore: 0 });
    expect(result).toHaveLength(2);
  });

  it("respects minScore", () => {
    const skills = [skill("fix-auth", { name: "Fix Authentication" })];
    expect(matchSkills("authentication is broken", skills, { minScore: 25 })).toEqual([]);
  });
});
