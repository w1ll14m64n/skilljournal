import { describe, it, expect } from "vitest";
import { parseFrontmatter, tokenize, unique, resolveHome, readTextIfExists } from "../src/utils.js";
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
