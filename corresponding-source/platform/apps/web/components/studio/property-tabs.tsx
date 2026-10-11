'use client';

import { useId, useState, type ReactNode } from 'react';

/** Existing editing commands stay in their panels; selecting a tab changes only local UI state. */
export function PropertyTabs({ sections, disabled = false }: {
  sections: readonly { id: string; label: string; content: ReactNode; managesDisabled?: boolean }[];
  disabled?: boolean;
}) {
  const prefix = useId();
  const [selected, setSelected] = useState(sections[0]?.id);
  const active = sections.some((section) => section.id === selected) ? selected : sections[0]?.id;
  if (!sections.length) return null;
  return <div className="min-w-0">
    <div role="tablist" aria-label="Item properties" className="flex flex-wrap gap-1 rounded-lg bg-paper p-1">
      {sections.map((section, index) => <button key={section.id} type="button" role="tab"
        id={`${prefix}-tab-${section.id}`} aria-controls={`${prefix}-panel-${section.id}`}
        aria-selected={active === section.id} tabIndex={active === section.id ? 0 : -1}
        className={`min-h-11 rounded-md px-2 py-1 text-[11px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ink/40 md:min-h-8 ${active === section.id ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/10'}`}
        onClick={() => setSelected(section.id)}
        onKeyDown={(event) => {
          const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : offset ? (index + offset + sections.length) % sections.length : -1;
          if (next < 0) return;
          event.preventDefault(); event.stopPropagation();
          const target = sections[next]!;
          setSelected(target.id);
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[id="${prefix}-tab-${target.id}"]`)?.focus();
        }}>{section.label}</button>)}
    </div>
    {sections.map((section) => <div key={section.id} role="tabpanel"
      id={`${prefix}-panel-${section.id}`} aria-labelledby={`${prefix}-tab-${section.id}`}
      hidden={active !== section.id} tabIndex={0} className="pt-3 outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
      <fieldset disabled={disabled && !section.managesDisabled} className="flex min-w-0 flex-col gap-3 disabled:opacity-40">{section.content}</fieldset>
    </div>)}
  </div>;
}
