import { tokenize, unique } from "./utils.js";

const DEFAULT_OPTIONS = {
  maxResults: 3,
  minScore: 20,
};

export function matchSkills(task, skills, options = {}) {
  const maxResults = Number.isInteger(options.maxResults) ? options.maxResults : DEFAULT_OPTIONS.maxResults;
  const minScore = Number.isInteger(options.minScore) ? options.minScore : DEFAULT_OPTIONS.minScore;
  const taskText = String(task || "").trim();
  const taskLower = taskText.toLowerCase();
  const taskTokens = unique(tokenize(taskText));

  const matches = [];
  for (const skill of skills) {
    const score = scoreSkill(taskLower, taskTokens, skill);
    if (score < minScore) {
      continue;
    }

    matches.push({
      ...skill,
      score
    });
  }

  return matches.sort(compareMatches).slice(0, maxResults);
}

function scoreSkill(taskLower, taskTokens, skill) {
  let score = 0;
  const skillSlug = skill.slug.toLowerCase();
  const skillSlugPhrase = skillSlug.replaceAll("-", " ");
  const skillSlugTokens = tokenize(skillSlug);
  const skillName = String(skill.name || "").toLowerCase();
  const triggerTokens = Array.isArray(skill.triggers) ? skill.triggers.flatMap((item) => tokenize(item)) : [];
  const termSources = new Map();

  addTerms(termSources, skillSlugTokens, "slug");
  addTerms(termSources, tokenize(skillName), "name");
  addTerms(termSources, triggerTokens, "trigger");

  if (taskLower.includes(skillSlug)) {
    score += 100;
  }

  if (skillSlugPhrase.includes(" ") && taskLower.includes(skillSlugPhrase)) {
    score += 95;
  }

  if (skillSlugTokens.length > 1 && skillSlugTokens.every((token) => taskTokens.includes(token))) {
    score += 90;
  }

  if (skillName && skillName.length > 4 && taskLower.includes(skillName)) {
    score += 60;
  }

  for (const trigger of Array.isArray(skill.triggers) ? skill.triggers : []) {
    const lowerTrigger = String(trigger).toLowerCase();
    if (lowerTrigger && taskLower.includes(lowerTrigger)) {
      score += 80 + tokenize(lowerTrigger).length * 5;
    }
  }

  const overlap = [];
  for (const [term, sources] of termSources.entries()) {
    if (isMeaningfulToken(term) && taskTokens.includes(term)) {
      overlap.push({ term, sources });
    }
  }

  for (const { term, sources } of overlap) {
    score += scoreTermOverlap(term, sources);
  }

  if (overlap.length >= 2) {
    score += 10;
  }

  return score;
}

function compareMatches(left, right) {
  return (
    right.score - left.score ||
    left.slug.localeCompare(right.slug) ||
    left.scope.localeCompare(right.scope)
  );
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "do",
  "for",
  "fix",
  "i",
  "in",
  "is",
  "it",
  "need",
  "of",
  "on",
  "run",
  "the",
  "to"
]);

function isMeaningfulToken(token) {
  return token.length >= 3 && !STOPWORDS.has(token);
}

function addTerms(termSources, terms, source) {
  for (const term of unique(terms)) {
    if (!termSources.has(term)) {
      termSources.set(term, new Set());
    }
    termSources.get(term).add(source);
  }
}

function scoreTermOverlap(term, sources) {
  const lengthBonus = term.length >= 8 ? 4 : 0;

  if (sources.has("slug") && sources.has("name")) {
    return 20 + lengthBonus;
  }

  if (sources.has("name")) {
    return 18 + lengthBonus;
  }

  if (sources.has("slug")) {
    return 14 + lengthBonus;
  }

  if (sources.has("trigger")) {
    return 8 + lengthBonus;
  }

  return 0;
}
