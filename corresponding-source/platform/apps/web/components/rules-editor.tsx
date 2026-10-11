'use client';

import {
  RIDE_LIMITS,
  RULE_LIMITS,
  type Action,
  type Compare,
  type Condition,
  type Counter,
  type Game,
  type HudBinding,
  type Rule,
} from '@genvr/contracts';
import { ArrowDown, ArrowUp, Plus, Trash } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ACTION_KINDS,
  ACTION_LABELS,
  actionOfKind,
  addCounter,
  addHud,
  addRule,
  checkRules,
  COMPARES,
  CONDITION_KINDS,
  CONDITION_LABELS,
  counterNames,
  customEvents,
  defaultAction,
  defaultCondition,
  EVENT_LABELS,
  EVENT_NAMES,
  HUD_KINDS,
  HUD_LABELS,
  hudOfKind,
  isEngineEvent,
  missingCounters,
  moveAt,
  ORDER_LABELS,
  ORDERS,
  PHASE_LABELS,
  PHASES,
  removeAt,
  removeCounter,
  renameCounter,
  replaceAt,
  rideTagSuggestions,
  rulesOf,
  followSaved,
  sameRules,
  SCOPE_LABELS,
  SCOPES,
  tagSuggestions,
  takesWho,
  TEAM_LABELS,
  TEAMS,
  uniqueName,
  whenFields,
  WHO,
  WHO_LABELS,
  winnerKind,
  WINNER_KINDS,
  WINNER_LABELS,
  winnerOfKind,
  withEvent,
  type GameRules,
} from '../lib/rules-edit';

// Controls: 44 px high on phones and tablets, compact on computers.
const control =
  'min-h-11 rounded-xl bg-paper px-3 text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-ink/30 disabled:opacity-50 lg:min-h-9';
const iconButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink/60 hover:bg-ink/10 hover:text-ink disabled:opacity-30 lg:size-9';
const addButton =
  'inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl bg-paper px-3 text-left text-sm font-bold text-ink hover:bg-ink/10 disabled:opacity-40 lg:min-h-9';

/** A value the draft names but does not declare shows as itself, marked, so nothing changes silently. */
function Options({
  values,
  labels,
  current,
}: {
  values: readonly string[];
  labels?: Record<string, string>;
  current?: string;
}) {
  return (
    <>
      {current !== undefined && !values.includes(current) ? (
        <option value={current}>{`${current} (not a counter)`}</option>
      ) : null}
      {values.map((value) => (
        <option key={value} value={value}>
          {labels?.[value] ?? value}
        </option>
      ))}
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`${control} max-w-full min-w-0 pr-8`}
    >
      {children}
    </select>
  );
}

/** A text field saved into the draft as it is typed. */
function Text({
  label,
  value,
  onChange,
  max = RULE_LIMITS.name,
  placeholder,
  list,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  placeholder?: string;
  list?: string;
  wide?: boolean;
}) {
  return (
    <input
      aria-label={label}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      list={list}
      onChange={(event) => onChange(event.target.value)}
      className={`${control} min-w-0 ${wide ? 'w-full sm:w-72' : 'w-40'}`}
    />
  );
}

/**
 * A text field that takes the typed value when leaving it or on Enter (Escape goes back). Used where
 * a keystroke may change what the row shows: a custom event name that becomes an engine event's
 * name would otherwise swap the field away while typing.
 */
function CommitText({
  label,
  value,
  onChange,
  list,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  list?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft !== value) onChange(draft);
  };
  return (
    <input
      aria-label={label}
      value={draft ?? value}
      maxLength={RULE_LIMITS.name}
      list={list}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
      className={`${control} w-40 min-w-0`}
    />
  );
}

/** A number field that takes the typed value when leaving it or on Enter, kept inside its limits. */
function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  integer,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const typed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(typed)) return;
    let next = integer ? Math.round(typed) : typed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (next !== value) onChange(next);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
      className={`${control} w-24 text-right tabular-nums`}
    />
  );
}

/**
 * A counter's name: taken when leaving the field or on Enter, and renamed everywhere the rules name
 * it. An empty name or one another counter has is refused (the field goes back).
 */
function CounterName({
  value,
  taken,
  onRename,
}: {
  value: string;
  taken: readonly string[];
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const name = draft.trim().slice(0, RULE_LIMITS.name);
    setDraft(null);
    if (name !== '' && name !== value && !taken.includes(name)) onRename(name);
  };
  return (
    <input
      aria-label="Counter name"
      value={draft ?? value}
      maxLength={RULE_LIMITS.name}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
      className={`${control} w-full min-w-0 sm:w-48`}
    />
  );
}

function Part({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h4 className="text-sm font-black">{title}</h4>
        <p className="text-xs text-ink/60">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** A small label between the controls of a row ("by", "to", "is"). */
function Word({ children }: { children: ReactNode }) {
  return <span className="text-sm text-ink/60">{children}</span>;
}

/** A small label and the control it names, kept on one line when the row wraps. */
function Pair({ word, children }: { word: string; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      <Word>{word}</Word>
      {children}
    </span>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={iconButton}>
      <Trash className="size-4" aria-hidden />
    </button>
  );
}

interface Lists {
  counters: string[];
  tagsList: string;
  /** The ride tags of the world and the rules (a datalist id). */
  rideTagsList: string;
  eventsList: string;
}

/** The fields of one condition. */
function ConditionRow({
  condition,
  draft,
  lists,
  onChange,
  onRemove,
}: {
  condition: Condition;
  draft: GameRules;
  lists: Lists;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-l-2 border-ink/10 pl-2">
      <Select
        label="Condition"
        value={condition.kind}
        onChange={(kind) => onChange(defaultCondition(kind as Condition['kind'], draft))}
      >
        <Options values={CONDITION_KINDS} labels={CONDITION_LABELS} />
      </Select>
      {condition.kind === 'counter' ? (
        <>
          <Select
            label="Counter"
            value={condition.name}
            onChange={(name) => onChange({ ...condition, name })}
          >
            <Options values={lists.counters} current={condition.name} />
          </Select>
          <Select
            label="Compare"
            value={condition.op}
            onChange={(op) => onChange({ ...condition, op: op as Compare })}
          >
            <Options values={COMPARES} />
          </Select>
          <Select
            label="Compare with"
            value={typeof condition.value === 'number' ? 'number' : 'counter'}
            onChange={(mode) =>
              onChange({
                ...condition,
                value: mode === 'number' ? 0 : { counter: lists.counters[0] ?? condition.name },
              })
            }
          >
            <option value="number">a number</option>
            <option value="counter">a counter</option>
          </Select>
          {typeof condition.value === 'number' ? (
            <NumberInput
              label="Number"
              value={condition.value}
              onChange={(value) => onChange({ ...condition, value })}
            />
          ) : (
            <Select
              label="Other counter"
              value={condition.value.counter}
              onChange={(counter) => onChange({ ...condition, value: { counter } })}
            >
              <Options values={lists.counters} current={condition.value.counter} />
            </Select>
          )}
        </>
      ) : condition.kind === 'phase' ? (
        <Pair word="is">
          <Select
            label="Phase"
            value={condition.is}
            onChange={(is) => onChange({ kind: 'phase', is: is as typeof condition.is })}
          >
            <Options values={PHASES} labels={PHASE_LABELS} />
          </Select>
        </Pair>
      ) : condition.kind === 'team' ? (
        <Pair word="is">
          <Select
            label="Team"
            value={condition.is}
            onChange={(is) => onChange({ kind: 'team', is: is as typeof condition.is })}
          >
            <Options values={TEAMS} labels={TEAM_LABELS} />
          </Select>
        </Pair>
      ) : (
        <>
          <Pair word="is">
            <Select
              label="Riding"
              value={condition.is ? 'yes' : 'no'}
              onChange={(is) => onChange({ ...condition, is: is === 'yes' })}
            >
              <Options values={['yes', 'no']} labels={{ yes: 'Yes', no: 'No' }} />
            </Select>
          </Pair>
          <Text
            label="Ride tag"
            value={condition.tag ?? ''}
            max={RIDE_LIMITS.tag}
            list={lists.rideTagsList}
            placeholder="Any item"
            onChange={(tag) => {
              const { tag: _old, ...rest } = condition;
              onChange(tag === '' ? rest : { ...rest, tag });
            }}
          />
        </>
      )}
      <RemoveButton label="Remove condition" onClick={onRemove} />
    </div>
  );
}

/** The fields of one action, and who it reaches where it reaches players. */
function ActionRow({
  action,
  draft,
  lists,
  tags,
  onChange,
  onRemove,
}: {
  action: Action;
  draft: GameRules;
  lists: Lists;
  tags: readonly string[];
  onChange: (action: Action) => void;
  onRemove: () => void;
}) {
  let fields: ReactNode = null;
  switch (action.kind) {
    case 'add_counter':
    case 'set_counter':
      fields = (
        <>
          <Select label="Counter" value={action.name} onChange={(name) => onChange({ ...action, name })}>
            <Options values={lists.counters} current={action.name} />
          </Select>
          {action.kind === 'add_counter' ? (
            <Pair word="by">
              <NumberInput label="Add" value={action.by} onChange={(by) => onChange({ ...action, by })} />
            </Pair>
          ) : (
            <Pair word="to">
              <NumberInput label="Set to" value={action.to} onChange={(to) => onChange({ ...action, to })} />
            </Pair>
          )}
        </>
      );
      break;
    case 'add_score':
      fields = (
        <Pair word="by">
          <NumberInput label="Score" value={action.by} onChange={(by) => onChange({ ...action, by })} />
        </Pair>
      );
      break;
    case 'end_match': {
      const kind = winnerKind(action.winner);
      const winner = action.winner;
      fields = (
        <>
          <Pair word="winner">
            <Select
              label="Winner"
              value={kind}
              onChange={(next) => onChange({ ...action, winner: winnerOfKind(next as typeof kind, draft) })}
            >
              <Options values={WINNER_KINDS} labels={WINNER_LABELS} />
            </Select>
          </Pair>
          {typeof winner === 'object' && 'byCounter' in winner ? (
            <>
              <Select
                label="Winner by counter"
                value={winner.byCounter}
                onChange={(byCounter) => onChange({ ...action, winner: { ...winner, byCounter } })}
              >
                <Options values={lists.counters} current={winner.byCounter} />
              </Select>
              <Select
                label="Winner order"
                value={winner.order}
                onChange={(order) =>
                  onChange({ ...action, winner: { ...winner, order: order as 'high' | 'low' } })
                }
              >
                <Options values={ORDERS} labels={ORDER_LABELS} />
              </Select>
            </>
          ) : typeof winner === 'object' && 'team' in winner ? (
            <Select
              label="Winning team"
              value={winner.team}
              onChange={(team) => onChange({ ...action, winner: { team: team as 'red' | 'blue' } })}
            >
              <Options values={TEAMS} labels={TEAM_LABELS} />
            </Select>
          ) : null}
        </>
      );
      break;
    }
    case 'start_timer':
      fields = (
        <>
          <Text label="Timer name" value={action.name} onChange={(name) => onChange({ ...action, name })} />
          <span className="inline-flex items-center gap-2">
            <NumberInput
              label="Seconds"
              value={action.seconds}
              min={0.1}
              max={3600}
              onChange={(seconds) => onChange({ ...action, seconds })}
            />
            <Word>s</Word>
          </span>
        </>
      );
      break;
    case 'damage':
    case 'heal':
      fields = (
        <NumberInput
          label="Amount"
          value={action.amount}
          min={1}
          max={1000}
          integer
          onChange={(amount) => onChange({ ...action, amount })}
        />
      );
      break;
    case 'teleport_to_zone':
      fields = (
        <Text
          label="Zone tag"
          value={action.tag}
          list={lists.tagsList}
          placeholder={tags[0] ?? 'Zone tag'}
          onChange={(tag) => onChange({ ...action, tag })}
        />
      );
      break;
    case 'show_message':
      fields = (
        <Text
          label="Message"
          value={action.text}
          max={RULE_LIMITS.text}
          placeholder="Text the players see"
          wide
          onChange={(text) => onChange({ ...action, text })}
        />
      );
      break;
    case 'say':
      fields = (
        <Text
          label="Voice line"
          value={action.line}
          placeholder="Voice line item id"
          wide
          onChange={(line) => onChange({ ...action, line: line.trim() })}
        />
      );
      break;
    case 'emit':
      fields = (
        <Text
          label="Custom event"
          value={action.event}
          list={lists.eventsList}
          onChange={(event) => onChange({ ...action, event })}
        />
      );
      break;
    case 'set_speed':
      fields = (
        <>
          <span className="inline-flex items-center gap-2">
            <NumberInput
              label="Speed factor"
              value={action.factor}
              min={RIDE_LIMITS.speedFactor[0]}
              max={RIDE_LIMITS.speedFactor[1]}
              onChange={(factor) => onChange({ ...action, factor })}
            />
            <Word>times</Word>
          </span>
          <Pair word="during">
            <NumberInput
              label="Seconds"
              value={action.seconds}
              min={0.1}
              max={600}
              onChange={(seconds) => onChange({ ...action, seconds })}
            />
            <Word>s</Word>
          </Pair>
        </>
      );
      break;
    case 'dismount':
      break;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-l-2 border-ink/10 pl-2">
      <Select
        label="Action"
        value={action.kind}
        onChange={(kind) => onChange(actionOfKind(action, kind as Action['kind'], draft, tags))}
      >
        <Options values={ACTION_KINDS} labels={ACTION_LABELS} />
      </Select>
      {fields}
      {takesWho(action.kind) && 'who' in action ? (
        <Pair word="for">
          <Select
            label="Who"
            value={action.who}
            onChange={(who) => onChange({ ...action, who: who as typeof action.who } as Action)}
          >
            <Options values={WHO} labels={WHO_LABELS} />
          </Select>
        </Pair>
      ) : null}
      <RemoveButton label="Remove action" onClick={onRemove} />
    </div>
  );
}

/** One rule: When (event, zone tag, counter), If (conditions), Do (actions). */
function RuleCard({
  rule,
  index,
  count,
  draft,
  lists,
  tags,
  custom,
  onChange,
  onMove,
  onRemove,
}: {
  rule: Rule;
  index: number;
  count: number;
  draft: GameRules;
  lists: Lists;
  tags: readonly string[];
  custom: readonly string[];
  onChange: (rule: Rule) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const engine = isEngineEvent(rule.when.event);
  const fields = whenFields(rule.when.event);
  const row = 'grid gap-2 lg:grid-cols-[3rem_1fr] lg:items-start';
  const head = 'pt-0 text-xs font-black tracking-wide text-ink/50 uppercase lg:pt-2.5';
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-ink/10 p-3">
      <div className="flex items-center gap-1">
        <p className="flex-1 text-sm font-black">Rule {index + 1}</p>
        <button
          type="button"
          aria-label="Move rule up"
          title="Move up"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className={iconButton}
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Move rule down"
          title="Move down"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          className={iconButton}
        >
          <ArrowDown className="size-4" aria-hidden />
        </button>
        <RemoveButton label="Remove rule" onClick={onRemove} />
      </div>

      <div className={row}>
        <p className={head}>When</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Event"
            value={engine ? rule.when.event : `custom:${rule.when.event}`}
            onChange={(value) => {
              if (value === 'new') onChange(withEvent(rule, uniqueName('custom event', customEvents(draft))));
              else onChange(withEvent(rule, value.startsWith('custom:') ? value.slice(7) : value));
            }}
          >
            {EVENT_NAMES.map((name) => (
              <option key={name} value={name}>
                {EVENT_LABELS[name]}
              </option>
            ))}
            {[...new Set([...custom, ...(engine ? [] : [rule.when.event])])].map((name) => (
              <option key={name} value={`custom:${name}`}>
                {`Custom: ${name || '(no name)'}`}
              </option>
            ))}
            <option value="new">New custom event</option>
          </Select>
          {!engine ? (
            <CommitText
              label="Custom event name"
              value={rule.when.event}
              list={lists.eventsList}
              onChange={(event) => onChange({ ...rule, when: { event } })}
            />
          ) : null}
          {fields.tag ? (
            <Text
              label={fields.tag === 'ride' ? 'Ride tag' : 'Zone tag'}
              value={rule.when.tag ?? ''}
              list={fields.tag === 'ride' ? lists.rideTagsList : lists.tagsList}
              placeholder={fields.tag === 'ride' ? 'Any item' : 'Any zone'}
              onChange={(tag) => {
                const { tag: _old, ...when } = rule.when;
                onChange({ ...rule, when: tag === '' ? when : { ...when, tag } });
              }}
            />
          ) : null}
          {fields.counter ? (
            <Select
              label="Which counter"
              value={rule.when.counter ?? ''}
              onChange={(counter) => {
                const { counter: _old, ...when } = rule.when;
                onChange({ ...rule, when: counter === '' ? when : { ...when, counter } });
              }}
            >
              <option value="">Any counter</option>
              <Options values={lists.counters} current={rule.when.counter} />
            </Select>
          ) : null}
        </div>
      </div>

      <div className={row}>
        <p className={head}>If</p>
        <div className="flex flex-col gap-2">
          {rule.if.map((condition, i) => (
            <ConditionRow
              key={i}
              condition={condition}
              draft={draft}
              lists={lists}
              onChange={(next) => onChange({ ...rule, if: replaceAt(rule.if, i, next) })}
              onRemove={() => onChange({ ...rule, if: removeAt(rule.if, i) })}
            />
          ))}
          <button
            type="button"
            disabled={rule.if.length >= RULE_LIMITS.conditions}
            onClick={() =>
              onChange({
                ...rule,
                if: [...rule.if, defaultCondition(draft.counters.length > 0 ? 'counter' : 'phase', draft)],
              })
            }
            className={addButton}
          >
            <Plus className="size-4" aria-hidden />
            {rule.if.length === 0 ? 'Add a condition (always runs without one)' : 'Add a condition'}
          </button>
        </div>
      </div>

      <div className={row}>
        <p className={head}>Do</p>
        <div className="flex flex-col gap-2">
          {rule.do.map((action, i) => (
            <ActionRow
              key={i}
              action={action}
              draft={draft}
              lists={lists}
              tags={tags}
              onChange={(next) => onChange({ ...rule, do: replaceAt(rule.do, i, next) })}
              onRemove={() => onChange({ ...rule, do: removeAt(rule.do, i) })}
            />
          ))}
          <button
            type="button"
            disabled={rule.do.length >= RULE_LIMITS.actions}
            onClick={() =>
              onChange({ ...rule, do: [...rule.do, defaultAction('show_message', draft, tags)] })
            }
            className={addButton}
          >
            <Plus className="size-4" aria-hidden />
            Add an action
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * The rules editor of Place settings > Game (generic rules, Task 7): the game's counters, rules
 * (When, If, Do), ranking and HUD displays as plain lists. Changes collect in a draft; Save checks
 * the whole game with the contracts schema and hands it on (the page saves it as one `set_game`
 * command, so undo, co-building and the assistant see it like any change). Every picker offers
 * exactly the schema's choices and stops at its limits.
 */
export function RulesEditor({
  game,
  worldTags,
  worldRideTags = [],
  busy,
  onSave,
}: {
  game: Game;
  /** The zone tags placed in the world (suggested in tag fields). */
  worldTags: readonly string[];
  /** The ride tags of the world's rideable items (suggested in ride tag fields). */
  worldRideTags?: readonly string[];
  busy: boolean;
  /** Saves the checked game; false when it was not saved (the draft stays). */
  onSave: (game: Game) => Promise<boolean>;
}) {
  const saved = rulesOf(game);
  const [base, setBase] = useState<GameRules>(saved);
  const [draft, setDraft] = useState<GameRules>(saved);
  const [problem, setProblem] = useState<string | null>(null);
  // The rules were changed elsewhere while this draft had changes: the builder chooses.
  const [conflict, setConflict] = useState(false);
  const ids = useId();

  // The saved game changed (a save here, or a reload): an untouched draft follows it; a changed
  // draft is never saved over rules changed elsewhere without asking (`followSaved`).
  const savedKey = JSON.stringify(saved);
  // The draft being saved and the rules it was made from: the page shows a save at once and takes
  // it back when it is refused, and neither may replace the draft.
  const pending = useRef<{ draft: GameRules; base: GameRules } | null>(null);
  useEffect(() => {
    const next = JSON.parse(savedKey) as GameRules;
    const followed = followSaved(draft, base, next, pending.current ?? undefined);
    setBase(next);
    setDraft(followed.draft);
    setConflict(followed.conflict);
    // `base` and `draft` are read as they were before this change on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const dirty = !sameRules(draft, base);
  // Unsaved rules are lost on a reload or when the tab closes: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = (next: GameRules) => {
    setDraft(next);
    setProblem(null);
  };
  const tags = tagSuggestions(draft, worldTags);
  const rideTags = rideTagSuggestions(draft, worldRideTags);
  const custom = customEvents(draft);
  const lists: Lists = {
    counters: counterNames(draft),
    tagsList: `${ids}-tags`,
    rideTagsList: `${ids}-ride-tags`,
    eventsList: `${ids}-events`,
  };
  const missing = missingCounters(draft);

  const save = async () => {
    if (conflict) return;
    const checked = checkRules(game, draft);
    if (!checked.ok) {
      setProblem(checked.message);
      return;
    }
    setProblem(null);
    // The draft as the schema reads it (names and tags trimmed), so the saved game coming back is
    // the draft and not a change made elsewhere (`followSaved`).
    const sent = rulesOf(checked.game);
    setDraft(sent);
    pending.current = { draft: sent, base };
    try {
      await onSave(checked.game);
    } finally {
      pending.current = null;
    }
  };

  return (
    <div className={`flex flex-col gap-6 ${dirty || problem ? 'pb-24' : ''}`}>
      <datalist id={lists.tagsList}>
        {tags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <datalist id={lists.rideTagsList}>
        {rideTags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <datalist id={lists.eventsList}>
        {custom.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <Part
        title="Counters"
        hint="Named numbers the rules change: one per player, per team, or one for everyone."
      >
        {draft.counters.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {draft.counters.map((counter, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <CounterName
                  key={counter.name}
                  value={counter.name}
                  taken={lists.counters}
                  onRename={(name) => change(renameCounter(draft, counter.name, name))}
                />
                <Select
                  label="Belongs to"
                  value={counter.scope}
                  onChange={(scope) =>
                    change({
                      ...draft,
                      counters: replaceAt(draft.counters, index, {
                        ...counter,
                        scope: scope as Counter['scope'],
                      }),
                    })
                  }
                >
                  <Options values={SCOPES} labels={SCOPE_LABELS} />
                </Select>
                <Pair word="starts at">
                  <NumberInput
                    label="Start"
                    value={counter.start}
                    onChange={(start) =>
                      change({ ...draft, counters: replaceAt(draft.counters, index, { ...counter, start }) })
                    }
                  />
                </Pair>
                <RemoveButton label="Remove counter" onClick={() => change(removeCounter(draft, index))} />
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          disabled={draft.counters.length >= RULE_LIMITS.counters}
          onClick={() => change(addCounter(draft))}
          className={addButton}
        >
          <Plus className="size-4" aria-hidden />
          Add a counter
        </button>
      </Part>

      <Part
        title="Rules"
        hint="When something happens, and the conditions hold, the actions run, top to bottom."
      >
        {missing.length > 0 ? (
          <p className="text-xs font-bold text-coral">
            Not a counter yet: {missing.join(', ')}. Add it above or pick another.
          </p>
        ) : null}
        {draft.rules.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {draft.rules.map((rule, index) => (
              <RuleCard
                key={index}
                rule={rule}
                index={index}
                count={draft.rules.length}
                draft={draft}
                lists={lists}
                tags={tags}
                custom={custom}
                onChange={(next) => change({ ...draft, rules: replaceAt(draft.rules, index, next) })}
                onMove={(delta) => change({ ...draft, rules: moveAt(draft.rules, index, delta) })}
                onRemove={() => change({ ...draft, rules: removeAt(draft.rules, index) })}
              />
            ))}
          </ol>
        ) : null}
        <button
          type="button"
          disabled={draft.rules.length >= RULE_LIMITS.rules}
          onClick={() => change(addRule(draft, tags))}
          className={addButton}
        >
          <Plus className="size-4" aria-hidden />
          Add a rule
        </button>
      </Part>

      <Part
        title="Ranking"
        hint="The counter that orders players on the scoreboard and names the place of each."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Order players by"
            value={draft.ranking?.by ?? ''}
            onChange={(by) =>
              change({
                ...draft,
                ranking:
                  by === ''
                    ? null
                    : {
                        by,
                        order: draft.ranking?.order ?? 'high',
                        ...(draft.ranking?.then ? { then: draft.ranking.then } : {}),
                      },
              })
            }
          >
            <option value="">Off (by score)</option>
            <Options values={lists.counters} current={draft.ranking?.by} />
          </Select>
          {draft.ranking ? (
            <>
              <Select
                label="Order"
                value={draft.ranking.order}
                onChange={(order) =>
                  change({ ...draft, ranking: { ...draft.ranking!, order: order as 'high' | 'low' } })
                }
              >
                <Options values={ORDERS} labels={ORDER_LABELS} />
              </Select>
              <Pair word="then">
                <Select
                  label="Then by"
                  value={draft.ranking.then ?? ''}
                  onChange={(then) => {
                    const { then: _old, ...ranking } = draft.ranking!;
                    change({ ...draft, ranking: then === '' ? ranking : { ...ranking, then } });
                  }}
                >
                  <option value="">Who got there first</option>
                  <Options values={lists.counters} current={draft.ranking.then} />
                </Select>
              </Pair>
            </>
          ) : null}
        </div>
      </Part>

      <Part
        title="End of the match"
        hint="When time is up, the highest score can win; turn it off when your rules end the match."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="When time is up"
            value={draft.scoreWins ? 'on' : 'off'}
            onChange={(value) => change({ ...draft, scoreWins: value === 'on' })}
          >
            <option value="on">The highest score wins</option>
            <option value="off">Only the rules decide</option>
          </Select>
        </div>
      </Part>

      <Part title="On screen" hint="What players see while playing, with your own label.">
        {draft.hud.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {draft.hud.map((binding, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <Select
                  label="Shows"
                  value={binding.kind}
                  onChange={(kind) =>
                    change({
                      ...draft,
                      hud: replaceAt(draft.hud, index, hudOfKind(binding, kind as HudBinding['kind'], draft)),
                    })
                  }
                >
                  <Options values={HUD_KINDS} labels={HUD_LABELS} />
                </Select>
                {binding.kind === 'counter' ? (
                  <Select
                    label="Counter shown"
                    value={binding.counter}
                    onChange={(counter) =>
                      change({ ...draft, hud: replaceAt(draft.hud, index, { ...binding, counter }) })
                    }
                  >
                    <Options values={lists.counters} current={binding.counter} />
                  </Select>
                ) : binding.kind === 'speed' ? (
                  <Select
                    label="Speed unit"
                    value={binding.unit}
                    onChange={(unit) =>
                      change({
                        ...draft,
                        hud: replaceAt(draft.hud, index, { ...binding, unit: unit as typeof binding.unit }),
                      })
                    }
                  >
                    <Options values={['km/h', 'm/s']} />
                  </Select>
                ) : null}
                <Text
                  label="Label"
                  value={binding.label}
                  max={RULE_LIMITS.text}
                  placeholder="Label"
                  onChange={(label) =>
                    change({ ...draft, hud: replaceAt(draft.hud, index, { ...binding, label }) })
                  }
                />
                <RemoveButton
                  label="Remove display"
                  onClick={() => change({ ...draft, hud: removeAt(draft.hud, index) })}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          disabled={draft.hud.length >= RULE_LIMITS.hud}
          onClick={() => change(addHud(draft))}
          className={addButton}
        >
          <Plus className="size-4" aria-hidden />
          Add a display
        </button>
      </Part>

      {dirty || problem ? (
        // Fixed at the bottom of the screen: the settings page scrolls as a whole, so a sticky bar
        // inside its content would not stay in view.
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-xl flex-wrap items-center gap-2 rounded-2xl border border-ink/10 bg-surface p-3 text-ink shadow-lg">
            {conflict && dirty ? (
              <>
                <p className="min-w-0 flex-1 text-sm font-bold text-coral">
                  The rules were changed elsewhere. Keep yours or take theirs?
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(base);
                    setConflict(false);
                    setProblem(null);
                  }}
                  className="min-h-11 rounded-xl px-4 text-sm font-bold text-ink hover:bg-ink/10 disabled:opacity-40 lg:min-h-9"
                >
                  Take theirs
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConflict(false)}
                  className="min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-on-brand hover:opacity-90 disabled:opacity-40 lg:min-h-9"
                >
                  Keep mine
                </button>
              </>
            ) : (
              <>
                <p className={`min-w-0 flex-1 text-sm font-bold ${problem ? 'text-coral' : 'text-ink/70'}`}>
                  {problem ?? 'Rules changed, not saved yet.'}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(base);
                    setProblem(null);
                  }}
                  className="min-h-11 rounded-xl px-4 text-sm font-bold text-ink hover:bg-ink/10 disabled:opacity-40 lg:min-h-9"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={() => void save()}
                  className="min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-on-brand hover:opacity-90 disabled:opacity-40 lg:min-h-9"
                >
                  Save rules
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
