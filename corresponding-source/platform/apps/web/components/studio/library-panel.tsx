'use client';

import type { ItemSource } from '@genvr/contracts';
import {
  DRAWN_ITEMS,
  getCoreItem,
  getGround,
  getOceanResource,
  groundRef,
  itemModelLook,
  LIBRARY,
  priceLabel,
  queryLibrary,
  SPAWN_POINT_ID,
  ZONE_AREA_ID,
  ZONE_GATE_ID,
  type LibraryEntry,
  type LibraryFilter,
} from '@genvr/core-library';
import type { GenvrRuntime, ToolStatus } from '@genvr/runtime';
import {
  Box,
  BrickWall,
  CloudSun,
  DoorOpen,
  Droplets,
  Flag,
  Globe,
  Grid2x2,
  Code2,
  Mountain,
  Music2,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  Bell,
  PanelsTopLeft,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { animationIcon } from '../../lib/animation-icons';
import { itemIcon } from '../../lib/item-icons';
import { fetchExternalItems } from '../../lib/free-assets';
import { fetchStoreItems, isStoreEntry, type StoreEntry } from '../../lib/store-items';
import { HEIGHT_FIELD_TOOLS } from '../build-panel';
import { Preview } from '../catalog-panel';
import { ENVIRONMENT_ICONS } from '../environment-picker';
import { OceanResourceControls } from './ocean-resource-controls';
import { FreeSourcesWindow, OriginLine } from './free-sources';
import { coreLibraryPicture } from './library-picture';
import { useStudioHost } from '../../lib/studio-host';

type Style = 'blocky' | 'realistic' | 'anime' | 'voxel';

/** Library sections by item kind (the store taxonomy); empty ones say what is coming. */
const KINDS: Array<{
  id: string;
  label: string;
  Icon: LucideIcon;
  filter: LibraryFilter;
  /** A group is a subcategory, or a set of items by id (`value` names it). */
  groups?: Array<
    { label: string; subcategory: string } | { label: string; value: string; ids: readonly string[] }
  >;
  empty?: string;
}> = [
  {
    id: 'models',
    label: '3D',
    Icon: Box,
    filter: {
      category: '3d-models',
      subcategory: ['parts', 'nature', 'props-and-decor', 'structures', 'building-blocks'],
    },
    groups: [
      { label: 'Parts', subcategory: 'parts' },
      { label: 'Nature', subcategory: 'nature' },
      { label: 'Props', subcategory: 'props-and-decor' },
      { label: 'Buildings', subcategory: 'structures' },
      { label: 'Blocks', subcategory: 'building-blocks' },
    ],
  },
  {
    // Free outside sources (owner, 2026-10-06): search Poly Haven and add a model to the library.
    id: 'free',
    label: 'Free',
    Icon: Globe,
    filter: { source: 'external' },
  },
  {
    // Items the game's rules use: zones (generic rules), start points and tools. Seen while
    // building; zones and start points are hidden while playing.
    id: 'game',
    label: 'Game',
    Icon: Flag,
    filter: { category: '3d-models', subcategory: 'gameplay' },
    groups: [
      { label: 'Zones', value: 'zones', ids: [ZONE_AREA_ID, ZONE_GATE_ID] },
      { label: 'Start points', value: 'spawns', ids: [SPAWN_POINT_ID] },
    ],
  },
  { id: 'roads', label: 'Roads', Icon: Route, filter: { category: 'environment', subcategory: 'roads' } },
  {
    id: 'ground',
    label: 'Ground',
    Icon: Mountain,
    filter: { category: 'environment', subcategory: 'ground' },
    empty: 'Real ground materials are for Realistic places: grass, soil, sand, rock, snow, roads.',
  },
  {
    id: 'walls',
    label: 'Walls',
    Icon: BrickWall,
    filter: { category: '3d-models', subcategory: ['walls', 'openings'] },
  },
  { id: 'water', label: 'Water', Icon: Droplets, filter: { category: 'environment', subcategory: 'water' } },
  {
    id: 'world',
    label: 'Sky',
    Icon: CloudSun,
    filter: { category: 'environment', subcategory: ['sky', 'weather'] },
  },
  {
    id: 'moves',
    label: 'Moves',
    Icon: Sparkles,
    filter: { category: 'avatar-appearance', subcategory: 'emotes' },
  },
  {
    id: 'sounds',
    label: 'Sounds',
    Icon: Music2,
    filter: { type: 'audio' },
    empty: 'Music, sound effects, ambience, and footsteps are coming to the library.',
  },
  {
    id: 'scripts',
    label: 'Scripts',
    Icon: Code2,
    filter: { type: 'script' },
    empty:
      'Scripts are coming: behaviors written in code that run safely in the Genvr sandbox, from Genvr and from creators in the store.',
  },
  {
    id: 'effects',
    label: 'Effects',
    Icon: Wand2,
    filter: { type: 'vfx' },
    empty: 'Fire, smoke, sparkles, and light effects are coming to the library.',
  },
  { id: 'notifications', label: 'Notifications', Icon: Bell, filter: {} },
  { id: 'cards', label: 'UI cards', Icon: PanelsTopLeft, filter: {} },
];

/** Icons of the drawn items (walls, openings, water). */
const DRAWN_ICONS: Record<string, LucideIcon> = {
  'genvr.core.wall.basic': BrickWall,
  'genvr.core.opening.door': DoorOpen,
  'genvr.core.opening.window': Grid2x2,
  'genvr.core.water.pond': Droplets,
};

const PRICES: Array<{ label: string; value?: 'free' | 'paid' }> = [
  { label: 'Any price' },
  { label: 'Free', value: 'free' },
  { label: 'Paid', value: 'paid' },
];
const SOURCES: Array<{ label: string; value?: ItemSource }> = [
  { label: 'Anyone' },
  { label: 'Genvr', value: 'core' },
  { label: 'Creators', value: 'user' },
  { label: 'Free sources', value: 'external' },
];

function Chips<T>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value?: T }>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-2 py-1 text-xs font-bold ${
            value === option.value ? 'bg-ink text-on-brand' : 'bg-paper text-ink/60 hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Studio library (P3-06, P1-08): the whole Core Library and the approved creator items by kind,
 * with search, filters for price, maker, and art style, price badges, and a details view with a
 * large preview. Picking a model starts placing it (creator models load their glTF package), a
 * road starts drawing it, a move plays it on the avatar.
 */
export function LibraryPanel({
  runtime,
  status,
  style: suppliedStyle,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
  style: Style;
}) {
  const host = useStudioHost();
  const kinds = host.presentationControls ? KINDS : KINDS.filter(row => row.id !== 'notifications' && row.id !== 'cards');
  const [text, setText] = useState('');
  const [kind, setKind] = useState(KINDS[0]!.id);
  const [group, setGroup] = useState<string | undefined>(undefined);
  const [price, setPrice] = useState<'free' | 'paid' | undefined>(undefined);
  const [source, setSource] = useState<ItemSource | undefined>(undefined);
  const [style, setStyle] = useState(suppliedStyle);
  useEffect(() => {
    const sync = () => setStyle(runtime.current?.world.style.base ?? suppliedStyle);
    sync();
    const timer = setInterval(sync, 300);
    return () => clearInterval(timer);
  }, [runtime, suppliedStyle]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [details, setDetails] = useState<LibraryEntry | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [store, setStore] = useState<StoreEntry[]>([]);
  useEffect(() => {
    if (!host.platform && !host.catalog) return;
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError('');
    const work = host.catalog ? host.catalog.list() : fetchStoreItems(controller.signal);
    void work.then(items => { if (!controller.signal.aborted) setStore(items); }).catch(() => { if (!controller.signal.aborted) setCatalogError('Marketplace is unavailable. Bundled library items still work.'); }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [host.platform, host.catalog, catalogRetry]);
  const [external, setExternal] = useState<StoreEntry[]>([]);
  const [freeOpen, setFreeOpen] = useState(false);
  useEffect(() => {
    if (!host.platform) return;
    const controller = new AbortController();
    fetchExternalItems(controller.signal)
      .then(setExternal)
      .catch(() => undefined);
    return () => controller.abort();
  }, [host.platform]);
  const externalById = useMemo(
    () => new Map(external.map((entry) => [entry.manifest.id, entry])),
    [external],
  );
  const everything = useMemo(() => [...LIBRARY, ...store, ...external], [store, external]);
  // Block ground (P2-26): only road types with blocks, and no height field tools.
  const worksHere = (id: string, subcategory: string) => {
    const rt = runtime.current;
    if (!rt?.blockGround) return true;
    if (subcategory === 'roads') return rt.blockRoadTypes?.includes(id) ?? true;
    const drawn = DRAWN_ITEMS.find((item) => item.manifest.id === id);
    return !drawn || !HEIGHT_FIELD_TOOLS.has(drawn.tool);
  };

  const section = KINDS.find((entry) => entry.id === kind)!;
  const picked = section.groups?.find((g) => ('ids' in g ? g.value : g.subcategory) === group);
  const pickedIds = picked && 'ids' in picked ? picked.ids : null;
  const entries = queryLibrary(
    {
      ...section.filter,
      ...(picked && !pickedIds ? { subcategory: group } : {}),
      style,
      ...(price ? { price } : {}),
      ...(source ? { source } : {}),
      text,
    },
    everything,
  ).filter(
    (entry) =>
      worksHere(entry.manifest.id, entry.manifest.subcategory) &&
      (!pickedIds || pickedIds.includes(entry.manifest.id)),
  );
  const activeFilters = [price, source].filter(Boolean).length;

  const use = (entry: LibraryEntry) => {
    const rt = runtime.current;
    const { manifest } = entry;
    setDetails(entry);
    setSelectionError('');
    if (!rt) return;
    if (!manifest.styles.includes(rt.world.style.base)) { setSelectionError('This item is not available for the current world style.'); return; }
    if (host.catalog && manifest.price.type !== 'free') { setSelectionError('This item requires a Genvr account and an authorized purchase.'); return; }
    const drawn = DRAWN_ITEMS.find((item) => item.manifest.id === manifest.id);
    const ocean = getOceanResource(manifest.id);
    if (ocean) {
      if (!ocean.manifest.styles.includes(rt.world.style.base)) {
        setSelectionError('This ocean supports the Realistic style.');
        return;
      }
      // Opening the already selected resource is a read-only properties action.
      if (rt.world.environment.sea?.resourceId === ocean.resourceId) return;
      const applied = rt.applyCommand({
        type: 'set_sea',
        params: {
          level: rt.world.environment.sea?.level ?? ocean.controls.find((c) => c.key === 'level')!.default!,
          resourceId: ocean.resourceId,
        },
      });
      if (!applied) setSelectionError('The ocean could not be applied.');
    } else if (drawn) {
      // Walls, doors, windows, and water are drawn with their build tool.
      rt.setTool(drawn.tool);
    } else if (manifest.subcategory === 'roads') {
      rt.setTool('road');
      rt.setRoadType(manifest.id);
    } else if (manifest.subcategory === 'ground') {
      // Ground materials (P2-37) are painted with the Terrain brush.
      const material = getGround(manifest.id);
      if (!material) return;
      rt.setTool('terrain');
      rt.setBrush({ mode: 'paint', soil: material.soil, material: groundRef(material) });
    } else if (manifest.type === 'animation') {
      if (host.presentAvatar) { const error = host.presentAvatar({ kind: 'animation', target: 'self', animation: manifest.id, duration: 5500 }); if (error) setSelectionError(error); }
      else rt.playAnimation(manifest.id);
    } else if (manifest.subcategory === 'sky' || manifest.subcategory === 'weather') {
      // Sky and weather items apply to the whole place (live for everyone, undoable).
      const preset = manifest.id.split('.').pop() as never;
      rt.applyCommand(
        manifest.subcategory === 'sky'
          ? { type: 'set_sky', params: { preset } }
          : { type: 'set_weather', params: { preset } },
      );
    } else if (manifest.type === 'model') {
      // Creator models start loading their package now, so the ghost shows the real model.
      if (isStoreEntry(entry)) rt.itemName(manifest.id);
      rt.setTool('place');
      rt.setPlaceItem(manifest.id);
    }
  };
  const drawnId = DRAWN_ITEMS.find((item) => item.tool === status.tool)?.manifest.id ?? null;
  const selectedId =
    status.tool === 'road'
      ? status.roadType
      : status.tool === 'place'
        ? status.placeItemId
        : status.tool === 'terrain' && status.brush.mode === 'paint'
          ? (status.brush.material?.id ?? null)
          : drawnId;

  const picture = (entry: LibraryEntry, selected: boolean, large = false) => {
    const { manifest } = entry;
    const drawnIcon = DRAWN_ICONS[manifest.id];
    if (drawnIcon || manifest.type === 'animation' || manifest.type === 'environment') {
      const Icon = getOceanResource(manifest.id)
        ? Droplets
        : (drawnIcon ?? ENVIRONMENT_ICONS[manifest.id] ?? animationIcon(manifest.id));
      return (
        <span className={`flex items-center justify-center ${large ? 'size-40' : 'size-20'}`}>
          <Icon className={large ? 'size-16' : 'size-8'} strokeWidth={1.6} aria-hidden />
        </span>
      );
    }
    // Real 3D models of the place's style (P2-38) show their rendered picture.
    const core = getCoreItem(manifest.id);
    const modelPicture = coreLibraryPicture(core, style);
    if (modelPicture)
      return (
        <img
          src={modelPicture}
          alt=""
          loading="lazy"
          className={`object-contain ${large ? 'size-40' : 'mt-1.5 mb-1 size-[4.5rem]'}`}
        />
      );
    const ground = manifest.subcategory === 'ground' ? getGround(manifest.id) : undefined;
    if (ground)
      return (
        <img
          src={ground.picture}
          alt=""
          loading="lazy"
          className={`rounded-lg object-cover ${large ? 'size-40' : 'mt-1.5 mb-1 size-[4.5rem]'}`}
        />
      );
    const road = manifest.subcategory === 'roads';
    return (
      <Preview
        runtime={runtime}
        kind={road ? 'road' : 'item'}
        entry={{
          id: manifest.id,
          name: manifest.name,
          Icon: road ? Route : itemIcon(manifest.id),
          // Creator items: the picture from item analysis, else the engine draws the package.
          ...(isStoreEntry(entry) ? { picture: entry.picture } : {}),
        }}
        selected={selected}
        large={large}
      />
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex gap-1.5">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-paper px-2.5 py-1.5">
          <Search className="size-4 text-ink/50" aria-hidden />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search the library"
            aria-label="Search the library"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          />
        </label>
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-label="Filters"
          title="Filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`relative flex size-9 shrink-0 items-center justify-center rounded-xl ${
            filtersOpen ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
          }`}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {activeFilters > 0 ? (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-ink text-[10px] font-black text-on-brand ring-2 ring-surface">
              {activeFilters}
            </span>
          ) : null}
        </button>
      </div>

      <p role="status" aria-label="Library world style" className="rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-[11px] font-semibold">{style === 'blocky' ? 'Simple' : style === 'anime' ? 'Cartoon' : style === 'voxel' ? 'Voxel' : 'Realistic'} world · compatible items only</p>
      {catalogLoading ? <p role="status" className="text-xs">Loading marketplace…</p> : null}
      {catalogError ? <div role="alert" className="text-xs"><p>{catalogError}</p><button type="button" onClick={() => setCatalogRetry(value => value + 1)}>Retry marketplace</button></div> : null}
      {filtersOpen ? (
        <div className="flex flex-col gap-2 rounded-xl border border-ink/10 p-2">
          <p className="text-[11px] font-black text-ink/50 uppercase">Price</p>
          <Chips options={PRICES} value={price} onChange={setPrice} />
          <p className="text-[11px] font-black text-ink/50 uppercase">Made by</p>
          <Chips options={host.platform || host.catalog ? SOURCES : SOURCES.filter(option => option.value === 'core' || !option.value)} value={source} onChange={setSource} />

        </div>
      ) : null}

      <div role="tablist" aria-label="Kinds" className="scroll-row flex gap-1 overflow-x-auto pb-0.5">
        {kinds.filter(entry => host.platform || entry.id !== 'free').map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={kind === entry.id}
            onClick={() => {
              setKind(entry.id);
              // The Free tab opens the Free sources window at once (owner, 2026-10-06).
              if (entry.id === 'free') setFreeOpen(true);
              setGroup(undefined);
              setDetails(null);
            }}
            className={`flex shrink-0 flex-col items-center rounded-lg px-2 py-1 text-[11px] font-bold ${
              kind === entry.id ? 'bg-ink text-on-brand' : 'text-ink/60 hover:bg-ink/5'
            }`}
          >
            <entry.Icon className="size-4" aria-hidden />
            {entry.label}
          </button>
        ))}
      </div>

      {section.groups ? (
        <Chips
          options={[
            { label: 'All' },
            ...section.groups.map((g) => ({ label: g.label, value: 'ids' in g ? g.value : g.subcategory })),
          ]}
          value={group}
          onChange={setGroup}
        />
      ) : null}

      {kind === 'free' ? (
        <button
          type="button"
          onClick={() => setFreeOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-left text-on-brand"
        >
          <Globe className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-black">Browse free sources</span>
            <span className="block truncate text-[11px] text-on-brand/70">
              Poly Haven, Kenney and Sketchfab, all free
            </span>
          </span>
        </button>
      ) : null}
      {freeOpen ? (
        <FreeSourcesWindow
          inLibrary={externalById}
          onClose={() => setFreeOpen(false)}
          onPick={(entry, added) => {
            if (added)
              setExternal((before) => [...before.filter((e) => e.manifest.id !== entry.manifest.id), entry]);
            setFreeOpen(false);
            use(entry);
          }}
        />
      ) : null}
      {host.presentationControls && ['moves', 'effects', 'notifications', 'cards'].includes(kind) ? <div className="overflow-y-auto space-y-3">{kind === 'moves' ? host.userAvatarControls?.('motions', text) : null}{host.presentationControls(kind === 'moves' ? 'motions' : kind as 'effects' | 'notifications' | 'cards', text)}{kind === 'moves' ? host.presentationControls('expressions', text) : null}</div> : null}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5 overflow-y-auto pr-1">
        {entries.length === 0 && !(host.presentationControls && ['effects', 'notifications', 'cards'].includes(kind)) ? (
          <div className="col-span-full flex flex-col items-start gap-2 px-1 py-4 text-sm text-ink/50">
            <p>{section.empty ?? `No compatible items found for this ${style === 'blocky' ? 'Simple' : style} world.`}</p>
          </div>
        ) : null}
        {(host.presentationControls && ['notifications', 'cards'].includes(kind) ? [] : entries).map((entry) => {
          const { manifest } = entry;
          const selected = selectedId === manifest.id || details?.manifest.id === manifest.id;
          return (
            <button
              key={manifest.id}
              type="button"
              aria-pressed={selected}
              title={manifest.name}
              onClick={() => use(entry)}
              className={`relative flex flex-col items-center rounded-xl px-1 pb-1.5 text-[11px] font-bold ${
                selected ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
              }`}
            >
              <span
                className={`absolute top-1 right-1 rounded-md px-1 text-[9px] font-black uppercase ${
                  selected ? 'bg-on-brand/20' : 'bg-surface text-ink/60'
                }`}
              >
                {priceLabel(manifest)}
              </span>
              {picture(entry, selected)}
              <span className="w-full truncate text-center">{manifest.name}</span>
            </button>
          );
        })}
      </div>

      {selectionError ? (
        <p role="alert" className="text-xs text-red-600">
          {selectionError}
        </p>
      ) : null}
      {details && getOceanResource(details.manifest.id) ? (
        <OceanResourceControls
          key={details.manifest.id}
          runtime={runtime}
          resource={getOceanResource(details.manifest.id)!}
        />
      ) : null}
      {details ? (
        <div className="flex gap-2 rounded-xl border border-ink/10 p-2">
          <div className="shrink-0 overflow-hidden rounded-lg bg-paper">{picture(details, false, true)}</div>
          <dl className="min-w-0 text-xs">
            <dt className="sr-only">Name</dt>
            <dd className="truncate text-sm font-black">{details.manifest.name}</dd>
            <dt className="sr-only">Kind</dt>
            <dd className="text-ink/60">
              {details.manifest.category} / {details.manifest.subcategory}
            </dd>
            <dt className="mt-1.5 font-bold text-ink/50">Price</dt>
            <dd className="font-bold">{priceLabel(details.manifest)}</dd>
            <dt className="mt-1.5 font-bold text-ink/50">Made by</dt>
            <dd>{details.manifest.author.name}</dd>
            {details.manifest.origin ? <OriginLine origin={details.manifest.origin} /> : null}
            {(() => {
              const core = getCoreItem(details.manifest.id);
              const look = core ? itemModelLook(core, style) : null;
              return look ? (
                <>
                  <dt className="mt-1.5 font-bold text-ink/50">Size</dt>
                  <dd>
                    {look.model.levels
                      .map(
                        (level) =>
                          `${level.triangles.toLocaleString()} tri, ${(level.bytes / 1e6).toFixed(1)} MB`,
                      )
                      .join(' / ')}
                  </dd>
                </>
              ) : null;
            })()}
            {getGround(details.manifest.id) ? (
              <>
                <dt className="mt-1.5 font-bold text-ink/50">Size</dt>
                <dd>
                  {getGround(details.manifest.id)!
                    .files.map((files) => `${files.size}: ${(files.bytes / 1e6).toFixed(1)} MB`)
                    .join(', ')}
                </dd>
              </>
            ) : null}
            <dt className="mt-1.5 font-bold text-ink/50">Styles</dt>
            <dd>{details.manifest.styles.join(', ')}</dd>
            {isStoreEntry(details) && details.caption ? (
              <>
                <dt className="sr-only">About</dt>
                <dd className="mt-1.5 line-clamp-3 text-ink/70">{details.caption}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
