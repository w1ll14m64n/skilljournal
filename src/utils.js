import os from "node:os";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { parseDocument } from "yaml";

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export function resolveHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function assertAbsoluteProjectRoot(projectRoot) {
  if (!path.isAbsolute(projectRoot)) {
    throw new Error("projectRoot must be an absolute path");
  }
}

export function assertValidSkillSlug(slug) {
  if (typeof slug !== "string" || slug.trim().length === 0) {
    throw new Error("skill slug must be a non-empty string");
  }

  if (!/^[A-Za-z0-9._ -]+$/.test(slug)) {
    throw new Error(`skill slug contains unsupported characters: ${slug}`);
  }
}

export function assertUniqueSkillSlugs(slugs) {
  const seen = new Set();

  for (const slug of slugs) {
    assertValidSkillSlug(slug);
    if (seen.has(slug)) {
      throw new Error(`Duplicate skill slug: ${slug}`);
    }
    seen.add(slug);
  }
}

export function resolveDateString(date) {
  if (!date) {
    return new Date().toISOString().slice(0, 10);
  }

  const trimmed = String(date).trim();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  return parsed.toISOString().slice(0, 10);
}

export function parseFrontmatter(documentText) {
  const normalized = String(documentText).replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { metadata: {}, body: documentText };
  }

  const metadata = parseFrontmatterMetadata(match[1]);

  return {
    metadata,
    body: normalized.slice(match[0].length)
  };
}

function parseFrontmatterMetadata(frontmatterText) {
  const document = parseDocument(frontmatterText, {
    uniqueKeys: false,
    prettyErrors: true,
  });

  if (document.errors.length > 0) {
    throw new Error(`Invalid frontmatter: ${document.errors[0].message}`);
  }

  const parsed = document.toJS();
  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid frontmatter: top-level frontmatter must be a mapping");
  }

  return normalizeFrontmatterValue(parsed);
}

export function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function unique(values) {
  return [...new Set(values)];
}

function normalizeFrontmatterValue(value) {
  if (typeof value === "string") {
    return value.endsWith("\n") ? value.slice(0, -1) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFrontmatterValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeFrontmatterValue(item)])
    );
  }

  return value;
}
