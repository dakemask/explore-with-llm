import type {
  EncryptedReasoning,
  Message,
  Provider,
  ReasoningPreferences,
  ReasoningSource,
} from "./types";

export const sourceName = (source: ReasoningSource) =>
  source === "chatgpt" ? "ChatGPT" : "Claude";
export function supportsSource(provider: Provider, source: ReasoningSource) {
  return (
    !!provider.supportsEncryptedReasoning &&
    provider.protocol === (source === "chatgpt" ? "responses" : "anthropic")
  );
}
export function usesSource(
  provider: Provider,
  preferences: ReasoningPreferences = {},
  source: ReasoningSource,
) {
  return supportsSource(provider, source) && preferences[source] !== false;
}
export function hasCiphertext(block: EncryptedReasoning) {
  const p = block.payload;
  return !!(p.type === "reasoning"
    ? p.encrypted_content
    : p.type === "thinking"
      ? p.signature
      : p.data);
}
export function isReplayable(block: EncryptedReasoning) {
  return block.complete && hasCiphertext(block);
}
export function summaryText(block: EncryptedReasoning) {
  const p = block.payload;
  return p.type === "reasoning"
    ? p.summary.map((s) => s.text).join("\n\n")
    : p.type === "thinking"
      ? (p.thinking ?? "")
      : "";
}
export function hasMessageContent(message: Message) {
  return !!(
    message.content.trim() ||
    message.images.length ||
    message.reasoning?.trim() ||
    message.encryptedReasoning?.some(
      (b) => hasCiphertext(b) || summaryText(b).trim(),
    )
  );
}
export function canUseAsContext(message: Message) {
  return message.role !== "assistant" || !!message.content.trim();
}
export function availableSources(messages: Message[]): ReasoningSource[] {
  return (["chatgpt", "claude"] as const).filter((source) =>
    messages.some(
      (m) =>
        canUseAsContext(m) &&
        m.encryptedReasoning?.some(
          (b) => b.source === source && isReplayable(b),
        ),
    ),
  );
}
