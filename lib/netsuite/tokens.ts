import { and, eq } from "drizzle-orm";
import { db, getUserSettings } from "@/lib/db/queries";
import { netsuiteToken } from "@/lib/db/schema";
import { normalizeNetSuiteAccountId } from "./accounts";
import { refreshAccessToken } from "./oauth";

async function getActiveAccountId(userId: string): Promise<string | null> {
  const settings = await getUserSettings({ userId });
  return settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
}

/**
 * Get NetSuite token for the user's active account, refreshing if necessary
 */
export async function getNetSuiteToken(userId: string): Promise<string | null> {
  const activeAccountId = await getActiveAccountId(userId);
  if (!activeAccountId) {
    console.log(`[NetSuite] No active account for user: ${userId}`);
    return null;
  }

  const [token] = await db
    .select()
    .from(netsuiteToken)
    .where(
      and(
        eq(netsuiteToken.userId, userId),
        eq(netsuiteToken.accountId, activeAccountId),
      ),
    )
    .limit(1);

  // Legacy rows may lack accountId; accept only if they are the sole token
  // and settings still point at that account after migration backfill.
  let resolved = token;
  if (!resolved) {
    const [legacy] = await db
      .select()
      .from(netsuiteToken)
      .where(eq(netsuiteToken.userId, userId))
      .limit(1);
    if (legacy && (!legacy.accountId || legacy.accountId === activeAccountId)) {
      resolved = legacy;
    }
  }

  if (!resolved) {
    console.log(
      `[NetSuite] No token found for user: ${userId}, account: ${activeAccountId}`,
    );
    return null;
  }

  console.log(
    `[NetSuite] Found token for user: ${userId}, account: ${activeAccountId}, expires at: ${resolved.expiresAt}`,
  );

  const now = new Date();
  const expiresAt = new Date(resolved.expiresAt);
  const buffer = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() < buffer) {
    try {
      const refreshed = await refreshAccessToken({
        userId,
        refreshToken: resolved.refreshToken,
      });
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

      await db
        .update(netsuiteToken)
        .set({
          accountId: activeAccountId,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(netsuiteToken.id, resolved.id));

      return refreshed.access_token;
    } catch (_error) {
      await db.delete(netsuiteToken).where(eq(netsuiteToken.id, resolved.id));
      return null;
    }
  }

  if (!resolved.accountId) {
    await db
      .update(netsuiteToken)
      .set({ accountId: activeAccountId, updatedAt: new Date() })
      .where(eq(netsuiteToken.id, resolved.id));
  }

  return resolved.accessToken;
}

/**
 * Save NetSuite token for a user + account
 */
export async function saveNetSuiteToken(params: {
  userId: string;
  accountId?: string | null;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + params.expiresIn * 1000);
  const now = new Date();
  const accountId =
    (params.accountId
      ? normalizeNetSuiteAccountId(params.accountId)
      : await getActiveAccountId(params.userId)) || null;

  const [existingForAccount] = accountId
    ? await db
        .select()
        .from(netsuiteToken)
        .where(
          and(
            eq(netsuiteToken.userId, params.userId),
            eq(netsuiteToken.accountId, accountId),
          ),
        )
        .limit(1)
    : [undefined];

  const [existingAny] = existingForAccount
    ? [existingForAccount]
    : await db
        .select()
        .from(netsuiteToken)
        .where(eq(netsuiteToken.userId, params.userId))
        .limit(1);

  if (existingAny) {
    await db
      .update(netsuiteToken)
      .set({
        accountId,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(netsuiteToken.id, existingAny.id));
  } else {
    await db.insert(netsuiteToken).values({
      userId: params.userId,
      accountId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Delete NetSuite token for a user (optionally a specific account)
 */
export async function deleteNetSuiteToken(
  userId: string,
  accountId?: string | null,
): Promise<void> {
  if (accountId) {
    const normalized = normalizeNetSuiteAccountId(accountId);
    await db
      .delete(netsuiteToken)
      .where(
        and(
          eq(netsuiteToken.userId, userId),
          eq(netsuiteToken.accountId, normalized),
        ),
      );
    return;
  }

  await db.delete(netsuiteToken).where(eq(netsuiteToken.userId, userId));
}
