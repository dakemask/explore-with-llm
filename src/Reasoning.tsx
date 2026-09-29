import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import Markdown from "./Markdown";

export default function Reasoning({
  text,
  thinking,
  onBeforeToggle,
}: {
  text: string;
  thinking: boolean;
  onBeforeToggle: (element: HTMLElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <div className={`reasoning ${open ? "open" : ""}`}>
      <button
        className="reasoning-toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={(e) => {
          onBeforeToggle(e.currentTarget);
          setOpen((value) => !value);
        }}
      >
        <ChevronRight size={16} aria-hidden="true" />
        <span>{thinking ? "正在思考" : "思考过程"}</span>
      </button>
      <div
        className="reasoning-collapse"
        id={contentId}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="reasoning-clip">
          <div className="reasoning-content markdown">
            <Markdown text={text} />
          </div>
        </div>
      </div>
    </div>
  );
}
