import os from "node:os";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";

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

export function parseFrontmatter(documentText) {
  const match = documentText.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { metadata: {}, body: documentText };
  }

  const metadata = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const index = trimmed.indexOf(":");
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    metadata[key] = parseFrontmatterValue(value);
  }

  return {
    metadata,
    body: documentText.slice(match[0].length)
  };
}

function parseFrontmatterValue(rawValue) {
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    const inner = rawValue.slice(1, -1).trim();
    if (!inner) {
      return [];
    }

    return splitTopLevel(inner).map((part) => stripQuotes(part.trim()));
  }

  if (rawValue === "true" || rawValue === "false") {
    return rawValue === "true";
  }

  if (/^-?\d+$/.test(rawValue)) {
    return Number(rawValue);
  }

  return stripQuotes(rawValue);
}

function splitTopLevel(input, delimiter = ",") {
  const parts = [];
  let current = "";
  let quote = null;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quote) {
      current += character;
      if (character === quote && input[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === "\"") {
      quote = character;
      current += character;
      continue;
    }

    if (character === delimiter) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function stripQuotes(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
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
