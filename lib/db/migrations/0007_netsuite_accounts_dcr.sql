ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "netsuiteAccounts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "NetSuiteToken" ADD COLUMN IF NOT EXISTS "accountId" varchar(64);--> statement-breakpoint
UPDATE "UserSettings"
SET "netsuiteAccounts" = jsonb_build_array(
  jsonb_build_object(
    'accountId', lower(replace("netsuiteAccountId", '_', '-')),
    'label', "netsuiteAccountId",
    'clientId', "netsuiteClientId"
  )
)
WHERE "netsuiteAccountId" IS NOT NULL
  AND "netsuiteAccountId" <> ''
  AND ("netsuiteAccounts" = '[]'::jsonb OR "netsuiteAccounts" IS NULL);--> statement-breakpoint
UPDATE "NetSuiteToken" AS t
SET "accountId" = lower(replace(s."netsuiteAccountId", '_', '-'))
FROM "UserSettings" AS s
WHERE t."userId" = s."userId"
  AND t."accountId" IS NULL
  AND s."netsuiteAccountId" IS NOT NULL
  AND s."netsuiteAccountId" <> '';
