import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import {
  getNetSuiteIntegrationChecklist,
  getNetSuiteNewIntegrationUrl,
  getNetSuiteRedirectUri,
  NETSUITE_DCR_CLIENT_NAME,
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
  upsertAccountEntry,
} from "@/lib/netsuite/accounts";
import { registerNetSuiteDcrClient } from "@/lib/netsuite/dcr";

const probeSchema = z.object({
  accountId: z.string().min(1).max(64),
  label: z.string().max(64).optional(),
});

/**
 * Probe NetSuite DCR for the selected account.
 * Runs on account selection so Connect only starts OAuth when a matching
 * Integration already exists (client_id resolved).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = probeSchema.parse(await request.json());
    const accountId = normalizeNetSuiteAccountId(body.accountId);
    const settings = await getUserSettings({ userId: session.user.id });
    let accounts = resolveNetSuiteAccounts(settings ?? {});
    const existing = accounts.find((item) => item.accountId === accountId);
    const label = body.label?.trim() || existing?.label || accountId;

    const dcr = await registerNetSuiteDcrClient(accountId);

    if (dcr.status === "ready") {
      accounts = upsertAccountEntry(accounts, {
        accountId,
        label,
        clientId: dcr.clientId,
      });
      await upsertUserSettings({
        userId: session.user.id,
        netsuiteAccountId: accountId,
        netsuiteClientId: dcr.clientId,
        netsuiteAccounts: accounts,
      });

      return NextResponse.json({
        status: "ready",
        accountId,
        clientId: dcr.clientId,
      });
    }

    if (dcr.status === "needs_integration") {
      accounts = upsertAccountEntry(accounts, {
        accountId,
        label,
        clientId: existing?.clientId ?? null,
      });
      await upsertUserSettings({
        userId: session.user.id,
        netsuiteAccountId: accountId,
        netsuiteAccounts: accounts,
      });

      return NextResponse.json({
        status: "needs_integration",
        accountId,
        integrationUrl: getNetSuiteNewIntegrationUrl(accountId),
        redirectUri: getNetSuiteRedirectUri(),
        dcrClientName: NETSUITE_DCR_CLIENT_NAME,
        checklist: getNetSuiteIntegrationChecklist(),
      });
    }

    return NextResponse.json({ error: dcr.error }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid probe request", details: error.errors },
        { status: 400 },
      );
    }

    console.error("[NetSuite Probe] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to probe NetSuite integration",
      },
      { status: 500 },
    );
  }
}
