import { useState } from "react";
import { ImagePlus } from "lucide-react";
import ProtectedEditor from "./ProtectedEditor";
import { Modal } from "./Modal";
import { editSegments } from "./model";
import type { Attachment, Conversation } from "./types";
import { Attachments, readImages } from "./Composer";
export default function Editor({
  conversation,
  id,
  onClose,
  onSave,
}: {
  conversation: Conversation;
  id: string;
  onClose: () => void;
  onSave: (
    segments: ReturnType<typeof editSegments>,
    branch: boolean,
    generate: boolean,
    images: Attachment[],
  ) => void;
}) {
  const n = conversation.nodes[id];
  const [segments, setSegments] = useState(() =>
      editSegments(conversation, id),
    ),
    [branch, setBranch] = useState(false),
    [branchText, setBranchText] = useState(n.content),
    [images, setImages] = useState(n.images),
    [error, setError] = useState("");
  return (
    <Modal
      title={
        n.role === "system"
          ? "系统消息"
          : `编辑${n.role === "user" ? "用户" : "助手"}消息`
      }
      onClose={onClose}
    >
      <div className="editor-body">
        {!n.side && n.role !== "system" && (
          <div className="segmented">
            <button
              className={!branch ? "active" : ""}
              onClick={() => setBranch(false)}
            >
              覆盖当前消息
            </button>
            <button
              className={branch ? "active" : ""}
              onClick={() => {
                setBranchText(segments.map((s) => s.text).join(""));
                setBranch(true);
              }}
            >
              新建分支
            </button>
          </div>
        )}
        {branch ? (
          <ProtectedEditor
            key="branch"
            segments={[{ text: branchText, locked: false, start: 0 }]}
            onChange={(value) =>
              setBranchText(value.map((s) => s.text).join(""))
            }
            onBlocked={() => {}}
          />
        ) : (
          <ProtectedEditor
            key="overwrite"
            segments={segments}
            onChange={(value) => {
              setSegments(value);
              setError("");
            }}
            onBlocked={() =>
              setError("高亮片段已有侧边提问，删除关联提问后可修改。")
            }
          />
        )}
        {n.role === "user" && (
          <>
            <Attachments images={images} onChange={setImages} />
            <label className="upload-label">
              <ImagePlus size={16} />
              添加图片
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={async (e) => {
                  try {
                    if (e.target.files)
                      setImages([
                        ...images,
                        ...(await readImages(e.target.files)),
                      ]);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            </label>
          </>
        )}
        {error && <p className="inline-error">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="secondary"
          onClick={() =>
            onSave(
              branch
                ? [{ text: branchText, locked: false, start: 0 }]
                : segments,
              branch,
              false,
              images,
            )
          }
        >
          保存
        </button>
        {n.role === "user" && !n.side && (
          <button
            className="primary"
            onClick={() =>
              onSave(
                branch
                  ? [{ text: branchText, locked: false, start: 0 }]
                  : segments,
                branch,
                true,
                images,
              )
            }
          >
            保存并生成
          </button>
        )}
      </footer>
    </Modal>
  );
}
