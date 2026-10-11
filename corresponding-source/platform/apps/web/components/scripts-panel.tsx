'use client';

import type { CommandPayload, PlaceScript, WorldDocument } from '@genvr/contracts';
import { ChevronRight, Monitor, Plus, ScrollText, Store } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, errorMessage } from '../lib/api';
import {
  addScriptCommand,
  EDITOR_MEDIA,
  removeScriptCommand,
  saveScriptCommand,
  statusText,
  toggleScriptCommand,
  type LogLine,
} from '../lib/scripts-edit';
import { MenuButton } from './menu-button';
import { ScriptEditor } from './script-editor';

/** How often the open list asks for the room's log and the scripts' states, and notices other builders' saves. */
const POLL_MS = 3000;

type ScriptState = { id: string; state: 'running' | 'off' | 'not_compiled'; strikes: number; errors: number };

/** Whether the code editor can show (a wide screen with a mouse); phones and tablets get the list only. */
function useEditorAvailable(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(EDITOR_MEDIA);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => window.matchMedia(EDITOR_MEDIA).matches,
    () => false,
  );
}

/**
 * Place settings > Game > Scripts (P2-10, spec 11): the place's scripts with an on/off switch each and their state in
 * open rooms (errors and strikes of the match), on every device. On a desktop, Add script and the plain code editor of
 * the selected script, and copying an approved store script in (pinned by its sha256, spec 9.3). Each change is one
 * `set_script` command saved with the place's version (`onCommands`), so a save
 * restarts the match in open rooms and is one undo step in the studio. The list asks every few seconds for the log, the
 * states and the saved scripts, so another builder's save shows here too.
 */
export function ScriptsPanel({
  placeId,
  doc,
  version,
  onCommands,
  onChangedElsewhere,
}: {
  placeId: string;
  /** The saved place (scripts, game, zones). */
  doc: WorldDocument;
  version: number;
  /** Saves commands with the place's version; true when saved. */
  onCommands: (commands: CommandPayload[]) => Promise<boolean>;
  /** The saved place is newer than `version` (another builder, the studio, the assistant): load it again. */
  onChangedElsewhere: () => void;
}) {
  const editorAvailable = useEditorAvailable();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<{
    rooms: number;
    lines: LogLine[];
    status: ScriptState[];
    /** Place script review: each enabled script's text and a moderator (places others can join). */
    review: { required: boolean; scripts: ReviewState[] };
  }>({
    rooms: 0,
    lines: [],
    status: [],
    review: { required: false, scripts: [] },
  });
  /** Approved store scripts (spec 9.3), offered on desktops; none means no store button. */
  const [store, setStore] = useState<Array<{ id: string; name: string; version: string }>>([]);
  const scripts = doc.scripts ?? [];
  const open = scripts.find((script) => script.id === openId) ?? null;

  useEffect(() => {
    if (!editorAvailable) return;
    let stopped = false;
    void api
      .GET('/v1/catalog/items', { params: { query: { type: 'script', limit: 50 } } })
      .then(({ data }) => {
        if (stopped || !data) return;
        setStore(
          data.items.map((item) => ({
            id: item.id,
            name: item.manifest.name,
            version: item.manifest.version,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [editorAvailable]);

  /** Copies an approved store script into the place as a script pinned to its approved text. */
  const copyFromStore = async (itemId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: failed } = await api.POST('/v1/experiences/{id}/scripts/copy', {
        params: { path: { id: placeId } },
        body: { itemId, baseVersion: version },
      });
      if (data) {
        setOpenId(data.scriptId);
        onChangedElsewhere();
      } else setError(errorMessage(failed));
    } catch {
      setError('The store script could not be copied. Check the connection.');
    }
    setBusy(false);
  };

  // The log, the states and other builders' saves, while the page is visible.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data } = await api.GET('/v1/experiences/{id}/scripts', { params: { path: { id: placeId } } });
        if (!data || stopped) return;
        setRoom({ rooms: data.rooms, lines: data.lines, status: data.status, review: data.review });
        if (data.version > version) onChangedElsewhere();
      } catch {
        // The next poll tries again.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [placeId, version, onChangedElsewhere]);

  const send = async (command: CommandPayload) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const saved = await onCommands([command]);
    setBusy(false);
    return saved;
  };

  const add = async () => {
    const added = addScriptCommand(scripts);
    if ('error' in added) {
      setError(added.error);
      return;
    }
    if (await send(added.command)) setOpenId(added.id);
  };

  const remove = async (script: PlaceScript) => {
    if (!window.confirm(`Remove the script "${script.name}"? Undo in the studio brings it back.`)) return;
    if (await send(removeScriptCommand(script.id))) setOpenId(null);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="scripts-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h4 id="scripts-heading" className="text-xs font-black tracking-wide text-ink/50 uppercase">
            Scripts
          </h4>
          <p className="text-sm text-ink/60">
            Small JavaScript files the server runs with the game: they hear its events and ask for the rules’
            actions.
          </p>
        </div>
        {editorAvailable ? (
          <div className="flex shrink-0 items-center gap-2">
            {store.length > 0 ? (
              <MenuButton<string>
                label="From the store"
                value={null}
                options={store.map((item) => ({
                  value: item.id,
                  label: `${item.name} ${item.version}`,
                  Icon: Store,
                }))}
                onChange={(itemId) => {
                  if (itemId) void copyFromStore(itemId);
                }}
              />
            ) : null}
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-bold text-on-brand hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden />
              Add script
            </button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm font-bold text-coral">{error}</p>
      ) : null}

      {scripts.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-paper px-3 py-3 text-sm text-ink/60">
          <ScrollText className="size-4 shrink-0" aria-hidden />
          {editorAvailable
            ? 'No scripts yet. Add one, or let your AI write one through the script tools.'
            : 'No scripts yet. Scripts are written on a computer.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {scripts.map((script) => {
            const state = room.status.find((one) => one.id === script.id);
            const review = room.review.required
              ? room.review.scripts.find((one) => one.scriptId === script.id)
              : undefined;
            const selected = script.id === openId;
            return (
              <li
                key={script.id}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-1.5 ${selected ? 'bg-ink/10' : 'bg-paper'}`}
              >
                <button
                  type="button"
                  disabled={!editorAvailable}
                  onClick={() => setOpenId(selected ? null : script.id)}
                  aria-expanded={editorAvailable ? selected : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                >
                  <ScrollText className="size-4 shrink-0 text-ink/60" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{script.name}</span>
                    <span
                      className={`block truncate text-xs ${(state && (state.state !== 'running' || state.errors > 0 || state.strikes > 0)) || review?.status === 'rejected' ? 'font-bold text-coral' : 'text-ink/50'}`}
                    >
                      {script.enabled ? statusText(state) : 'Switched off'}
                      {script.from ? ` · from the store, ${script.from.version}` : ''}
                      {reviewText(review)}
                    </span>
                  </span>
                  {editorAvailable ? (
                    <ChevronRight
                      className={`size-4 shrink-0 text-ink/40 transition ${selected ? 'rotate-90' : ''}`}
                      aria-hidden
                    />
                  ) : null}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={script.enabled}
                  aria-label={`${script.name}: ${script.enabled ? 'on' : 'off'}`}
                  disabled={busy}
                  onClick={() => void send(toggleScriptCommand(script))}
                  className="flex h-11 shrink-0 items-center px-1 disabled:opacity-40"
                >
                  <span
                    className={`relative h-6 w-11 rounded-full transition-colors ${script.enabled ? 'bg-ink' : 'bg-ink/20'}`}
                    aria-hidden
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-surface transition-[left] ${script.enabled ? 'left-5.5' : 'left-0.5'}`}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!editorAvailable && scripts.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-ink/50">
          <Monitor className="size-3.5 shrink-0" aria-hidden />
          Open Place settings on a computer to write or change a script.
        </p>
      ) : null}

      {editorAvailable && open ? (
        <ScriptEditor
          key={open.id}
          placeId={placeId}
          doc={doc}
          script={open}
          lines={room.lines}
          rooms={room.rooms}
          busy={busy}
          onSave={(source, name) => send(saveScriptCommand({ ...open, name }, source))}
          onRemove={() => void remove(open)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}

type ReviewState = {
  scriptId: string;
  status: 'approved' | 'pending' | 'rejected' | 'none';
  note: string | null;
};

/** The script's review in a place others can join (place script review); empty when none is needed. */
function reviewText(review: ReviewState | undefined): string {
  if (!review || review.status === 'approved') return '';
  return review.status === 'rejected' ? ' · Not approved by a moderator' : ' · Waiting for review';
}
