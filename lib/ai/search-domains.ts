export type SearchProvider = "searxng";

export type SearchDomainTier = "included" | "premium" | "coming-soon";

export type SearchDomain = {
  id: string;
  label: string;
  description: string;
  hostname: string;
  path?: string;
  provider: SearchProvider;
  tier: SearchDomainTier;
  defaultIncluded?: boolean;
  tags?: string[];
  keywords?: string[];
};

/** Catalog of web search domains for the Settings "Web Search Tools" toggles and get_current_config. */
export const searchDomains: SearchDomain[] = [
  {
    id: "oracle-netsuite-help",
    label: "Oracle NetSuite Help Center",
    description:
      "Official Oracle NetSuite documentation, guides, and help topics.",
    hostname: "docs.oracle.com",
    path: "en/cloud/saas/netsuite",
    provider: "searxng",
    tier: "included",
    defaultIncluded: true,
    tags: ["oracle", "netsuite", "help", "official"],
    keywords: ["oracle netsuite", "suiteanswers", "netsuite help"],
  },
];

const TRAILING_SLASH_REGEX = /\/+$/;

export function getSearchDomainUrl(domain: SearchDomain): string {
  const path = domain.path ? domain.path.replace(TRAILING_SLASH_REGEX, "") : "";
  const normalizedPath = path ? `/${path}` : "";
  return `https://${domain.hostname}${normalizedPath}`;
}
