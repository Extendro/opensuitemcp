import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getOracleSkillsDir } from "./sync-oracle";

export type SkillAuthor = "Oracle NetSuite" | "You" | "OpenSuiteMCP";

export type CatalogSkill = {
  id: string;
  name: string;
  description: string;
  author: SkillAuthor;
  source: "oracle" | "builtin" | "custom";
  /** Always applied when MCP is used; not user-toggleable off by default UI */
  alwaysOn?: boolean;
  updatedAt: string;
  /** Character length of SKILL.md body (approx) */
  contentLength: number;
};

export type CustomSkill = {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
  enabled?: boolean;
};

export type UserSkillSettings = {
  /** Oracle/builtin skill ids enabled for the session */
  enabledSkillIds: string[];
  customSkills: CustomSkill[];
};

function titleFromSkillId(id: string): string {
  return id
    .replace(/^netsuite-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseSkillFrontmatter(raw: string): {
  name?: string;
  description?: string;
} {
  if (!raw.startsWith("---")) {
    return {};
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return {};
  }
  const block = raw.slice(3, end);
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descMatch = block.match(/^description:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
  let description = descMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
  // Folded/literal descriptions are rare; keep first line if huge.
  if (description && description.length > 280) {
    description = `${description.slice(0, 277)}...`;
  }
  return {
    name: name || undefined,
    description: description || undefined,
  };
}

const ALWAYS_ON_SKILL_ID = "netsuite-ai-connector-instructions";

/** Max chars injected per optional skill; connector skill is uncapped within TOTAL. */
const MAX_OPTIONAL_SKILL_CHARS = 12_000;
/** Soft budget for all appended skill text per turn */
const MAX_TOTAL_SKILL_CHARS = 40_000;

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown.trim();
  }
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return markdown.trim();
  }
  return markdown.slice(end + 4).trim();
}

function readOracleSkillBody(skillId: string): string | null {
  const filePath = path.join(getOracleSkillsDir(), skillId, "SKILL.md");
  if (!existsSync(filePath)) {
    return null;
  }
  return stripFrontmatter(readFileSync(filePath, "utf8"));
}

/** Read a vendored Oracle skill body for UI preview / injection. */
export function getOracleSkillContent(skillId: string): string | null {
  if (
    !skillId ||
    skillId.includes("..") ||
    skillId.includes("/") ||
    skillId.includes("\\")
  ) {
    return null;
  }
  return readOracleSkillBody(skillId);
}

export function listOracleCatalogSkills(): CatalogSkill[] {
  const skillsDir = getOracleSkillsDir();
  if (!existsSync(skillsDir)) {
    return [];
  }

  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return dirs.map((id) => {
    const rawPath = path.join(skillsDir, id, "SKILL.md");
    const raw = existsSync(rawPath) ? readFileSync(rawPath, "utf8") : "";
    const fm = parseSkillFrontmatter(raw);
    const body = stripFrontmatter(raw);
    let updatedAt = new Date().toISOString().slice(0, 10);
    try {
      updatedAt = statSync(rawPath).mtime.toISOString().slice(0, 10);
    } catch {
      /* keep today */
    }
    return {
      id,
      name: fm.name ? titleFromSkillId(fm.name) : titleFromSkillId(id),
      description: fm.description ?? "Oracle SuiteCloud Agent Skill",
      author: "Oracle NetSuite" as const,
      source: "oracle" as const,
      alwaysOn: id === ALWAYS_ON_SKILL_ID,
      updatedAt,
      contentLength: body.length,
    };
  });
}

export function getDefaultEnabledSkillIds(): string[] {
  // Connector instructions are always-on separately; start with finance analyst off.
  return [];
}

export function normalizeUserSkillSettings(
  raw: unknown,
  legacyCustomInstructions?: string | null,
): UserSkillSettings {
  const empty: UserSkillSettings = {
    enabledSkillIds: getDefaultEnabledSkillIds(),
    customSkills: [],
  };

  let settings = empty;
  if (raw && typeof raw === "object") {
    const value = raw as Partial<UserSkillSettings>;
    settings = {
      enabledSkillIds: Array.isArray(value.enabledSkillIds)
        ? value.enabledSkillIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      customSkills: Array.isArray(value.customSkills)
        ? value.customSkills
            .filter(
              (skill) =>
                skill &&
                typeof skill.id === "string" &&
                typeof skill.name === "string" &&
                typeof skill.content === "string",
            )
            .map((skill) => ({
              id: skill.id,
              name: skill.name.trim() || "Custom skill",
              content: skill.content,
              updatedAt:
                typeof skill.updatedAt === "string"
                  ? skill.updatedAt
                  : new Date().toISOString(),
              enabled: skill.enabled !== false,
            }))
        : [],
    };
  }

  // One-time style migration: legacy customInstructions → custom skill
  const legacy = legacyCustomInstructions?.trim();
  if (
    legacy &&
    !settings.customSkills.some(
      (skill) => skill.id === "migrated-custom-instructions",
    )
  ) {
    settings = {
      ...settings,
      customSkills: [
        {
          id: "migrated-custom-instructions",
          name: "Custom instructions",
          content: legacy,
          updatedAt: new Date().toISOString(),
          enabled: true,
        },
        ...settings.customSkills,
      ],
    };
  }

  return settings;
}

/** Names of skills active for this session (for inventory / config tools). */
export function listEnabledSkillNames(
  userSettings: UserSkillSettings,
): string[] {
  const names: string[] = ["AI Connector Instructions (always on)"];

  for (const skill of listOracleCatalogSkills()) {
    if (skill.alwaysOn) {
      continue;
    }
    if (!userSettings.enabledSkillIds.includes(skill.id)) {
      continue;
    }
    names.push(skill.name);
  }

  for (const skill of userSettings.customSkills) {
    if (skill.enabled === false) {
      continue;
    }
    names.push(skill.name?.trim() || "Custom skill");
  }

  return names;
}

/**
 * Build skill text to append to the system prompt.
 * Skips always-on connector skill body by default — condensed rules live in
 * `lib/ai/prompts.ts` (avoids duplicating ~16KB). Optional Oracle skills +
 * enabled custom skills are injected within budget.
 *
 * Always includes an ENABLED SKILLS inventory so the model can answer
 * “what skills do you have?” even when optional bodies are empty/truncated.
 */
export function buildSkillsPromptSection(
  userSettings: UserSkillSettings,
  options?: { includeAlwaysOn?: boolean },
): string {
  const parts: string[] = [];
  let used = 0;
  const enabledNames = listEnabledSkillNames(userSettings);

  const push = (title: string, body: string, maxChars?: number) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    const limited =
      maxChars && trimmed.length > maxChars
        ? `${trimmed.slice(0, maxChars)}\n\n[Skill truncated for context budget]`
        : trimmed;
    const block = `### ${title}\n\n${limited}`;
    if (used + block.length > MAX_TOTAL_SKILL_CHARS) {
      return;
    }
    parts.push(block);
    used += block.length;
  };

  if (options?.includeAlwaysOn) {
    const connector = readOracleSkillBody(ALWAYS_ON_SKILL_ID);
    if (connector) {
      push(
        "NetSuite AI Connector Instructions (always on)",
        connector,
        MAX_OPTIONAL_SKILL_CHARS,
      );
    }
  }

  const oracleCatalog = listOracleCatalogSkills().filter(
    (skill) => !skill.alwaysOn,
  );
  for (const skill of oracleCatalog) {
    if (!userSettings.enabledSkillIds.includes(skill.id)) {
      continue;
    }
    const body = readOracleSkillBody(skill.id);
    if (body) {
      push(skill.name, body, MAX_OPTIONAL_SKILL_CHARS);
    }
  }

  for (const skill of userSettings.customSkills) {
    if (skill.enabled === false) {
      continue;
    }
    push(skill.name || "Custom skill", skill.content, MAX_OPTIONAL_SKILL_CHARS);
  }

  const inventory = `==============================
ENABLED SKILLS
==============================

These skills are active for this session. If the user asks what skills you have access to, list them by name (do not invent others):
${enabledNames.map((name) => `- ${name}`).join("\n")}

AI Connector Instructions are always on (core NetSuite MCP rules are already in your system prompt). Optional Oracle/custom skills below add specialized guidance when relevant.`;

  if (parts.length === 0) {
    return `\n\n${inventory}\n`;
  }

  return `\n\n${inventory}\n\n==============================\nACTIVE SKILL INSTRUCTIONS\n==============================\n\nApply the following skill instructions when relevant to the user's request.\n\n${parts.join("\n\n---\n\n")}`;
}

export { ALWAYS_ON_SKILL_ID };
