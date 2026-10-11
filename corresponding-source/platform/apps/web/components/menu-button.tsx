'use client';

import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface MenuOption<T extends string> {
  value: T | null;
  label: string;
  Icon?: LucideIcon;
}

/**
 * A button that opens a short list to pick one option (filters and sorting). Long option lists
 * belong here, never in rows of chips. Keyboard: arrows move, Enter picks, Escape closes.
 */
export function MenuButton<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** What the menu chooses, shown when nothing is picked (for example "Category"). */
  label: string;
  value: T | null;
  options: Array<MenuOption<T>>;
  onChange: (value: T | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((option) => option.value === value);
  const picked = value !== null;

  useEffect(() => {
    if (!open) return;
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    list.current?.focus();
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open, options, value]);

  const choose = (option: MenuOption<T>) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold sm:gap-2 sm:px-3.5 transition-colors ${
          picked ? 'bg-ink text-on-brand' : 'bg-surface text-ink ring-1 ring-ink/10 hover:ring-ink/25'
        }`}
      >
        {current?.Icon && picked ? <current.Icon className="size-4" aria-hidden /> : null}
        {picked ? current?.label : label}
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            else if (event.key === 'ArrowDown') setActive((index) => Math.min(options.length - 1, index + 1));
            else if (event.key === 'ArrowUp') setActive((index) => Math.max(0, index - 1));
            else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              const option = options[active];
              if (option) choose(option);
            } else return;
            event.preventDefault();
          }}
          className="absolute top-12 right-0 z-30 max-h-[min(26rem,70vh)] w-64 overflow-y-auto rounded-2xl [scrollbar-width:thin] bg-surface p-1.5 shadow-xl ring-1 ring-ink/10 outline-none sm:left-0 sm:right-auto"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value ?? 'all'}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${
                  index === active ? 'bg-ink/5' : ''
                } ${selected ? 'font-extrabold' : 'font-semibold text-ink/80'}`}
              >
                {option.Icon ? <option.Icon className="size-4 shrink-0 text-ink/60" aria-hidden /> : null}
                <span className="flex-1">{option.label}</span>
                {selected ? <Check className="size-4" aria-hidden /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
