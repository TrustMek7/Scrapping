import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} className="max-w-md p-6">
      <h4 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h4>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} className="!bg-error-500 hover:!bg-error-600">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
