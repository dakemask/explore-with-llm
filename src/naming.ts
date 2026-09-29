import { streamAnswer } from "./api";
import type { Message, Provider } from "./types";
export function namingPrompt(messages: Message[], language = "简体中文") {
  const conversation = messages
    .map((m) => `${m.role}: ${m.content}${m.images.length ? "\n[图片]" : ""}`)
    .join("\n\n");
  return `Based on the chat history, give this conversation a name. Keep it short - 10 words max, no quotes. Use ${language}. Just provide the name, nothing else.
Here's the conversation:
\`\`\`
${conversation} 
\`\`\`
Name this conversation in 10 words or less. Use ${language}. Only give the name, nothing else.
The name is:`;
}
export async function nameConversation(
  messages: Message[],
  provider: Provider,
) {
  let title = "";
  await streamAnswer(
    [
      {
        id: "name",
        parent: null,
        role: "user",
        content: namingPrompt(messages),
        images: [],
      },
    ],
    provider,
    "none",
    AbortSignal.timeout(30000),
    (delta) => {
      title += delta;
    },
  );
  title = title
    .trim()
    .replace(/^["“”'「」]+|["“”'「」]+$/g, "")
    .split(/\r?\n/)[0]
    .split(/\s+/)
    .slice(0, 10)
    .join(" ");
  if (!title) throw new Error("Empty title");
  return title;
}
