import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { normalizeUserSkillSettings } from "@/lib/ai/skills/catalog";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
} from "@/lib/netsuite/accounts";

const aiProviderSchema = z.enum(["google", "anthropic", "openai"]);

const netsuiteAccountSchema = z.object({
  accountId: z.string().min(1).max(64),
  label: z.string().max(64),
  clientId: z.string().max(128).optional().nullable(),
});

const customSkillSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  content: z.string().max(32_000),
  updatedAt: z.string().optional(),
  enabled: z.boolean().optional(),
});

const settingsSchema = z.object({
  googleApiKey: z.string().optional().nullable(),
  anthropicApiKey: z.string().optional().nullable(),
  openaiApiKey: z.string().optional().nullable(),
  aiProvider: aiProviderSchema.optional().nullable(),
  netsuiteAccountId: z.string().max(64).optional().nullable(),
  netsuiteClientId: z.string().max(128).optional().nullable(),
  netsuiteAccounts: z.array(netsuiteAccountSchema).max(20).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  searchDomainIds: z.array(z.string()).max(16).optional().nullable(),
  maxIterations: z
    .string()
    .regex(/^\d+$/)
    .transform((val) => {
      const num = Number.parseInt(val, 10);
      // Clamp between 1 and 20
      return Math.max(1, Math.min(20, num)).toString();
    })
    .optional()
    .nullable(),
  customInstructions: z.string().max(32_000).optional().nullable(),
  enabledSkillIds: z.array(z.string().max(128)).max(64).optional().nullable(),
  customSkills: z.array(customSkillSchema).max(32).optional().nullable(),
});

function normalizeAiProvider(
  value: string | null | undefined,
): "google" | "anthropic" | "openai" {
  if (value === "google" || value === "anthropic" || value === "openai") {
    return value;
  }
  return "google";
}

function resolveSkillSettings(
  settings: Awaited<ReturnType<typeof getUserSettings>>,
) {
  return normalizeUserSkillSettings(
    settings
      ? {
          enabledSkillIds: settings.enabledSkillIds ?? [],
          customSkills: settings.customSkills ?? [],
        }
      : null,
    settings?.customInstructions,
  );
}

function shouldPersistLegacySkillMigration(
  settings: NonNullable<Awaited<ReturnType<typeof getUserSettings>>>,
  normalized: ReturnType<typeof normalizeUserSkillSettings>,
): boolean {
  const legacy = settings.customInstructions?.trim();
  if (!legacy) {
    return false;
  }
  if (
    settings.customSkills?.some(
      (skill) => skill.id === "migrated-custom-instructions",
    )
  ) {
    return false;
  }
  return normalized.customSkills.some(
    (skill) => skill.id === "migrated-custom-instructions",
  );
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });

    console.log("[Settings API] Raw settings from DB:", {
      hasGoogleKey: !!settings?.googleApiKey,
      hasAnthropicKey: !!settings?.anthropicApiKey,
      hasOpenAIKey: !!settings?.openaiApiKey,
      aiProvider: settings?.aiProvider,
    });

    if (!settings) {
      const emptySkills = resolveSkillSettings(null);
      return NextResponse.json({
        googleApiKey: null,
        anthropicApiKey: null,
        openaiApiKey: null,
        aiProvider: "google",
        netsuiteAccountId: null,
        netsuiteClientId: null,
        netsuiteAccounts: [],
        timezone: "UTC",
        searchDomainIds: [],
        maxIterations: "10",
        customInstructions: null,
        enabledSkillIds: emptySkills.enabledSkillIds,
        customSkills: emptySkills.customSkills,
      });
    }

    // Decrypt API keys if present
    let decryptedGoogleKey: string | null = null;
    if (settings.googleApiKey) {
      try {
        decryptedGoogleKey = decrypt(settings.googleApiKey);
        console.log("[Settings API] Successfully decrypted Google key");
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting Google API key on GET:",
          error,
        );
        decryptedGoogleKey = null;
      }
    } else {
      console.log("[Settings API] No Google key in DB");
    }

    let decryptedAnthropicKey: string | null = null;
    if (settings.anthropicApiKey) {
      try {
        decryptedAnthropicKey = decrypt(settings.anthropicApiKey);
        console.log("[Settings API] Successfully decrypted Anthropic key");
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting Anthropic API key on GET:",
          error,
        );
        decryptedAnthropicKey = null;
      }
    } else {
      console.log("[Settings API] No Anthropic key in DB");
    }

    let decryptedOpenAIKey: string | null = null;
    if (settings.openaiApiKey) {
      try {
        decryptedOpenAIKey = decrypt(settings.openaiApiKey);
        console.log("[Settings API] Successfully decrypted OpenAI key");
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting OpenAI API key on GET:",
          error,
        );
        decryptedOpenAIKey = null;
      }
    } else {
      console.log("[Settings API] No OpenAI key in DB");
    }

    const provider = normalizeAiProvider(settings.aiProvider);
    const netsuiteAccounts = resolveNetSuiteAccounts(settings);
    const activeAccountId = settings.netsuiteAccountId
      ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
      : (netsuiteAccounts[0]?.accountId ?? null);
    const activeAccount = netsuiteAccounts.find(
      (account) => account.accountId === activeAccountId,
    );

    const skillSettings = resolveSkillSettings(settings);

    if (shouldPersistLegacySkillMigration(settings, skillSettings)) {
      try {
        await upsertUserSettings({
          userId: session.user.id,
          enabledSkillIds: skillSettings.enabledSkillIds,
          customSkills: skillSettings.customSkills,
        });
      } catch (error) {
        console.warn(
          "[Settings API] Failed to persist legacy skill migration:",
          error,
        );
      }
    }

    const response = {
      googleApiKey: decryptedGoogleKey,
      anthropicApiKey: decryptedAnthropicKey,
      openaiApiKey: decryptedOpenAIKey,
      aiProvider: provider,
      netsuiteAccountId: activeAccountId,
      netsuiteClientId:
        activeAccount?.clientId ?? settings.netsuiteClientId ?? null,
      netsuiteAccounts,
      timezone: settings.timezone ?? "UTC",
      searchDomainIds: settings.searchDomainIds ?? [],
      maxIterations: settings.maxIterations ?? "10",
      customInstructions: settings.customInstructions ?? null,
      enabledSkillIds: skillSettings.enabledSkillIds,
      customSkills: skillSettings.customSkills,
    };

    console.log("[Settings API] Sending response:", {
      hasGoogleKey: !!response.googleApiKey,
      hasAnthropicKey: !!response.anthropicApiKey,
      hasOpenAIKey: !!response.openaiApiKey,
      aiProvider: response.aiProvider,
      googleKeyLength: response.googleApiKey?.length ?? 0,
      anthropicKeyLength: response.anthropicApiKey?.length ?? 0,
      openaiKeyLength: response.openaiApiKey?.length ?? 0,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Settings] Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = settingsSchema.partial().parse(body);

    // Get existing settings to preserve values not being updated
    const existing = await getUserSettings({ userId: session.user.id });

    // Encrypt Google API key if provided
    let encryptedGoogleKey: string | null | undefined;
    if (validated.googleApiKey !== undefined) {
      const trimmedKey = validated.googleApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedGoogleKey = encrypt(trimmedKey);
        } catch (error) {
          console.error("[Settings] Error encrypting Google API key:", error);
          return NextResponse.json(
            {
              error:
                "Failed to encrypt Google API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedGoogleKey = null;
      }
    } else if (existing?.googleApiKey) {
      encryptedGoogleKey = existing.googleApiKey;
    }

    // Encrypt Anthropic API key if provided
    let encryptedAnthropicKey: string | null | undefined;
    if (validated.anthropicApiKey !== undefined) {
      const trimmedKey = validated.anthropicApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedAnthropicKey = encrypt(trimmedKey);
        } catch (error) {
          console.error(
            "[Settings] Error encrypting Anthropic API key:",
            error,
          );
          return NextResponse.json(
            {
              error:
                "Failed to encrypt Anthropic API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedAnthropicKey = null;
      }
    } else if (existing?.anthropicApiKey) {
      encryptedAnthropicKey = existing.anthropicApiKey;
    }

    // Encrypt OpenAI API key if provided
    let encryptedOpenAIKey: string | null | undefined;
    if (validated.openaiApiKey !== undefined) {
      const trimmedKey = validated.openaiApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedOpenAIKey = encrypt(trimmedKey);
        } catch (error) {
          console.error("[Settings] Error encrypting OpenAI API key:", error);
          return NextResponse.json(
            {
              error:
                "Failed to encrypt OpenAI API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedOpenAIKey = null;
      }
    } else if (existing?.openaiApiKey) {
      encryptedOpenAIKey = existing.openaiApiKey;
    }

    const nextProvider =
      validated.aiProvider !== undefined
        ? normalizeAiProvider(validated.aiProvider)
        : undefined;

    const nextAccounts =
      validated.netsuiteAccounts !== undefined
        ? resolveNetSuiteAccounts({
            netsuiteAccounts: validated.netsuiteAccounts ?? [],
          })
        : undefined;

    let nextAccountId =
      validated.netsuiteAccountId !== undefined
        ? validated.netsuiteAccountId
          ? normalizeNetSuiteAccountId(validated.netsuiteAccountId)
          : null
        : undefined;

    let nextClientId =
      validated.netsuiteClientId !== undefined
        ? validated.netsuiteClientId
        : undefined;

    if (nextAccounts) {
      if (
        nextAccountId &&
        !nextAccounts.some((account) => account.accountId === nextAccountId)
      ) {
        nextAccountId = nextAccounts[0]?.accountId ?? null;
      }
      if (!nextAccountId && nextAccounts[0]) {
        nextAccountId = nextAccounts[0].accountId;
      }
      const active = nextAccounts.find(
        (account) => account.accountId === nextAccountId,
      );
      if (active && nextClientId === undefined) {
        nextClientId = active.clientId ?? null;
      }
    }

    const nextCustomSkills =
      validated.customSkills !== undefined
        ? normalizeUserSkillSettings({
            enabledSkillIds:
              validated.enabledSkillIds ??
              existing?.enabledSkillIds ??
              [],
            customSkills: validated.customSkills ?? [],
          }).customSkills
        : undefined;

    const nextEnabledSkillIds =
      validated.enabledSkillIds !== undefined
        ? normalizeUserSkillSettings({
            enabledSkillIds: validated.enabledSkillIds ?? [],
            customSkills:
              nextCustomSkills ??
              existing?.customSkills ??
              [],
          }).enabledSkillIds
        : undefined;

    await upsertUserSettings({
      userId: session.user.id,
      googleApiKey: encryptedGoogleKey,
      anthropicApiKey: encryptedAnthropicKey,
      openaiApiKey: encryptedOpenAIKey,
      // Clear legacy Inception key when settings are saved
      inceptionApiKey: null,
      aiProvider: nextProvider,
      netsuiteAccountId: nextAccountId,
      netsuiteClientId: nextClientId,
      netsuiteAccounts: nextAccounts,
      timezone: validated.timezone,
      searchDomainIds:
        validated.searchDomainIds !== undefined
          ? (validated.searchDomainIds ?? [])
          : undefined,
      maxIterations: validated.maxIterations,
      customInstructions: validated.customInstructions,
      enabledSkillIds: nextEnabledSkillIds,
      customSkills: nextCustomSkills,
    });

    return NextResponse.json({
      success: true,
      message: "Settings saved successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid settings data", details: error.errors },
        { status: 400 },
      );
    }

    console.error("[Settings] Error saving settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
