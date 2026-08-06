/**
 * Companion Prompt Library embeds user-fillable values as `[TOKEN]` text.
 * NetSuite does not ship a structured variables schema — we detect template-like
 * tokens and substitute them before sending the prompt to chat.
 *
 * Each occurrence is a separate field so templates like
 * `between [DATE] and [DATE]` can take two different values.
 */

const BRACKET_TOKEN_RE = /\[([^\[\]]+)\]/g;

/** Identifier / short phrase shapes used in Companion templates. */
const TEMPLATE_INNER_RE =
  /^[A-Za-z0-9_/#][A-Za-z0-9_/# '\-]{0,38}[A-Za-z0-9_/#']?$/;

export type PromptPlaceholderField = {
  /** Stable form key, e.g. `[DATE]#0` */
  id: string;
  /** Literal token including brackets, e.g. `[DATE]` */
  token: string;
  /** 0-based occurrence among the same token */
  occurrence: number;
  /** How many times this token appears in the prompt */
  totalOfToken: number;
};

function isTemplateLikePlaceholder(inner: string): boolean {
  const trimmed = inner.trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    return false;
  }
  // Drop sentence-like / prose example blocks
  if (/[.,;:!?]/.test(trimmed)) {
    return false;
  }
  if (!TEMPLATE_INNER_RE.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Returns every template-like placeholder occurrence in order.
 * Duplicate tokens (e.g. two `[DATE]`s) yield separate fields.
 */
export function extractPromptPlaceholders(
  prompt: string,
): PromptPlaceholderField[] {
  const matches: Array<{ token: string }> = [];
  for (const match of prompt.matchAll(BRACKET_TOKEN_RE)) {
    const inner = match[1] ?? "";
    if (!isTemplateLikePlaceholder(inner)) {
      continue;
    }
    matches.push({ token: `[${inner}]` });
  }

  const totals = new Map<string, number>();
  for (const match of matches) {
    totals.set(match.token, (totals.get(match.token) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return matches.map((match) => {
    const occurrence = seen.get(match.token) ?? 0;
    seen.set(match.token, occurrence + 1);
    return {
      id: `${match.token}#${occurrence}`,
      token: match.token,
      occurrence,
      totalOfToken: totals.get(match.token) ?? 1,
    };
  });
}

/**
 * Replace each placeholder occurrence left-to-right using field ids from
 * {@link extractPromptPlaceholders}. Empty values leave the original token.
 */
export function applyPromptPlaceholders(
  prompt: string,
  fields: PromptPlaceholderField[],
  values: Record<string, string>,
): string {
  let result = "";
  let lastIndex = 0;
  let fieldIndex = 0;

  for (const match of prompt.matchAll(BRACKET_TOKEN_RE)) {
    const inner = match[1] ?? "";
    if (!isTemplateLikePlaceholder(inner)) {
      continue;
    }
    const start = match.index ?? 0;
    const field = fields[fieldIndex];
    fieldIndex += 1;
    result += prompt.slice(lastIndex, start);
    const value = field ? (values[field.id] ?? "").trim() : "";
    result += value || match[0];
    lastIndex = start + match[0].length;
  }

  result += prompt.slice(lastIndex);
  return result;
}

/** Humanize `[VENDOR_NAME]` → `Vendor name`. */
export function humanizePlaceholderToken(token: string): string {
  const inner = token.replace(/^\[/, "").replace(/\]$/, "").trim();
  const spaced = inner
    .replace(/[_/]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) {
    return token;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Label for a field, e.g. `Date (1)` when the same token repeats. */
export function labelForPlaceholderField(field: PromptPlaceholderField): string {
  const base = humanizePlaceholderToken(field.token);
  if (field.totalOfToken <= 1) {
    return base;
  }
  return `${base} (${field.occurrence + 1})`;
}
