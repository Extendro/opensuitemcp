import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ORACLE_REPO = "oracle/netsuite-suitecloud-sdk";
const ORACLE_SKILLS_PATH = "packages/agent-skills";
const ALWAYS_ON_MARKER = "netsuite-ai-connector-instructions";

type GithubContentItem = {
  name: string;
  path: string;
  type: "file" | "dir" | string;
  download_url?: string | null;
};

/**
 * On-disk Oracle skill pack (single source of truth for all users).
 * Populated only by `pnpm skills:sync` (boot + weekly cron) — never from git.
 */
export function getOracleSkillsDir(): string {
  const fromEnv = process.env.ORACLE_SKILLS_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return path.join(process.cwd(), ".data", "oracle-skills");
}

export function oracleSkillsLookHealthy(
  skillsDir = getOracleSkillsDir(),
): boolean {
  return existsSync(path.join(skillsDir, ALWAYS_ON_MARKER, "SKILL.md"));
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "opensuitemcp-skill-sync",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Download Oracle SuiteCloud Agent Skill `SKILL.md` files from GitHub into
 * `ORACLE_SKILLS_DIR` (default `.data/oracle-skills`). Prunes skill folders
 * that no longer exist upstream so every instance shares one SoT.
 *
 * Intended to run from cron / deploy entrypoint — not from request handlers.
 */
export async function syncOracleSkills(): Promise<boolean> {
  const skillsDir = getOracleSkillsDir();
  mkdirSync(skillsDir, { recursive: true });
  const headers = githubHeaders();

  const listUrl = `https://api.github.com/repos/${ORACLE_REPO}/contents/${ORACLE_SKILLS_PATH}`;
  const listRes = await fetch(listUrl, { headers, cache: "no-store" });
  if (!listRes.ok) {
    throw new Error(`GitHub list failed: HTTP ${listRes.status}`);
  }

  const items = (await listRes.json()) as GithubContentItem[];
  if (!Array.isArray(items)) {
    throw new Error("Unexpected GitHub contents payload");
  }

  const skillDirs = items.filter(
    (item) =>
      item.type === "dir" &&
      typeof item.name === "string" &&
      item.name.startsWith("netsuite-"),
  );

  const seen = new Set<string>();
  let wrote = 0;

  for (const dir of skillDirs) {
    const skillUrl = `https://api.github.com/repos/${ORACLE_REPO}/contents/${ORACLE_SKILLS_PATH}/${dir.name}/SKILL.md`;
    const skillRes = await fetch(skillUrl, { headers, cache: "no-store" });
    if (!skillRes.ok) {
      console.warn(
        `[skills] Skip ${dir.name}: SKILL.md HTTP ${skillRes.status}`,
      );
      continue;
    }

    const meta = (await skillRes.json()) as {
      encoding?: string;
      content?: string;
      download_url?: string | null;
    };

    let markdown: string | null = null;
    if (meta.encoding === "base64" && typeof meta.content === "string") {
      markdown = Buffer.from(meta.content, "base64").toString("utf8");
    } else if (meta.download_url) {
      const raw = await fetch(meta.download_url, {
        headers,
        cache: "no-store",
      });
      if (raw.ok) {
        markdown = await raw.text();
      }
    }

    if (!markdown?.trim()) {
      continue;
    }

    const skillDir = path.join(skillsDir, dir.name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, "SKILL.md"), markdown, "utf8");
    seen.add(dir.name);
    wrote += 1;
  }

  // Remove local skills Oracle no longer ships
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (!seen.has(entry.name)) {
        rmSync(path.join(skillsDir, entry.name), {
          recursive: true,
          force: true,
        });
        console.log(`[skills] Pruned removed upstream skill: ${entry.name}`);
      }
    }
  }

  const ok = oracleSkillsLookHealthy(skillsDir);
  console.log(
    `[skills] Synced ${wrote} Oracle SKILL.md file(s) → ${skillsDir} (healthy=${ok})`,
  );
  if (!ok) {
    throw new Error(
      `Sync finished but missing ${ALWAYS_ON_MARKER}/SKILL.md — refusing unhealthy pack`,
    );
  }
  return true;
}
