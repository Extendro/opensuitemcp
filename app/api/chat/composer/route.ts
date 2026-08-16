import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  CHAT_AI_PROVIDER_COOKIE,
  CHAT_MODEL_COOKIE,
} from "@/lib/ai/composer-preferences";
import { ChatSDKError } from "@/lib/errors";

const bodySchema = z.object({
  selectedChatModel: z.enum(["chat-model", "chat-model-reasoning"]).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  try {
    const body = bodySchema.parse(await request.json());
    const cookieStore = await cookies();

    if (body.selectedChatModel) {
      cookieStore.set(CHAT_MODEL_COOKIE, body.selectedChatModel);
    }

    // Last-used provider must not override the Settings default for new chats.
    cookieStore.delete(CHAT_AI_PROVIDER_COOKIE);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
