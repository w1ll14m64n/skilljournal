import path from "node:path";
import { appendFile } from "node:fs/promises";

import {
  assertAbsoluteProjectRoot,
  assertValidSkillSlug,
  ensureDir,
  readTextIfExists,
  resolveDateString
} from "./utils.js";

export function journalPathForSkill(projectRoot, slug) {
  assertAbsoluteProjectRoot(projectRoot);
  assertValidSkillSlug(slug);

  const journalRoot = path.join(projectRoot, ".journal");
  const journalPath = path.join(journalRoot, `${slug}.md`);
  const relativePath = path.relative(journalRoot, journalPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`skill slug resolves outside journal directory: ${slug}`);
  }

  return journalPath;
}

export async function readJournal(projectRoot, slug) {
  const journalPath = journalPathForSkill(projectRoot, slug);
  const content = await readTextIfExists(journalPath);
  return {
    journalPath,
    journalExists: content !== null,
    content: content || ""
  };
}

export async function appendSkillLearning(projectRoot, slug, entry) {
  const journalPath = journalPathForSkill(projectRoot, slug);
  await ensureDir(path.dirname(journalPath));
  await appendFile(journalPath, renderJournalEntry(entry), "utf8");
  return journalPath;
}

export function renderJournalEntry(entry) {
  const lines = [`## ${resolveEntryDate(entry)} - ${String(entry.title).trim()}`, `Learning: ${String(entry.learning).trim()}`];

  if (entry.action) {
    lines.push(`Action: ${String(entry.action).trim()}`);
  }

  if (entry.context) {
    lines.push(`Context: ${String(entry.context).trim()}`);
  }

  return `${lines.join("\n")}\n\n`;
}

function resolveEntryDate(entry) {
  return resolveDateString(entry.date);
}
