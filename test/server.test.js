import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = path.dirname(fileURLToPath(new URL("../server.mjs", import.meta.url)));

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "skilljournal-e2e-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function createSkill(slug, content) {
  const skillDir = path.join(tmpDir, ".codex", "skills", slug);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
}

async function withClient(run) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["server.mjs"],
    cwd: repoRoot,
    stderr: "pipe",
  });
  const client = new Client(
    {
      name: "skilljournal-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  const stderr = [];
  transport.stderr?.on("data", (chunk) => {
    stderr.push(String(chunk));
  });

  try {
    await client.connect(transport);
    return await run(client);
  } catch (error) {
    if (stderr.length > 0 && error instanceof Error) {
      error.message += `\nServer stderr:\n${stderr.join("")}`;
    }
    throw error;
  } finally {
    await client.close();
  }
}

function readTextContent(result) {
  return JSON.parse(result.content.find((item) => item.type === "text").text);
}

function readErrorText(result) {
  return result.content.find((item) => item.type === "text").text;
}

describe("server integration", () => {
  it("lists tools and executes the full skill resolution flow over stdio", async () => {
    await createSkill("deploy-prod", "---\nname: Deploy Prod\ntriggers:\n  - deploy to prod\n---\n# Deploy steps");

    await withClient(async (client) => {
      const toolsResult = await client.listTools();
      expect(toolsResult.tools.map((tool) => tool.name).sort()).toEqual([
        "list_skills",
        "record_skill_learning",
        "resolve_triggered_skills",
      ]);

      const listedSkills = readTextContent(
        await client.callTool({
          name: "list_skills",
          arguments: {
            projectRoot: tmpDir,
            scope: "project",
          },
        })
      );
      expect(listedSkills).toEqual([
        expect.objectContaining({
          slug: "deploy-prod",
          name: "Deploy Prod",
          scope: "project",
        }),
      ]);

      const resolved = readTextContent(
        await client.callTool({
          name: "resolve_triggered_skills",
          arguments: {
            projectRoot: tmpDir,
            scope: "project",
            task: "please deploy to prod",
          },
        })
      );

      expect(resolved.skills).toEqual([
        expect.objectContaining({
          slug: "deploy-prod",
          journalExists: false,
        }),
      ]);
      expect(resolved.injectionText).toContain("Deploy steps");
      expect(resolved.injectionText).toContain("record_skill_learning");

      const recorded = readTextContent(
        await client.callTool({
          name: "record_skill_learning",
          arguments: {
            projectRoot: tmpDir,
            skillSlugs: ["deploy-prod"],
            title: "Timeout issue",
            learning: "Increase timeout to 300s",
            action: "Raised deploy timeout",
          },
        })
      );
      expect(recorded.count).toBe(1);

      const journalPath = path.join(tmpDir, ".journal", "deploy-prod.md");
      const journalContent = await readFile(journalPath, "utf8");
      expect(journalContent).toContain("Timeout issue");
      expect(journalContent).toContain("Increase timeout to 300s");

      const resolvedAgain = readTextContent(
        await client.callTool({
          name: "resolve_triggered_skills",
          arguments: {
            projectRoot: tmpDir,
            scope: "project",
            triggeredSkillSlugs: ["deploy-prod"],
            task: "anything",
          },
        })
      );
      expect(resolvedAgain.injectionText).toContain("Journal learnings:");
      expect(resolvedAgain.injectionText).toContain("Increase timeout to 300s");
    });
  });

  it("rejects invalid tool inputs at the MCP boundary", async () => {
    await createSkill("deploy-prod", "# Deploy steps");

    await withClient(async (client) => {
      const invalidRoot = await client.callTool({
        name: "list_skills",
        arguments: {
          projectRoot: "relative/path",
        },
      });
      expect(invalidRoot.isError).toBe(true);
      expect(readErrorText(invalidRoot)).toContain("projectRoot must be an absolute path");

      const duplicateSlug = await client.callTool({
        name: "record_skill_learning",
        arguments: {
          projectRoot: tmpDir,
          skillSlugs: ["deploy-prod", "deploy-prod"],
          title: "Duplicate",
          learning: "Duplicate",
        },
      });
      expect(duplicateSlug.isError).toBe(true);
      expect(readErrorText(duplicateSlug)).toContain("Duplicate skill slug: deploy-prod");

      const emptyFields = await client.callTool({
        name: "record_skill_learning",
        arguments: {
          projectRoot: tmpDir,
          skillSlugs: ["deploy-prod"],
          title: "   ",
          learning: "   ",
        },
      });
      expect(emptyFields.isError).toBe(true);
      expect(readErrorText(emptyFields)).toContain("Too small");

      const invalidDate = await client.callTool({
        name: "record_skill_learning",
        arguments: {
          projectRoot: tmpDir,
          skillSlugs: ["deploy-prod"],
          title: "Bad date",
          learning: "Bad date",
          date: "not-a-date",
        },
      });
      expect(invalidDate.isError).toBe(true);
      expect(readErrorText(invalidDate)).toContain("date must be a valid date string");

      const duplicateExplicitTriggers = await client.callTool({
        name: "resolve_triggered_skills",
        arguments: {
          projectRoot: tmpDir,
          scope: "project",
          task: "anything",
          triggeredSkillSlugs: ["deploy-prod", "deploy-prod"],
        },
      });
      expect(duplicateExplicitTriggers.isError).toBe(true);
      expect(readErrorText(duplicateExplicitTriggers)).toContain("Duplicate skill slug: deploy-prod");
    });
  });
});
