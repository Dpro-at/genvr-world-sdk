'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '../lib/api';
import { reportContext, type ReportContext } from '../lib/report-context';
import { NoticeForm } from './notice-form';

const Reports = createContext<((context: ReportContext) => void) | null>(null);

/** A native modal keeps the current world mounted and provides focus trapping/return. */
export function ContextReportProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ReportContext | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeReport = () => {
    dialog.current?.close();
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
    setContext(null);
  };
  const pathname = usePathname();
  useEffect(() => setContext(null), [pathname]);
  useEffect(() => {
    if (!context || !dialog.current) return;
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, [Boolean(context)]);

  return (
    <Reports.Provider
      value={(next) => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setContext(next);
      }}
    >
      {children}
      {context ? (
        <dialog
          ref={dialog}
          aria-label="Report illegal content"
          className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl bg-paper p-5 text-ink shadow-2xl backdrop:bg-black/60 sm:p-8"
          onCancel={(event) => {
            event.preventDefault();
            closeReport();
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={closeReport} className="mb-5 font-bold underline">
            Close report
          </button>
          <ContextNotice context={context} onClose={closeReport} />
        </dialog>
      ) : null}
    </Reports.Provider>
  );
}

function ContextNotice({ context, onClose }: { context: ReportContext; onClose: () => void }) {
  const [resolved, setResolved] = useState(context);
  useEffect(() => {
    let active = true;
    if (context.kind === 'place' && context.id) {
      void api
        .GET('/v1/experiences/{id}', { params: { path: { id: context.id } } })
        .then(({ data }) => {
          if (active && data) setResolved({ ...context, title: data.title, creator: data.creatorName });
        })
        .catch(() => {}); // The identifier remains useful when private/offline metadata is unavailable.
    }
    return () => {
      active = false;
    };
  }, [context]);
  return <NoticeForm context={resolved} onClose={onClose} />;
}

export function ReportLink({
  children = 'Report illegal content',
  className,
  item,
}: {
  children?: ReactNode;
  className?: string;
  item?: { id: string; title: string; creator?: string };
}) {
  const open = useContext(Reports);
  return (
    <a
      href="/report-illegal-content"
      className={className}
      onClick={(event) => {
        if (!open || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const context = reportContext(window.location.pathname);
        open(item ? { ...context, kind: 'item', ...item } : context);
      }}
    >
      {children}
    </a>
  );
}
