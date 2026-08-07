import { REGISTERED_MODELS, type ModelProviderId } from "./model-registry";

export const DEFAULT_CHAT_MODEL: string = "chat-model";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
  provider?: ModelProviderId;
};

const SLOT_TO_CHAT_ID = {
  speed: "chat-model",
  reasoning: "chat-model-reasoning",
} as const;

export const chatModels: ChatModel[] = REGISTERED_MODELS.map((model) => ({
  id: SLOT_TO_CHAT_ID[model.slot],
  name: `${model.name} (${model.slot === "speed" ? "Speed Mode" : "Enhanced Reasoning"})`,
  description: `${model.blurb} Billed to your ${model.provider === "openai" ? "OpenAI" : model.provider === "anthropic" ? "Anthropic" : "Google AI"} key.`,
  provider: model.provider,
}));
