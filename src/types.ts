export type Effort = "none" | "low" | "high" | "max";
export type Role = "system" | "user" | "assistant";
export interface Attachment {
  id: string;
  name: string;
  url: string;
}
export interface Message {
  id: string;
  parent: string | null;
  role: Role;
  content: string;
  images: Attachment[];
  side?: string;
  reasoning?: string;
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
  id: string;
  name: string;
  baseUrl: string;
  key: string;
  model: string;
  remember: boolean;
}
export interface Settings {
  id: string;
  providers: Provider[];
  selected: string;
  thinking?: boolean; // Legacy local settings
  effort?: Effort;
}
