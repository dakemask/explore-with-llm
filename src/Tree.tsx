import { useMemo, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  Handle,
  Position,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { Modal } from "./Modal";
import type { Conversation } from "./types";
import { Trash2, CircleHelp } from "lucide-react";
const nodeTypes = {
  message: ({ data }: { data: { label: React.ReactNode } }) => (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle id="side" type="source" position={Position.Right} />
      {data.label}
    </>
  ),
  question: ({ data }: { data: { label: React.ReactNode } }) => (
    <>
      <Handle type="target" position={Position.Left} />
      {data.label}
    </>
  ),
};
export default function Tree({
  conversation: c,
  onClose,
  onJump,
  onDelete,
  onDeleteQuestion,
}: {
  conversation: Conversation;
  onClose: () => void;
  onJump: (id: string, question?: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteQuestion: (id: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  function close(action = onClose) {
    if (closing) return;
    setMenu(null);
    setClosing(true);
    timer.current = setTimeout(
      action,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
    );
  }
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
    question: boolean;
  } | null>(null);
  const { nodes, edges } = useMemo(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({ rankdir: "TB", nodesep: 38, ranksep: 65 });
    graph.setDefaultEdgeLabel(() => ({}));
    const edges: Edge[] = [],
      nodes: Node[] = [];
    for (const n of Object.values(c.nodes)) {
      if (n.side) continue;
      const count = c.questions.filter((q) => q.owner === n.id).length;
      graph.setNode(n.id, {
        width: count ? 830 : 230,
        height: Math.max(86, count * 106 - 20),
      });
      nodes.push({
        id: n.id,
        type: "message",
        position: { x: 0, y: 0 },
        width: 230,
        height: 86,
        data: {
          label: (
            <>
              <span className="tree-role">
                {n.role === "system"
                  ? "系统"
                  : n.role === "user"
                    ? "用户"
                    : "助手"}
                {n.side ? " · 侧边" : ""}
              </span>
              <span className="tree-text">{n.content || "等待回答…"}</span>
            </>
          ),
        },
        className: `tree-node ${n.side ? "side-node" : ""} ${n.id === c.current ? "current-node" : ""}`,
      });
      if (n.parent) {
        const q = n.side && c.questions.find((q) => q.id === n.side);
        const source = q && n.parent === q.owner ? `q:${q.id}` : n.parent;
        graph.setEdge(source, n.id);
        edges.push({
          id: `e:${n.id}`,
          source,
          target: n.id,
          type: "smoothstep",
          style: n.side
            ? { stroke: "#0d9488", strokeDasharray: "5 4" }
            : { stroke: "#aab4c3" },
        });
      }
    }
    for (const q of c.questions) {
      const id = `q:${q.id}`;

      nodes.push({
        id,
        type: "question",
        position: { x: 0, y: 0 },
        width: 230,
        height: 86,
        className: "tree-node question-node",
        data: {
          label: (
            <>
              <span className="tree-role">
                侧边提问
                {!Object.values(c.nodes).some((n) => n.side === q.id)
                  ? " · 草稿"
                  : ""}
              </span>
              <span className="tree-text">{q.title || q.quote}</span>
            </>
          ),
        },
      });
      edges.push({
        id: `eq:${q.id}`,
        sourceHandle: "side",
        source: q.owner,
        target: id,
        type: "smoothstep",
        style: { stroke: "#0d9488", strokeDasharray: "5 4" },
      });
    }
    dagre.layout(graph);
    for (const n of nodes.filter((n) => !n.id.startsWith("q:"))) {
      const p = graph.node(n.id);
      n.position = { x: p.x - 115, y: p.y - p.height / 2 };
      c.questions
        .filter((q) => q.owner === n.id)
        .forEach((q, index) => {
          const satellite = nodes.find((item) => item.id === `q:${q.id}`)!;
          satellite.position = {
            x: n.position.x + 290,
            y: n.position.y + index * 106,
          };
        });
    }
    return { nodes, edges };
  }, [c]);
  return (
    <Modal title="对话脉络" wide open={!closing} onClose={() => close()}>
      <div className="tree-legend">
        <span>
          <i />
          主对话
        </span>
        <span>
          <i className="teal" />
          侧边提问
        </span>
        <span className="flex" />
        <button className="icon tree-help" aria-label="消息树操作说明">
          <CircleHelp size={17} />
          <span role="tooltip">
            双击节点可跳转到对应消息
            <br />
            右键节点可删除
          </span>
        </button>
      </div>
      <div className="tree-canvas" ref={canvas}>
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.15}
          maxZoom={1.3}
          autoPanOnNodeFocus={false}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          onPaneClick={() => setMenu(null)}
          onMoveStart={() => setMenu(null)}
          onNodeDoubleClick={(_, n) =>
            close(() => onJump(n.id.replace(/^q:/, ""), n.id.startsWith("q:")))
          }
          onNodeContextMenu={(event, n) => {
            event.preventDefault();
            const bounds = canvas.current!.getBoundingClientRect();
            if (n.id !== c.root)
              setMenu({
                id: n.id.replace(/^q:/, ""),
                question: n.id.startsWith("q:"),
                x: Math.max(
                  4,
                  Math.min(event.clientX - bounds.left, bounds.width - 144),
                ),
                y: Math.max(
                  4,
                  Math.min(event.clientY - bounds.top, bounds.height - 48),
                ),
              });
          }}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) =>
              n.className?.includes("side") || n.className?.includes("question")
                ? "#5cbeb3"
                : "#b3c4e8"
            }
          />
        </ReactFlow>
        {menu && (
          <button
            key={`${menu.id}:${menu.x}:${menu.y}`}
            className="context-menu danger"
            style={{ left: menu.x, top: menu.y }}
            onClick={() => {
              menu.question ? onDeleteQuestion(menu.id) : onDelete(menu.id);
              setMenu(null);
            }}
          >
            <Trash2 size={15} />
            删除节点
          </button>
        )}
      </div>
    </Modal>
  );
}
