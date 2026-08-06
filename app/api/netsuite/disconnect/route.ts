import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { deleteNetSuiteToken } from "@/lib/netsuite/tokens";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const activeAccountId = settings?.netsuiteAccountId
      ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
      : null;

    await deleteNetSuiteToken(session.user.id, activeAccountId);
    return NextResponse.json({ success: true, accountId: activeAccountId });
  } catch (error) {
    console.error("[NetSuite Disconnect] Error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect NetSuite account" },
      { status: 500 },
    );
  }
}
