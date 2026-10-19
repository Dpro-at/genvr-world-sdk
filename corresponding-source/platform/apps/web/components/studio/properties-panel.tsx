'use client';

import { useStructureFocus } from '../../lib/structure-focus';
import { StructureProperties } from './structure-properties';
import {
  CORE_SURFACES,
  describeGeneratedControls,
  getCoreItem,
  getLibraryItem,
  SPAWN_POINT_ID,
  zoneShapeOfItem,
} from '@genvr/core-library';
import { asksForRest, type GenvrRuntime, type SelectedWater, type ToolStatus } from '@genvr/runtime';
import {
  Anchor,
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Group,
  Lock,
  LockOpen,
  Move,
  MousePointer2,
  RotateCw,
  Trash,
  Ungroup,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type RefObject } from 'react';
import { rideTags, zoneTags } from '../../lib/rules-edit';
import {
  shapeChoices,
  shapePatch,
  tagPatch,
  visiblePatch,
  zoneSettings,
  type ParamsPatch,
  type ZoneShapeChoice,
} from '../../lib/zone-settings';
import {
  canGroup,
  groupSelection,
  selectionAnchored,
  setSelectionFlags,
  ungroupSelection,
} from './selection-actions';
import { RideSection } from './ride-section';
import { PropertyTabs } from './property-tabs';
import { GeneratedControls } from './generated-controls';
import { SaveBuilderItemButton } from './save-builder-item';

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** Teams a spawn point serves (P9-12); any is the default and is stored as no param. */
const SPAWN_TEAMS = [
  { key: 'any', label: 'Any' },
  { key: 'red', label: 'Red' },
  { key: 'blue', label: 'Blue' },
] as const;

const ZONE_SHAPE_LABELS: Record<ZoneShapeChoice, string> = { off: 'Off', area: 'Area', gate: 'Gate' };

/**
 * Zone settings of the selected item (generic rules): any item can be a zone, an area players
 * enter and leave or a gate they cross forward, named by a tag the game's rules listen for. Each
 * change is one `set_item_params` command, so undo and co-building work as for any look.
 */
function ZoneSection({
  params,
  itemShape,
  worldTags,
  onPatch,
}: {
  params: Readonly<Record<string, unknown>>;
  itemShape: 'area' | 'gate' | undefined;
  worldTags: readonly string[];
  onPatch: (patch: ParamsPatch) => void;
}) {
  const zone = zoneSettings(params, itemShape);
  const [draft, setDraft] = useState<string | null>(null);
  const listId = useId();
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const patch = tagPatch(draft);
    if ((patch.zoneTag ?? '') !== zone.tag.trim()) onPatch(patch);
  };
  const choices = shapeChoices(itemShape);
  return (
    <section className="flex flex-col gap-1.5">
      <p className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Zone</p>
      <div className={`grid gap-1.5 ${choices.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {choices.map((shape) => (
          <button
            key={shape}
            type="button"
            aria-pressed={zone.shape === shape}
            onClick={() => zone.shape !== shape && onPatch(shapePatch(shape, itemShape))}
            className={`min-h-11 rounded-md text-[11px] font-bold md:min-h-8 ${
              zone.shape === shape ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
            }`}
          >
            {ZONE_SHAPE_LABELS[shape]}
          </button>
        ))}
      </div>
      {zone.shape !== 'off' ? (
        <>
          <label className="flex items-center gap-1 text-xs">
            <span className="w-12 shrink-0 font-bold text-ink/60">Tag</span>
            <input
              value={draft ?? zone.tag}
              maxLength={40}
              list={listId}
              placeholder="Name it for the rules"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') commit();
                if (event.key === 'Escape') setDraft(null);
              }}
              aria-label="Zone tag"
              className="h-11 w-full min-w-0 rounded-md bg-paper px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-ink/30 md:h-7"
            />
            <datalist id={listId}>
              {worldTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold md:min-h-7">
            <input
              type="checkbox"
              checked={zone.visible}
              onChange={(event) => onPatch(visiblePatch(event.target.checked))}
              className="size-4 accent-current"
            />
            Players see it while playing
          </label>
          <p className="text-[11px] text-ink/50">
            {zone.active
              ? zone.shape === 'gate'
                ? 'Rules hear players crossing it the way it faces.'
                : 'Rules hear players entering and leaving it.'
              : 'Give it a tag so the rules can use it.'}
          </p>
        </>
      ) : null}
    </section>
  );
}

/** Item colors (content, not UI): bright enough for kids' worlds; none keeps the item's own. */
const PALETTE = [
  '#fafafa',
  '#9e9e9e',
  '#212121',
  '#e53935',
  '#fb8c00',
  '#fdd835',
  '#43a047',
  '#00acc1',
  '#1e88e5',
  '#8e24aa',
  '#d81b60',
  '#6d4c41',
];

const yawOf = (q: Quat) => 2 * Math.atan2(q[1], q[3]);
const yawQuat = (yaw: number): Quat => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
const tidy = (value: number) => Math.round(value * 1000) / 1000;
const degrees = (radians: number) => {
  const d = Math.round((radians * 180) / Math.PI) % 360;
  return d < 0 ? d + 360 : d;
};

/** A number field that applies on Enter or when leaving it, with step buttons. */
function NumberField({
  label,
  value,
  step,
  unit,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  unit: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
  };
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-12 shrink-0 font-bold text-ink/60">{label}</span>
      <button
        type="button"
        aria-label={`${label} minus ${step}`}
        onClick={() => onCommit(tidy(value - step))}
        className="rounded-md p-1 text-ink/50 hover:bg-ink/10 hover:text-ink"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
      </button>
      <input
        inputMode="decimal"
        value={draft ?? String(tidy(value))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
        aria-label={label}
        className="h-7 w-full min-w-0 rounded-md bg-paper px-2 text-right font-mono text-xs font-bold outline-none focus:ring-2 focus:ring-ink/30"
      />
      <button
        type="button"
        aria-label={`${label} plus ${step}`}
        onClick={() => onCommit(tidy(value + step))}
        className="rounded-md p-1 text-ink/50 hover:bg-ink/10 hover:text-ink"
      >
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
      <span className="w-5 shrink-0 text-ink/40">{unit}</span>
    </label>
  );
}

/** Name of the selection (an item or a group); applies on Enter or when leaving the field. */
function NameField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (name: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const name = draft.trim().slice(0, 64);
    setDraft(null);
    if (name !== value) onCommit(name || null);
  };
  return (
    <input
      value={draft ?? value}
      placeholder={placeholder}
      maxLength={64}
      aria-label="Name"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
      className="h-9 w-full min-w-0 rounded-lg bg-paper px-2 text-lg font-black outline-none placeholder:text-ink/40 focus:ring-2 focus:ring-ink/30"
    />
  );
}

/**
 * Studio properties (P3-06, P3-24, P3-26): the selected item's name, lock, anchor, exact position, turn, and size (each
 * change is one `transform_item` command: undo, saving, and co-building just work), and actions.
 */
export function PropertiesPanel({
  runtime,
  status,
  grid,
  angle,
  placeId,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
  /** Snapping steps from the top bar (grid in meters, turn in degrees). */
  grid: number;
  angle: number;
  placeId?: string;
}) {
  const [, redraw] = useState(0);
  const structure = useStructureFocus();
  const rt = () => runtime.current;
  const instance = status.selected
    ? rt()?.world.instances.find((entry) => entry.instanceId === status.selected?.instanceId)
    : undefined;

  // A lake or a river picked in the 3D view has its own settings (P2-39).
  if (!status.selected && status.water && rt()) {
    return <WaterProperties runtime={runtime} picked={status.water} onChange={() => redraw((n) => n + 1)} />;
  }

  if (!status.selected && structure) return <StructureProperties runtime={runtime} focus={structure} />;

  if (!status.selected || !instance) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-ink/60">
        <p>Nothing selected.</p>
        <button
          type="button"
          onClick={() => rt()?.setTool('select')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1.5 font-bold text-ink hover:bg-ink/10"
        >
          <MousePointer2 className="size-4" aria-hidden />
          Select tool
        </button>
      </div>
    );
  }

  const runtimeNow = rt()!;
  const selection = status.selected;
  const many = selection.instanceIds.length > 1;
  const locked = selection.locked;
  const anchored = selectionAnchored(runtimeNow, selection);
  const group = selection.groupId ? runtimeNow.world.groups.find((g) => g.id === selection.groupId) : null;
  const rename = (name: string | null) => {
    if (group) {
      if (name) runtimeNow.applyCommand({ type: 'rename', params: { kind: 'group', id: group.id, name } });
    } else if (!many) {
      runtimeNow.applyCommand({ type: 'rename', params: { kind: 'item', id: instance.instanceId, name } });
    }
    redraw((n) => n + 1);
  };
  const header = (
    <div className="flex flex-col gap-1.5">
      {placeId && <SaveBuilderItemButton placeId={placeId} runtime={runtime} instanceIds={selection.instanceIds} />}
      <p className="text-xs font-bold text-ink/50 uppercase">
        {group ? `Group of ${selection.instanceIds.length}` : many ? 'Selected' : 'Name'}
      </p>
      {group || !many ? (
        <NameField
          key={group?.id ?? instance.instanceId}
          value={group ? group.name : (instance.name ?? '')}
          placeholder={rt()?.itemName(instance.itemId) ?? 'Item'}
          onCommit={rename}
        />
      ) : (
        <p className="text-lg font-black">{selection.name}</p>
      )}
      {status.moving ? <p className="text-sm text-ink/60">Click where it should go.</p> : null}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-pressed={locked}
          onClick={() => {
            setSelectionFlags(runtimeNow, selection, { locked: !locked });
            redraw((n) => n + 1);
          }}
          title="Locked items cannot be picked or changed in the 3D view"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold ${
            locked ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
          }`}
        >
          {locked ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
          {locked ? 'Locked' : 'Lock'}
        </button>
        <button
          type="button"
          aria-pressed={anchored}
          onClick={() => {
            setSelectionFlags(runtimeNow, selection, { anchored: !anchored });
            redraw((n) => n + 1);
          }}
          title="Anchored items stay put; others fall and can be pushed while playing"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold ${
            anchored ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
          }`}
        >
          <Anchor className="size-4" aria-hidden />
          {anchored ? 'Anchored' : 'Loose'}
        </button>
        {/* Settle (P2-11): fall and come to rest with physics, saved as one undo step. */}
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            runtimeNow.settleItems(selection.instanceIds);
            redraw((n) => n + 1);
          }}
          title="Let it fall and come to rest, like in play (one undo step)"
          className="col-span-2 inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-sm font-bold text-ink hover:bg-ink/10 disabled:opacity-40"
        >
          <ArrowDownToLine className="size-4" aria-hidden />
          {many ? 'Let them fall' : 'Let it fall'}
        </button>
      </div>
      {locked ? <p className="text-xs text-ink/60">Unlock it to change it.</p> : null}
    </div>
  );

  if (many) {
    const groupActions: Array<{ label: string; Icon: LucideIcon; run: () => void; danger?: boolean }> = [
      { label: 'Turn (R)', Icon: RotateCw, run: () => rt()?.rotateItem() },
      canGroup(runtimeNow, selection)
        ? { label: 'Group', Icon: Group, run: () => groupSelection(runtimeNow, selection) }
        : { label: 'Ungroup', Icon: Ungroup, run: () => ungroupSelection(runtimeNow, selection) },
      { label: 'Delete', Icon: Trash, run: () => rt()?.deleteItem(), danger: true },
    ];
    return (
      <div className="flex flex-col gap-3">
        {header}
        <fieldset disabled={locked} className="grid grid-cols-2 gap-1.5 disabled:opacity-40">
          {groupActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-2 text-sm font-bold hover:bg-ink/10 ${
                action.danger ? 'text-coral' : 'text-ink'
              }`}
            >
              <action.Icon className="size-4" aria-hidden />
              {action.label}
            </button>
          ))}
        </fieldset>
        <p className="text-xs text-ink/60">
          Drag the handles to move or turn them together; arrow keys nudge them.
        </p>
      </div>
    );
  }

  const rules = rt()?.itemRules(instance.instanceId) ?? null;
  const { position, rotation, scale } = instance.transform as {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
  };
  const transform = (params: { position?: Vec3; rotation?: Quat; scale?: Vec3; rest?: true }) => {
    rt()?.applyCommand({ type: 'transform_item', params: { instanceId: instance.instanceId, ...params } });
    redraw((n) => n + 1);
  };
  const move = (axis: 0 | 1 | 2, value: number) => {
    const next = [...position] as Vec3;
    next[axis] = tidy(value);
    // Across the ground it rests where it arrives (P2-43); a typed height is kept on purpose, and a
    // grid block keeps its exact cell.
    const rest = asksForRest(getCoreItem(instance.itemId)?.grid ?? null, axis);
    transform({ position: next, ...(rest ? { rest: true as const } : {}) });
  };
  const step = grid > 0 ? grid : 0.1;
  const size = Math.round((scale[0] ?? 1) * 100);
  const resizable = getCoreItem(instance.itemId)?.resizable ?? false;
  const look = (params: ParamsPatch) => {
    rt()?.applyCommand({ type: 'set_item_params', params: { instanceId: instance.instanceId, params } });
    redraw((n) => n + 1);
  };
  const color = typeof instance.params.color === 'string' ? instance.params.color : null;
  const material = typeof instance.params.material === 'string' ? instance.params.material : 'plastic';
  const team =
    instance.params.team === 'red' || instance.params.team === 'blue' ? instance.params.team : 'any';
  const stretch = (axis: 0 | 1 | 2, meters: number) => {
    const next = [...scale] as Vec3;
    next[axis] = tidy(Math.min(50, Math.max(0.1, meters)));
    transform({ scale: next });
  };

  const actions: Array<{ label: string; Icon: LucideIcon; run: () => void; danger?: boolean }> = [
    { label: 'Turn (R)', Icon: RotateCw, run: () => rt()?.rotateItem() },
    { label: 'Move', Icon: Move, run: () => rt()?.moveItem() },
    { label: 'Copy', Icon: Copy, run: () => rt()?.duplicateItem() },
    { label: 'Row of 4', Icon: Columns3, run: () => rt()?.rowItems(4) },
    { label: 'Delete', Icon: Trash, run: () => rt()?.deleteItem(), danger: true },
  ];
  return (
    <div className="flex flex-col gap-3">
      {header}
      <div className="flex flex-col gap-3">
        <PropertyTabs key={instance.instanceId} disabled={locked} sections={[
          { id: 'transform', label: 'Transform', content: <>
        <section className="flex flex-col gap-1.5">
          <p className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Position</p>
          <NumberField label="X" value={position[0]} step={step} unit="m" onCommit={(v) => move(0, v)} />
          <NumberField label="Height" value={position[1]} step={step} unit="m" onCommit={(v) => move(1, v)} />
          <NumberField label="Z" value={position[2]} step={step} unit="m" onCommit={(v) => move(2, v)} />
        </section>
        <section className="flex flex-col gap-1.5">
          <p className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Turn and size</p>
          <NumberField
            label="Turn"
            value={degrees(yawOf(rotation))}
            step={angle}
            unit="°"
            onCommit={(v) => transform({ rotation: yawQuat((v * Math.PI) / 180).map(tidy) as Quat })}
          />
          {resizable ? (
            <>
              <NumberField
                label="Width"
                value={scale[0]}
                step={step}
                unit="m"
                onCommit={(v) => stretch(0, v)}
              />
              <NumberField
                label="Height"
                value={scale[1]}
                step={step}
                unit="m"
                onCommit={(v) => stretch(1, v)}
              />
              <NumberField
                label="Depth"
                value={scale[2]}
                step={step}
                unit="m"
                onCommit={(v) => stretch(2, v)}
              />
            </>
          ) : (
            <NumberField
              label="Size"
              value={size}
              step={10}
              unit="%"
              onCommit={(v) => {
                const factor = Math.min(10, Math.max(0.1, v / 100));
                transform({ scale: [factor, factor, factor].map(tidy) as Vec3 });
              }}
            />
          )}
        </section>
        {rules && rules.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            {/* Debug view of the item's own placement rules (P2-11, owner note). */}
            <p className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Placement rules</p>
            <ul className="flex flex-col gap-1 text-xs">
              {rules.map((rule) => (
                <li key={rule.rule} className="flex items-start gap-1.5">
                  {rule.ok ? (
                    <Check className="mt-px size-3.5 shrink-0 text-ink/50" aria-label="Kept" />
                  ) : (
                    <X className="mt-px size-3.5 shrink-0 text-coral" aria-label="Broken" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={rule.ok ? 'text-ink/70' : 'font-bold text-ink'}>{rule.label}</span>
                    {rule.message ? <span className="block text-ink/60">{rule.message}</span> : null}
                  </span>
                  {rule.fix ? (
                    <button
                      type="button"
                      onClick={() => {
                        rt()?.applyBatch(rule.fix!);
                        redraw((n) => n + 1);
                      }}
                      className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 font-bold text-on-brand hover:bg-ink/85"
                    >
                      Fix
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
          </> },
          { id: 'appearance', label: 'Appearance', content: <>
        <section className="flex flex-col gap-1.5">
          <p className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Color</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={color === null}
              onClick={() => look({ color: null })}
              className={`h-7 rounded-md px-2 text-[11px] font-bold ${color === null ? 'bg-ink text-on-brand' : 'bg-paper text-ink/60'}`}
            >
              Own
            </button>
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Color ${swatch}`}
                aria-pressed={color === swatch}
                onClick={() => look({ color: swatch })}
                className={`size-7 rounded-md ring-offset-1 ring-offset-surface ${
                  color === swatch ? 'ring-2 ring-ink' : 'ring-1 ring-ink/15'
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
            <label
              className="relative size-7 cursor-pointer overflow-hidden rounded-md ring-1 ring-ink/15"
              title="Any color"
            >
              <input
                type="color"
                value={color ?? '#ffffff'}
                onChange={(event) => look({ color: event.target.value })}
                aria-label="Any color"
                className="absolute -inset-2 size-12 cursor-pointer"
              />
            </label>
          </div>
        </section>
        <section className="flex flex-col gap-1.5">
          <p className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Material</p>
          <div className="grid grid-cols-3 gap-1.5">
            {CORE_SURFACES.map((surface) => (
              <button
                key={surface.key}
                type="button"
                aria-pressed={material === surface.key}
                onClick={() => look({ material: surface.key === 'plastic' ? null : surface.key })}
                className={`rounded-md py-1.5 text-[11px] font-bold ${
                  material === surface.key ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
                }`}
              >
                {surface.manifest.name}
              </button>
            ))}
          </div>
        </section>
          </> },
          { id: 'behavior', label: 'Behavior', content: <>
        {instance.itemId === SPAWN_POINT_ID ? (
          <section className="flex flex-col gap-1.5">
            <p className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Team</p>
            <div className="grid grid-cols-3 gap-1.5">
              {SPAWN_TEAMS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={team === option.key}
                  onClick={() => look({ team: option.key === 'any' ? null : option.key })}
                  className={`min-h-11 rounded-md text-[11px] font-bold md:min-h-8 ${
                    team === option.key ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink/50">Players of this team start here in a game with teams.</p>
          </section>
        ) : null}
        <ZoneSection
          key={instance.instanceId}
          params={instance.params}
          itemShape={zoneShapeOfItem(instance.itemId)}
          worldTags={zoneTags(runtimeNow.world.instances, zoneShapeOfItem)}
          onPatch={look}
        />
        <RideSection
          key={`ride-${instance.instanceId}`}
          params={instance.params}
          itemDefault={getLibraryItem(instance.itemId)?.manifest.ride}
          sideView={runtimeNow.playView === 'side'}
          worldTags={rideTags(runtimeNow.world.instances, (id) => getLibraryItem(id)?.manifest.ride)}
          onPatch={look}
        />
          </> },
          ...(describeGeneratedControls(instance.itemId)?.controls.length ? [{ id: 'settings', label: 'Item settings', managesDisabled: true, content:
            <GeneratedControls key={instance.instanceId} itemId={instance.itemId} params={instance.params} disabled={locked} onPatch={look} />
          }] : []),
        ]} />
        <fieldset disabled={locked} className="grid grid-cols-2 gap-1.5 disabled:opacity-40">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-2 text-sm font-bold hover:bg-ink/10 ${
                action.danger ? 'text-coral' : 'text-ink'
              }`}
            >
              <action.Icon className="size-4" aria-hidden />
              {action.label}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

/**
 * Settings of the lake or river picked in the 3D view (P2-39). Before this, a river could only be
 * changed by drawing a new one: nothing in the studio could select water at all. Each change is
 * one command, so undo and saving work as everywhere else, and the slider applies when it is let
 * go so dragging makes a single undo step.
 */
function WaterProperties({
  runtime,
  picked,
  onChange,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  picked: SelectedWater;
  onChange: () => void;
}) {
  const rt = () => runtime.current;
  const world = rt()?.world;
  const river = picked.kind === 'river' ? world?.environment.rivers.find((r) => r.id === picked.id) : null;
  const lake = picked.kind === 'water' ? world?.environment.water.find((w) => w.id === picked.id) : null;
  const [draft, setDraft] = useState<Record<string, number>>({});
  const apply = (command: Parameters<GenvrRuntime['applyCommand']>[0]) => {
    rt()?.applyCommand(command);
    onChange();
  };
  const slider = (
    key: string,
    label: string,
    value: number,
    shown: string,
    min: number,
    max: number,
    step: number,
    commit: (value: number) => void,
  ) => {
    const now = draft[key] ?? value;
    const done = () => {
      if (draft[key] !== undefined && draft[key] !== value) commit(draft[key]!);
      setDraft((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    };
    return (
      <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        <span className="flex justify-between gap-3">
          {label}
          <span className="text-ink">{draft[key] !== undefined ? `${now}` : shown}</span>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={now}
          onChange={(event) => setDraft((c) => ({ ...c, [key]: Number(event.target.value) }))}
          onPointerUp={done}
          onKeyUp={done}
          onBlur={done}
          className="accent-ink"
        />
      </label>
    );
  };

  if (!river && !lake) return <p className="text-sm text-ink/60">That water is gone.</p>;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <h3 className="text-[11px] font-black tracking-wide text-ink/50 uppercase">
        {river ? (river.name ?? 'River') : (lake!.name ?? 'Water')}
      </h3>
      {river ? (
        <>
          {slider(
            'width',
            'Width',
            river.width,
            `${river.width} m · ${river.width >= 11 ? 'swim' : 'wade'}`,
            2,
            40,
            1,
            (width) => apply({ type: 'edit_river', params: { riverId: river.id, width } }),
          )}
          {slider(
            'widen',
            'Wider downstream',
            river.widen,
            `${Math.round((river.widen - 1) * 100)}%`,
            1,
            2,
            0.1,
            (widen) => apply({ type: 'edit_river', params: { riverId: river.id, widen } }),
          )}
          {slider(
            'flow',
            'Current',
            river.flow,
            river.flow < 1 ? 'Slow' : river.flow < 3 ? 'Normal' : 'Fast',
            0,
            6,
            0.5,
            (flow) => apply({ type: 'edit_river', params: { riverId: river.id, flow } }),
          )}
        </>
      ) : (
        slider(
          'level',
          'Water level',
          lake!.level,
          `${lake!.level} m`,
          lake!.level - 10,
          lake!.level + 10,
          0.5,
          (level) => apply({ type: 'set_water_level', params: { waterId: lake!.id, level } }),
        )
      )}
      <button
        type="button"
        onClick={() =>
          apply(
            river
              ? { type: 'remove_river', params: { riverId: river.id } }
              : { type: 'remove_water', params: { waterId: lake!.id } },
          )
        }
        className="self-start rounded-lg bg-paper px-2.5 py-1.5 text-xs font-bold text-coral hover:bg-coral/10"
      >
        Remove
      </button>
    </div>
  );
}
