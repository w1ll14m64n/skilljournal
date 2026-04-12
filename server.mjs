#!/usr/bin/env node
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listSkills, resolveTriggeredSkills } from "./src/skills.js";
import { appendSkillLearning } from "./src/journal.js";

const server = new McpServer({
  name: "skilljournal",
  version: "1.0.0",
});

const absolutePath = z.string().refine((value) => path.isAbsolute(value), {
  message: "projectRoot must be an absolute path",
});
const nonEmptyTrimmed = z.string().trim().min(1);
const skillSlug = nonEmptyTrimmed.regex(/^[A-Za-z0-9._ -]+$/, {
  message: "skill slug contains unsupported characters",
});
const uniqueSkillSlugs = z.array(skillSlug).min(1).superRefine((value, ctx) => {
  const seen = new Set();
  for (const slug of value) {
    if (seen.has(slug)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate skill slug: ${slug}`,
      });
      return;
    }
    seen.add(slug);
  }
});
const validDate = nonEmptyTrimmed.max(50).refine((value) => !Number.isNaN(new Date(value).getTime()), {
  message: "date must be a valid date string",
});
const matcherOptions = {
  maxSkills: z.number().int().min(1).max(20).optional().describe("Maximum number of matched skills to return"),
  minScore: z.number().int().min(0).max(500).optional().describe("Minimum matcher score required for implicit matches"),
};

// List available skills from Codex and Claude Code directories
server.tool(
  "list_skills",
  {
    projectRoot: absolutePath.describe("Absolute path to the project root"),
    scope: z.enum(["all", "project", "user"]).optional().describe("Filter skills by scope"),
  },
  async ({ projectRoot, scope }) => {
    const skills = await listSkills(projectRoot, { scope: scope || "all" });
    const result = skills.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      scope: skill.scope,
      skillPath: skill.skillPath,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Resolve triggered skills and return prompt-ready skill plus journal context
server.tool(
  "resolve_triggered_skills",
  {
    projectRoot: absolutePath.describe("Absolute path to the project root"),
    scope: z.enum(["all", "project", "user"]).optional().describe("Filter skills by scope"),
    task: z.string().describe("Task text to match skills against"),
    triggeredSkillSlugs: uniqueSkillSlugs.optional().describe("Explicit skill slugs to resolve"),
    ...matcherOptions,
  },
  async ({ projectRoot, scope, task, triggeredSkillSlugs, maxSkills, minScore }) => {
    const result = await resolveTriggeredSkills(projectRoot, task, {
      scope,
      triggeredSkillSlugs: triggeredSkillSlugs || [],
      maxSkills,
      minScore,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Record a critical learning entry to project-local journals
server.tool(
  "record_skill_learning",
  {
    projectRoot: absolutePath.describe("Absolute path to the project root"),
    skillSlugs: uniqueSkillSlugs.describe("Skill slugs to record learning for"),
    title: nonEmptyTrimmed.max(200).describe("Title of the learning entry"),
    learning: nonEmptyTrimmed.max(5000).describe("The learning content"),
    action: nonEmptyTrimmed.max(5000).optional().describe("Action taken"),
    context: nonEmptyTrimmed.max(5000).optional().describe("Additional context"),
    date: validDate.optional().describe("Date string (defaults to today)"),
  },
  async ({ projectRoot, skillSlugs, title, learning, action, context, date }) => {
    const skills = await listSkills(projectRoot);
    const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));
    const missing = skillSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length > 0) {
      throw new Error(`Unknown skill slugs: ${missing.join(", ")}`);
    }

    const appended = [];
    for (const slug of skillSlugs) {
      const journalPath = await appendSkillLearning(projectRoot, slug, {
        title,
        learning,
        action,
        context,
        date,
      });
      appended.push({ slug, journalPath });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ appended, count: appended.length }, null, 2),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
