import { useState } from "react";
import { ChevronRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import type {
  EncryptedReasoning,
  Message,
  Provider,
  ReasoningPreferences,
  ReasoningSource,
} from "./types";
import {
  availableSources,
  canUseAsContext,
  isReplayable,
  sourceName,
  summaryText,
  supportsSource,
  usesSource,
} from "./encryptedReasoning";
import Markdown from "./Markdown";

function Block({
  block,
  provider,
  preferences,
  eligible,
  streaming,
  onBeforeToggle,
}: {
  block: EncryptedReasoning;
  provider: Provider;
  preferences?: ReasoningPreferences;
  eligible: boolean;
  streaming: boolean;
  onBeforeToggle: (el: HTMLElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = summaryText(block),
    name = sourceName(block.source);
  const supported = supportsSource(provider, block.source);
  const using =
    eligible &&
    isReplayable(block) &&
    usesSource(provider, preferences, block.source);
  const description = !supported
    ? `当前模型不支持使用${name}加密思维链`
    : !isReplayable(block)
      ? "未完整接收，不会发送"
      : !eligible
        ? "当前发送路径不包含此消息，不会发送"
        : !using
          ? `已关闭使用${name}加密思维链`
          : `将随请求发送${name}加密思维链`;
  const label = (
    <>
      <LockKeyhole size={14} />
      <span>{name}加密思维链</span>
    </>
  );
  return (
    <section
      className={`encrypted-reasoning ${open ? "open" : ""}`}
      aria-label={`${name}加密思维链`}
    >
      <div className="encrypted-heading">
        {summary ? (
          <button
            className="encrypted-toggle"
            aria-expanded={open}
            onClick={(e) => {
              onBeforeToggle(e.currentTarget);
              setOpen(!open);
            }}
          >
            <ChevronRight className="encrypted-chevron" size={15} />
            {label}
          </button>
        ) : (
          <span className="encrypted-label">{label}</span>
        )}
        <span
          className="encrypted-visibility"
          tabIndex={0}
          title={description}
          aria-label={description}
        >
          {using ? <Eye size={16} /> : <EyeOff size={16} />}
        </span>
      </div>
      {!isReplayable(block) && (
        <small className="encrypted-incomplete">
          {streaming ? "正在接收…" : "未完整接收，不会发送"}
        </small>
      )}
      {open && summary && (
        <div className="encrypted-summary">
          <Markdown text={summary} />
        </div>
      )}
    </section>
  );
}

export default function EncryptedReasoningView({
  message,
  provider,
  preferences,
  included,
  onBeforeToggle,
}: {
  message: Message;
  provider: Provider;
  preferences?: ReasoningPreferences;
  included: boolean;
  onBeforeToggle: (el: HTMLElement) => void;
}) {
  return (
    <>
      {message.encryptedReasoning?.map((block) => (
        <Block
          key={`${block.source}:${block.index}`}
          block={block}
          provider={provider}
          preferences={preferences}
          eligible={included && canUseAsContext(message)}
          streaming={message.status === "streaming"}
          onBeforeToggle={onBeforeToggle}
        />
      ))}
    </>
  );
}

export function ReasoningControls({
  history,
  provider,
  preferences,
  onChange,
  busy,
}: {
  history: Message[];
  provider: Provider;
  preferences?: ReasoningPreferences;
  onChange: (source: ReasoningSource, enabled: boolean) => void;
  busy: boolean;
}) {
  const sources = availableSources(history);
  if (!sources.length) return null;
  return (
    <div className="reasoning-controls">
      {sources.map((source) => {
        const supported = supportsSource(provider, source),
          using = usesSource(provider, preferences, source),
          name = sourceName(source);
        return (
          <span
            key={source}
            title={
              !supported ? `当前模型不支持使用${name}加密思维链` : undefined
            }
          >
            <button
              className="reasoning-pill"
              disabled={!supported || busy}
              aria-pressed={using}
              onClick={() => onChange(source, !using)}
            >
              {using ? <Eye size={14} /> : <EyeOff size={14} />}使用{name}
              加密思维链
            </button>
          </span>
        );
      })}
    </div>
  );
}
