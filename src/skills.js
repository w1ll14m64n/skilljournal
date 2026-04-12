import os from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";

import { readJournal } from "./journal.js";
import { matchSkills } from "./matcher.js";
import { assertAbsoluteProjectRoot, assertUniqueSkillSlugs, parseFrontmatter, readTextIfExists } from "./utils.js";

export async function listSkills(projectRoot, options = {}) {
  assertAbsoluteProjectRoot(projectRoot);
  const scope = options.scope || "all";
  const userSkillsDir = options.userSkillsDir || path.join(os.homedir(), ".codex", "skills");
  const projectSkillsDir = options.projectSkillsDir || path.join(projectRoot, ".codex", "skills");
  const userCommandsDir = options.userCommandsDir || path.join(os.homedir(), ".claude", "commands");
  const projectCommandsDir = options.projectCommandsDir || path.join(projectRoot, ".claude", "commands");

  const userSkills = scope === "project" ? [] : await loadSkillsFromDir(userSkillsDir, "user");
  const projectSkills = scope === "user" ? [] : await loadSkillsFromDir(projectSkillsDir, "project");
  const userCommands = scope === "project" ? [] : await loadCommandsFromDir(userCommandsDir, "user");
  const projectCommands = scope === "user" ? [] : await loadCommandsFromDir(projectCommandsDir, "project");

  const merged = new Map();

  for (const skill of userSkills) {
    merged.set(skill.slug, skill);
  }

  for (const skill of userCommands) {
    merged.set(skill.slug, skill);
  }

  for (const skill of projectSkills) {
    merged.set(skill.slug, skill);
  }

  for (const skill of projectCommands) {
    merged.set(skill.slug, skill);
  }

  return [...merged.values()].sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function resolveTriggeredSkills(projectRoot, task, options = {}) {
  assertAbsoluteProjectRoot(projectRoot);
  const triggeredSkillSlugs = options.triggeredSkillSlugs || [];
  assertUniqueSkillSlugs(triggeredSkillSlugs);
  const skills = await listSkills(projectRoot, options);

  const selected = triggeredSkillSlugs.length > 0
    ? resolveExplicitSkills(triggeredSkillSlugs, skills)
    : matchSkills(task, skills, {
      maxResults: options.maxSkills,
      minScore: options.minScore,
    });

  const hydrated = [];
  for (const skill of selected) {
    const journal = await readJournal(projectRoot, skill.slug);
    hydrated.push({
      ...skill,
      journalPath: journal.journalExists ? journal.journalPath : null,
      journalExists: journal.journalExists,
      journalContent: journal.content
    });
  }

  return {
    skills: hydrated.map(toResolvedSkillShape),
    injectionText: renderInjectionText(hydrated, projectRoot),
    usedExplicitTriggers: triggeredSkillSlugs.length > 0
  };
}

function resolveExplicitSkills(triggeredSkillSlugs, skills) {
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));
  const selected = triggeredSkillSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);

  if (selected.length !== triggeredSkillSlugs.length) {
    const found = new Set(selected.map((skill) => skill.slug));
    const missing = triggeredSkillSlugs.filter((slug) => !found.has(slug));
    throw new Error(`Unknown skill slugs: ${missing.join(", ")}`);
  }

  return selected;
}

async function loadSkillsFromDir(skillsDir, scope) {
  const skillDirs = await listSkillDirectories(skillsDir);
  const skills = [];

  for (const skillDir of skillDirs) {
    const slug = path.basename(skillDir);
    const skillPath = path.join(skillDir, "SKILL.md");
    const documentText = await readTextIfExists(skillPath);
    if (documentText === null) {
      continue;
    }

    const { metadata } = parseFrontmatter(documentText);
    const triggers = normalizeTriggers(metadata.triggers);
    skills.push({
      slug,
      name: metadata.name || slug,
      scope,
      skillPath,
      triggers,
      content: documentText
    });
  }

  return skills;
}

async function loadCommandsFromDir(commandsDir, scope) {
  const commands = [];
  let entries;
  try {
    entries = await readdir(commandsDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const mdFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of mdFiles) {
    const slug = entry.name.slice(0, -3);
    if (!slug) {
      continue;
    }

    const commandPath = path.join(commandsDir, entry.name);
    const documentText = await readTextIfExists(commandPath);
    if (documentText === null) {
      continue;
    }

    const { metadata } = parseFrontmatter(documentText);
    const triggers = normalizeTriggers(metadata.triggers);
    commands.push({
      slug,
      name: metadata.name || slug,
      scope,
      skillPath: commandPath,
      triggers,
      content: documentText
    });
  }

  return commands;
}

async function listSkillDirectories(skillsDir) {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => path.join(skillsDir, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function normalizeTriggers(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function toResolvedSkillShape(skill) {
  return {
    slug: skill.slug,
    name: skill.name,
    scope: skill.scope,
    skillPath: skill.skillPath,
    journalPath: skill.journalPath,
    journalExists: skill.journalExists
  };
}

function renderInjectionText(skills, projectRoot) {
  if (skills.length === 0) {
    return "No triggered skills resolved.";
  }

  const skillSections = skills
    .map((skill) => {
      const sections = [
        `=== Skill: ${skill.slug} ===`,
        `Name: ${skill.name}`,
        `Scope: ${skill.scope}`,
        `Path: ${skill.skillPath}`,
        "",
        "SKILL.md:",
        skill.content.trim()
      ];

      if (skill.journalExists && skill.journalContent.trim()) {
        sections.push("", "Journal learnings:", skill.journalContent.trim());
      }

      return sections.join("\n");
    })
    .join("\n\n");

  const slugs = skills.map((s) => `"${s.slug}"`).join(", ");

  const reflection = [
    "---",
    "REFLECTION: After completing your task, call `record_skill_learning` with what you learned.",
    "",
    "  projectRoot: " + JSON.stringify(projectRoot),
    "  skillSlugs: [" + slugs + "]",
    "  title: short summary of what happened",
    "  learning: what worked, what failed, what was unexpected",
    "  action: what you did about it (optional)",
    "  context: the specific task or situation (optional)",
    "",
    "Only journal things worth knowing next time. Skip if nothing new was learned.",
  ].join("\n");

  return skillSections + "\n\n" + reflection;
}
