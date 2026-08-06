import {
  getNetSuiteApiHost,
  getNetSuiteRedirectUri,
  NETSUITE_DCR_CLIENT_NAME,
  normalizeNetSuiteAccountId,
} from "./accounts";

export type NetSuiteDcrResult =
  | { status: "ready"; clientId: string }
  | {
      status: "needs_integration";
      error: string;
      accountId: string;
    }
  | { status: "error"; error: string };

type AuthorizationServerMetadata = {
  registration_endpoint?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
};

export async function discoverNetSuiteAuthServer(
  accountId: string,
): Promise<AuthorizationServerMetadata> {
  const normalized = normalizeNetSuiteAccountId(accountId);
  const discoveryUrl = `${getNetSuiteApiHost(normalized)}/.well-known/oauth-authorization-server`;
  const response = await fetch(discoveryUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `OAuth discovery failed for ${normalized}: ${response.status}`,
    );
  }

  return (await response.json()) as AuthorizationServerMetadata;
}

/**
 * Register (or resolve) the public OpenSuiteMCP client via NetSuite DCR.
 * Returns needs_integration when no matching Integration record exists yet.
 */
export async function registerNetSuiteDcrClient(
  accountId: string,
): Promise<NetSuiteDcrResult> {
  const normalized = normalizeNetSuiteAccountId(accountId);
  const redirectUri = getNetSuiteRedirectUri();

  try {
    const metadata = await discoverNetSuiteAuthServer(normalized);
    const registrationEndpoint = metadata.registration_endpoint;
    if (!registrationEndpoint) {
      return {
        status: "error",
        error:
          "This NetSuite account does not expose a Dynamic Client Registration endpoint.",
      };
    }

    const response = await fetch(registrationEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_name: NETSUITE_DCR_CLIENT_NAME,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "mcp",
      }),
      cache: "no-store",
    });

    const bodyText = await response.text();
    let parsed: { client_id?: string; error?: string } = {};
    try {
      parsed = JSON.parse(bodyText) as { client_id?: string; error?: string };
    } catch {
      parsed = {};
    }

    if (response.ok && parsed.client_id) {
      return { status: "ready", clientId: parsed.client_id };
    }

    if (
      response.status === 400 &&
      (parsed.error === "invalid_redirect_uri" ||
        bodyText.includes("invalid_redirect_uri"))
    ) {
      return {
        status: "needs_integration",
        error: "invalid_redirect_uri",
        accountId: normalized,
      };
    }

    return {
      status: "error",
      error:
        parsed.error ||
        `Dynamic client registration failed (${response.status}): ${bodyText.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      status: "error",
      error:
        error instanceof Error
          ? error.message
          : "Dynamic client registration failed",
    };
  }
}
