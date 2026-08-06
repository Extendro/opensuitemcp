"use client";

import {
  Clock,
  Cloud,
  ExternalLink,
  Globe,
  type LucideIcon,
  Sparkles,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  EyeIcon,
  EyeOffIcon,
  LoaderIcon,
  WarningIcon,
} from "@/components/icons";
import { useAppPortal } from "@/components/portal/context";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getSearchDomainUrl, searchDomains } from "@/lib/ai/search-domains";
import { guestRegex } from "@/lib/constants";
import type { NetSuiteAccountEntry } from "@/lib/netsuite/accounts";
import {
  getNetSuiteNewIntegrationUrl,
  NETSUITE_DCR_CLIENT_NAME,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

export type SettingsPanelSection =
  | "provider"
  | "netsuite"
  | "search"
  | "timezone"
  | "account";

type PortalPanelHeaderProps = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  docsLinks?: { label: string; href: string }[];
};

function PortalPanelHeader({
  icon: Icon,
  title,
  subtitle,
  docsLinks,
}: PortalPanelHeaderProps) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-border/60 border-b px-4 py-3 sm:px-5">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-1.5 font-medium text-sm">
          <Icon className="size-3.5 text-muted-foreground" />
          {title}
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {subtitle}
        </p>
      </div>
      {docsLinks && docsLinks.length > 0 ? (
        <div className="hidden shrink-0 flex-col gap-1 text-xs sm:flex">
          {docsLinks.map((link) => (
            <a
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={link.href}
              key={link.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {link.label}
              <ExternalLink className="size-3" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const PROVIDER_DOCS: Record<
  "google" | "anthropic" | "openai",
  { label: string; href: string }
> = {
  openai: {
    label: "OpenAI models",
    href: "https://platform.openai.com/docs/models",
  },
  anthropic: {
    label: "Anthropic models",
    href: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  google: {
    label: "Google models",
    href: "https://ai.google.dev/gemini-api/docs/models",
  },
};

const SECTION_META: Record<
  SettingsPanelSection,
  {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    docsLinks?: { label: string; href: string }[];
  }
> = {
  provider: {
    icon: Sparkles,
    title: "AI Provider",
    subtitle:
      "Bring your own LLM key and choose which provider powers chat responses.",
  },
  netsuite: {
    icon: Cloud,
    title: "NetSuite",
    subtitle: "Connect MCP tools to your NetSuite account.",
    docsLinks: [
      {
        label: "AI Connector",
        href: "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7200233106.html",
      },
    ],
  },
  search: {
    icon: Globe,
    title: "Web Search",
    subtitle:
      "Enable Oracle NetSuite Help Center search tools available in chat.",
  },
  timezone: {
    icon: Clock,
    title: "Timezone",
    subtitle: "Set your timezone for accurate date and time calculations.",
  },
  account: {
    icon: User,
    title: "Account",
    subtitle: "Your account details and session information.",
  },
};

type DcrProbeState =
  | { status: "idle" }
  | { status: "probing" }
  | { status: "ready"; clientId: string }
  | {
      status: "needs_integration";
      accountId: string;
      integrationUrl: string;
      redirectUri: string;
      dcrClientName: string;
      checklist: string[];
    }
  | { status: "error"; error: string };

function getClientNetSuiteRedirectUri(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/netsuite/callback`;
  }
  return "/api/netsuite/callback";
}

function NetSuiteIntegrationInstructions({
  redirectUri,
  bodyClassName = "text-sm text-muted-foreground",
  emphasisClassName = "font-medium text-foreground",
}: {
  redirectUri: string;
  bodyClassName?: string;
  emphasisClassName?: string;
}) {
  return (
    <ol className={cn("list-decimal space-y-3 pl-5", bodyClassName)}>
      <li>
        In NetSuite, navigate to{" "}
        <span className={emphasisClassName}>
          Setup &gt; Integration &gt; Manage Integrations &gt; New
        </span>
      </li>
      <li>
        Set the following field values:
        <ol className="mt-2 list-[lower-alpha] space-y-1.5 pl-5">
          <li>
            <span className={emphasisClassName}>Name</span>
            {" — "}
            {NETSUITE_DCR_CLIENT_NAME}
          </li>
          <li>
            <span className={emphasisClassName}>Authorization Code Grant</span>
            {" — checked"}
          </li>
          <li>
            <span className={emphasisClassName}>Public Client</span>
            {" — checked"}
          </li>
          <li>
            <span className={emphasisClassName}>Redirect URI</span>
            {" — "}
            <span className="break-all">{redirectUri}</span>
          </li>
          <li>
            <span className={emphasisClassName}>Scope</span>
            {" — NetSuite AI Connector Service (leave other scopes off)"}
          </li>
          <li>
            <span className={emphasisClassName}>
              Dynamic Client Registration
            </span>
            {" — checked"}
          </li>
          <li>
            <span className={emphasisClassName}>
              Dynamic Client Registration Client Name
            </span>
            {" — "}
            {NETSUITE_DCR_CLIENT_NAME}
          </li>
        </ol>
      </li>
      <li>Press Save and return to OpenSuiteMCP</li>
    </ol>
  );
}

async function fetchSettings() {
  try {
    // Add cache busting to ensure fresh data
    const response = await fetch("/api/settings", {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[Settings] Failed to fetch settings:",
        response.status,
        errorText,
      );
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }
    const data = await response.json();
    console.log("[Settings] Received from API:", {
      hasGoogleKey: !!data.googleApiKey,
      hasAnthropicKey: !!data.anthropicApiKey,
      hasOpenAIKey: !!data.openaiApiKey,
      aiProvider: data.aiProvider,
      googleKeyLength: data.googleApiKey?.length ?? 0,
      anthropicKeyLength: data.anthropicApiKey?.length ?? 0,
      openaiKeyLength: data.openaiApiKey?.length ?? 0,
    });
    return data as {
      googleApiKey: string | null;
      anthropicApiKey: string | null;
      openaiApiKey: string | null;
      aiProvider: "google" | "anthropic" | "openai";
      netsuiteAccountId: string | null;
      netsuiteClientId: string | null;
      netsuiteAccounts: NetSuiteAccountEntry[];
      timezone: string;
      searchDomainIds: string[];
      maxIterations: string;
    };
  } catch (error) {
    console.error("[Settings] Error in fetchSettings:", error);
    throw error;
  }
}

async function fetchNetSuiteStatus() {
  const response = await fetch("/api/netsuite/status");
  if (!response.ok) {
    return { connected: false };
  }
  return response.json() as Promise<{ connected: boolean }>;
}

type SettingsPanelProps = {
  active: boolean;
  section: SettingsPanelSection;
};

// Get timezone display name and abbreviation
function getTimezoneDisplay(tz: string): {
  code: string;
  name: string;
  full: string;
} {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(now);
    const tzNamePart = parts.find((part) => part.type === "timeZoneName");
    const code = tzNamePart?.value || "";

    const longFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "long",
    });
    const longParts = longFormatter.formatToParts(now);
    const tzLongPart = longParts.find((part) => part.type === "timeZoneName");
    const name = tzLongPart?.value || tz;

    return {
      code,
      name,
      full: tz,
    };
  } catch {
    return {
      code: "",
      name: tz,
      full: tz,
    };
  }
}

// Get all available timezones
function getAllTimezones(): string[] {
  try {
    // Use Intl API if available (modern browsers)
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return Intl.supportedValuesOf("timeZone").sort();
    }
  } catch {
    // Fallback if not supported
  }

  // Fallback list of common timezones
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "America/Honolulu",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Rome",
    "Europe/Madrid",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Hong_Kong",
    "Asia/Singapore",
    "Asia/Dubai",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Pacific/Auckland",
  ].sort();
}

export function SettingsPanel({ active, section }: SettingsPanelProps) {
  const { closePortal } = useAppPortal();
  const { data: session } = useSession();
  const router = useRouter();
  const isGuest = guestRegex.test(session?.user?.email ?? "");

  // Fetch user info including lastLoginAt
  const { data: userInfo } = useSWR(
    session?.user?.id ? "/api/user/info" : null,
    async () => {
      const response = await fetch("/api/user/info");
      if (!response.ok) {
        throw new Error("Failed to fetch user info");
      }
      return response.json() as Promise<{
        id: string;
        email: string;
        lastLoginAt: string | null;
      }>;
    },
  );
  const googleApiKeyId = useId();
  const anthropicApiKeyId = useId();
  const openaiApiKeyId = useId();
  const netsuiteAccountSelectId = useId();
  const netsuiteNewAccountId = useId();
  const netsuiteNewAccountLabelId = useId();
  const timezoneId = useId();
  const [settingsCacheKey, setSettingsCacheKey] = useState<string | null>(null);
  const { mutate: globalMutate } = useSWRConfig();

  // Create new cache key when panel becomes active to force fresh fetch
  useEffect(() => {
    if (active) {
      setSettingsCacheKey(`settings-${Date.now()}`);
    } else {
      setSettingsCacheKey(null);
    }
  }, [active]);

  // Fetch settings only when panel is active
  const {
    data: settings,
    mutate: refreshSettings,
    isLoading,
  } = useSWR(settingsCacheKey, fetchSettings, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupeInterval: 0, // Always fetch fresh data, don't dedupe
    revalidateIfStale: true, // Revalidate if data is stale
  });
  const { data: netsuiteStatus, mutate: refreshNetsuiteStatus } = useSWR(
    active ? "netsuite-status" : null,
    fetchNetSuiteStatus,
  );

  const [googleApiKey, setGoogleApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState<
    "google" | "anthropic" | "openai"
  >("google");
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
  const [showAnthropicApiKey, setShowAnthropicApiKey] = useState(false);
  const [showOpenaiApiKey, setShowOpenaiApiKey] = useState(false);
  const [netsuiteAccounts, setNetsuiteAccounts] = useState<
    NetSuiteAccountEntry[]
  >([]);
  const [netsuiteAccountId, setNetsuiteAccountId] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [isSaving, setIsSaving] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [searchDomainIds, setSearchDomainIds] = useState<string[]>([]);
  const [maxIterations, setMaxIterations] = useState("10");
  const maxIterationsId = useId();
  const [isConnectingNetSuite, setIsConnectingNetSuite] = useState(false);
  const [dcrProbe, setDcrProbe] = useState<DcrProbeState>({ status: "idle" });
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>(
    {},
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const initializedForThisOpenRef = useRef(false);
  const dcrProbeRequestIdRef = useRef(0);
  const timezones = getAllTimezones();

  // Filter timezones based on search
  const filteredTimezones = timezones.filter((tz) => {
    if (!timezoneSearch.trim()) {
      return true;
    }
    const searchLower = timezoneSearch.toLowerCase();
    const display = getTimezoneDisplay(tz);
    const searchText =
      `${display.code} ${display.name} ${display.full}`.toLowerCase();
    return searchText.includes(searchLower);
  });

  // Reset initialization flag when panel becomes active
  useEffect(() => {
    if (active) {
      initializedForThisOpenRef.current = false;
      void refreshSettings();
    } else {
      initializedForThisOpenRef.current = false;
    }
  }, [active, refreshSettings]);

  // Populate form when settings load and panel is active
  useEffect(() => {
    if (!active) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!settings) {
      console.warn("[Settings] Panel active but settings not loaded yet");
      return;
    }

    // Only populate once per active session
    if (initializedForThisOpenRef.current) {
      return;
    }

    // Populate form when settings are available
    if (typeof settings === "object" && "aiProvider" in settings) {
      setGoogleApiKey(settings.googleApiKey ?? "");
      setAnthropicApiKey(settings.anthropicApiKey ?? "");
      setOpenaiApiKey(settings.openaiApiKey ?? "");
      // Coerce unknown or deprecated provider values to google
      const provider =
        settings.aiProvider === "google" ||
        settings.aiProvider === "anthropic" ||
        settings.aiProvider === "openai"
          ? settings.aiProvider
          : "google";
      setAiProvider(provider);
      const accounts = settings.netsuiteAccounts ?? [];
      const activeId =
        settings.netsuiteAccountId ?? accounts[0]?.accountId ?? "";
      setNetsuiteAccounts(accounts);
      setNetsuiteAccountId(activeId);
      setEditingLabels(
        Object.fromEntries(
          accounts.map((account) => [account.accountId, account.label]),
        ),
      );
      setTimezone(settings.timezone ?? "UTC");
      setSearchDomainIds(settings.searchDomainIds ?? []);
      setMaxIterations(settings.maxIterations ?? "10");
      initializedForThisOpenRef.current = true;
    } else {
      console.warn("[Settings] Settings object invalid:", settings);
    }
  }, [settings, active, isLoading]);

  // Keep NetSuite picker in sync if settings arrive/revalidate with an
  // active account while local state is still empty (skeleton remount race).
  useEffect(() => {
    if (!active || !settings) {
      return;
    }
    const accounts = settings.netsuiteAccounts ?? [];
    const activeId =
      settings.netsuiteAccountId ?? accounts[0]?.accountId ?? "";
    if (!activeId && accounts.length === 0) {
      return;
    }
    if (netsuiteAccounts.length === 0 && accounts.length > 0) {
      setNetsuiteAccounts(accounts);
      setEditingLabels(
        Object.fromEntries(
          accounts.map((account) => [account.accountId, account.label]),
        ),
      );
    }
    if (!netsuiteAccountId && activeId) {
      setNetsuiteAccountId(activeId);
    }
  }, [
    active,
    settings,
    netsuiteAccountId,
    netsuiteAccounts.length,
  ]);

  const accountOptions =
    netsuiteAccounts.length > 0
      ? netsuiteAccounts
      : (settings?.netsuiteAccounts ?? []);
  const selectedAccountId = (() => {
    if (
      netsuiteAccountId &&
      accountOptions.some((account) => account.accountId === netsuiteAccountId)
    ) {
      return netsuiteAccountId;
    }
    const fromSettings = settings?.netsuiteAccountId ?? "";
    if (
      fromSettings &&
      accountOptions.some((account) => account.accountId === fromSettings)
    ) {
      return fromSettings;
    }
    return accountOptions[0]?.accountId ?? "";
  })();

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (timezoneOpen && searchInputRef.current) {
      // Small delay to ensure the dropdown content is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [timezoneOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Include all selected domains (both included and premium tiers)
      const effectiveSearchDomainIds = Array.from(new Set(searchDomainIds));

      const accountsToSave =
        netsuiteAccounts.length > 0
          ? netsuiteAccounts
          : (settings?.netsuiteAccounts ?? []);
      const activeToSave =
        netsuiteAccountId?.trim() ||
        selectedAccountId ||
        settings?.netsuiteAccountId ||
        null;

      const payload = {
        googleApiKey: googleApiKey?.trim() || null,
        anthropicApiKey: anthropicApiKey?.trim() || null,
        openaiApiKey: openaiApiKey?.trim() || null,
        aiProvider: aiProvider,
        netsuiteAccountId: activeToSave,
        netsuiteAccounts: accountsToSave,
        timezone: timezone?.trim() || "UTC",
        searchDomainIds: effectiveSearchDomainIds,
        maxIterations: maxIterations?.trim() || "10",
      };

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save settings");
      }

      toast({
        type: "success",
        description: "Settings saved successfully",
      });

      // Refresh settings after save
      const freshData = await fetchSettings();
      await refreshSettings(freshData, { revalidate: false });

      // Invalidate the "settings" cache key used by model selector components
      // This ensures they refresh with the new provider
      await globalMutate("settings");

      // Always close portal after saving
      closePortal();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const probeNetSuiteDcr = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    if (!normalized) {
      setDcrProbe({ status: "idle" });
      return;
    }

    const requestId = ++dcrProbeRequestIdRef.current;
    setDcrProbe({ status: "probing" });

    const selected = netsuiteAccounts.find(
      (account) => account.accountId === normalized,
    );

    try {
      const response = await fetch("/api/netsuite/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: normalized,
          label: selected?.label || normalized,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (requestId !== dcrProbeRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setDcrProbe({
          status: "error",
          error: data.error || "Failed to check NetSuite integration",
        });
        return;
      }

      if (data.status === "ready") {
        setDcrProbe({ status: "ready", clientId: data.clientId });
        setNetsuiteAccounts((previous) => {
          const base =
            previous.length > 0
              ? previous
              : (settings?.netsuiteAccounts ?? [
                  {
                    accountId: normalized,
                    label: selected?.label || normalized,
                    clientId: null,
                  },
                ]);
          const exists = base.some(
            (account) => account.accountId === normalized,
          );
          const next = exists
            ? base.map((account) =>
                account.accountId === normalized
                  ? { ...account, clientId: data.clientId }
                  : account,
              )
            : [
                ...base,
                {
                  accountId: normalized,
                  label: selected?.label || normalized,
                  clientId: data.clientId,
                },
              ];
          return next;
        });
        await refreshSettings();
        return;
      }

      if (data.status === "needs_integration") {
        setDcrProbe({
          status: "needs_integration",
          accountId: data.accountId,
          integrationUrl: data.integrationUrl,
          redirectUri: data.redirectUri,
          dcrClientName: data.dcrClientName,
          checklist: data.checklist ?? [],
        });
        await refreshSettings();
        return;
      }

      setDcrProbe({
        status: "error",
        error: data.error || "Unexpected probe response",
      });
    } catch (error) {
      if (requestId !== dcrProbeRequestIdRef.current) {
        return;
      }
      setDcrProbe({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to check NetSuite integration",
      });
    }
  };

  useEffect(() => {
    if (!active || isGuest || !selectedAccountId) {
      // Invalidate in-flight probes so a late response can't show a miss card
      // when nothing is selected.
      dcrProbeRequestIdRef.current += 1;
      setDcrProbe({ status: "idle" });
      return;
    }

    if (netsuiteAccountId !== selectedAccountId) {
      setNetsuiteAccountId(selectedAccountId);
    }

    void probeNetSuiteDcr(selectedAccountId);
    // Probe whenever the active account changes while Settings is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: account selection drives probe
  }, [active, isGuest, selectedAccountId]);

  const persistAccounts = async (accounts: NetSuiteAccountEntry[], activeId: string) => {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        netsuiteAccounts: accounts,
        netsuiteAccountId: activeId || null,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to save NetSuite accounts");
    }
  };

  const handleAddNetSuiteAccount = async () => {
    const accountId = normalizeNetSuiteAccountId(newAccountId);
    if (!accountId) {
      return;
    }

    const label = newAccountLabel.trim() || accountId;
    const nextAccounts = [
      ...netsuiteAccounts.filter((account) => account.accountId !== accountId),
      {
        accountId,
        label,
        clientId:
          netsuiteAccounts.find((account) => account.accountId === accountId)
            ?.clientId ?? null,
      },
    ].sort((a, b) => a.label.localeCompare(b.label));

    try {
      await persistAccounts(nextAccounts, accountId);
      setNetsuiteAccounts(nextAccounts);
      setNetsuiteAccountId(accountId);
      setEditingLabels((previous) => ({ ...previous, [accountId]: label }));
      setNewAccountId("");
      setNewAccountLabel("");
      await refreshSettings();
      toast({ type: "success", description: `Added ${label}` });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to add account",
      });
    }
  };

  const handleRemoveNetSuiteAccount = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const nextAccounts = netsuiteAccounts.filter(
      (account) => account.accountId !== normalized,
    );
    const nextActive =
      netsuiteAccountId === normalized
        ? (nextAccounts[0]?.accountId ?? "")
        : netsuiteAccountId;

    try {
      await persistAccounts(nextAccounts, nextActive);
      setNetsuiteAccounts(nextAccounts);
      setNetsuiteAccountId(nextActive);
      setEditingLabels((previous) => {
        const next = { ...previous };
        delete next[normalized];
        return next;
      });
      await refreshSettings();
      await refreshNetsuiteStatus();
      toast({ type: "success", description: "Account removed" });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to remove account",
      });
    }
  };

  const handleRenameNetSuiteAccount = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const label =
      editingLabels[normalized]?.trim() ||
      netsuiteAccounts.find((account) => account.accountId === normalized)
        ?.label ||
      normalized;
    const nextAccounts = netsuiteAccounts.map((account) =>
      account.accountId === normalized ? { ...account, label } : account,
    );

    try {
      await persistAccounts(nextAccounts, netsuiteAccountId);
      setNetsuiteAccounts(nextAccounts);
      await refreshSettings();
      toast({ type: "success", description: "Account renamed" });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to rename account",
      });
    }
  };

  const handleSelectNetSuiteAccount = async (accountId: string) => {
    setNetsuiteAccountId(accountId);
    try {
      await persistAccounts(netsuiteAccounts, accountId);
      await refreshSettings();
      await refreshNetsuiteStatus();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to switch NetSuite account",
      });
    }
  };

  const handleNetSuiteConnect = async () => {
    if (netsuiteStatus?.connected) {
      try {
        const response = await fetch("/api/netsuite/disconnect", {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("Failed to disconnect");
        }
        toast({
          type: "success",
          description: "NetSuite account disconnected successfully",
        });
        refreshNetsuiteStatus();
      } catch {
        toast({
          type: "error",
          description: "Failed to disconnect NetSuite account",
        });
      }
      return;
    }

    if (!netsuiteAccountId || dcrProbe.status !== "ready") {
      return;
    }

    const selected = netsuiteAccounts.find(
      (account) => account.accountId === netsuiteAccountId,
    );

    setIsConnectingNetSuite(true);
    try {
      const response = await fetch("/api/netsuite/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: netsuiteAccountId,
          label: selected?.label || netsuiteAccountId,
          clientId: dcrProbe.clientId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to prepare NetSuite connection");
      }

      if (data.status === "needs_integration") {
        setDcrProbe({
          status: "needs_integration",
          accountId: data.accountId,
          integrationUrl: data.integrationUrl,
          redirectUri: data.redirectUri,
          dcrClientName: data.dcrClientName,
          checklist: data.checklist ?? [],
        });
        await refreshSettings();
        return;
      }

      await refreshSettings();
      window.location.href = data.authorizeUrl || "/api/netsuite/authorize";
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to connect NetSuite account",
      });
    } finally {
      setIsConnectingNetSuite(false);
    }
  };

  const openIntegrationSetup = () => {
    const url =
      dcrProbe.status === "needs_integration"
        ? dcrProbe.integrationUrl
        : netsuiteAccountId
          ? getNetSuiteNewIntegrationUrl(netsuiteAccountId)
          : null;
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDomainToggle = (domainId: string, checked: boolean) => {
    setSearchDomainIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(domainId);
      } else {
        next.delete(domainId);
      }
      return Array.from(next);
    });
  };

  const isNetSuiteConnected = netsuiteStatus?.connected ?? false;
  const canConnectNetSuite =
    Boolean(selectedAccountId) &&
    !isConnectingNetSuite &&
    (isNetSuiteConnected || dcrProbe.status === "ready");
  const connectionHelpRedirectUri =
    dcrProbe.status === "needs_integration"
      ? dcrProbe.redirectUri
      : getClientNetSuiteRedirectUri();

  // Show skeletons while loading
  const showSkeletons = isLoading;
  const sectionMeta = SECTION_META[section];
  const headerDocsLinks =
    section === "provider"
      ? [PROVIDER_DOCS[aiProvider]]
      : sectionMeta.docsLinks;

  return (
    <form
      autoComplete="off"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <PortalPanelHeader
        docsLinks={headerDocsLinks}
        icon={sectionMeta.icon}
        subtitle={sectionMeta.subtitle}
        title={sectionMeta.title}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {section === "provider" ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Provider</Label>
              {showSkeletons || !settings ? (
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2">
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : (
                <Select
                  key={`provider-${aiProvider}`}
                  onValueChange={(
                    value: "google" | "anthropic" | "openai",
                  ) => {
                    setAiProvider(value);
                  }}
                  value={aiProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google (Gemini)</SelectItem>
                    <SelectItem value="anthropic">
                      Anthropic (Claude)
                    </SelectItem>
                    <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-4 border-t border-border/60 pt-4">
              <div>
                <p className="font-medium text-sm">API keys & limits</p>
                <p className="text-muted-foreground text-xs">
                  API key and reasoning limits for the selected provider.
                </p>
              </div>

              {aiProvider === "openai" && (
                <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-500">
                      <WarningIcon size={16} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-sm text-yellow-900 dark:text-yellow-100">
                        Organization Verification Required
                      </p>
                      <p className="text-xs text-yellow-800 dark:text-yellow-200">
                        For enhanced reasoning features, verify your
                        organization at{" "}
                        <a
                          className="text-primary underline hover:no-underline"
                          href="https://platform.openai.com/settings/organization/general"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          platform.openai.com/settings/organization/general
                        </a>
                        . Propagation can take up to 15 minutes.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {aiProvider === "google" && (
                <div className="space-y-2">
                  <Label htmlFor={googleApiKeyId}>Google API Key</Label>
                  <p className="text-muted-foreground text-xs">
                    Get a key at{" "}
                    <a
                      className="text-primary underline hover:no-underline"
                      href="https://aistudio.google.com/apikey"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      aistudio.google.com/apikey
                    </a>
                    .
                  </p>
                  <div className="relative">
                    <Input
                      autoComplete="off"
                      className="pr-10"
                      data-1p-ignore="true"
                      data-form-type="other"
                      data-lpignore="true"
                      id={googleApiKeyId}
                      name="google-api-key"
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                      placeholder="Enter your Google API key"
                      type={showGoogleApiKey ? "text" : "password"}
                      value={googleApiKey}
                    />
                    <Button
                      className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowGoogleApiKey(!showGoogleApiKey)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {showGoogleApiKey ? (
                        <EyeOffIcon size={16} />
                      ) : (
                        <EyeIcon size={16} />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {aiProvider === "anthropic" && (
                <div className="space-y-2">
                  <Label htmlFor={anthropicApiKeyId}>Anthropic API Key</Label>
                  <p className="text-muted-foreground text-xs">
                    Get a key at{" "}
                    <a
                      className="text-primary underline hover:no-underline"
                      href="https://console.anthropic.com/"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      console.anthropic.com
                    </a>
                    .
                  </p>
                  <div className="relative">
                    <Input
                      autoComplete="off"
                      className="pr-10"
                      data-1p-ignore="true"
                      data-form-type="other"
                      data-lpignore="true"
                      id={anthropicApiKeyId}
                      name="anthropic-api-key"
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
                      placeholder="Enter your Anthropic API key"
                      type={showAnthropicApiKey ? "text" : "password"}
                      value={anthropicApiKey}
                    />
                    <Button
                      className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                      onClick={() =>
                        setShowAnthropicApiKey(!showAnthropicApiKey)
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {showAnthropicApiKey ? (
                        <EyeOffIcon size={16} />
                      ) : (
                        <EyeIcon size={16} />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {aiProvider === "openai" && (
                <div className="space-y-2">
                  <Label htmlFor={openaiApiKeyId}>OpenAI API Key</Label>
                  <p className="text-muted-foreground text-xs">
                    Get a key at{" "}
                    <a
                      className="text-primary underline hover:no-underline"
                      href="https://platform.openai.com/api-keys"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      platform.openai.com/api-keys
                    </a>
                    .
                  </p>
                  <div className="relative">
                    <Input
                      autoComplete="off"
                      className="pr-10"
                      data-1p-ignore="true"
                      data-form-type="other"
                      data-lpignore="true"
                      id={openaiApiKeyId}
                      name="openai-api-key"
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder="Enter your OpenAI API key"
                      type={showOpenaiApiKey ? "text" : "password"}
                      value={openaiApiKey}
                    />
                    <Button
                      className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowOpenaiApiKey(!showOpenaiApiKey)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {showOpenaiApiKey ? (
                        <EyeOffIcon size={16} />
                      ) : (
                        <EyeIcon size={16} />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={maxIterationsId}>Max Reasoning Steps</Label>
                <p className="text-muted-foreground text-xs">
                  Maximum reasoning steps before stopping (1-20).
                </p>
                <Input
                  id={maxIterationsId}
                  max={20}
                  min={1}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || /^\d+$/.test(value)) {
                      const num = Number.parseInt(value, 10);
                      if (value === "" || (num >= 1 && num <= 20)) {
                        setMaxIterations(value);
                      }
                    }
                  }}
                  placeholder="10"
                  type="number"
                  value={maxIterations}
                />
              </div>
            </div>
          </div>
        ) : null}

        {section === "netsuite" ? (
          isGuest ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="mb-4 text-center text-muted-foreground text-sm">
                Login to use NetSuite features
              </p>
              <Button
                onClick={() => {
                  router.push("/login");
                  closePortal();
                }}
                type="button"
              >
                Login
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">Connection</p>
                  <p className="text-muted-foreground text-xs">
                    Choose a NetSuite account to connect with MCP tools.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={netsuiteAccountSelectId}>
                    Active account
                  </Label>
                  {showSkeletons && accountOptions.length === 0 ? (
                    <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2">
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ) : (
                    <Select
                      disabled={accountOptions.length === 0}
                      onValueChange={(value) => {
                        void handleSelectNetSuiteAccount(value);
                      }}
                      value={selectedAccountId || undefined}
                    >
                      <SelectTrigger id={netsuiteAccountSelectId}>
                        <SelectValue placeholder="Select an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((account) => (
                          <SelectItem
                            key={account.accountId}
                            value={account.accountId}
                          >
                            {account.label} ({account.accountId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {dcrProbe.status === "probing" && selectedAccountId && (
                  <p className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span className="inline-block animate-spin">
                      <LoaderIcon size={14} />
                    </span>
                    Checking Integration record for {selectedAccountId}…
                  </p>
                )}

                {selectedAccountId &&
                  dcrProbe.status === "needs_integration" &&
                  dcrProbe.accountId === selectedAccountId && (
                    <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-500">
                          <WarningIcon size={16} />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="space-y-2">
                            <p className="font-medium text-sm text-yellow-900 dark:text-yellow-100">
                              Integration record required
                            </p>
                            <p className="text-xs text-yellow-800 dark:text-yellow-200">
                              No matching NetSuite Integration was found for
                              account{" "}
                              <span className="font-medium">
                                {dcrProbe.accountId}
                              </span>
                              . Create it once with the steps below, then press
                              Check again.
                            </p>
                            <p className="text-xs text-yellow-800 dark:text-yellow-200">
                              If you are a non-admin user, please contact your
                              company NetSuite admin team to set up an
                              Integration record for account{" "}
                              <span className="font-medium">
                                {dcrProbe.accountId}
                              </span>
                              .
                            </p>
                          </div>
                          <NetSuiteIntegrationInstructions
                            bodyClassName="text-xs text-yellow-800 dark:text-yellow-200"
                            emphasisClassName="font-medium text-yellow-900 dark:text-yellow-100"
                            redirectUri={dcrProbe.redirectUri}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={openIntegrationSetup}
                              size="sm"
                              type="button"
                            >
                              Setup Integration (Admin Only)
                            </Button>
                            <Button
                              onClick={() => {
                                void probeNetSuiteDcr(dcrProbe.accountId);
                              }}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Check again
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                {selectedAccountId && dcrProbe.status === "error" && (
                  <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-500">
                        <WarningIcon size={16} />
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="font-medium text-sm text-yellow-900 dark:text-yellow-100">
                          Could not verify Integration
                        </p>
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">
                          {dcrProbe.error}
                        </p>
                        <Button
                          onClick={() => {
                            void probeNetSuiteDcr(selectedAccountId);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Check again
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    disabled={!canConnectNetSuite}
                    onClick={() => {
                      void handleNetSuiteConnect();
                    }}
                    type="button"
                    variant={isNetSuiteConnected ? "destructive" : "default"}
                  >
                    {isNetSuiteConnected
                      ? "Disconnect"
                      : isConnectingNetSuite
                        ? "Connecting..."
                        : "Connect"}
                  </Button>
                  {isNetSuiteConnected && (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
                      <span className="text-muted-foreground text-sm">
                        Connected
                        {selectedAccountId ? ` · ${selectedAccountId}` : ""}
                      </span>
                    </div>
                  )}
                  {!isNetSuiteConnected && dcrProbe.status === "ready" && (
                    <span className="text-muted-foreground text-sm">
                      Integration ready
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">Manage accounts</p>
                  <p className="text-muted-foreground text-xs">
                    Add, rename, or remove NetSuite accounts used for MCP tools.
                  </p>
                </div>

                {netsuiteAccounts.length > 0 ? (
                  <div>
                    {netsuiteAccounts.map((account) => (
                      <div
                        className="space-y-2 border-border/60 border-b py-3 last:border-b-0"
                        key={account.accountId}
                      >
                        <p className="truncate text-muted-foreground text-xs">
                          {account.accountId}
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            aria-label={`Label for ${account.accountId}`}
                            autoComplete="off"
                            onChange={(e) => {
                              setEditingLabels((previous) => ({
                                ...previous,
                                [account.accountId]: e.target.value,
                              }));
                            }}
                            value={
                              editingLabels[account.accountId] ?? account.label
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              disabled={
                                (editingLabels[account.accountId] ??
                                  account.label) === account.label
                              }
                              onClick={() => {
                                void handleRenameNetSuiteAccount(
                                  account.accountId,
                                );
                              }}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Rename
                            </Button>
                            <Button
                              onClick={() => {
                                void handleRemoveNetSuiteAccount(
                                  account.accountId,
                                );
                              }}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No accounts yet. Add one below.
                  </p>
                )}

                <div className="space-y-3 border-border/60 border-t pt-4">
                  <p className="font-medium text-sm">Add account</p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-2">
                      <Label htmlFor={netsuiteNewAccountId}>Account ID</Label>
                      <Input
                        autoComplete="off"
                        id={netsuiteNewAccountId}
                        onChange={(e) => setNewAccountId(e.target.value)}
                        placeholder="1234567-sb1"
                        value={newAccountId}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={netsuiteNewAccountLabelId}>
                        Label (optional)
                      </Label>
                      <Input
                        autoComplete="off"
                        id={netsuiteNewAccountLabelId}
                        onChange={(e) => setNewAccountLabel(e.target.value)}
                        placeholder="Sandbox"
                        value={newAccountLabel}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        disabled={!newAccountId.trim()}
                        onClick={() => {
                          void handleAddNetSuiteAccount();
                        }}
                        type="button"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">Connection instructions</p>
                  <p className="text-muted-foreground text-xs">
                    A NetSuite Administrator needs to create this Integration
                    once per account. Non-admin users should contact their
                    NetSuite admin team.
                  </p>
                </div>
                <NetSuiteIntegrationInstructions
                  redirectUri={connectionHelpRedirectUri}
                />
                {netsuiteAccountId ? (
                  <Button
                    onClick={openIntegrationSetup}
                    type="button"
                    variant="outline"
                  >
                    Setup Integration (Admin Only)
                  </Button>
                ) : null}
              </div>
            </div>
          )
        ) : null}

        {section === "search" ? (
          isGuest ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="mb-4 text-center text-muted-foreground text-sm">
                Login to configure web search tools
              </p>
              <Button
                onClick={() => {
                  router.push("/login");
                  closePortal();
                }}
                type="button"
              >
                Login
              </Button>
            </div>
          ) : showSkeletons ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton className="h-14 w-full" key={i} />
              ))}
            </div>
          ) : (
            <div>
              {searchDomains.map((domain) => {
                const checked = searchDomainIds.includes(domain.id);
                return (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-border/60 border-b py-3 last:border-b-0"
                    key={domain.id}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{domain.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {domain.description}
                      </p>
                      <p className="mt-0.5 truncate text-muted-foreground text-xs">
                        {getSearchDomainUrl(domain)}
                      </p>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(isChecked) =>
                        handleDomainToggle(domain.id, isChecked)
                      }
                    />
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {section === "timezone" ? (
          <div className="space-y-2">
            {showSkeletons ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <DropdownMenu
                onOpenChange={(isOpen) => {
                  setTimezoneOpen(isOpen);
                  if (!isOpen) {
                    setTimezoneSearch("");
                  }
                }}
                open={timezoneOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    className="w-full justify-between"
                    id={timezoneId}
                    type="button"
                    variant="outline"
                  >
                    {timezone
                      ? (() => {
                          const display = getTimezoneDisplay(timezone);
                          return display.code
                            ? `[${display.code}] ${display.name} ${display.full}`
                            : `${display.name} ${display.full}`;
                        })()
                      : "Select timezone"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="flex max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] w-(--radix-dropdown-menu-trigger-width) flex-col overflow-hidden p-0"
                >
                  <div className="shrink-0 border-b p-2">
                    <Input
                      className="h-8"
                      onChange={(e) => setTimezoneSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && timezoneSearch) {
                          setTimezoneSearch("");
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      placeholder="Search timezones..."
                      ref={searchInputRef}
                      value={timezoneSearch}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-1">
                    {filteredTimezones.length > 0 ? (
                      filteredTimezones.map((tz) => {
                        const display = getTimezoneDisplay(tz);
                        const displayText = display.code
                          ? `[${display.code}] ${display.name} ${display.full}`
                          : `${display.name} ${display.full}`;
                        return (
                          <DropdownMenuItem
                            key={tz}
                            onSelect={() => {
                              setTimezone(tz);
                              setTimezoneOpen(false);
                              setTimezoneSearch("");
                            }}
                          >
                            {displayText}
                          </DropdownMenuItem>
                        );
                      })
                    ) : (
                      <div className="py-6 text-center text-muted-foreground text-sm">
                        No timezones found
                      </div>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : null}

        {section === "account" && session?.user?.id ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground text-xs">
                User ID
              </p>
              <p className="font-mono text-sm">{session.user.id}</p>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground text-xs">Email</p>
              <p className="text-sm">
                {userInfo?.email || session.user.email || "N/A"}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground text-xs">
                Last Login
              </p>
              <p className="text-sm">
                {userInfo?.lastLoginAt
                  ? new Date(userInfo.lastLoginAt).toLocaleString()
                  : "Never"}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 sm:justify-end">
        <Button onClick={() => closePortal()} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={isSaving || isLoading}
          onClick={() => handleSave()}
          type="button"
        >
          {isSaving ? (
            <>
              <span className="mr-2 inline-block animate-spin">
                <LoaderIcon size={16} />
              </span>
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
