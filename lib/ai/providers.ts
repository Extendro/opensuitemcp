import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";
import { apiModelFor } from "./model-registry";

function createGoogleProvider(apiKey?: string) {
  const googleProvider = apiKey ? createGoogleGenerativeAI({ apiKey }) : google;

  if (apiKey) {
    console.log(
      "[Provider] Creating Google provider with API key, length:",
      apiKey.length,
    );
  } else {
    console.log(
      "[Provider] Creating Google provider without API key (using env var)",
    );
  }

  const speed = apiModelFor("google", "speed");
  const reasoning = apiModelFor("google", "reasoning");

  return customProvider({
    languageModels: {
      "chat-model": googleProvider(speed),
      "chat-model-reasoning": googleProvider(reasoning),
      "title-model": googleProvider(speed),
    },
  });
}

function createAnthropicProvider(apiKey?: string) {
  const anthropicProvider = apiKey ? createAnthropic({ apiKey }) : anthropic;

  if (apiKey) {
    console.log(
      "[Provider] Creating Anthropic provider with API key, length:",
      apiKey.length,
    );
  } else {
    console.log(
      "[Provider] Creating Anthropic provider without API key (using env var)",
    );
  }

  const speed = apiModelFor("anthropic", "speed");
  const reasoning = apiModelFor("anthropic", "reasoning");

  return customProvider({
    languageModels: {
      // Note: `as never` — Anthropic provider types vs customProvider LanguageModel
      "chat-model": anthropicProvider(speed) as never,
      "chat-model-reasoning": anthropicProvider(reasoning) as never,
      "title-model": anthropicProvider(speed) as never,
    },
  });
}

function createOpenAIProvider(apiKey?: string) {
  const openaiProvider = apiKey ? createOpenAI({ apiKey }) : openai;

  if (apiKey) {
    console.log(
      "[Provider] Creating OpenAI provider with API key, length:",
      apiKey.length,
    );
  } else {
    console.log(
      "[Provider] Creating OpenAI provider without API key (using env var)",
    );
  }

  const speed = apiModelFor("openai", "speed");
  const reasoning = apiModelFor("openai", "reasoning");

  return customProvider({
    languageModels: {
      "chat-model": openaiProvider(speed) as never,
      "chat-model-reasoning": openaiProvider(reasoning) as never,
      "title-model": openaiProvider(speed) as never,
    },
  });
}

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
        },
      });
    })()
  : createGoogleProvider();

/**
 * Create a provider with a user-specific API key
 * @param apiKey - User's API key (encrypted, will be decrypted)
 * @param provider - Provider type: "google", "anthropic", or "openai"
 * @throws Error if no API key is provided and env var is not set
 */
export function getUserProvider(
  apiKey?: string | null,
  provider: "google" | "anthropic" | "openai" = "google",
) {
  if (isTestEnvironment) {
    const { chatModel, reasoningModel, titleModel } = require("./models.mock");
    return customProvider({
      languageModels: {
        "chat-model": chatModel,
        "chat-model-reasoning": reasoningModel,
        "title-model": titleModel,
      },
    });
  }

  if (provider === "anthropic") {
    if (!apiKey) {
      throw new Error(
        "API key is required. Please set your API key in Settings.",
      );
    }

    return createAnthropicProvider(apiKey);
  }

  if (provider === "openai") {
    if (!apiKey) {
      throw new Error(
        "API key is required. Please set your API key in Settings.",
      );
    }

    return createOpenAIProvider(apiKey);
  }

  // Default to Google
  if (!apiKey) {
    throw new Error(
      "API key is required. Please set your API key in Settings.",
    );
  }

  return createGoogleProvider(apiKey);
}
