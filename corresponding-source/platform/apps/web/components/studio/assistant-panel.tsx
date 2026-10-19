'use client';

import { runAvatarStudio } from '../../lib/avatar-studio';
import { runAssistant, streamingChatModel, type AssistantHost, type ChatMessage } from '@genvr/assistant';
import type { GenvrRuntime } from '@genvr/runtime';
import { ArrowUp, Check, ShieldCheck, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api, API_URL } from '../../lib/api';
import { correctionsFor } from '../../lib/corrections';
import { studioScriptHost } from '../../lib/script-engine';
import { useStudioHost } from '../../lib/studio-host';

interface ToolLine {
  name: string;
  ok: boolean;
  result: string;
}

interface Turn {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolLine[];
  /** What the world checks did after the reply (P2-12): settled items, things to look at. */
  notes?: string[];
}

/** Short labels for tool calls shown in the chat. */
const TOOL_LABELS: Record<string, string> = {
  get_world_summary: 'Looked at the place',
  search_catalog: 'Searched the library',
  place_item: 'Placed an item',
  scatter_items: 'Placed items around',
  build_platforms: 'Built platforms',
  remove_items: 'Removed items',
  draw_road: 'Drew a road',
  draw_wall: 'Built walls',
  add_water: 'Added water',
  draw_river: 'Drew a river',
  set_sea: 'Changed the sea',
  sculpt_terrain: 'Shaped the ground',
  paint_terrain: 'Painted the ground',
  make_world: 'Made a new world',
  cover_ground: 'Changed the ground cover',
  fill_blocks: 'Built with blocks',
  block_line: 'Built a line of blocks',
  block_floor: 'Changed the ground blocks',
  dig_blocks: 'Dug the ground',
  set_sky: 'Changed the sky',
  set_weather: 'Changed the weather',
  set_style: 'Changed the style',
  set_game: 'Set up the game',
  get_script_api: 'Read the script reference',
  get_scripts: 'Read the scripts',
  set_script: 'Changed a script',
  test_script: 'Tried a script',
  get_script_logs: 'Read the script log',
  ask_user: 'Asked a question',
};

const IDEAS = [
  'Plant a small forest in front of me',
  'Make it night with rain',
  'Build a room with a bench and a lamp',
];

/**
 * World checks after a reply (P2-12 part 3, decision 83): problems the reply caused (items it
 * placed or moved, or items whose ground it reshaped) are compared with the checks from before
 * the reply. New floating or sunken items are settled right away, inside the reply's undo
 * step; other new findings are counted for the Checks tab. Returns short notes for the chat.
 */
function checkReply(rt: GenvrRuntime, before: ReadonlySet<string>): string[] {
  const fresh = rt
    .checkWorld()
    .findings.filter((finding) => finding.level === 'warning' && !before.has(finding.id));
  const settle = fresh.filter(
    (finding) => (finding.code === 'floating' || finding.code === 'buried') && finding.fix,
  );
  const notes: string[] = [];
  const settled = settle.length > 0 && rt.applyBatch(settle.flatMap((finding) => finding.fix!));
  if (settled)
    notes.push(
      settle.length === 1
        ? 'Set 1 item down on what is under it'
        : `Set ${settle.length} items down on what is under them`,
    );
  const rest = fresh.length - (settled ? settle.length : 0);
  if (rest > 0)
    notes.push(rest === 1 ? '1 thing to look at in Checks' : `${rest} things to look at in Checks`);
  return notes;
}

/**
 * The studio runtime as the assistant sees it: every change is a normal world command. The script tools (P2-10) get
 * the sandbox (loaded on first use) and the place's script log and last match from its open rooms through the API.
 */
/**
 * world_history (BUILD-B9): where the undo history stood right after the assistant's last step, and after its last
 * undo. A different size means the person changed the place since, so their work is never taken back.
 */
const agentSteps = new WeakMap<GenvrRuntime, { done: number | null; undone: number | null }>();

function hostFor(runtime: GenvrRuntime, placeId: string): AssistantHost {
  const steps = agentSteps.get(runtime) ?? { done: null, undone: null };
  agentSteps.set(runtime, steps);
  return {
    world: () => runtime.world,
    heightAt: (x, z) => runtime.terrainHeightAt(x, z),
    restingPoint: (x, z, on) => runtime.restingPoint(x, z, on),
    canStand: (itemId, position, yaw) => runtime.canStand(itemId, position, yaw),
    apply: (commands) => {
      if (!runtime.applyBatch(commands)) return runtime.lastCommandError ?? 'It cannot go there.';
      steps.done = runtime.undoMark();
      steps.undone = null;
      return null;
    },
    history: (action) => {
      if (action === 'undo') {
        if (steps.done === null || runtime.undoMark() !== steps.done)
          return 'The person changed the place after your last step (or there is none); ask them to use Undo.';
        if (!runtime.undo()) return 'Nothing to undo.';
        steps.done = null;
        steps.undone = runtime.undoMark();
        return null;
      }
      if (steps.undone === null || runtime.undoMark() !== steps.undone) return 'There is no step of yours to redo.';
      if (!runtime.redo()) return 'Nothing to redo.';
      steps.done = runtime.undoMark();
      steps.undone = null;
      return null;
    },
    addWater: (x, z) => runtime.addWater(x, z),
    focus: () => {
      const { x, z, yaw } = runtime.localPlayer;
      return { x, z, yaw };
    },
    // Side-view places (P2-23): players move on the line through the spawn point.
    sideLine: () => (runtime.playView === 'side' ? runtime.world.spawn.position[2] : null),
    // The moves the creator gave it (decision 95), so courses fit what players can do.
    sideMoves: () => runtime.sideMoves,
    // Places made of blocks (P2-26): the assistant builds with blocks there.
    blockGround: () => runtime.blockGround,
    // Search by meaning over approved items (P4-03); null lets the assistant match words.
    searchCatalog: async (query, signal) => {
      const { data } = await api.GET('/v1/catalog/search', {
        params: { query: { q: query, limit: 12 } },
        ...(signal ? { signal } : {}),
      });
      return data?.items ?? null;
    },
    ...studioScriptHost(placeId),
  };
}

/**
 * Studio assistant chat (P4-04): the builder types what they want; the local model answers with
 * tool calls that appear in the world as they arrive (each one undoable). Questions from the
 * assistant come with answer buttons.
 */
export function AssistantPanel({
  runtime,
  placeId,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  placeId: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const services = useStudioHost();
  const [ask, setAsk] = useState<{ question: string; options: string[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Requests ahead of this one while the helper is busy with other builders (P4-05).
  const [ahead, setAhead] = useState(0);
  const history = useRef<ChatMessage[]>([]);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns, ask]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = async (prompt: string) => {
    const rt = runtime.current;
    const text = prompt.trim();
    if (!rt || !text || busy) return;
    if (!services.platform && !services.model) { setError('No model configured for this local Studio.'); return; }
    setDraft('');
    setAsk(null);
    setError(null);
    setBusy(true);
    const answerId = (nextId.current += 2);
    setTurns((current) => [
      ...current,
      { id: answerId - 1, role: 'user', text, tools: [] },
      { id: answerId, role: 'assistant', text: '', tools: [] },
    ]);
    const update = (change: (turn: Turn) => Turn) =>
      setTurns((current) => current.map((turn) => (turn.id === answerId ? change(turn) : turn)));
    const controller = new AbortController();
    abort.current = controller;
    // One Undo takes back everything this reply built.
    const mark = rt.undoMark();
    const before = new Set(rt.checkWorld().findings.map((finding) => finding.id));
    const corrections = correctionsFor(placeId);
    corrections.startReply(text);
    try {
      history.current = await runAssistant({
        model: services.model ?? streamingChatModel(`${API_URL}/v1/experiences/${encodeURIComponent(placeId)}/assistant`, {
          credentials: 'include',
        }),
        host: { ...hostFor(rt, placeId), ...(services.shareStudio?{shareStudio:services.shareStudio}:{}), ...(services.avatarVoice ? {avatarVoice:services.avatarVoice} : {}), ...(services.userAvatarLibrary ? { userAvatarLibrary: services.userAvatarLibrary } : {}), avatarStudio: async (input) => runAvatarStudio(input), ...(services.presentAvatar ? { presentAvatar: services.presentAvatar, presentationInfo: services.presentationInfo } : {}) },
        // The last messages are enough context and keep requests small.
        history: history.current.slice(-30),
        prompt: text,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'queue') setAhead(event.ahead);
          else if (event.type === 'text') update((turn) => ({ ...turn, text: turn.text + event.delta }));
          else if (event.type === 'tool')
            update((turn) => ({
              ...turn,
              // Text written before a tool call was the model thinking aloud; keep the answer only.
              text: '',
              tools: [...turn.tools, { name: event.name, ok: event.ok, result: event.result }],
            }));
          else if (event.type === 'ask') {
            update((turn) => ({ ...turn, text: event.question }));
            setAsk({ question: event.question, options: event.options });
          } else if (event.type === 'done') update((turn) => ({ ...turn, text: event.text }));
        },
      });
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : 'The assistant stopped. Please try again.');
    } finally {
      try {
        const notes = checkReply(rt, before);
        if (notes.length > 0) update((turn) => ({ ...turn, notes }));
      } catch {
        // The checks are advice; the reply's undo step and cleanup below must still happen.
      }
      rt.mergeUndoSince(mark);
      corrections.endReply();
      abort.current = null;
      setAhead(0);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
      <div
        ref={list}
        className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto [scrollbar-width:thin]"
        aria-live="polite"
      >
        {turns.length === 0 ? (
          <div className="flex flex-col gap-1.5 text-sm text-ink/60">
            <p>Tell me what to build. I place things right away, and one Undo takes back a whole answer.</p>
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => void send(idea)}
                className="rounded-lg bg-paper px-2.5 py-1.5 text-left text-xs font-bold text-ink hover:bg-ink/10"
              >
                {idea}
              </button>
            ))}
          </div>
        ) : null}
        {turns.map((turn) =>
          turn.role === 'user' ? (
            <p
              key={turn.id}
              className="ml-6 self-end rounded-2xl rounded-br-md bg-ink px-3 py-1.5 text-sm font-semibold text-on-brand"
            >
              {turn.text}
            </p>
          ) : (
            <div key={turn.id} className="mr-4 flex flex-col gap-1">
              {turn.tools.map((tool, index) => (
                <p
                  key={index}
                  title={tool.result}
                  className={`flex items-center gap-1.5 text-xs font-bold ${tool.ok ? 'text-ink/60' : 'text-coral'}`}
                >
                  {tool.ok ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <X className="size-3.5 shrink-0" aria-hidden />
                  )}
                  {TOOL_LABELS[tool.name] ?? tool.name}
                </p>
              ))}
              {turn.notes?.map((note) => (
                <p key={note} className="flex items-center gap-1.5 text-xs font-bold text-ink/60">
                  <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                  {note}
                </p>
              ))}
              {turn.text ? (
                <p className="rounded-2xl rounded-bl-md bg-paper px-3 py-1.5 text-sm text-ink">{turn.text}</p>
              ) : busy && turn.id === nextId.current ? (
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink/50">
                  <Sparkles className="size-3.5 animate-pulse" aria-hidden />
                  {ahead > 0 ? `Waiting for the helper: ${ahead} ahead` : 'Thinking…'}
                </p>
              ) : null}
            </div>
          ),
        )}
        {ask ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={ask.question}>
            {ask.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void send(option)}
                className="rounded-lg bg-paper px-2.5 py-1.5 text-xs font-bold text-ink ring-1 ring-ink/15 hover:bg-ink/10"
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-xs font-bold text-coral">{error}</p> : null}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="flex items-end gap-1.5 rounded-xl bg-paper p-1.5"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Typing here must not move the player or trigger build keys.
            event.stopPropagation();
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          maxLength={500}
          placeholder="Ask the assistant to build…"
          aria-label="Message to the assistant"
          className="min-h-9 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm font-semibold text-ink outline-none placeholder:text-ink/40"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abort.current?.abort()}
            aria-label="Stop"
            title="Stop"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-on-brand"
          >
            <Square className="size-3.5" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            title="Send (Enter)"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-on-brand disabled:opacity-30"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        )}
      </form>
    </div>
  );
}
