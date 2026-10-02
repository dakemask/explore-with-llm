import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Check,
  UserRound,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Pencil,
  Pin,
  CirclePlus,
  Languages,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Bot,
  Trash2,
  X,
} from "lucide-react";
import type { Conversation, Message, Settings } from "./types";
import {
  ancestors,
  append,
  applyEdit,
  children,
  createConversation,
  descendants,
  navigate,
  path,
  removeNode,
  removeQuestion,
  uid,
} from "./model";
import { db, defaultSettings } from "./db";
import logo from "../icon.png";
import { nameConversation } from "./naming";
import { streamAnswer } from "./api";
import Markdown from "./Markdown";
import Reasoning from "./Reasoning";
import EncryptedReasoningView, {
  ReasoningControls,
} from "./EncryptedReasoningView";
import { canUseAsContext, hasMessageContent } from "./encryptedReasoning";
import { effortLabel } from "./budget";
import {
  blankProvider,
  normalizeSettings,
  resolveModel,
  reconcileState,
} from "./config";
import { parameterRequest } from "./parameters";
import NamingSettings from "./NamingSettings";
import { useScrollAnchor } from "./useScrollAnchor";
import { useBranchTransition } from "./useBranchTransition";
import Composer, { Attachments } from "./Composer";
const Editor = lazy(() => import("./Editor"));
import SettingsDialog from "./SettingsDialog";
const Tree = lazy(() => import("./Tree"));
import { Modal } from "./Modal";
import { selectedSource } from "./selection";
import ModelPicker from "./ModelPicker";
import { useSidebarResize } from "./useSidebarResize";
export default function App() {
  const [draft, setDraft] = useState(createConversation),
    draftRef = useRef(draft);
  const [tabMenu, setTabMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [naming, setNaming] = useState<Record<string, boolean>>({});
  const nameVersions = useRef(new Map<string, symbol>());
  const [renameQuestion, setRenameQuestion] = useState(false);
  const [all, setAll] = useState<Conversation[]>([]),
    allRef = useRef(all),
    [active, setActive] = useState(""),
    [ready, setReady] = useState(false);
  const scrollAnchor = useScrollAnchor(active);
  const transitionBranch = useBranchTransition(active);
  const [settings, setSettings] = useState<Settings>(() =>
      normalizeSettings(defaultSettings),
    ),
    settingsRef = useRef(settings);
  const [showSettings, setShowSettings] = useState(false),
    [showBudget, setShowBudget] = useState(false),
    [tree, setTree] = useState(false),
    [left, setLeft] = useState(true),
    [right, setRight] = useState(false),
    [search, setSearch] = useState("");
  const [parameterDetails, setParameterDetails] = useState<Message | null>(
    null,
  );
  const sidebarResize = useSidebarResize(left, right);
  const [editing, setEditing] = useState<string | null>(null),
    [renaming, setRenaming] = useState<string | null>(null),
    [renameValue, setRenameValue] = useState("");
  const [confirm, setConfirm] = useState<{
      title: string;
      count: number;
      action: () => void;
    } | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [storageError, setStorageError] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({}),
    controllers = useRef(new Map<string, AbortController>()),
    writes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [selection, setSelection] = useState<{
      owner: string;
      start: number;
      end: number;
      quote: string;
      x: number;
      y: number;
    } | null>(null),
    [highlightMenu, setHighlightMenu] = useState<{
      ids: string[];
      x: number;
      y: number;
    } | null>(null);
  const [copied, setCopied] = useState("");
  const mainEnd = useRef<HTMLDivElement>(null),
    sideEnd = useRef<HTMLDivElement>(null),
    followMain = useRef(true),
    followSide = useRef(true);
  function store(c: Conversation, immediate = false) {
    const old = writes.current.get(c.id);
    if (old) clearTimeout(old);
    const save = () => {
      writes.current.delete(c.id);
      void db.conversations
        .put(c)
        .catch(() => setStorageError("本地保存失败，请检查浏览器存储空间"));
    };
    if (immediate) save();
    else writes.current.set(c.id, setTimeout(save, 150));
  }
  function commit(
    id: string,
    fn: (c: Conversation) => void,
    immediate = false,
  ): Conversation | undefined {
    const current =
      allRef.current.find((c) => c.id === id) ??
      (draftRef.current.id === id ? draftRef.current : undefined);
    if (!current) return;
    const next = structuredClone(current);
    fn(next);
    publish(next, immediate);
    return next;
  }
  function publish(next: Conversation, immediate = false) {
    const id = next.id;
    next.updated = Date.now();
    if (!allRef.current.some((c) => c.id === id)) {
      draftRef.current = next;
      setDraft(next);
      return;
    }
    const list = allRef.current.map((c) => (c.id === id ? next : c));
    allRef.current = list;
    setAll(list);
    store(next, immediate);
  }
  // Draft edits must not copy the message tree, images, or model metadata.
  function updateDraft(
    text: string,
    images: Conversation["images"],
    sideId?: string,
  ) {
    const current =
      allRef.current.find((item) => item.id === c.id) ?? draftRef.current;
    const next = sideId
      ? {
          ...current,
          questions: current.questions.map((question) =>
            question.id === sideId
              ? { ...question, draft: text, images }
              : question,
          ),
        }
      : { ...current, draft: text, images };
    publish(next);
  }
  function saveSettings(value: Settings) {
    const previous = settingsRef.current;
    const changed =
      JSON.stringify(previous.providers) !== JSON.stringify(value.providers);
    if (changed) {
      for (const conversation of [
        ...allRef.current,
        ...(allRef.current.some((c) => c.id === draftRef.current.id)
          ? []
          : [draftRef.current]),
      ]) {
        if (!conversation.parameterSelections) continue;
        const selections = structuredClone(conversation.parameterSelections);
        for (const id of Object.keys(selections)) {
          const next = resolveModel(value, id);
          const old = resolveModel(previous, id);
          if (!next) delete selections[id];
          else if (
            old?.customParameters !== next.customParameters ||
            old?.protocol !== next.protocol ||
            old?.parameterRevision !== next.parameterRevision
          )
            selections[id] = reconcileState(old, next, selections[id]);
        }
        if (
          JSON.stringify(selections) !==
          JSON.stringify(conversation.parameterSelections)
        )
          commit(
            conversation.id,
            (d) => {
              d.parameterSelections = selections;
            },
            true,
          );
      }
      if (value.naming) {
        const next = resolveModel(value, value.naming.model);
        value = {
          ...value,
          naming: next
            ? {
                ...value.naming,
                state: reconcileState(
                  resolveModel(previous, value.naming.model),
                  next,
                  value.naming.state,
                ),
              }
            : undefined,
        };
      }
    }
    settingsRef.current = value;
    setSettings(value);
    void db.settings
      .put({
        ...value,
        providers: value.providers.map((p) => ({
          ...p,
          key: p.remember ? p.key : "",
        })),
      })
      .catch(() => setStorageError("设置保存失败"));
  }
  useEffect(() => {
    let live = true;
    void Promise.all([db.conversations.toArray(), db.settings.get("settings")])
      .then(async ([conversations, s]) => {
        if (!live) return;
        for (const c of conversations) {
          for (const n of Object.values(c.nodes))
            if (n.status === "streaming") {
              if (hasMessageContent(n)) {
                n.status = "stopped";
              } else removeNode(c, n.id);
            }
          await db.conversations.put(c);
        }
        if (!live) return;
        allRef.current = conversations;
        setAll(conversations);
        setActive(
          conversations.sort((a, b) => b.updated - a.updated)[0]?.id ?? "",
        );
        if (s) {
          const migrated = normalizeSettings(s);
          settingsRef.current = migrated;
          setSettings(migrated);
          await db.settings.put({
            ...migrated,
            providers: migrated.providers.map((p) => ({
              ...p,
              key: p.remember ? p.key : "",
            })),
          });
        }
        setReady(true);
      })
      .catch(() => {
        setStorageError("无法打开浏览器本地数据库");
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const flush = () => {
      for (const id of writes.current.keys()) {
        const c = allRef.current.find((c) => c.id === id);
        if (c) store(c, true);
      }
    };
    window.addEventListener("pagehide", flush);
    const visibility = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    setSelection(null);
    setHighlightMenu(null);
    setEditing(null);
  }, [active]);
  useEffect(() => {
    const clearSelection = () => setSelection(null);
    const change = () => {
      if (window.getSelection()?.isCollapsed) clearSelection();
    };
    const pointer = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!target.closest(".selection-popover")) clearSelection();
      if (!target.closest(".tab-context-menu")) setTabMenu(null);
      if (!target.closest(".highlight-menu")) setHighlightMenu(null);
    };
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
        setTabMenu(null);
        setHighlightMenu(null);
      }
    };
    document.addEventListener("selectionchange", change);
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("scroll", clearSelection, true);
    window.addEventListener("resize", clearSelection);
    window.addEventListener("blur", clearSelection);
    return () => {
      document.removeEventListener("selectionchange", change);
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("scroll", clearSelection, true);
      window.removeEventListener("resize", clearSelection);
      window.removeEventListener("blur", clearSelection);
    };
  }, []);
  const c = all.find((c) => c.id === active) ?? draft,
    main = c ? path(c) : [],
    current = c?.nodes[c.current],
    questions = c?.questions.filter((q) => q.owner === c.current) ?? [],
    q = questions.find((q) => q.id === c?.tabs[c.current]) ?? questions[0],
    side = c && q ? path(c, q.id) : [];
  useEffect(() => {
    if (
      main.at(-1)?.status === "streaming" &&
      followMain.current &&
      !scrollAnchor.isAnchoring()
    )
      mainEnd.current?.scrollIntoView({ block: "end" });
  }, [main.at(-1)?.content, main.at(-1)?.reasoning]);
  useEffect(() => {
    if (
      side.at(-1)?.status === "streaming" &&
      followSide.current &&
      !scrollAnchor.isAnchoring()
    )
      sideEnd.current?.scrollIntoView({ block: "end" });
  }, [side.at(-1)?.content, side.at(-1)?.reasoning]);
  useEffect(() => {
    if (right && q) {
      const scroller = sideEnd.current?.closest(".side-scroll");
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const animation = scroller.animate(
            [
              { opacity: 0.4, transform: "translateX(6px)" },
              { opacity: 1, transform: "translateX(0)" },
            ],
            { duration: 160, easing: "cubic-bezier(.22,.7,.25,1)" },
          );
          return () => animation.cancel();
        }
      }
    }
  }, [right, q?.id]);
  const provider =
    resolveModel(
      settings,
      settings.selected,
      c.parameterSelections?.[settings.selected],
    ) ?? blankProvider;
  const mainHistory = ancestors(c, main.at(-1)?.id ?? c.root);
  const sideHistory = q ? ancestors(c, side.at(-1)?.id ?? q.owner) : [];
  function reasoningControls(history: Message[], busy: boolean) {
    return (
      <ReasoningControls
        history={history}
        provider={provider}
        preferences={c.reasoningPreferences}
        busy={busy}
        onChange={(source, enabled) =>
          commit(c.id, (d) => {
            d.reasoningPreferences = {
              ...d.reasoningPreferences,
              [source]: enabled,
            };
          })
        }
      />
    );
  }
  function newChat() {
    const next = createConversation();
    draftRef.current = next;
    setDraft(next);
    setActive("");
    setSearch("");
    setTree(false);
  }

  function key(cid: string, side?: string) {
    return `${cid}:${side ?? "main"}`;
  }
  function stop(cid: string, side?: string) {
    controllers.current.get(key(cid, side))?.abort();
  }
  function report(cid: string, side: string | undefined, error: string) {
    setErrors((e) => ({ ...e, [key(cid, side)]: error }));
  }
  async function autoName(
    cid: string,
    assistantId: string,
    sideId: string | undefined,
    _provider: Settings["providers"][number],
  ) {
    const namingConfig = settingsRef.current.naming;
    const namingProvider =
      namingConfig &&
      resolveModel(settingsRef.current, namingConfig.model, namingConfig.state);
    if (!namingProvider) return;
    const current = allRef.current.find((c) => c.id === cid);
    if (!current?.nodes[assistantId]?.content) return;
    const target = sideId
      ? current.questions.find((q) => q.id === sideId)
      : current;
    if (
      !target ||
      target.titleMode === "manual" ||
      (!sideId && target.titleMode === "auto")
    )
      return;
    const history = ancestors(current, assistantId).filter(
      (n) => n.role !== "system",
    );
    const messages = sideId ? history.slice(-5) : history.slice(0, 2);
    const lane = key(cid, sideId),
      version = Symbol();
    nameVersions.current.set(lane, version);
    setNaming((v) => ({ ...v, [lane]: true }));
    try {
      const title = await nameConversation(messages, namingProvider);
      if (nameVersions.current.get(lane) !== version) return;
      commit(
        cid,
        (c) => {
          if (!c.nodes[assistantId]) return;
          const target = sideId ? c.questions.find((q) => q.id === sideId) : c;
          if (target && target.titleMode !== "manual") {
            target.title = title;
            target.titleMode = "auto";
          }
        },
        true,
      );
    } catch {
      /* Keep the existing title if naming is unavailable. */
    } finally {
      if (nameVersions.current.get(lane) === version)
        setNaming((v) => ({ ...v, [lane]: false }));
    }
  }
  function titlePending(item: Conversation, sideId?: string) {
    const target = sideId ? item.questions.find((q) => q.id === sideId) : item;
    return (
      target?.titleMode !== "manual" &&
      (!!naming[key(item.id, sideId)] ||
        (!!busy[key(item.id, sideId)] &&
          (!!sideId || target?.titleMode !== "auto")))
    );
  }
  function dots() {
    return (
      <span className="title-dots" role="status" aria-label="正在生成标题">
        <i />
        <i />
        <i />
      </span>
    );
  }
  async function generate(
    cid: string,
    userId: string,
    sideId?: string,
    retryId?: string,
    restoreDraft = false,
  ) {
    const lane = key(cid, sideId);
    if (controllers.current.has(lane)) return;
    const config = structuredClone(settingsRef.current),
      currentConversation = allRef.current.find((item) => item.id === cid),
      p =
        resolveModel(
          config,
          config.selected,
          currentConversation?.parameterSelections?.[config.selected],
        ) ?? blankProvider;
    if (!p.model) {
      setShowSettings(true);
      return;
    }
    if (!p.key.trim()) {
      report(cid, sideId, "请先填写 API Key");
      setShowSettings(true);
      return;
    }
    nameVersions.current.set(lane, Symbol());
    setNaming((v) => ({ ...v, [lane]: false }));
    const controller = new AbortController();
    controllers.current.set(lane, controller);
    setBusy((v) => ({ ...v, [lane]: true }));
    report(cid, sideId, "");
    let assistantId = "",
      backup: Message | undefined;
    try {
      const before = allRef.current.find((c) => c.id === cid);
      if (!before?.nodes[userId]) return;
      const snapshot = structuredClone(ancestors(before, userId));
      const next = commit(
        cid,
        (c) => {
          if (retryId && c.nodes[retryId]) {
            backup = structuredClone(c.nodes[retryId]);
            const n = c.nodes[retryId];
            n.content = "";
            n.reasoning = "";
            n.encryptedReasoning = [];
            n.status = "streaming";
            n.error = undefined;
            n.edited = false;
            n.model = p.model;
            n.parameters = parameterRequest(
              p.customParameters ?? "",
              p.parameterState,
            ).summary;
            n.requestParameters = parameterRequest(
              p.customParameters ?? "",
              p.parameterState,
            ).body;
            n.effort = undefined;
            n.created = Date.now();
            assistantId = n.id;
          } else {
            const n = append(c, userId, "assistant", "", sideId);
            n.status = "streaming";
            n.model = p.model;
            n.parameters = parameterRequest(
              p.customParameters ?? "",
              p.parameterState,
            ).summary;
            n.requestParameters = parameterRequest(
              p.customParameters ?? "",
              p.parameterState,
            ).body;
            n.effort = undefined;
            n.created = Date.now();
            assistantId = n.id;
          }
        },
        true,
      );
      if (!next) return;
      await streamAnswer(
        snapshot,
        p,
        controller.signal,
        (content, reasoning, encrypted) => {
          commit(cid, (c) => {
            const n = c.nodes[assistantId];
            if (n) {
              n.content += content;
              n.reasoning = (n.reasoning ?? "") + reasoning;
              if (encrypted) n.encryptedReasoning = encrypted;
            }
          });
        },
        before.reasoningPreferences,
      );
      commit(
        cid,
        (c) => {
          const n = c.nodes[assistantId];
          if (n) n.status = "done";
        },
        true,
      );
    } catch (error) {
      const aborted = controller.signal.aborted;
      const message =
        error instanceof TypeError
          ? "无法连接提供商，请检查地址、网络或跨域设置"
          : (error as Error).message;
      if (!aborted) report(cid, sideId, message);
      commit(
        cid,
        (c) => {
          const n = c.nodes[assistantId];
          if (!n) return;
          if (!hasMessageContent(n)) {
            if (backup) c.nodes[assistantId] = backup;
            else removeNode(c, assistantId);
            if (
              restoreDraft &&
              !aborted &&
              /context|上下文|48 MiB/i.test(message)
            ) {
              const user = c.nodes[userId];
              if (
                user &&
                !Object.values(c.nodes).some((child) => child.parent === userId)
              ) {
                const draft = { text: user.content, images: user.images };
                removeNode(c, userId);
                const question =
                  sideId && c.questions.find((q) => q.id === sideId);
                if (question) {
                  question.draft = draft.text;
                  question.images = draft.images;
                } else if (!sideId) {
                  c.draft = draft.text;
                  c.images = draft.images;
                }
              }
            }
          } else {
            n.status = aborted ? "stopped" : "error";
            n.error = aborted ? undefined : message;
          }
        },
        true,
      );
    } finally {
      const latest = allRef.current.find((c) => c.id === cid);
      if (
        latest?.nodes[assistantId] &&
        !hasMessageContent(latest.nodes[assistantId]) &&
        latest.nodes[assistantId].status === "done"
      )
        commit(
          cid,
          (c) => {
            if (backup) c.nodes[assistantId] = backup;
            else removeNode(c, assistantId);
          },
          true,
        );
      void autoName(cid, assistantId, sideId, p);
      controllers.current.delete(lane);
      setBusy((v) => ({ ...v, [lane]: false }));
    }
  }
  function send(sideId?: string) {
    if (!c) return;
    const s = sideId ? c.questions.find((q) => q.id === sideId) : undefined;
    const content = s ? s.draft : c.draft,
      images = s ? s.images : c.images;
    if (!content.trim() && !images.length) return;
    if (!provider.model || !provider.key.trim()) {
      setShowSettings(true);
      return;
    }
    try {
      parameterRequest(
        provider.customParameters ?? "",
        provider.parameterState,
      );
    } catch (e) {
      report(c.id, sideId, (e as Error).message);
      return;
    }
    if (!allRef.current.some((item) => item.id === c.id)) {
      allRef.current = [c, ...allRef.current];
      setAll(allRef.current);
      setActive(c.id);
    }
    const currentPath = path(c, sideId),
      parent = currentPath.at(-1)?.id ?? s?.owner ?? c.root;
    if (c.nodes[parent]?.role === "user" || !canUseAsContext(c.nodes[parent]))
      return;
    let id = "";
    commit(
      c.id,
      (d) => {
        const n = append(d, parent, "user", content, sideId);
        n.images = images;
        id = n.id;
        if (s) {
          const target = d.questions.find((q) => q.id === s.id)!;
          target.draft = "";
          target.images = [];
        } else {
          d.draft = "";
          d.images = [];
          if (d.title === "新的对话")
            d.title = content.trim().slice(0, 30) || "图片对话";
        }
      },
      true,
    );
    void generate(c.id, id, sideId, undefined, true);
    setTimeout(() => {
      (sideId ? sideEnd : mainEnd).current?.scrollIntoView({
        behavior: "smooth",
      });
    }, 80);
  }
  function switchBranch(button: HTMLButtonElement, id: string) {
    const label = button.getAttribute("aria-label");
    followMain.current = false;
    transitionBranch(
      button.closest<HTMLElement>(".message")!,
      id,
      () => {
        scrollAnchor.capture(
          button,
          () =>
            document
              .getElementById(`message-${id}`)
              ?.querySelector<HTMLButtonElement>(
                `button[aria-label="${label}"]`,
              ) ?? null,
        );
        commit(c.id, (d) => navigate(d, id));
        setSelection(null);
      },
      label === "上一个分支" ? -1 : 1,
    );
  }

  function jump(id: string, question = false) {
    if (!c) return;
    if (question) {
      const target = c.questions.find((q) => q.id === id);
      if (!target) return;
      commit(c.id, (d) => {
        navigate(d, target.owner);
        d.tabs[target.owner] = id;
      });
      setRight(true);
      id = path(c, target.id)[0]?.id ?? target.owner;
    } else {
      const n = c.nodes[id];
      if (!n) return;
      commit(c.id, (d) => navigate(d, id));
      if (n.side) setRight(true);
    }
    setTree(false);
    setSelection(null);

    setTimeout(
      () =>
        document
          .getElementById(`message-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      100,
    );
  }
  function deletion(id: string, isQuestion = false) {
    if (!c) return;
    const cid = c.id;
    if (isQuestion) {
      const count = Object.values(c.nodes).filter((n) => n.side === id).length;
      setConfirm({
        title: "删除侧边提问？",
        count,
        action: () => {
          stop(cid, id);
          commit(cid, (d) => removeQuestion(d, id), true);
        },
      });
    } else {
      const ids = descendants(c, id),
        count =
          ids.size - 1 + c.questions.filter((q) => ids.has(q.owner)).length;
      setConfirm({
        title: "删除消息？",
        count,
        action: () => {
          for (const n of Object.values(c.nodes))
            if (ids.has(n.id) && n.status === "streaming") stop(cid, n.side);
          commit(cid, (d) => removeNode(d, id), true);
        },
      });
    }
  }
  function selectMessage(id: string) {
    if (!c) return;
    commit(c.id, (d) => {
      d.current = id;
    });
    setHighlightMenu(null);
  }
  function questionFromSelection() {
    if (!c || !selection) return;
    const s = selection;
    commit(
      c.id,
      (d) => {
        if (!d.nodes[s.owner] || d.nodes[s.owner].status === "streaming")
          return;
        const id = uid();
        d.questions.push({
          id,
          owner: s.owner,
          start: s.start,
          end: s.end,
          quote: s.quote,
          draft:
            s.quote
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n") + "\n\n",
          images: [],
        });
        d.current = s.owner;
        d.tabs[s.owner] = id;
      },
      true,
    );
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setRight(true);
  }
  function renderMessage(n: Message, inherited = false) {
    if (!c) return null;
    const sibling = n.parent && !n.side ? children(c, n.parent) : [],
      index = Array.isArray(sibling)
        ? sibling.findIndex((s) => s.id === n.id)
        : 0;
    const isBusy = n.status === "streaming",
      isLast = (n.side ? side : main).at(-1)?.id === n.id,
      localQuestions = c.questions.filter((q) => q.owner === n.id),
      laneBusy = busy[key(c.id, n.side)];
    return (
      <article
        key={n.id}
        id={inherited ? undefined : `message-${n.id}`}
        title={inherited ? "历史消息（只读）" : undefined}
        className={`message ${n.role} ${!inherited && c.current === n.id ? "focused" : ""} ${inherited ? "inherited" : ""}`}
        onClick={() => {
          if (!inherited && !n.side && c.current !== n.id) selectMessage(n.id);
        }}
      >
        <div className="message-heading">
          <span className={`avatar ${n.role}`}>
            {n.role === "assistant" ? (
              <Bot size={17} />
            ) : n.role === "system" ? (
              <SlidersHorizontal size={14} />
            ) : (
              <UserRound size={16} />
            )}
          </span>
          {n.role === "system" && <strong>系统</strong>}
          {n.status === "stopped" && <span className="status">已停止</span>}
        </div>
        {n.reasoning && (
          <Reasoning
            text={n.reasoning}
            thinking={isBusy && !n.content}
            onBeforeToggle={scrollAnchor.capture}
          />
        )}
        <EncryptedReasoningView
          message={n}
          provider={provider}
          preferences={c.reasoningPreferences}
          included={(inherited || n.side ? sideHistory : mainHistory).some(
            (m) => m.id === n.id,
          )}
          onBeforeToggle={scrollAnchor.capture}
        />
        {n.role === "assistant" &&
          !n.content.trim() &&
          !isBusy &&
          hasMessageContent(n) && (
            <p className="muted">没有正文，请重新生成后继续对话。</p>
          )}
        <Attachments images={n.images} />
        <div
          className="markdown"
          onMouseUp={(e) => {
            if (n.role !== "assistant" || n.side || inherited || isBusy) return;
            const selected = selectedSource(e.currentTarget);
            if (selected)
              setSelection({
                owner: n.id,
                ...selected,
                x: Math.min(selected.rect.left, window.innerWidth - 190),
                y: Math.max(10, selected.rect.top - 44),
              });
            else setSelection(null);
          }}
          onClick={(e) => {
            if (inherited) return;
            const el = (e.target as Element).closest("[data-questions]");
            if (el && window.getSelection()?.isCollapsed) {
              const ids = el.getAttribute("data-questions")!.split(",");
              if (ids.length === 1) {
                commit(c.id, (d) => {
                  d.current = n.id;
                  d.tabs[n.id] = ids[0];
                });
                setRight(true);
              } else
                setHighlightMenu({
                  ids,
                  x: Math.min(e.clientX, window.innerWidth - 250),
                  y: Math.min(e.clientY, window.innerHeight - 180),
                });
            }
          }}
        >
          <Markdown
            text={n.content}
            questions={inherited ? [] : localQuestions}
          />
          {isBusy && <span className="stream-cursor" />}
        </div>
        <div className="message-meta">
          {n.created && (
            <time dateTime={new Date(n.created).toISOString()}>
              {new Date(n.created).toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
          {n.model && (
            <span>
              {n.model}
              {n.effort !== undefined ? ` · ${effortLabel(n.effort)}` : ""}
              {n.parameters !== undefined && (
                <button
                  className="message-parameters"
                  onClick={() => setParameterDetails(n)}
                >
                  参数
                </button>
              )}
            </span>
          )}
        </div>
        {n.error && <div className="inline-error">{n.error}</div>}
        {!inherited && (
          <div className="message-tools">
            <button
              className="icon"
              title="复制消息"
              aria-label="复制消息"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await navigator.clipboard.writeText(n.content);
                  setCopied(n.id);
                  setTimeout(() => setCopied(""), 1600);
                } catch {
                  report(c.id, n.side, "复制失败，请手动选中文字");
                }
              }}
            >
              {copied === n.id ? <Check size={15} /> : <Copy size={15} />}
            </button>
            <button
              className="icon"
              title="编辑消息"
              aria-label="编辑消息"
              disabled={isBusy}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(n.id);
              }}
            >
              <Pencil size={15} />
            </button>
            {n.role === "assistant" && (!n.side || isLast) && (
              <button
                className="icon"
                title="重新生成"
                aria-label="重新生成"
                disabled={laneBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  void generate(
                    c.id,
                    n.parent!,
                    n.side,
                    n.side ? n.id : undefined,
                  );
                }}
              >
                <RotateCcw size={15} />
              </button>
            )}
            {n.role !== "system" && (
              <button
                className="icon"
                title="删除消息"
                aria-label="删除消息"
                onClick={(e) => {
                  e.stopPropagation();
                  deletion(n.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
            {n.role === "assistant" && !n.side && (
              <button
                className={`question-count ${localQuestions.length ? "has-questions" : ""}`}
                title="侧边提问"
                onClick={(e) => {
                  e.stopPropagation();
                  selectMessage(n.id);
                  setRight(true);
                }}
              >
                <MessageSquare size={15} />
                {localQuestions.length || ""}
              </button>
            )}
            {Array.isArray(sibling) && sibling.length > 1 && (
              <span className="branch-switch">
                <button
                  aria-label="上一个分支"
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    switchBranch(e.currentTarget, sibling[index - 1].id);
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  {index + 1} / {sibling.length}
                </span>
                <button
                  aria-label="下一个分支"
                  disabled={index === sibling.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    switchBranch(e.currentTarget, sibling[index + 1].id);
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </span>
            )}
          </div>
        )}
      </article>
    );
  }
  function errorBanner(sideId?: string) {
    if (!c) return null;
    const message = errors[key(c.id, sideId)];
    return message ? (
      <div className="lane-error" role="alert">
        {message}
        <button
          className="icon"
          aria-label="关闭错误"
          onClick={() => report(c.id, sideId, "")}
        >
          <X size={14} />
        </button>
      </div>
    ) : null;
  }
  if (!ready)
    return (
      <div className="loading">
        <Sparkles size={28} />
        正在打开工作区…
      </div>
    );
  if (!c)
    return (
      <div className="loading">
        {storageError || "没有对话"}
        <button onClick={newChat}>新建对话</button>
      </div>
    );
  const mainBusy = !!busy[key(c.id)],
    sideBusy = !!busy[key(c.id, q?.id)],
    pendingMain =
      main.at(-1)?.role === "user" ||
      (!!main.at(-1) && !canUseAsContext(main.at(-1)!)),
    pendingSide =
      side.at(-1)?.role === "user" ||
      (!!(side.at(-1) ?? (q && c.nodes[q.owner])) &&
        !canUseAsContext((side.at(-1) ?? c.nodes[q!.owner])!));
  return (
    <div
      className={`app ${!left ? "left-hidden" : ""} ${right ? "right-open" : ""} ${sidebarResize.dragging ? "resizing" : ""}`}
      style={sidebarResize.style}
    >
      {sidebarResize.handles}
      <aside className="conversation-sidebar" inert={!left} aria-hidden={!left}>
        <div className="brand">
          <img
            className="brand-logo"
            src={logo}
            alt=""
            width="26"
            height="26"
          />
          <b>Explore with LLM</b>
          <button
            className="icon"
            aria-label="收起对话列表"
            onClick={() => setLeft(false)}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <button className="new-chat" onClick={newChat}>
          <CirclePlus size={18} />
          创建新对话
        </button>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="搜索对话"
            placeholder="搜索对话"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="section-label">
          你的对话 <span>{all.length}</span>
        </div>
        <div className="conversation-list">
          {[...all]
            .filter((item) =>
              (
                item.title +
                " " +
                Object.values(item.nodes)
                  .map((n) => n.content)
                  .join(" ")
              )
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .sort(
              (a, b) =>
                Number(b.pinned) - Number(a.pinned) || b.updated - a.updated,
            )
            .map((item) => (
              <div
                className={`conversation-item ${active === item.id ? "active" : ""}`}
                key={item.id}
              >
                <button
                  className="conversation-title"
                  onClick={() => setActive(item.id)}
                >
                  {item.pinned ? (
                    <Pin size={14} />
                  ) : (
                    <MessageSquare size={15} />
                  )}
                  <span>{titlePending(item) ? dots() : item.title}</span>
                </button>
                <div className="conversation-actions">
                  <button
                    title={item.pinned ? "取消置顶" : "置顶"}
                    onClick={() =>
                      commit(item.id, (d) => {
                        d.pinned = !d.pinned;
                      })
                    }
                  >
                    <Pin size={16} />
                  </button>
                  <button
                    title="重命名"
                    onClick={() => {
                      setRenameQuestion(false);
                      setRenaming(item.id);
                      setRenameValue(item.title);
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    title="删除对话"
                    onClick={() =>
                      setConfirm({
                        title: `删除“${item.title}”？`,
                        count: 0,
                        action: () => {
                          for (const [lane, controller] of controllers.current)
                            if (lane.startsWith(item.id + ":"))
                              controller.abort();
                          const timer = writes.current.get(item.id);
                          if (timer) clearTimeout(timer);
                          writes.current.delete(item.id);
                          allRef.current = allRef.current.filter(
                            (c) => c.id !== item.id,
                          );
                          setAll(allRef.current);
                          void db.conversations
                            .delete(item.id)
                            .catch(() => setStorageError("删除保存失败"));
                          if (active === item.id) {
                            if (allRef.current.length)
                              setActive(allRef.current[0].id);
                            else newChat();
                          }
                        },
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
        </div>
        <div className="sidebar-bottom">
          <details className="language-menu">
            <summary>
              <Languages size={18} />
              Language
            </summary>
            <div>
              <button
                onClick={(e) =>
                  e.currentTarget.closest("details")?.removeAttribute("open")
                }
              >
                <Check size={16} />
                简体中文
              </button>
            </div>
          </details>
          <button onClick={() => setShowSettings(true)}>
            <Settings2 size={18} />
            模型提供商
            <ChevronRight size={15} />
          </button>
          <button onClick={() => setShowBudget(true)}>
            <Bot size={18} />
            命名模型设置
            <ChevronRight size={15} />
          </button>
          <div className="local-note">
            <span className="local-dot" />
            本地工作区<span>v1.0</span>
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          {!left && (
            <button
              className="icon"
              aria-label="展开对话列表"
              onClick={() => setLeft(true)}
            >
              <PanelLeftOpen size={19} />
            </button>
          )}
          <h1 className="chat-title">
            {titlePending(c) ? dots() : active ? c.title : "Explore with LLM"}
          </h1>
          <span className="flex" />
          <button className="header-button" onClick={() => setTree(true)}>
            <GitBranch size={17} />
            对话脉络
          </button>
          <span className="divider" />
          <button
            className={`icon ${right ? "active" : ""}`}
            aria-label="切换侧边提问栏"
            title="侧边提问"
            onClick={() => setRight(!right)}
          >
            <PanelRight size={20} />
          </button>
        </header>
        <div
          className="main-scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            scrollAnchor.onScroll(el);
            followMain.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
        >
          <div className="chat-width">
            {!main.length ? (
              <div className="welcome">
                <img
                  className="welcome-logo"
                  src={logo}
                  alt="Explore with LLM"
                  width="72"
                  height="72"
                />
                <h1>今天我能提供什么帮助？</h1>
              </div>
            ) : (
              <>
                {renderMessage(c.nodes[c.root])}
                {main.map((n) => renderMessage(n))}
              </>
            )}
            <div ref={mainEnd} />
          </div>
        </div>
        <div className="bottom-area">
          <div className="chat-width">
            {main.at(-1)?.role === "user" && !mainBusy && (
              <button
                className="generate-button"
                onClick={() => void generate(c.id, main.at(-1)!.id)}
              >
                <Sparkles size={16} />
                生成回答
              </button>
            )}
            {errorBanner()}
            <Composer
              text={c.draft}
              images={c.images}
              onChange={(text, images) => updateDraft(text, images)}
              onImagesAdded={(images) =>
                commit(c.id, (d) => {
                  d.images.push(...images);
                })
              }
              onSend={() => send()}
              busy={mainBusy}
              onStop={() => stop(c.id)}
              disabled={pendingMain}
              reasoningControls={reasoningControls(mainHistory, mainBusy)}
              modelPicker={
                <ModelPicker
                  settings={settings}
                  onChange={saveSettings}
                  onConfigure={() => setShowSettings(true)}
                  state={c.parameterSelections?.[settings.selected]}
                  onParameters={(state) =>
                    commit(c.id, (d) => {
                      d.parameterSelections = {
                        ...d.parameterSelections,
                        [settings.selected]: state,
                      };
                    })
                  }
                />
              }
            />
          </div>
        </div>
      </main>
      <aside className="question-sidebar" inert={!right} aria-hidden={!right}>
        <header className="side-header">
          <span className="side-heading">
            <MessageSquare size={18} />
            <strong>侧边提问</strong>
          </span>
          <button
            className="icon"
            aria-label="收起侧边提问栏"
            onClick={() => setRight(false)}
          >
            <X size={18} />
          </button>
        </header>
        {q ? (
          <>
            <div className="question-tabs" role="tablist" aria-label="侧边提问">
              {questions.map((question, i) => (
                <div
                  className={`question-tab ${q.id === question.id ? "active" : ""}`}
                  key={question.id}
                >
                  <button
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTabMenu({
                        id: question.id,
                        x: Math.min(e.clientX, window.innerWidth - 170),
                        y: Math.min(e.clientY, window.innerHeight - 100),
                      });
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "ContextMenu" ||
                        (e.shiftKey && e.key === "F10")
                      ) {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        setTabMenu({
                          id: question.id,
                          x: r.left,
                          y: r.bottom,
                        });
                      }
                    }}
                    role="tab"
                    aria-selected={q.id === question.id}
                    onClick={() =>
                      commit(c.id, (d) => {
                        d.tabs[d.current] = question.id;
                      })
                    }
                  >
                    {titlePending(c, question.id)
                      ? dots()
                      : question.title || `提问 ${i + 1}`}
                  </button>
                </div>
              ))}
            </div>
            <div
              className="side-scroll"
              onScroll={(e) => {
                const el = e.currentTarget;
                scrollAnchor.onScroll(el);
                followSide.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              }}
            >
              {ancestors(c, q.owner).map((n) => renderMessage(n, true))}
              {side.map((n) => renderMessage(n))}
              <div ref={sideEnd} />
            </div>
            <div className="side-bottom">
              {side.at(-1)?.role === "user" && !sideBusy && (
                <button
                  className="generate-button"
                  onClick={() => void generate(c.id, side.at(-1)!.id, q.id)}
                >
                  <Sparkles size={15} />
                  生成回答
                </button>
              )}
              {errorBanner(q.id)}
              <Composer
                compact
                text={q.draft}
                images={q.images}
                onChange={(text, images) => updateDraft(text, images, q.id)}
                onImagesAdded={(images) =>
                  commit(c.id, (d) => {
                    const target = d.questions.find((x) => x.id === q.id);
                    if (target) target.images.push(...images);
                  })
                }
                onSend={() => send(q.id)}
                busy={sideBusy}
                onStop={() => stop(c.id, q.id)}
                disabled={pendingSide}
                reasoningControls={reasoningControls(sideHistory, sideBusy)}
                modelPicker={
                  <ModelPicker
                    settings={settings}
                    onChange={saveSettings}
                    onConfigure={() => setShowSettings(true)}
                    state={c.parameterSelections?.[settings.selected]}
                    onParameters={(state) =>
                      commit(c.id, (d) => {
                        d.parameterSelections = {
                          ...d.parameterSelections,
                          [settings.selected]: state,
                        };
                      })
                    }
                  />
                }
              />
            </div>
          </>
        ) : (
          <div className="side-empty">
            <MessageSquare size={28} />
            <p>
              {current?.role === "assistant"
                ? "选中对话中的文字以进行提问"
                : current?.role === "user"
                  ? "无法对用户消息进行侧边提问"
                  : "无法对系统消息进行侧边提问"}
            </p>
          </div>
        )}
      </aside>
      {tabMenu && (
        <div
          className="tab-context-menu"
          role="menu"
          style={{ left: tabMenu.x, top: tabMenu.y }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setRenameQuestion(true);
              setRenaming(tabMenu.id);
              setRenameValue(
                c.questions.find((q) => q.id === tabMenu.id)?.title || "",
              );
              setTabMenu(null);
            }}
          >
            <Pencil size={15} />
            重命名
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              deletion(tabMenu.id, true);
              setTabMenu(null);
            }}
          >
            <Trash2 size={15} />
            删除
          </button>
        </div>
      )}
      {selection && (
        <button
          className="selection-popover"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={questionFromSelection}
        >
          <MessageSquare size={15} />
          创建侧边对话
        </button>
      )}
      {highlightMenu && (
        <div
          className="highlight-menu"
          style={{ left: highlightMenu.x, top: highlightMenu.y }}
        >
          {highlightMenu.ids.map((id) => {
            const target = c.questions.find((q) => q.id === id);
            return (
              target && (
                <button
                  key={id}
                  onClick={() => {
                    commit(c.id, (d) => {
                      d.current = target.owner;
                      d.tabs[target.owner] = id;
                    });
                    setRight(true);
                    setHighlightMenu(null);
                  }}
                >
                  提问{" "}
                  {c.questions
                    .filter((q) => q.owner === target.owner)
                    .findIndex((q) => q.id === id) + 1}{" "}
                  · {target.quote.slice(0, 24)}
                </button>
              )
            );
          })}
          <button onClick={() => setHighlightMenu(null)}>关闭</button>
        </div>
      )}
      {storageError && (
        <div className="storage-error" role="alert">
          {storageError}
        </div>
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(value) => {
            saveSettings(value);
            setShowSettings(false);
          }}
        />
      )}
      {showBudget && (
        <NamingSettings
          settings={settings}
          onClose={() => setShowBudget(false)}
          onSave={(value) => {
            saveSettings(value);
            setShowBudget(false);
          }}
        />
      )}
      {parameterDetails && (
        <Modal title="本次请求参数" onClose={() => setParameterDetails(null)}>
          {parameterDetails.parameters?.length ? (
            parameterDetails.parameters.map((p, i) => (
              <p key={i}>
                <strong>{p.name}</strong>：{p.value}
              </p>
            ))
          ) : (
            <p>未指定自定义参数</p>
          )}
          <pre className="parameter-snapshot">
            {JSON.stringify(parameterDetails.requestParameters ?? {}, null, 2)}
          </pre>
        </Modal>
      )}
      {editing && c.nodes[editing] && (
        <Suspense fallback={null}>
          <Editor
            key={editing}
            conversation={c}
            id={editing}
            onClose={() => setEditing(null)}
            onSave={(segments, branch, shouldGenerate, images) => {
              let target = editing;
              try {
                commit(
                  c.id,
                  (d) => {
                    const n = d.nodes[editing];
                    if (n.status === "streaming")
                      throw new Error("请先停止生成");
                    if (branch) {
                      const copy = append(
                        d,
                        n.parent!,
                        n.role,
                        segments.map((s) => s.text).join(""),
                      );
                      copy.images = images;
                      copy.model = n.model;
                      copy.effort = n.effort;
                      copy.parameters = structuredClone(n.parameters);
                      copy.requestParameters = structuredClone(
                        n.requestParameters,
                      );
                      copy.reasoning = n.reasoning;
                      copy.encryptedReasoning = structuredClone(
                        n.encryptedReasoning,
                      );
                      copy.status = n.status;
                      copy.edited = true;
                      target = copy.id;
                      navigate(d, target);
                    } else {
                      applyEdit(d, editing, segments);
                      d.nodes[editing].images = images;
                    }
                  },
                  true,
                );
                setEditing(null);
                if (shouldGenerate) void generate(c.id, target);
              } catch (e) {
                report(c.id, undefined, (e as Error).message);
              }
            }}
          />
        </Suspense>
      )}
      {tree && (
        <Suspense
          fallback={
            <Modal title="对话脉络" onClose={() => setTree(false)}>
              <div className="form-body">正在加载…</div>
            </Modal>
          }
        >
          <Tree
            conversation={c}
            onClose={() => setTree(false)}
            onJump={jump}
            onDelete={(id) => deletion(id)}
            onDeleteQuestion={(id) => deletion(id, true)}
          />
        </Suspense>
      )}
      {renaming && (
        <Modal
          title={renameQuestion ? "重命名侧边提问" : "重命名对话"}
          onClose={() => setRenaming(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (renameValue.trim()) {
                if (renameQuestion)
                  commit(c.id, (d) => {
                    const target = d.questions.find((q) => q.id === renaming);
                    if (target) {
                      target.title = renameValue.trim();
                      target.titleMode = "manual";
                    }
                  });
                else
                  commit(renaming, (d) => {
                    d.title = renameValue.trim();
                    d.titleMode = "manual";
                  });
                setRenaming(null);
              }
            }}
          >
            <div className="form-body">
              <input
                autoFocus
                aria-label="对话名称"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
              />
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setRenaming(null)}
              >
                取消
              </button>
              <button className="primary">保存</button>
            </footer>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="confirm-body">
            {confirm.count > 0 && (
              <p>将递归删除其下 {confirm.count} 个节点，包括关联的侧边提问。</p>
            )}
          </div>
          <footer className="modal-footer">
            <button className="secondary" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button
              className="destructive"
              onClick={() => {
                confirm.action();
                setConfirm(null);
              }}
            >
              删除
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
