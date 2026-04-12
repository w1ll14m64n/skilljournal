import { describe, it, expect } from "vitest";
import {
  assertUniqueSkillSlugs,
  parseFrontmatter,
  tokenize,
  unique,
  resolveHome,
  readTextIfExists,
  resolveDateString
} from "../src/utils.js";
import os from "node:os";
import path from "node:path";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric", () => {
    expect(tokenize("Deploy-to-Prod")).toEqual(["deploy", "to", "prod"]);
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });

  it("strips leading/trailing separators", () => {
    expect(tokenize("--hello--world--")).toEqual(["hello", "world"]);
  });
});

describe("unique", () => {
  it("deduplicates values", () => {
    expect(unique(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("handles empty array", () => {
    expect(unique([])).toEqual([]);
  });
});

describe("parseFrontmatter", () => {
  it("parses name and triggers", () => {
    const doc = `---\nname: "Deploy"\ntriggers: ["deploy", "release"]\n---\n# Content`;
    const { metadata, body } = parseFrontmatter(doc);
    expect(metadata.name).toBe("Deploy");
    expect(metadata.triggers).toEqual(["deploy", "release"]);
    expect(body).toBe("# Content");
  });

  it("returns empty metadata when no frontmatter", () => {
    const doc = "# Just markdown";
    const { metadata, body } = parseFrontmatter(doc);
    expect(metadata).toEqual({});
    expect(body).toBe("# Just markdown");
  });

  it("parses boolean values", () => {
    const doc = `---\nenabled: true\ndisabled: false\n---\n`;
    const { metadata } = parseFrontmatter(doc);
    expect(metadata.enabled).toBe(true);
    expect(metadata.disabled).toBe(false);
  });

  it("parses integer values", () => {
    const doc = `---\npriority: 42\n---\n`;
    const { metadata } = parseFrontmatter(doc);
    expect(metadata.priority).toBe(42);
  });

  it("parses empty array", () => {
    const doc = `---\ntriggers: []\n---\n`;
    const { metadata } = parseFrontmatter(doc);
    expect(metadata.triggers).toEqual([]);
  });

  it("handles single-quoted strings in arrays", () => {
    const doc = `---\ntriggers: ['one', 'two']\n---\n`;
    const { metadata } = parseFrontmatter(doc);
    expect(metadata.triggers).toEqual(["one", "two"]);
  });

  it("parses CRLF frontmatter", () => {
    const doc = "---\r\nname: Deploy\r\ntriggers: [\"deploy\"]\r\n---\r\n# Content";
    const { metadata, body } = parseFrontmatter(doc);
    expect(metadata.name).toBe("Deploy");
    expect(metadata.triggers).toEqual(["deploy"]);
    expect(body).toBe("# Content");
  });

  it("parses block-list arrays", () => {
    const doc = `---\nname: "Deploy"\ntriggers:\n  - deploy\n  - release\n---\n# Content`;
    const { metadata } = parseFrontmatter(doc);
    expect(metadata.triggers).toEqual(["deploy", "release"]);
  });

  it("parses multiline block scalars", () => {
    const doc = `---\ndescription: |\n  line one\n  line two\n---\n# Content`;
    const { metadata } = parseFrontmatter(doc);
    expect(metadata.description).toBe("line one\nline two");
  });

  it("parses nested YAML metadata", () => {
    const doc = `---\nmeta:\n  owner: ops\n  tags:\n    - deploy\n    - release\n---\n# Content`;
    const { metadata } = parseFrontmatter(doc);
    expect(metadata.meta).toEqual({
      owner: "ops",
      tags: ["deploy", "release"],
    });
  });

  it("throws on invalid YAML frontmatter", () => {
    const doc = `---\nname: [unterminated\n---\n# Content`;
    expect(() => parseFrontmatter(doc)).toThrow("Invalid frontmatter");
  });
});

describe("resolveHome", () => {
  it("expands ~ to homedir", () => {
    expect(resolveHome("~")).toBe(os.homedir());
  });

  it("expands ~/path", () => {
    expect(resolveHome("~/foo/bar")).toBe(path.join(os.homedir(), "foo/bar"));
  });

  it("leaves absolute paths alone", () => {
    expect(resolveHome("/usr/bin")).toBe("/usr/bin");
  });

  it("returns falsy input as-is", () => {
    expect(resolveHome("")).toBe("");
    expect(resolveHome(null)).toBe(null);
  });
});

describe("readTextIfExists", () => {
  it("returns null for missing file", async () => {
    const result = await readTextIfExists("/tmp/skilljournal-test-nonexistent-file");
    expect(result).toBe(null);
  });
});

describe("assertUniqueSkillSlugs", () => {
  it("accepts unique valid slugs", () => {
    expect(() => assertUniqueSkillSlugs(["deploy-prod", "lint"])).not.toThrow();
  });

  it("rejects duplicates", () => {
    expect(() => assertUniqueSkillSlugs(["deploy-prod", "deploy-prod"])).toThrow(
      "Duplicate skill slug: deploy-prod"
    );
  });
});

describe("resolveDateString", () => {
  it("normalizes valid dates", () => {
    expect(resolveDateString("2026-04-09T14:30:00Z")).toBe("2026-04-09");
  });

  it("rejects invalid dates", () => {
    expect(() => resolveDateString("not-a-date")).toThrow("Invalid date: not-a-date");
  });
});
