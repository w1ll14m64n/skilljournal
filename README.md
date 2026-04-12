<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/open-book_1f4d6.png" width="120" />
</p>

<h1 align="center">SkillJournal</h1>

<p align="center">
  <strong>skills that improve themselves</strong>
</p>

<p align="center">
  <a href="https://github.com/theluckyloop/skilljournal/stargazers"><img src="https://img.shields.io/github/stars/theluckyloop/skilljournal?style=flat" alt="Stars"></a>
  <a href="https://github.com/theluckyloop/skilljournal/commits/main"><img src="https://img.shields.io/github/last-commit/theluckyloop/skilljournal?style=flat" alt="Last Commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/theluckyloop/skilljournal?style=flat" alt="License"></a>
</p>

<p align="center">
  <a href="#why-this-exists">Why</a> •
  <a href="#the-idea">The idea</a> •
  <a href="#setup">Setup</a> •
  <a href="#recommended-agent-pattern">Agent Pattern</a> •
  <a href="#skill-discovery">Skills</a> •
  <a href="#journals">Journals</a> •
  <a href="#reading">Reading</a>
</p>

---

Write the skills.
The agent uses them.
skilljournal learns from them.

A lightweight MCP server that gives Claude Code and Codex CLI persistent skill memory with learning journals — so agents don't repeat mistakes and get better every time a skill runs.

## Why this exists

Agents are good at following instructions.
They're bad at writing them.

The [SkillsBench paper](https://arxiv.org/abs/2602.12670) shows:

- Curated skills improve performance by **+16.2 percentage points**
- Self-generated skills **hurt** performance (-1.3pp)
- Just **2-3 good skills** per task is optimal
- A smaller model + good skills **>** larger model without them

```
┌──────────────────────────────────────────┐
│  CURATED SKILL BOOST     ████████ +16.2pp│
│  SELF-GEN SKILL BOOST    ░          -1.3pp│
│  OPTIMAL SKILLS/TASK     ██           2-3│
│  SMALL+SKILLS > BIG      ████████     YES│
└──────────────────────────────────────────┘
```

## The problem

Even when agents use skills:

- They don't improve them over time
- They repeat the same mistakes
- Self-generated skills drift and degrade

## The idea

skilljournal turns skills into learning systems:

1. A skill runs
2. The agent reflects on what worked / failed
3. A journal entry is stored alongside the skill
4. Next time the skill runs, the journal context is injected

The same mistake doesn't happen twice. Skills get better without manual curation.

## What it does

- Persistent per-skill journals
- Automatic post-run reflection
- Context injection on future runs
- MCP server for Claude Code / Codex CLI
- Works with both curated and self-generated skills

## Setup

**Claude Code**

```bash
claude mcp add --scope user skilljournal -- npx --yes skilljournal
```

**Codex CLI**

```bash
codex mcp add skilljournal -- npx --yes skilljournal
```

For Codex CLI, MCP servers are added to your user config by default, so `--scope user` is not needed. `--yes` avoids `npx` prompting on first install, which can break non-interactive MCP startup. Or install globally first with `npm install -g skilljournal` and replace `npx --yes skilljournal` with just `skilljournal`.

If `npx` fails with an `EPERM` error under `~/.npm`, fix your npm cache ownership or point npm at a clean cache directory before retrying.

<details>
<summary>From source</summary>

```bash
git clone https://github.com/theluckyloop/skilljournal.git
cd skilljournal && npm install

# Claude Code
claude mcp add skilljournal -- node /absolute/path/to/skilljournal/server.mjs

# Codex CLI
codex mcp add skilljournal -- node /absolute/path/to/skilljournal/server.mjs
```
</details>

## Production checklist

- Run `npm run verify` before publishing.
- Publish only from a clean tree with CI green on Node 20 and 22.
- Pass an absolute `projectRoot` to every MCP tool call.
- Use simple frontmatter shapes for metadata: `name`, `triggers`, and basic multiline text.

## Tools

- **`list_skills`** — finds skills across `~/.codex/skills/`, `<project>/.codex/skills/`, `~/.claude/commands/`, and `<project>/.claude/commands/`
- **`resolve_triggered_skills`** — matches a task to relevant skills using token scoring, supports optional `scope`, `maxSkills`, and `minScore` controls, and returns the skill content + any journal entries as prompt-ready text
- **`record_skill_learning`** — writes a learning entry to `.journal/<slug>.md` so it gets picked up next time

## Recommended agent pattern

The MCP tells the model which tools exist and what arguments they take. For reliable behavior, you should also tell the agent when to call them.

Recommended runtime flow:

1. At task start, call `resolve_triggered_skills` with the current task text
2. Inject the returned `injectionText` into the working prompt/context
3. Complete the task using the resolved skills
4. If the run produced a reusable lesson, call `record_skill_learning` before finishing

Use `list_skills` for inspection and debugging, not as the default runtime path.

### Suggested instruction block

Put this once in a repo-level `AGENTS.md`, global Codex instructions, or another always-loaded system prompt:

```md
At task start, call `resolve_triggered_skills` with the current task text and use the returned `injectionText` as active context.

If the user explicitly names a skill, prioritize that skill or pass it as an explicit trigger when supported.

After completing work, if there is a reusable lesson worth saving, call `record_skill_learning`.

Use `list_skills` for inspection/debugging only, not as the default runtime path.

Do not manually edit `.journal` files when the MCP tools can manage them.
```

This keeps the workflow automatic.

## Skill discovery

Scans four places:

| Directory | Scope |
|-----------|-------|
| `~/.codex/skills/<slug>/SKILL.md` | User |
| `<project>/.codex/skills/<slug>/SKILL.md` | Project |
| `~/.claude/commands/<slug>.md` | User |
| `<project>/.claude/commands/<slug>.md` | Project |

Project skills override user skills when slugs collide.

Skills are markdown files. Standard YAML frontmatter is supported for metadata such as `name`, `triggers`, and nested config.
Supported forms include inline arrays, block-list arrays, CRLF files, multiline block scalars, and nested mappings:

```markdown
---
name: "Deploy to Production"
triggers: ["deploy", "release", "ship it"]
---

1. Run tests first
2. ...
```

Frontmatter is parsed as YAML and must have a top-level mapping object.

## Journals

Learnings live in `<project>/.journal/<slug>.md`. Structured, timestamped, git-friendly:

```markdown
## 2026-04-09 - Deployment timeout on large assets
Learning: Asset compilation exceeds the default 120s timeout when bundle > 50MB

Action: Added --timeout 300 flag to deploy command
Context: Discovered during Q2 release with new image assets
```

When `resolve_triggered_skills` fires for a deploy task, this entry rides along. The agent sees it before hitting the same wall.

## How matching works

Token-based scoring. Exact slug match is the strongest signal, then trigger phrases, then meaningful vocabulary overlap. The matcher is designed to reduce context-window pollution while still surfacing likely skills.

The matcher is heuristic, not semantic. Keep trigger phrases concrete and task-shaped, validate matching changes against the test corpus before shipping, and use `scope`, `maxSkills`, and `minScore` to tune production behavior.

## Troubleshooting

- `projectRoot must be an absolute path`: pass a fully-qualified project path, not `.` or a relative path.
- No skills found: confirm the skill file exists in one of the scanned directories and is named `SKILL.md` or `<slug>.md`.
- Too many or too few matches: tune `resolve_triggered_skills` with `scope`, `maxSkills`, and `minScore`.
- Journal write failed: check that the project directory is writable and that the slug uses supported filename characters.
- MCP startup via `npx` fails: install globally first or fix npm cache ownership, then retry.

## Structure

```
server.mjs        # MCP entry point
src/
  skills.js       # Discovery and resolution
  journal.js      # Read/append journal entries
  matcher.js      # Token-based skill matching
  utils.js        # Frontmatter parsing, helpers
```

## Reading

- [SkillsBench](https://arxiv.org/abs/2602.12670) — the benchmark behind the numbers above
- [SoK: Agentic Skills](https://arxiv.org/abs/2602.20867) — full skill lifecycle, discovery through evaluation
- [Claude Code skills docs](https://docs.anthropic.com/en/docs/claude-code/skills)

## License

MIT
