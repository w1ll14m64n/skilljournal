#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listSkills, resolveTriggeredSkills } from "./src/skills.js";
import { appendSkillLearning } from "./src/journal.js";

const server = new McpServer({
  name: "skilljournal",
  version: "1.0.0",
});

// List available skills from Codex and Claude Code directories
server.tool(
  "list_skills",
  {
    projectRoot: z.string().describe("Absolute path to the project root"),
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
    projectRoot: z.string().describe("Absolute path to the project root"),
    task: z.string().describe("Task text to match skills against"),
    triggeredSkillSlugs: z.array(z.string()).optional().describe("Explicit skill slugs to resolve"),
  },
  async ({ projectRoot, task, triggeredSkillSlugs }) => {
    const result = await resolveTriggeredSkills(projectRoot, task, {
      triggeredSkillSlugs: triggeredSkillSlugs || [],
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
    projectRoot: z.string().describe("Absolute path to the project root"),
    skillSlugs: z.array(z.string()).min(1).describe("Skill slugs to record learning for"),
    title: z.string().describe("Title of the learning entry"),
    learning: z.string().describe("The learning content"),
    action: z.string().optional().describe("Action taken"),
    context: z.string().optional().describe("Additional context"),
    date: z.string().optional().describe("Date string (defaults to today)"),
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
