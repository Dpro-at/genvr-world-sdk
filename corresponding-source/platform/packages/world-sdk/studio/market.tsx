import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import type { GenvrRuntime, ToolStatus } from '@genvr/runtime';
import type { Style } from '@genvr/contracts';
import { LibraryPanel, LibraryPicture } from '../../../apps/web/components/studio/library-panel';
import { StudioHostProvider } from '../../../apps/web/lib/studio-host';
import { kindName, STYLE_NAMES, useLibraryDetails } from '../../../apps/web/lib/library-details';
import type { StoreEntry } from '../../../apps/web/lib/store-items';

/** GV1c v2: the Studio's Items catalog on its own, for a host's market page (no world is open). */
export interface MarketOptions {
  /** The same catalog the Studio's Items tab reads. */
  catalog: { list(): Promise<StoreEntry[]> };
  /** Add to a place…: the host chooses the place and opens it with this item ready to place. */
  onAdd?: (itemId: string) => void;
  /** The look the list starts with (items differ per look). */
  style?: Style;
}

const IDLE = { tool: null, points: 0, canFinish: false, message: null, placeItemId: null, selected: null, moving: false, brush: {}, roadType: '' } as unknown as ToolStatus;
const LOOKS: Style[] = ['blocky', 'realistic', 'voxel'];

function Market({ options }: { options: MarketOptions }) {
  const runtime = useRef<GenvrRuntime | null>(null);
  const [style, setStyle] = useState<Style>(options.style && LOOKS.includes(options.style) ? options.style : 'realistic');
  const entry = useLibraryDetails();
  const manifest = entry?.manifest as (NonNullable<typeof entry>['manifest'] & { author?: { name?: string }; license?: string; price: { type: string; coins?: number } }) | undefined;
  const free = manifest?.price.type === 'free';
  return (
    <StudioHostProvider value={{ platform: false, catalog: options.catalog }}>
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)_280px] bg-paper text-ink">
        <div className="flex min-h-0 flex-col gap-2 overflow-auto p-3">
          <label className="flex items-center gap-2 self-start text-xs font-bold text-ink/70">Look
            <select value={style} onChange={event => setStyle(event.target.value as Style)} className="rounded border border-ink/20 bg-paper px-2 py-1 text-xs">
              {LOOKS.map(look => <option key={look} value={look}>{STYLE_NAMES[look] ?? look}</option>)}
            </select>
          </label>
          <LibraryPanel key={style} runtime={runtime} status={IDLE} style={style} />
        </div>
        <aside aria-label="Item details" className="flex min-h-0 flex-col gap-3 overflow-auto border-l border-ink/10 p-3">
          {entry && manifest ? (
            <>
              <LibraryPicture entry={entry} runtime={runtime} style={style} selected large />
              <b className="text-sm">{manifest.name}</b>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink/70">
                <dt>Kind</dt><dd>{kindName(manifest.subcategory)}</dd>
                <dt>Price</dt><dd>{free ? 'Free' : manifest.price.type === 'paid' ? `${manifest.price.coins ?? '?'} coins` : 'With a subscription'}</dd>
                {manifest.author?.name ? <><dt>Made by</dt><dd>{manifest.author.name}</dd></> : null}
                {manifest.license ? <><dt>Licence</dt><dd>{manifest.license}</dd></> : null}
                <dt>Looks</dt><dd>{manifest.styles.map(look => STYLE_NAMES[look] ?? look).join(', ')}</dd>
              </dl>
              {free ? (
                <button type="button" disabled={!options.onAdd} onClick={() => options.onAdd?.(manifest.id)} className="rounded-lg bg-ink px-3 py-2 text-sm font-bold text-paper disabled:opacity-50">Add to a place…</button>
              ) : (
                <p className="text-xs text-ink/60">Paid items are bought on GenVR.</p>
              )}
            </>
          ) : <p className="text-xs text-ink/60">Select an item to see it here.</p>}
        </aside>
      </div>
    </StudioHostProvider>
  );
}

/** Mounts the market; one per page. */
export function mountMarket(container: HTMLElement, options: MarketOptions) {
  const root = createRoot(container);
  root.render(<Market options={options} />);
  return { dispose() { root.unmount(); } };
}
