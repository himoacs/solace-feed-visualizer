interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(1,46,77,0.30)]" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-lg border border-sc-border bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-semibold text-sc-text">{title}</h3>
        <p className="mt-2 text-sm text-sc-text">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-sc-text hover:bg-sc-chip"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-red-500/90 px-3 py-1.5 text-sm font-medium text-sc-text hover:bg-red-500"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
