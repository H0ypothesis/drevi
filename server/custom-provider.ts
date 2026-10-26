import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";

export function customProvider() {
  return createProvider({
    id: "custom",
    name: "通用接口",
    baseUrl: "",
    models: [],
    auth: {
      apiKey: {
        name: "Custom API key",
        resolve: async ({ ctx, signal }) => {
          const key = (await ctx.env("CUSTOM_API_KEY"))?.trim();
          signal.throwIfAborted();
          return key
            ? { auth: { apiKey: key }, source: "CUSTOM_API_KEY" }
            : undefined;
        },
      },
    },
    api: {
      "openai-completions": openAICompletionsApi(),
      "openai-responses": openAIResponsesApi(),
      "anthropic-messages": anthropicMessagesApi(),
    },
  });
}
