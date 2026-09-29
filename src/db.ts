import Dexie, { type EntityTable } from "dexie";
import type { Conversation, Settings } from "./types";
export const db = new Dexie("threadline") as Dexie & {
  conversations: EntityTable<Conversation, "id">;
  settings: EntityTable<Settings, "id">;
};
db.version(1).stores({ conversations: "id, updated", settings: "id" });
export const defaultSettings: Settings = {
  id: "settings",
  providers: [
    {
      id: "deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      key: "",
      model: "deepseek-flash",
      remember: true,
    },
  ],
  selected: "deepseek",
  effort: "none",
};
