import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose(): void;
  actions?: ReactNode;
}

export function Modal({ title, children, onClose, actions }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const bodyControl = modal?.querySelector<HTMLElement>(
      '.modal__body input:not([disabled]), .modal__body select:not([disabled]), .modal__body textarea:not([disabled]), .modal__body button:not([disabled]), .modal__body a[href]',
    );
    (bodyControl ?? closeRef.current)?.focus();

    const focusableElements = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || !modal?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !modal?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={modalRef}
        aria-labelledby="modal-title"
        aria-modal="true"
        className="modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {actions ? <footer className="modal__actions">{actions}</footer> : null}
      </section>
    </div>
  );
}
