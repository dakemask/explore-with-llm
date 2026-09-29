import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  open = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  open?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? "wide" : ""}`}
          aria-describedby={undefined}
        >
          <header className="modal-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon" aria-label="关闭">
                <X size={20} />
              </button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
