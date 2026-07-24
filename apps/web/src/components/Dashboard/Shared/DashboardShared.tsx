import React from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { guardClose } from './DashboardShared.utils';

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(10,10,10,0.72)',
  backdropFilter: 'blur(2px)',
  display: 'grid',
  placeItems: 'center',
  padding: '1rem',
};

export const ModalOverlay = ({ children, onClose, maxWidth, isDirty, onFormChange }: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
  isDirty?: boolean;
  onFormChange?: () => void;
}) => {
  const dirtyRef = React.useRef(false);
  const closeRef = React.useRef(onClose);
  React.useLayoutEffect(() => {
    dirtyRef.current = !!isDirty;
    closeRef.current = onClose;
  });

  React.useEffect(() => {
    document.body.setAttribute('data-modal-open', 'true');
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') guardClose(dirtyRef.current, closeRef.current);
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      document.body.removeAttribute('data-modal-open');
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) guardClose(!!isDirty, onClose);
  };

  return createPortal(
    <div style={backdropStyle} onClick={handleBackdropClick}>
      <div
        className="bg-white dark:bg-bg-surface w-full rounded-2xl border border-slate-200 dark:border-bg-deep p-6 relative flex flex-col dark-scrollbar"
        style={{ maxHeight: '90vh', overflowY: 'auto', maxWidth: maxWidth ?? '32rem' }}
        onClick={e => e.stopPropagation()}
        onChangeCapture={onFormChange}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirmar Eliminación' }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}) => {
  if (!isOpen) return null;
  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{title}</h2>
      <p className="text-slate-600 dark:text-gray-400 leading-relaxed mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors cursor-pointer border-0"
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-orange cursor-pointer border-0"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalOverlay>
  );
};

export const DetailField = ({
  label, value, isFullWidth = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  isFullWidth?: boolean;
}) => (
  <div className={`flex flex-col gap-1 bg-slate-50 dark:bg-bg-surface p-3 rounded-lg border border-slate-200 dark:border-bg-deep ${isFullWidth ? 'col-span-2' : 'col-span-1'}`}>
    <span className="text-xs font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-wide">
      {label}
    </span>
    <div className="text-sm font-medium text-slate-900 dark:text-white">
      {value || '-'}
    </div>
  </div>
);

export const RecordDetailModal = ({
  isOpen, onClose, title, children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) => {
  if (!isOpen) return null;
  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-gray-700 flex-shrink-0 mb-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors bg-transparent border-0 cursor-pointer leading-none"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5 overflow-y-auto flex-1 min-h-0 pr-1 pb-2">
          {children}
        </div>

        <div className="border-t border-slate-200 dark:border-gray-700 mt-4 pt-3 flex-shrink-0">
          <button
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors cursor-pointer border-0"
            onClick={onClose}
          >
            Cerrar Detalle
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
