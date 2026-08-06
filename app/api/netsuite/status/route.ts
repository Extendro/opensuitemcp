import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import {
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
} from "@/lib/netsuite/accounts";
import { loadNetSuiteMCPTools } from "@/lib/netsuite/mcp";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const activeAccountId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : (accounts[0]?.accountId ?? null);

  const accessToken = await getNetSuiteToken(session.user.id);
  const isConnected = !!accessToken;

  let toolCount = 0;
  if (isConnected) {
    try {
      const tools = await loadNetSuiteMCPTools(session.user.id);
      toolCount = Object.keys(tools).length;
    } catch (error) {
      console.error("[NetSuite Status] Error loading tools:", error);
    }
  }

  return NextResponse.json({
    connected: isConnected,
    toolCount,
    activeAccountId,
    accounts,
  });
}
