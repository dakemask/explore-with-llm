import { useRef, useState, useLayoutEffect, type ReactNode } from "react";
import { ArrowUp, ImagePlus, Square, X } from "lucide-react";
import type { Attachment } from "./types";
import { uid } from "./model";
export async function readImages(
  files: FileList | File[],
): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const file of Array.from(files)) {
    if (
      !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
        file.type,
      )
    )
      throw new Error("请选择 JPEG、PNG、GIF 或 WebP 图片");
    if (file.size > 32 * 1024 * 1024)
      throw new Error("单张图片不能超过 32 MiB");
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    result.push({ id: uid(), name: file.name, url });
  }
  return result;
}
export function Attachments({
  images,
  onChange,
}: {
  images: Attachment[];
  onChange?: (images: Attachment[]) => void;
}) {
  return (
    <div className="attachments">
      {images.map((image) => (
        <div className="attachment" key={image.id}>
          <a href={image.url} target="_blank" rel="noreferrer">
            <img src={image.url} alt={image.name} />
          </a>
          {onChange && (
            <button
              aria-label={`移除 ${image.name}`}
              onClick={() => onChange(images.filter((i) => i.id !== image.id))}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export default function Composer({
  text,
  images,
  onChange,
  onImagesAdded,
  onSend,
  busy,
  onStop,
  disabled,
  modelPicker,
  reasoningControls,
  compact = false,
}: {
  text: string;
  images: Attachment[];
  onChange: (text: string, images: Attachment[]) => void;
  onImagesAdded: (images: Attachment[]) => void;
  onSend: () => void;
  busy: boolean;
  onStop: () => void;
  disabled?: boolean;
  modelPicker: ReactNode;
  reasoningControls?: ReactNode;
  compact?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    // Native sizing avoids collapsing and laying out the entire draft per key.
    if (CSS.supports("field-sizing", "content")) return;
    const el = input.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "0px";
      const style = getComputedStyle(el);
      const max = parseFloat(style.maxHeight);
      const height = Math.max(
        parseFloat(style.minHeight),
        Math.min(max, el.scrollHeight),
      );
      el.style.height = `${height}px`;
      el.style.overflowY = el.scrollHeight > height ? "auto" : "hidden";
    };
    resize();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        resize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  const [error, setError] = useState("");
  async function add(files: FileList | File[]) {
    try {
      const added = await readImages(files);
      onImagesAdded(added);
      setError("");
    } catch (e) {
      setError(String((e as Error).message));
    }
  }
  return (
    <div className={`composer-wrap ${compact ? "compact" : ""}`}>
      <div
        className="composer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled && !busy) void add(e.dataTransfer.files);
        }}
      >
        <Attachments images={images} onChange={(v) => onChange(text, v)} />
        <textarea
          ref={input}
          aria-label={compact ? "侧边提问输入" : "消息输入"}
          placeholder={disabled ? "先生成上一条消息的回答" : "写下你的问题…"}
          value={text}
          disabled={disabled || busy}
          onChange={(e) => onChange(e.target.value, images)}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void add(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (!busy && !disabled && (text.trim() || images.length))
                onSend();
            }
          }}
        />
        {reasoningControls}
        <div className="composer-actions">
          {modelPicker}
          <span className="flex" />
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void add(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            className="icon"
            title="添加图片"
            aria-label={compact ? "侧栏添加图片" : "添加图片"}
            disabled={disabled || busy}
            onClick={() => file.current?.click()}
          >
            <ImagePlus size={19} />
          </button>
          {busy ? (
            <button
              className="send"
              title="停止生成"
              aria-label="停止生成"
              onClick={onStop}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              className="send"
              aria-label={compact ? "发送侧边提问" : "发送消息"}
              disabled={disabled || (!text.trim() && !images.length)}
              onClick={onSend}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="inline-error">
          {error}
          <button onClick={() => setError("")}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
