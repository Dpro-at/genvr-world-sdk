'use client';

import type { CommandPayload, Sea } from '@genvr/contracts';
import type { OceanControl, OceanResource } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';
import { useEffect, useState, type RefObject } from 'react';

/** Build a single-property edit from the latest world, preserving unrelated swell settings. */
export function oceanControlCommand(
  sea: Sea,
  resource: OceanResource,
  key: OceanControl['key'],
  value: number | null,
): CommandPayload {
  const control = resource.controls.find((c) => c.key === key);
  if (!control) throw new Error('Unknown ocean control.');
  const next = value ?? control.default;
  if (
    next !== null &&
    (!Number.isFinite(next) ||
      next < control.min ||
      (control.exclusiveMax ? next >= control.max : next > control.max))
  )
    throw new Error(`${control.label} is outside its supported range.`);
  if (key === 'level') {
    if (next === null) throw new Error('A sea level is required.');
    return { type: 'set_sea', params: { level: next, resourceId: resource.resourceId } };
  }
  const swell = { ...sea.swell };
  if (next === null) delete swell[key];
  else swell[key] = next;
  return { type: 'set_sea', params: { level: sea.level, resourceId: resource.resourceId, swell } };
}

function OceanField({
  control,
  value,
  disabled,
  save,
}: {
  control: OceanControl;
  value: number | null;
  disabled: boolean;
  save: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-bold">
        {control.label} ({control.unit})
      </span>
      <span className="text-ink/60">{control.description}</span>
      <div className="flex gap-1">
        <input
          type="number"
          aria-label={control.label}
          disabled={disabled}
          min={control.min}
          max={control.exclusiveMax ? undefined : control.max}
          step="any"
          placeholder={control.reset === 'automatic' ? 'Automatic' : undefined}
          value={draft ?? (value === null ? '' : String(value))}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={() => {
            if (draft !== null) {
              save(draft.trim() === '' ? null : Number(draft));
              setDraft(null);
            }
          }}
          className="min-w-0 flex-1 rounded-lg bg-paper px-2 py-1 text-ink"
        />
        <button
          type="button"
          disabled={disabled}
          className="rounded-lg bg-paper px-2 py-1 font-bold"
          aria-label={`Reset ${control.label}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            setDraft(null);
            save(null);
          }}
        >
          Reset
        </button>
      </div>
    </label>
  );
}

export function OceanResourceControls({
  runtime,
  resource,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  resource: OceanResource;
}) {
  const [snapshot, setSnapshot] = useState('');
  const [error, setError] = useState('');
  // MCP, undo and other editor panels can edit the singleton while its card is open.
  useEffect(() => {
    const refresh = () => setSnapshot(JSON.stringify(runtime.current?.world.environment.sea ?? null));
    refresh();
    const timer = setInterval(refresh, 400);
    return () => clearInterval(timer);
  }, [runtime, resource.resourceId]);
  const sea: Sea | null = snapshot ? JSON.parse(snapshot) : null;
  const active = sea?.resourceId === resource.resourceId;
  const save = (key: OceanControl['key'], value: number | null) => {
    const rt = runtime.current,
      current = rt?.world.environment.sea;
    if (!rt || !current || current.resourceId !== resource.resourceId) return;
    try {
      if (!rt.applyCommand(oceanControlCommand(current, resource, key, value)))
        throw new Error('The ocean change could not be applied.');
      setError('');
      setSnapshot(JSON.stringify(rt.world.environment.sea ?? null));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The ocean change could not be applied.');
    }
  };
  return (
    <section
      aria-label="Ocean properties"
      className="flex max-h-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-ink/10 p-2 text-xs"
    >
      <p>{resource.documentation}</p>
      <p className="font-bold">
        {active ? 'Applies to the whole world' : 'Select this ocean in the library to use its controls.'}
      </p>
      {(['appearance', 'motion'] as const).map((group) => (
        <fieldset key={group} className="flex flex-col gap-2">
          <legend className="mb-2 font-black capitalize">{group}</legend>
          {resource.controls
            .filter((c) => c.group === group)
            .map((control) => (
              <OceanField
                key={control.key}
                control={control}
                disabled={!active}
                value={
                  control.key === 'level'
                    ? (sea?.level ?? control.default)
                    : (sea?.swell?.[control.key] ?? control.default)
                }
                save={(value) => save(control.key, value)}
              />
            ))}
        </fieldset>
      ))}
      {error ? (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      ) : null}
      <p className="text-ink/60">Appearance adapts to your device and graphics settings.</p>
      <a href={resource.source.page} target="_blank" rel="noreferrer" className="underline">
        Source: {resource.source.name} · {resource.source.license}
      </a>
    </section>
  );
}
