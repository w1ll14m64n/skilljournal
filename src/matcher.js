import { tokenize, unique } from "./utils.js";

export function matchSkills(task, skills) {
  const taskText = String(task || "").trim();
  const taskLower = taskText.toLowerCase();
  const taskTokens = unique(tokenize(taskText));

  const matches = [];
  for (const skill of skills) {
    const score = scoreSkill(taskLower, taskTokens, skill);
    if (score <= 0) {
      continue;
    }

    matches.push({
      ...skill,
      score
    });
  }

  return matches.sort(compareMatches);
}

function scoreSkill(taskLower, taskTokens, skill) {
  let score = 0;
  const skillSlug = skill.slug.toLowerCase();
  const skillSlugPhrase = skillSlug.replaceAll("-", " ");
  const skillSlugTokens = tokenize(skillSlug);
  const skillName = String(skill.name || "").toLowerCase();
  const terms = unique([
    skillSlug,
    ...skillSlugTokens,
    ...tokenize(skillName),
    ...(Array.isArray(skill.triggers) ? skill.triggers.flatMap((item) => tokenize(item)) : [])
  ]);

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

  for (const term of terms) {
    if (term.length < 2) {
      continue;
    }

    if (taskTokens.includes(term)) {
      score += 10;
    }
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
