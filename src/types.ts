export type Effort = string;
export type Protocol = "chat-completions" | "responses" | "anthropic";
export type ReasoningSource = "chatgpt" | "claude";
export type ReasoningPreferences = Partial<Record<ReasoningSource, boolean>>;
export interface BudgetSettings {
  template: string;
  levels: string;
  selected: string; // Empty means unspecified; fixed templates use FIXED_EFFORT.
}
export type ReasoningPayload =
  | {
      type: "reasoning";
      id?: string;
      summary: { type: "summary_text"; text: string }[];
      encrypted_content?: string;
    }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };
export interface EncryptedReasoning {
  source: ReasoningSource;
  index: number;
  contentOffset: number;
  complete: boolean;
  payload: ReasoningPayload;
}
export type Role = "system" | "user" | "assistant";
export interface Attachment {
  id: string;
  name: string;
  url: string;
}
export interface Message {
  parameters?: { name: string; value: string }[];
  requestParameters?: Record<string, unknown>;
  id: string;
  parent: string | null;
  role: Role;
  content: string;
  images: Attachment[];
  side?: string;
  reasoning?: string;
  encryptedReasoning?: EncryptedReasoning[];
  model?: string;
  effort?: Effort;
  created?: number;
  edited?: boolean;
  status?: "streaming" | "done" | "stopped" | "error";
  error?: string;
}
export interface Question {
  titleMode?: "auto" | "manual";
  title?: string;
  id: string;
  owner: string;
  start: number;
  end: number;
  quote: string;
  draft: string;
  images: Attachment[];
}
export interface Conversation {
  parameterSelections?: Record<string, ParameterState>;
  reasoningPreferences?: ReasoningPreferences;
  titleMode?: "auto" | "manual";
  id: string;
  title: string;
  pinned: boolean;
  created: number;
  updated: number;
  root: string;
  nodes: Record<string, Message>;
  questions: Question[];
  choices: Record<string, string>;
  tabs: Record<string, string>;
  current: string;
  draft: string;
  images: Attachment[];
}
export interface Provider {
  parameterRevision?: number;
  models?: ModelConfig[];
  template?: ModelTemplate;
  customParameters?: string;
  parameterState?: ParameterState;
  id: string;
  name: string;
  baseUrl: string;
  key: string;
  model: string;
  remember: boolean;
  protocol?: Protocol;
  supportsEncryptedReasoning?: boolean;
}
export interface Settings {
  naming?: { model: string; state: ParameterState };
  id: string;
  providers: Provider[];
  selected: string;
}
export type ParameterState = Record<
  string,
  { enabled: boolean; value: string | number; invalid?: boolean }
>;
export interface ModelConfig {
  id: string;
  model: string;
  customParameters: string;
  supportsEncryptedReasoning: boolean;
}
export interface ModelTemplate {
  customParameters: string;
  chatgpt: "keep" | "yes" | "no";
  claude: "keep" | "yes" | "no";
}
