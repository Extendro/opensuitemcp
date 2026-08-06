import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  listOracleCatalogSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { getUserSettings } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const userSkillSettings = normalizeUserSkillSettings(
      settings
        ? {
            enabledSkillIds: settings.enabledSkillIds ?? [],
            customSkills: settings.customSkills ?? [],
          }
        : null,
      settings?.customInstructions,
    );

    return NextResponse.json({
      catalog: listOracleCatalogSkills(),
      enabledSkillIds: userSkillSettings.enabledSkillIds,
      customSkills: userSkillSettings.customSkills,
    });
  } catch (error) {
    console.error("[Skills API] Error fetching skills:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 },
    );
  }
}
