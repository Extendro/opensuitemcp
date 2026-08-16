export const CHAT_MODEL_COOKIE = "chat-model";
export const CHAT_AI_PROVIDER_COOKIE = "chat-ai-provider";

export type ComposerChatModelId = "chat-model" | "chat-model-reasoning";

export function isComposerChatModelId(
  value: string,
): value is ComposerChatModelId {
  return value === "chat-model" || value === "chat-model-reasoning";
}

/** Persist Speed/Reasoning without a server action (those refresh RSC and remount new chats). */
export function persistComposerPreferences(input: {
  selectedChatModel?: ComposerChatModelId;
}) {
  void fetch("/api/chat/composer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
