import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Built on the native <dialog> element: the browser handles focus trapping, the Escape
 * key and the backdrop, which is more accessible than a hand-made overlay.
 */
export function Modal({ open, onClose, title, description, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose(); // click on the backdrop
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 shadow-xl',
        size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
