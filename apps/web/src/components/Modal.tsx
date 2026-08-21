import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Sous-titre sous le titre (contexte métier). */
  description?: string;
  /** Largeur du panneau — `lg` formulaires, `xl` grilles (bon de commande). */
  size?: 'md' | 'lg' | 'xl' | 'doc';
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-panel${size === 'lg' ? ' modal-panel-lg' : ''}${size === 'xl' ? ' modal-panel-xl' : ''}${size === 'doc' ? ' modal-panel-doc' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-text">
            <h3>{title}</h3>
            {description ? <p className="modal-description">{description}</p> : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
