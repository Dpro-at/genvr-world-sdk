'use client';

import { CORE_SKIES, CORE_WEATHER, STYLE_PACKS, getCoreItem } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';
import {
  Box,
  CloudFog,
  CloudLightning,
  CloudRain,
  Moon,
  Mountain,
  Sparkle,
  Grid3x3,
  Snowflake,
  Sun,
  SunMedium,
  SunMoon,
  Sunset,
  Wind,
  Palmtree,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { STYLE_CARDS } from '../lib/styles';

/** Icons of the Core skies and weathers (environment/sky and environment/weather items). */
export const ENVIRONMENT_ICONS: Record<string, LucideIcon> = {
  'genvr.core.sky.day': Sun,
  'genvr.core.sky.sunset': Sunset,
  'genvr.core.sky.night': Moon,
  'genvr.core.sky.storm': CloudLightning,
  'genvr.core.sky.tropical': Palmtree,
  'sky.cycle': SunMoon,
  'genvr.core.weather.clear': SunMedium,
  'genvr.core.weather.rain': CloudRain,
  'genvr.core.weather.snow': Snowflake,
  'genvr.core.weather.storm': Zap,
  'genvr.core.weather.fog': CloudFog,
  'genvr.core.weather.sandstorm': Wind,
  'genvr.core.style.blocky': Box,
  'genvr.core.style.realistic': Mountain,
  'genvr.core.style.anime': Sparkle,
  'genvr.core.style.voxel': Grid3x3,
};

/** Minutes per day of the day-night cycle: the first is used when the cycle is turned on. */
export const DAY_LENGTHS = [20, 10, 40, 60] as const;

/** Styles the engine draws well today (the others follow, STYLE_CARDS `ready`). */
export const READY_STYLES = STYLE_PACKS.filter((pack) => STYLE_CARDS.find((card) => card.id === pack.style)?.ready);

/**
 * Sky and weather of the place (tasks P2-02, P2-06): each choice is a `set_sky` or `set_weather`
 * command, so it saves, undoes, and shows live for everyone in the room.
 */
export function EnvironmentPicker({
  runtime,
  variant,
  onStyle,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  /** `panel` for the desktop studio sidebar, `pills` over the 3D view on phones and tablets. */
  variant: 'panel' | 'pills';
  /** Called after the place's style changed (the page updates its style filters). */
  onStyle?: (style: (typeof STYLE_PACKS)[number]['style']) => void;
}) {
  const style = runtime.current?.world.style;
  const current = runtime.current?.world.environment;
  const cycle = Number(current?.sky.params.cycle ?? 0);
  const cycling = cycle > 0;
  const startCycle = (minutes: number) =>
    choose({
      type: 'set_sky',
      params: {
        // The cycle keeps the chosen look and the hour, sun and wind already set (WORLD-W0).
        preset: current?.sky.preset ?? 'day',
        params: { ...current?.sky.params, cycle: minutes },
      },
    });
  /** A sky preset keeps the hour, sun path and wind; choosing one stops the cycle (WORLD-W0). */
  const keptSky = () => {
    const params = { ...current?.sky.params };
    delete params.cycle;
    return Object.keys(params).length ? params : null;
  };
  const [, redraw] = useState(0);
  // Undo, redo, the assistant, and other builders change the world too: follow them (cheap check).
  useEffect(() => {
    let seen = '';
    const timer = window.setInterval(() => {
      const world = runtime.current?.world;
      const now = world
        ? JSON.stringify([world.style, world.environment.sky, world.environment.weather.preset])
        : '';
      if (now !== seen) {
        seen = now;
        redraw((n) => n + 1);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [runtime]);
  const choose = (command: Parameters<GenvrRuntime['applyCommand']>[0]) => {
    runtime.current?.applyCommand(command);
    redraw((n) => n + 1);
  };
  const button = (id: string, name: string, active: boolean, run: () => void) => {
    const Icon = ENVIRONMENT_ICONS[id] ?? Sun;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={active}
        onClick={run}
        className={
          variant === 'panel'
            ? `flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-bold ${
                active ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
              }`
            : `flex w-16 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold ${
                active ? 'bg-ink text-on-brand shadow' : 'text-ink hover:bg-ink/5'
              }`
        }
      >
        <Icon className="size-5" aria-hidden />
        {name}
      </button>
    );
  };
  const groups = [
    {
      title: 'Style',
      buttons: READY_STYLES.filter(pack => {
        const world = runtime.current?.world;
        if (!world || pack.style === world.style.base) return true;
        if ((pack.style === 'voxel') !== Boolean(world.voxels)) return false;
        if (world.terrain.world && pack.style !== 'realistic') return false;
        return world.instances.every(item => { const core = getCoreItem(item.itemId); return !core || core.manifest.styles.includes(pack.style); });
      }).map((pack) =>
        button(pack.manifest.id, pack.manifest.name, style?.base === pack.style, () => {
          choose({ type: 'set_style', params: { ...(style ?? {}), base: pack.style } });
          onStyle?.(pack.style);
        }),
      ),
    },
    {
      title: 'Sky',
      buttons: [
        ...CORE_SKIES.map((sky) =>
          button(sky.manifest.id, sky.manifest.name, !cycling && current?.sky.preset === sky.preset, () =>
            choose({ type: 'set_sky', params: { preset: sky.preset, params: keptSky() ?? {} } }),
          ),
        ),
        // Day and night (P2-02): the sun crosses the sky once a day; a storm sky stays stormy and
        // only darkens at night. The day length is chosen below the buttons in the studio.
        button('sky.cycle', 'Day and night', cycling, () => startCycle(cycling ? cycle : DAY_LENGTHS[0])),
      ],
    },
    {
      title: 'Weather',
      buttons: CORE_WEATHER.map((weather) =>
        button(weather.manifest.id, weather.manifest.name, current?.weather.preset === weather.preset, () =>
          choose({ type: 'set_weather', params: { preset: weather.preset, params: { ...current?.weather.params } } }),
        ),
      ),
    },
  ];
  if (variant === 'panel')
    return (
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="pb-1.5 text-[11px] font-black tracking-wide text-ink/50 uppercase">
              {group.title}
            </h3>
            <div className="grid grid-cols-3 gap-1.5">{group.buttons}</div>
            {group.title === 'Sky' && cycling ? (
              <label className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-ink/70">
                Day length
                <select
                  value={cycle}
                  onChange={(event) => startCycle(Number(event.target.value))}
                  className="rounded-md bg-paper px-2 py-1 text-ink"
                >
                  {[...new Set([...DAY_LENGTHS, cycle])]
                    .sort((a, b) => a - b)
                    .map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </section>
        ))}
        {style?.base === 'realistic' ? (
          <GroundRules
            snowLine={style.snowLine}
            autoRock={style.autoRock !== false}
            grass={style.grass ?? { on: true, density: 1 }}
            woods={style.woods ?? { on: true, density: 1 }}
            hasWorld={runtime.current?.world.terrain.world !== undefined}
            onChange={(change) => choose({ type: 'set_style', params: { ...style, ...change } })}
          />
        ) : null}
        {style?.base === 'realistic' ? (
          <WaterRules
            water={style.water ?? DEFAULT_WATER}
            sea={current?.sea ?? null}
            lakes={current?.water.length ?? 0}
            onWater={(water) => choose({ type: 'set_style', params: { ...style, water } })}
            onSea={(level) => choose({ type: 'set_sea', params: { level } })}
            onSwell={(direction) => {
              const sea = current?.sea;
              if (!sea) return;
              // Only the direction is set here; the swell's period and height stay as they are.
              const swell = { ...sea.swell };
              if (direction === null) delete swell.direction;
              else swell.direction = direction;
              choose({ type: 'set_sea', params: { level: sea.level, swell: Object.keys(swell).length > 0 ? swell : null } });
            }}
          />
        ) : null}
      </div>
    );
  return (
    <div className="scroll-row pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-3xl bg-surface/95 p-1.5 shadow-lg">
      {groups.map((group, index) => (
        <div key={group.title} className="flex items-center gap-1">
          {index > 0 ? <span className="mx-1 w-px shrink-0 self-stretch bg-ink/10" /> : null}
          {group.buttons}
        </div>
      ))}
    </div>
  );
}

/** Snow line used when a Realistic place has not chosen one (the runtime's default, P2-37). */
const DEFAULT_SNOW_LINE = 80;

/** Water settings a Realistic place gets before anyone changes them (P2-39). */
export const DEFAULT_WATER = { clarity: 9, waves: 'normal' as const };
/** Sea level offered the first time it is switched on: just under the flat starting ground. */
const FIRST_SEA_LEVEL = -1;
/**
 * Where the sea's shore waves come from (Tidewater sea): automatic picks the open side of the coast, or one of
 * eight compass directions (degrees clockwise from north).
 */
const SWELL_DIRECTIONS: ReadonlyArray<readonly [string, number | 'auto']> = [
  ['Automatic', 'auto'],
  ['North', 0],
  ['North-east', 45],
  ['East', 90],
  ['South-east', 135],
  ['South', 180],
  ['South-west', 225],
  ['West', 270],
  ['North-west', 315],
];
/** Only this many bodies of water can mirror the world; each one costs a pass over the scene. */
const MIRRORS = 2;

/**
 * The ground's own rules in Realistic places (P2-37): snow above a height and rock on steep
 * slopes. Each change is one `set_style` command (undo, saving, co-building); the slider applies
 * when it is let go, so dragging makes one undo step.
 */
export function GroundRules({
  snowLine,
  autoRock,
  grass,
  woods,
  hasWorld,
  onChange,
}: {
  snowLine: number | null | undefined;
  autoRock: boolean;
  grass: { on: boolean; density: number };
  /** The starter world's woods (P2-40): the same kind of setting as grass, so it sits beside it. */
  woods: { on: boolean; density: number };
  /** Only a place made from a starter world has woods to switch off. */
  hasWorld: boolean;
  onChange: (change: {
    snowLine?: number | null;
    autoRock?: boolean;
    grass?: { on: boolean; density: number };
    woods?: { on: boolean; density: number };
  }) => void;
}) {
  const [grassDraft, setGrassDraft] = useState<number | null>(null);
  const grassShown = grassDraft ?? grass.density;
  const commitGrass = () => {
    if (grassDraft !== null && grassDraft !== grass.density)
      onChange({ grass: { ...grass, density: grassDraft } });
    setGrassDraft(null);
  };
  const [woodsDraft, setWoodsDraft] = useState<number | null>(null);
  const woodsShown = woodsDraft ?? woods.density;
  const commitWoods = () => {
    if (woodsDraft !== null && woodsDraft !== woods.density)
      onChange({ woods: { ...woods, density: woodsDraft } });
    setWoodsDraft(null);
  };
  const snowOn = snowLine !== null;
  const line = snowLine ?? DEFAULT_SNOW_LINE;
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? line;
  const commit = () => {
    if (draft !== null && draft !== line) onChange({ snowLine: draft });
    setDraft(null);
  };
  const toggle = (label: string, on: boolean, run: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={run}
      className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-xs font-bold text-ink hover:bg-ink/10"
    >
      {label}
      <span className={`relative h-5 w-9 rounded-full ${on ? 'bg-ink' : 'bg-ink/20'}`} aria-hidden>
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-surface transition-[left] ${on ? 'left-4.5' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="pb-0 text-[11px] font-black tracking-wide text-ink/50 uppercase">Ground</h3>
      {toggle('Grass grows on grass ground', grass.on, () =>
        onChange({ grass: { ...grass, on: !grass.on } }),
      )}
      {grass.on ? (
        <label className="flex flex-col gap-1 px-1 text-xs font-bold text-ink/70">
          <span className="flex justify-between">
            Grass
            <span className="text-ink">
              {grassShown <= 0.5 ? 'Sparse' : grassShown < 1.25 ? 'Normal' : 'Thick'}
            </span>
          </span>
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.25}
            value={grassShown}
            onChange={(event) => setGrassDraft(Number(event.target.value))}
            onPointerUp={commitGrass}
            onKeyUp={commitGrass}
            onBlur={commitGrass}
            className="accent-ink"
          />
        </label>
      ) : null}
      {hasWorld
        ? toggle('Trees grow where the world put them', woods.on, () =>
            onChange({ woods: { ...woods, on: !woods.on } }),
          )
        : null}
      {hasWorld && woods.on ? (
        <label className="flex flex-col gap-1 px-1 text-xs font-bold text-ink/70">
          <span className="flex justify-between">
            Trees
            <span className="text-ink">
              {woodsShown <= 0.5 ? 'A few' : woodsShown < 1.25 ? 'Normal' : 'Thick'}
            </span>
          </span>
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.25}
            value={woodsShown}
            onChange={(event) => setWoodsDraft(Number(event.target.value))}
            onPointerUp={commitWoods}
            onKeyUp={commitWoods}
            onBlur={commitWoods}
            className="accent-ink"
          />
        </label>
      ) : null}
      {toggle('Rock on steep slopes', autoRock, () => onChange({ autoRock: !autoRock }))}
      {toggle('Snow on high ground', snowOn, () => onChange({ snowLine: snowOn ? null : line }))}
      {snowOn ? (
        <label className="flex flex-col gap-1 px-1 text-xs font-bold text-ink/70">
          <span className="flex justify-between">
            Snow from
            <span className="text-ink">{shown} m</span>
          </span>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={shown}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            className="accent-ink"
          />
        </label>
      ) : null}
    </section>
  );
}

/**
 * Water in Realistic places (P2-39): how clear it is, how the surface moves, and whether the place
 * has a sea. The look settings ride on `set_style` beside grass and the sea is its own command, so
 * both undo and save with the world. Only two bodies can mirror the world, so the panel says which
 * ones do rather than letting a builder wonder.
 */
export function WaterRules({
  water,
  sea,
  lakes,
  onWater,
  onSea,
  onSwell,
}: {
  water: { clarity: number; waves: 'calm' | 'normal' | 'rough' };
  sea: { level: number; swell?: { direction?: number } } | null;
  lakes: number;
  onWater: (water: { clarity: number; waves: 'calm' | 'normal' | 'rough' }) => void;
  onSea: (level: number | null) => void;
  /** Where the shore waves come from (degrees clockwise from north), or null: worked out from the coast. */
  onSwell: (direction: number | null) => void;
}) {
  const [clarityDraft, setClarityDraft] = useState<number | null>(null);
  const [levelDraft, setLevelDraft] = useState<number | null>(null);
  const clarity = clarityDraft ?? water.clarity;
  const level = levelDraft ?? sea?.level ?? FIRST_SEA_LEVEL;
  const commitClarity = () => {
    if (clarityDraft !== null && clarityDraft !== water.clarity) onWater({ ...water, clarity: clarityDraft });
    setClarityDraft(null);
  };
  const commitLevel = () => {
    if (levelDraft !== null && sea && levelDraft !== sea.level) onSea(levelDraft);
    setLevelDraft(null);
  };
  // The sea is the widest water there is, so it always takes one of the two mirrors.
  const mirrored = Math.min(MIRRORS, (sea ? 1 : 0) + lakes);
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="pb-0 text-[11px] font-black tracking-wide text-ink/50 uppercase">Water</h3>
      <button
        type="button"
        role="switch"
        aria-checked={sea !== null}
        onClick={() => onSea(sea ? null : FIRST_SEA_LEVEL)}
        className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-xs font-bold text-ink hover:bg-ink/10"
      >
        Sea fills the low ground
        <span
          className={`relative h-5 w-9 rounded-full ${sea !== null ? 'bg-ink' : 'bg-ink/20'}`}
          aria-hidden
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-surface transition-[left] ${sea !== null ? 'left-4.5' : 'left-0.5'}`}
          />
        </span>
      </button>
      {sea !== null ? (
        <label className="flex flex-col gap-1 px-1 text-xs font-bold text-ink/70">
          <span className="flex justify-between">
            Sea level
            <span className="text-ink">{level} m</span>
          </span>
          <input
            type="range"
            min={-20}
            max={20}
            step={0.5}
            value={level}
            onChange={(event) => setLevelDraft(Number(event.target.value))}
            onPointerUp={commitLevel}
            onKeyUp={commitLevel}
            onBlur={commitLevel}
            className="accent-ink"
          />
        </label>
      ) : null}
      {sea !== null ? (
        <label className="flex items-center justify-between gap-2 px-1 text-xs font-bold text-ink/70">
          Waves come from
          <select
            value={sea.swell?.direction ?? 'auto'}
            onChange={(event) => onSwell(event.target.value === 'auto' ? null : Number(event.target.value))}
            className="rounded-lg bg-paper px-2 py-1 text-xs font-bold text-ink"
          >
            {SWELL_DIRECTIONS.map(([label, value]) => (
              <option key={label} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 px-1 text-xs font-bold text-ink/70">
        <span className="flex justify-between">
          See through
          <span className="text-ink">{clarity} m</span>
        </span>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={clarity}
          onChange={(event) => setClarityDraft(Number(event.target.value))}
          onPointerUp={commitClarity}
          onKeyUp={commitClarity}
          onBlur={commitClarity}
          className="accent-ink"
        />
      </label>
      <div className="flex gap-1">
        {(['calm', 'normal', 'rough'] as const).map((waves) => (
          <button
            key={waves}
            type="button"
            aria-pressed={water.waves === waves}
            onClick={() => onWater({ ...water, waves })}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold capitalize ${
              water.waves === waves ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/10'
            }`}
          >
            {waves}
          </button>
        ))}
      </div>
      <p className="px-1 text-[11px] font-semibold text-ink/50">
        {mirrored === 0
          ? 'No water yet, so nothing mirrors the world.'
          : `The ${mirrored === 1 ? 'widest water mirrors' : 'two widest waters mirror'} the world; the rest reflect the sky.`}
      </p>
    </section>
  );
}
