/**
 * CLI: pnpm skills:sync
 * Pull Oracle agent-skills SKILL.md files into ORACLE_SKILLS_DIR.
 */
import { syncOracleSkills } from "./sync-oracle";

syncOracleSkills()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[skills] Sync failed:", error);
    process.exit(1);
  });
