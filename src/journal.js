import path from "node:path";
import { appendFile, access, writeFile } from "node:fs/promises";

import { ensureDir, readTextIfExists } from "./utils.js";

export function journalPathForSkill(projectRoot, slug) {
  return path.join(projectRoot, ".journal", `${slug}.md`);
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
  await ensureFile(journalPath);
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

async function ensureFile(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(filePath, "", "utf8");
  }
}

function resolveEntryDate(entry) {
  return String(entry.date || new Date().toISOString()).slice(0, 10);
}
