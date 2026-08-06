ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "enabledSkillIds" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "customSkills" jsonb DEFAULT '[]'::jsonb NOT NULL;
