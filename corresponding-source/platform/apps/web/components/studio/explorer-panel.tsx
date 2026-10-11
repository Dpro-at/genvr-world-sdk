'use client';

import type { WorldDocument } from '@genvr/contracts';
import { getCoreItem } from '@genvr/core-library';
import type { GenvrRuntime, ToolStatus } from '@genvr/runtime';
import {
  Anchor,
  Box,
  BrickWall,
  ChevronRight,
  Cloud,
  Folder,
  Group,
  Lock,
  LockOpen,
  Route,
  Search,
  Ungroup,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import {
  canGroup,
  groupSelection,
  selectionAnchored,
  selectionFloats,
  setSelectionFlags,
  ungroupSelection,
} from './selection-actions';

type Kind = 'item' | 'road' | 'wall' | 'water' | 'river' | 'group';

interface Row {
  kind: Kind;
  id: string;
  name: string;
  /** Item ids this row selects (an item, or every member of a group). */
  select: string[];
  locked?: boolean;
  unanchored?: boolean;
  children?: Row[];
}

interface Section {
  label: string;
  Icon: LucideIcon;
  rows: Row[];
}

/** Rows shown per section before asking to search (large places have thousands of items). */
const MAX_ROWS = 300;

/** Names of item types: Core Library or uploaded packages the engine loaded (P2-16). */
type ItemNames = (itemId: string) => string | null;

const itemName = (instance: WorldDocument['instances'][number], names: ItemNames) =>
  instance.name ?? getCoreItem(instance.itemId)?.manifest.name ?? names(instance.itemId) ?? instance.itemId;

/** The place as a tree: groups with their items, loose items, roads, walls, and water. */
function sections(world: WorldDocument, names: ItemNames): Section[] {
  const itemRow = (instance: WorldDocument['instances'][number]): Row => ({
    kind: 'item',
    id: instance.instanceId,
    name: itemName(instance, names),
    select: [instance.instanceId],
    locked: instance.locked === true,
    unanchored: instance.anchored === false,
  });
  const members = new Map<string, Row[]>();
  const loose: Row[] = [];
  for (const instance of world.instances) {
    if (instance.groupId) {
      const list = members.get(instance.groupId) ?? [];
      list.push(itemRow(instance));
      members.set(instance.groupId, list);
    } else loose.push(itemRow(instance));
  }
  const groups: Row[] = world.groups.map((group) => {
    const children = members.get(group.id) ?? [];
    return {
      kind: 'group',
      id: group.id,
      name: group.name,
      select: children.map((child) => child.id),
      locked: children.length > 0 && children.every((child) => child.locked),
      unanchored: children.some((child) => child.unanchored),
      children,
    };
  });
  const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
  return [
    { label: 'Items', Icon: Box, rows: [...groups.sort(byName), ...loose.sort(byName)] },
    {
      label: 'Roads',
      Icon: Route,
      rows: world.roads.map((road, i) => ({
        kind: 'road',
        id: road.id,
        name: road.name ?? `Road ${i + 1}`,
        select: [],
      })),
    },
    {
      label: 'Walls and rooms',
      Icon: BrickWall,
      rows: world.walls.map((wall, i) => ({
        kind: 'wall',
        id: wall.id,
        name: wall.name ?? `${wall.closed ? 'Room' : 'Wall'} ${i + 1}`,
        select: [],
      })),
    },
    {
      label: 'Water',
      Icon: Waves,
      rows: [
        ...world.environment.water.map((water, i) => ({
          kind: 'water' as const,
          id: water.id,
          name: water.name ?? `${water.kind[0]!.toUpperCase()}${water.kind.slice(1)} ${i + 1}`,
          select: [],
        })),
        ...world.environment.rivers.map((river, i) => ({
          kind: 'river' as const,
          id: river.id,
          name: river.name ?? `River ${i + 1}`,
          select: [],
        })),
      ],
    },
  ];
}

const matches = (row: Row, query: string): boolean =>
  row.name.toLowerCase().includes(query) || Boolean(row.children?.some((child) => matches(child, query)));

const ROW_ICON: Record<Kind, LucideIcon> = {
  item: Box,
  group: Folder,
  road: Route,
  wall: BrickWall,
  water: Waves,
  river: Waves,
};

/**
 * Studio explorer (P3-26): every object in the place as a tree. Click to select (Ctrl or Shift
 * adds to the selection), double-click or F2 to rename; group, lock, and anchor the selection.
 */
export function ExplorerPanel({
  runtime,
  status,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
}) {
  const [tree, setTree] = useState<Section[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({ Items: true });
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ kind: Kind; id: string; draft: string } | null>(null);
  /** Last clicked road, wall, or water row (they are not selectable in the 3D view yet). */
  const [focused, setFocused] = useState<string | null>(null);
  const rt = () => runtime.current;
  const selection = status.selected;
  const selected = new Set(selection?.instanceIds ?? []);

  useEffect(() => {
    const read = () => {
      if (runtime.current) setTree(sections(runtime.current.world, runtime.current.itemName));
    };
    read();
    // Edits by other builders and undo arrive without a status change: read once a second too.
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, [runtime, status]);

  const click = (row: Row, additive: boolean) => {
    const runtimeNow = rt();
    if (!runtimeNow) return;
    if (row.select.length === 0) {
      setFocused(`${row.kind}:${row.id}`);
      return;
    }
    setFocused(null);
    if (!additive) {
      runtimeNow.selectItems(row.select);
      return;
    }
    // Ctrl or Shift: add the row to the selection, or take it out when it is all selected.
    const all = row.select.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of row.select) {
      if (all) next.delete(id);
      else next.add(id);
    }
    runtimeNow.selectItems([...next]);
  };

  const rename = () => {
    if (!editing) return;
    const name = editing.draft.trim().slice(0, 64);
    setEditing(null);
    const runtimeNow = rt();
    if (!runtimeNow) return;
    if (!name && editing.kind === 'group') return;
    runtimeNow.applyCommand({
      type: 'rename',
      params: { kind: editing.kind, id: editing.id, name: name || null },
    });
    setTree(sections(runtimeNow.world, runtimeNow.itemName));
  };

  const startRename = (row: Row) => setEditing({ kind: row.kind, id: row.id, draft: row.name });

  const runtimeNow = rt();
  const anchored = runtimeNow && selection ? selectionAnchored(runtimeNow, selection) : true;
  const floats = runtimeNow && selection ? selectionFloats(runtimeNow, selection) : false;
  const tools: Array<{ label: string; Icon: LucideIcon; on?: boolean; disabled: boolean; run: () => void }> =
    [
      {
        label: 'Group',
        Icon: Group,
        disabled: !runtimeNow || !canGroup(runtimeNow, selection),
        run: () => runtimeNow && selection && groupSelection(runtimeNow, selection),
      },
      {
        label: 'Ungroup',
        Icon: Ungroup,
        disabled: !selection?.groupId,
        run: () => runtimeNow && selection && ungroupSelection(runtimeNow, selection),
      },
      {
        label: selection?.locked ? 'Unlock' : 'Lock',
        Icon: selection?.locked ? Lock : LockOpen,
        on: Boolean(selection?.locked),
        disabled: !selection,
        run: () =>
          runtimeNow && selection && setSelectionFlags(runtimeNow, selection, { locked: !selection.locked }),
      },
      {
        label: anchored ? 'Anchored' : 'Not anchored',
        Icon: Anchor,
        on: anchored && Boolean(selection),
        disabled: !selection,
        run: () =>
          runtimeNow && selection && setSelectionFlags(runtimeNow, selection, { anchored: !anchored }),
      },
      {
        // Meant to hang in the air (P2-11): the world checks leave it there.
        label: floats ? 'Meant to float' : 'Rests on the ground',
        Icon: Cloud,
        on: floats && Boolean(selection),
        disabled: !selection,
        run: () =>
          runtimeNow &&
          selection &&
          setSelectionFlags(runtimeNow, selection, { floats: floats ? null : true }),
      },
    ];

  const q = query.trim().toLowerCase();

  const renderRow = (row: Row, depth: number) => {
    const Icon = ROW_ICON[row.kind];
    const isSelected =
      row.select.length > 0
        ? row.select.every((id) => selected.has(id))
        : focused === `${row.kind}:${row.id}`;
    const expanded = row.children ? (open[row.id] ?? false) || (q !== '' && matches(row, q)) : false;
    const isEditing = editing?.kind === row.kind && editing.id === row.id;
    return (
      <li key={`${row.kind}:${row.id}`}>
        <div
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={row.children ? expanded : undefined}
          tabIndex={0}
          onClick={(event) => click(row, event.ctrlKey || event.metaKey || event.shiftKey)}
          onDoubleClick={() => startRename(row)}
          onKeyDown={(event) => {
            if (isEditing) return;
            if (event.key === 'F2') startRename(row);
            else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              click(row, event.ctrlKey || event.metaKey || event.shiftKey);
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          className={`group flex cursor-default items-center gap-1 rounded-md py-0.5 pr-1.5 outline-none select-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
            isSelected ? 'bg-ink text-on-brand' : 'text-ink hover:bg-ink/5'
          }`}
        >
          {row.children ? (
            <button
              type="button"
              aria-label={expanded ? `Close ${row.name}` : `Open ${row.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpen({ ...open, [row.id]: !expanded });
              }}
              className="rounded p-0.5 hover:bg-ink/10"
            >
              <ChevronRight className={`size-3.5 transition ${expanded ? 'rotate-90' : ''}`} aria-hidden />
            </button>
          ) : (
            <span className="w-4.5 shrink-0" />
          )}
          <Icon className={`size-3.5 shrink-0 ${isSelected ? '' : 'text-ink/50'}`} aria-hidden />
          {isEditing ? (
            <input
              autoFocus
              value={editing.draft}
              maxLength={64}
              aria-label="Name"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
              onBlur={rename}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') rename();
                if (event.key === 'Escape') setEditing(null);
              }}
              className="h-6 min-w-0 flex-1 rounded bg-paper px-1.5 text-sm font-semibold text-ink outline-none focus:ring-2 focus:ring-ink/30"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
          )}
          {row.children ? (
            <span className={`text-xs ${isSelected ? 'opacity-70' : 'text-ink/50'}`}>
              {row.children.length}
            </span>
          ) : null}
          {row.unanchored ? (
            <Anchor className="size-3.5 shrink-0 opacity-40" aria-label="Not anchored" />
          ) : null}
          {row.locked ? <Lock className="size-3.5 shrink-0 opacity-70" aria-label="Locked" /> : null}
        </div>
        {row.children && expanded ? (
          <ul role="group">
            {row.children
              .filter((child) => !q || matches(child, q) || matches(row, q))
              .map((child) => renderRow(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1.5 rounded-lg bg-paper px-2 py-1">
        <Search className="size-3.5 text-ink/50" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Find by name"
          aria-label="Find by name"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
        />
      </label>
      <div className="flex gap-1" role="toolbar" aria-label="Selection">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={tool.on}
            disabled={tool.disabled}
            onClick={tool.run}
            className={`flex h-8 flex-1 items-center justify-center rounded-lg disabled:opacity-30 ${
              tool.on ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
            }`}
          >
            <tool.Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      <ul role="tree" aria-label="Explorer" className="flex flex-col gap-0.5">
        {tree.map((section) => {
          const rows = q ? section.rows.filter((row) => matches(row, q)) : section.rows;
          const isOpen = Boolean(open[section.label]) || (q !== '' && rows.length > 0);
          return (
            <li key={section.label}>
              <button
                type="button"
                aria-expanded={isOpen}
                disabled={rows.length === 0}
                onClick={() => setOpen({ ...open, [section.label]: !open[section.label] })}
                className="flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-bold hover:bg-ink/5 disabled:hover:bg-transparent"
              >
                <ChevronRight
                  className={`size-4 transition ${isOpen ? 'rotate-90' : ''} ${rows.length === 0 ? 'opacity-0' : ''}`}
                  aria-hidden
                />
                <section.Icon className="size-4 text-ink/60" aria-hidden />
                <span className="flex-1 text-left">{section.label}</span>
                <span className="text-xs text-ink/50">{rows.length}</span>
              </button>
              {isOpen ? (
                <ul role="group" className="flex flex-col">
                  {rows.slice(0, MAX_ROWS).map((row) => renderRow(row, 1))}
                  {rows.length > MAX_ROWS ? (
                    <li className="px-6 py-1 text-xs text-ink/50">
                      {rows.length - MAX_ROWS} more. Find them by name.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
