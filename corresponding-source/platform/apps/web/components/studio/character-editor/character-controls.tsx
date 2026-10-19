'use client';

import { MOTION_CATEGORIES, motionCategories, avatarMotionEntries } from '@genvr/runtime';
import { EXPRESSIONS } from '@genvr/assistant';
import { Smile, Angry, Frown, Brain, CircleHelp, Meh, Ruler, Palette, ScanFace, ChevronDown, Star } from 'lucide-react';
import { useStudioHost } from '../../../lib/studio-host';

import {
  CHARACTER_SHAPE_LIMITS,
  FACE_PARTS,
  HUMAN_BEARD_STYLES,
  HUMAN_BROW_STYLES,
  HUMAN_HAIR_STYLES,
  type HumanHair,
  FAT_REGIONS,
  fatForWeight,
  weightForFat,
  MAX_BODY_FAT,
  MUSCLE_GROUPS,
  MUSCLE_ZONE_COLORS,
  NORMAL_CHARACTER_SHAPE,
  type FaceFeature,
  type FatRegion,
  type MuscleGroup,
  recipeLook,
  type CharacterColorPart,
  type CharacterShape,
} from '@genvr/contracts';
import {
  CORE_ANIMATIONS,
  CORE_EMOTES,
  findBody,
  PLAYER_BODIES,
  SKIN_MATERIALS,
  type SkinMaterial,
} from '@genvr/core-library';
import {
  Check,
  Download,
  Armchair,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Footprints,
  Redo2,
  RotateCcw,
  RotateCw,
  Undo2,
  Zap,
  Hammer,
  Mountain,
  Swords,
  Waves,
  PersonStanding,
  Pipette,
  Save,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fitFace } from '../../../lib/face-fit/fit';
import { PHOTO_PROBLEM_TEXT, readFace } from '../../../lib/face-fit/landmarker';
import { animationIcon } from '../../../lib/animation-icons';
import { CLOTHES_PALETTE, FANTASY_SKINS, LOOK_PALETTES } from '../../../lib/character-palettes';
import { AvatarSketch } from '../../avatar-sketch';
import type { CharacterEditor } from './use-character-editor';
import { MusclePaintPanel } from './muscle-paint-panel';

export function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  const icons: Record<string, LucideIcon> = { Characters: PersonStanding, Body: PersonStanding, Shape: Ruler, Face: ScanFace, Colours: Palette, 'Character recipe': Save };
  const Icon=icons[title]??PersonStanding;
  return <section aria-label={title} className="mb-5"><h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-ink/60"><Icon className="size-4"/>{title}</h3>{children}</section>;
}

/** Genvr's bodies and the creator's uploaded ones; every card keeps the same skeleton family and clips. */
export function BodySection({ editor }: { editor: CharacterEditor }) {
  const { recipe } = editor;
  const look = recipeLook(recipe);
  return (
    <div role="radiogroup" aria-label="Body" className="grid grid-cols-2 gap-2">
      {PLAYER_BODIES.map((body) => (
        <BodyCard
          key={body.id}
          on={recipe.body === body.id}
          label={body.manifest.name}
          note={`${body.joints.length} bones`}
          onPick={() => editor.change((current) => ({ ...current, body: body.id }))}
        >
          <AvatarSketch look={{ ...look, body: body.id }} className="h-20 w-full" />
        </BodyCard>
      ))}
      {editor.myBodies.map((body) => (
        <BodyCard
          key={body.id}
          on={recipe.body === body.id}
          label={body.name}
          note="Uploaded"
          onPick={() => editor.change((current) => ({ ...current, body: body.id }))}
        >
          <PersonStanding className="h-20 w-full p-4 text-ink/40" strokeWidth={1.5} aria-hidden />
        </BodyCard>
      ))}
    </div>
  );
}

function BodyCard({
  on,
  label,
  note,
  onPick,
  children,
}: {
  on: boolean;
  label: string;
  note: string;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`relative flex flex-col items-center gap-0.5 rounded-2xl bg-paper px-2 pt-2 pb-1.5 text-xs font-bold text-ink transition active:scale-95 ${
        on ? 'ring-2 ring-ink' : 'hover:bg-ink/5'
      }`}
    >
      {children}
      <span className="truncate">{label}</span>
      <span className="text-[10px] font-semibold text-ink/50">{note}</span>
      {on ? (
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-on-brand">
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

const SHAPES: Array<{ key: keyof typeof CHARACTER_SHAPE_LIMITS; label: string }> = [
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Width' },
  { key: 'scale', label: 'Size' },
];

/** Height, weight and overall size on the same skeleton (feet stay on the ground, every clip still plays). */
export function ShapeSection({ editor }: { editor: CharacterEditor }) {
  const { recipe } = editor;
  const normal = JSON.stringify(recipe.shape) === JSON.stringify(NORMAL_CHARACTER_SHAPE);
  return (
    <div className="flex flex-col gap-2.5">
      {SHAPES.map(({ key, label }) => {
        const limits = CHARACTER_SHAPE_LIMITS[key];
        const value = recipe.shape[key];
        return (
          <label
            key={key}
            className="grid grid-cols-[4.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-xs font-bold text-ink/75"
          >
            {label}
            <input
              type="range"
              min={limits.min}
              max={limits.max}
              step={0.01}
              value={value}
              aria-label={label}
              onChange={(event) => {
                const next = Number(event.target.value);
                editor.change((current) => ({ ...current, shape: { ...current.shape, [key]: next } }));
              }}
              className="w-full accent-ink"
            />
            <span className="text-right tabular-nums">{Math.round(value * 100)}%</span>
          </label>
        );
      })}
      {findBody(recipe.body).generated === 'human' ? <BuildControls editor={editor} /> : null}
      <div className="flex items-center justify-between text-xs font-semibold text-ink/60">
        <span>
          Stands{' '}
          <b className="text-ink tabular-nums">
            {editor.info ? `${editor.info.height.toFixed(2)} m` : '...'}
          </b>
        </span>
        <button
          type="button"
          disabled={normal}
          onClick={() => editor.change((current) => ({ ...current, shape: NORMAL_CHARACTER_SHAPE }))}
          className="rounded-lg px-2 py-1 font-bold text-ink/70 ring-1 ring-ink/15 hover:text-ink disabled:opacity-40"
        >
          Normal shape
        </button>
      </div>
    </div>
  );
}

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  traps: 'Traps',
  lats: 'Lats',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  waist: 'Waist',
  lowerBack: 'Lower back',
  hips: 'Hips',
  glutes: 'Glutes',
  quads: 'Thighs',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  hands: 'Hands',
};
const FAT_LABEL: Record<FatRegion, string> = {
  belly: 'Stomach',
  waist: 'Love handles',
  hips: 'Hip width',
  buttocks: 'Glute size',
  thighs: 'Thigh size',
  upperArms: 'Upper arms',
  forearms: 'Forearms',
  calves: 'Calf size',
  face: 'Face',
  chin: 'Chin',
};

/**
 * The body editor in five steps (owner's plan sheets, docs/reference/character-anime/muscles/05-09): each body
 * part step shows its muscle zones in their colours from the side they face, with its muscle and fat sliders;
 * the last step is the whole body (presets, overall muscle, fat and definition, reset).
 */
const BODY_STEPS: ReadonlyArray<{
  title: string;
  face: 'front' | 'back';
  muscles: readonly MuscleGroup[];
  fat: readonly FatRegion[];
}> = [
  {
    title: 'Upper body',
    face: 'front',
    muscles: ['neck', 'shoulders', 'chest', 'biceps', 'triceps', 'forearms', 'hands', 'traps', 'lats'],
    fat: ['upperArms', 'forearms', 'face', 'chin'],
  },
  {
    title: 'Core & waist',
    face: 'front',
    muscles: ['abs', 'obliques', 'waist', 'lowerBack'],
    fat: ['belly', 'waist'],
  },
  {
    title: 'Lower body front',
    face: 'front',
    muscles: ['hips', 'quads', 'calves'],
    fat: ['hips', 'thighs', 'calves'],
  },
  { title: 'Lower body back', face: 'back', muscles: ['glutes', 'hamstrings', 'calves'], fat: ['buttocks'] },
];
const FULL_BODY_STEP = BODY_STEPS.length;

/** Whole-body presets (appearance choices, never better or worse): overall muscle, fat and definition. */
const BODY_PRESETS: ReadonlyArray<{ name: string; muscle: number; fat: number; definition: number }> = [
  { name: 'Very slim', muscle: -0.7, fat: 0, definition: 0 },
  { name: 'Slim', muscle: -0.35, fat: 0, definition: 0.1 },
  { name: 'Lean', muscle: 0.15, fat: 0, definition: 0.5 },
  { name: 'Average', muscle: 0, fat: 0.2, definition: 0.1 },
  { name: 'Athletic', muscle: 0.4, fat: 0.08, definition: 0.6 },
  { name: 'Muscular', muscle: 0.75, fat: 0.05, definition: 0.85 },
  { name: 'Heavy muscular', muscle: 1, fat: 0.3, definition: 0.45 },
  { name: 'Stocky', muscle: 0.5, fat: 0.45, definition: 0.1 },
  { name: 'Soft', muscle: 0, fat: 0.5, definition: 0 },
  { name: 'Chubby', muscle: 0, fat: 0.8, definition: 0 },
];

/** The build part of a shape back at the body as made (the step bar's Reset). */
const NORMAL_BUILD: Partial<CharacterShape> = {
  muscle: 0,
  fat: 0,
  fatPattern: 0,
  definition: 0,
  muscles: {},
  fatRegions: {},
};

/** One build slider: a label (with its zone colour), the range and its value in percent (signed for offsets). */
function BuildSlider({
  label,
  value,
  min = -1,
  max = 1,
  title,
  color,
  onChange,
  onShow,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  title?: string;
  /** The zone's colour in the Muscles view. */
  color?: string;
  onChange: (value: number) => void;
  /** Shows on the body what this slider changes (the muscle or fat view), when it is touched. */
  onShow?: () => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label
      title={title}
      className="grid grid-cols-[6rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-xs font-bold text-ink/75"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {color ? (
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={onShow}
        onFocus={onShow}
        className="w-full accent-ink"
      />
      <span className="text-right tabular-nums">{min < 0 && percent > 0 ? `+${percent}` : percent}%</span>
    </label>
  );
}

/** A number typed by the user, applied on Enter or when the field is left. */
function NumberField({
  label,
  unit,
  value,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number | null;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== '') onCommit(Number(draft));
    setDraft(null);
  };
  return (
    <label className="flex items-center gap-1.5 rounded-lg px-2 py-1 ring-1 ring-ink/15">
      <span className="text-ink/60">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={draft ?? value ?? ''}
        aria-label={`${label} in ${unit}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        className="w-full min-w-0 bg-transparent text-right tabular-nums text-ink outline-none"
      />
      <span className="text-ink/60">{unit}</span>
    </label>
  );
}

/** A titled group of sliders. */
function BuildGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-ink/10 pt-2.5">
      <p className="text-[11px] font-black uppercase tracking-wide text-ink/50">{title}</p>
      {children}
    </div>
  );
}

/**
 * A generated body's own controls (owner, Stage B): what it is (base, sex and style apart), height and weight, the
 * style's own shape (Anime Shape only on anime), and the five-step muscle and fat editor.
 */
function BuildControls({ editor }: { editor: CharacterEditor }) {
  const { recipe } = editor;
  const shape = recipe.shape;
  const [step, setStep] = useState(FULL_BODY_STEP);
  const set = (patch: Partial<CharacterShape>) =>
    editor.change((current) => ({ ...current, shape: { ...current.shape, ...patch } }));
  const kind = `${recipe.base} · ${recipe.sex} · ${recipe.style}`;
  // Touching a muscle or fat slider shows that zone on the body (owner: see each muscle and fat region).
  const show = (view: 'muscles' | 'fat', muscle: number, fat: number) => () => {
    editor.setView(view);
    editor.stage.current?.setAnatomyFocus(muscle, fat);
  };
  const goTo = (next: number) => {
    setStep(next);
    const part = BODY_STEPS[next];
    if (part) {
      editor.setView('muscles');
      editor.stage.current?.setAnatomyFocus(0, 0);
      editor.stage.current?.lookFrom(part.face);
    } else editor.setView('normal');
  };
  // Typed height and weight (owner): the height sets the Height factor, the weight the body fat.
  const metres = editor.info?.height ?? null;
  const setHeight = (centimetres: number) => {
    if (!metres || !(centimetres > 0)) return;
    const limits = CHARACTER_SHAPE_LIMITS.height;
    // The Height factor stretches the body below the head; the head (~24 cm, scaled by Size) stays.
    const head = 0.24 * shape.scale;
    const factor = (shape.height * (centimetres / 100 - head)) / (metres - head);
    const height = Math.min(limits.max, Math.max(limits.min, factor));
    set({ height: Math.round(height * 100) / 100 });
  };
  const setWeight = (kilograms: number) => {
    if (metres && kilograms > 0) set({ fat: fatForWeight(kilograms, metres) });
  };
  const part = BODY_STEPS[step];
  return (
    <>
      <p className="text-xs font-semibold capitalize text-ink/60">
        Character <b className="text-ink">{kind}</b>
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs font-bold text-ink/75">
        <NumberField
          label="Height"
          unit="cm"
          value={metres ? Math.round(metres * 100) : null}
          onCommit={setHeight}
        />
        <NumberField
          label="Weight"
          unit="kg"
          value={metres ? Math.round(weightForFat(shape.fat, metres)) : null}
          onCommit={setWeight}
        />
      </div>
      {recipe.style === 'anime' ? (
        <BuildSlider
          label="Anime"
          value={shape.anime}
          min={0}
          title="Anime shape: bigger eyes, smaller nose and mouth, slimmer jaw"
          onChange={(anime) => set({ anime })}
        />
      ) : null}
      <nav aria-label="Body steps" className="grid grid-cols-5 gap-1 border-t border-ink/10 pt-2.5">
        {[...BODY_STEPS.map((one) => one.title), 'Full body'].map((title, index) => (
          <button
            key={title}
            type="button"
            aria-current={step === index ? 'step' : undefined}
            title={title}
            onClick={() => goTo(index)}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[10px] font-bold leading-tight transition ${
              step === index ? 'bg-ink text-on-brand' : 'text-ink/70 ring-1 ring-ink/15 hover:text-ink'
            }`}
          >
            <span className="text-sm font-black tabular-nums">{index + 1}</span>
            <span className="w-full truncate text-center">{title}</span>
          </button>
        ))}
      </nav>
      {part ? (
        <>
          <BuildGroup title={`${part.title}: muscles`}>
            {part.muscles.map((zone) => (
              <BuildSlider
                key={zone}
                label={MUSCLE_LABEL[zone]}
                color={MUSCLE_ZONE_COLORS[zone]}
                value={shape.muscles[zone] ?? 0}
                onShow={show('muscles', MUSCLE_GROUPS.indexOf(zone) + 1, 0)}
                onChange={(value) => set({ muscles: { ...shape.muscles, [zone]: value } })}
              />
            ))}
          </BuildGroup>
          <BuildGroup title={`${part.title}: shape`}>
            {part.fat.map((region) => (
              <BuildSlider
                key={region}
                label={FAT_LABEL[region]}
                value={shape.fatRegions[region] ?? 0}
                onShow={show('fat', 0, FAT_REGIONS.indexOf(region) + 1)}
                onChange={(value) => set({ fatRegions: { ...shape.fatRegions, [region]: value } })}
              />
            ))}
          </BuildGroup>
        </>
      ) : (
        <>
          <BuildGroup title="Body type">
            <div className="grid grid-cols-2 gap-1.5">
              {BODY_PRESETS.map((preset) => {
                const on =
                  shape.muscle === preset.muscle &&
                  shape.fat === preset.fat &&
                  shape.definition === preset.definition;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        muscle: preset.muscle,
                        fat: preset.fat,
                        definition: preset.definition,
                        fatPattern: 0,
                      })
                    }
                    className={`rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                      on ? 'bg-ink text-on-brand' : 'text-ink/75 ring-1 ring-ink/15 hover:text-ink'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </BuildGroup>
          <BuildGroup title="Whole body">
            <BuildSlider
              label="Muscle"
              value={shape.muscle}
              onShow={show('muscles', 0, 0)}
              onChange={(muscle) => set({ muscle })}
            />
            <BuildSlider
              label="Body mass"
              value={shape.fat}
              min={0}
              max={MAX_BODY_FAT}
              title="Overall body fat"
              onShow={show('fat', 0, 0)}
              onChange={(fat) => set({ fat })}
            />
            <BuildSlider
              label="Definition"
              value={shape.definition}
              min={0}
              title="How clearly the muscles show (the lines between them); fat softens it"
              onShow={show('muscles', 0, 0)}
              onChange={(definition) => set({ definition })}
            />
            <BuildSlider
              label="Fat spread"
              value={shape.fatPattern}
              title="Where the fat goes: left the belly and waist, right the hips, buttocks and thighs"
              onShow={show('fat', 0, 0)}
              onChange={(fatPattern) => set({ fatPattern })}
            />
            {/* Save and bake use the dev server's /api/dev endpoints, so the painter stays a development tool. */}
      {process.env.NODE_ENV === 'development' ? <MusclePaintPanel editor={editor} /> : null}
            <button
              type="button"
              onClick={() => set(NORMAL_BUILD)}
              className="self-end rounded-lg px-2 py-1 text-xs font-bold text-ink/70 ring-1 ring-ink/15 hover:text-ink"
            >
              Reset muscle and fat
            </button>
          </BuildGroup>
        </>
      )}
    </>
  );
}

type FacePart = keyof typeof FACE_PARTS;
const FACE_PART_LABEL: Record<FacePart, string> = {
  eyes: 'Eyes',
  brows: 'Brows',
  nose: 'Nose',
  mouth: 'Mouth',
  cheeks: 'Cheeks',
  jaw: 'Jaw',
  head: 'Head',
};
/** Each face control: its label and what the two ends of the slider do. */
const FACE_LABEL: Record<FaceFeature, { label: string; title: string }> = {
  eyeSize: { label: 'Size', title: 'Smaller eyes to the left, bigger to the right' },
  eyeOpen: { label: 'Opening', title: 'Narrower eyes to the left, more open to the right' },
  eyeSpacing: { label: 'Spacing', title: 'Eyes closer together to the left, further apart to the right' },
  eyeHeight: { label: 'Height', title: 'Eyes lower on the face to the left, higher to the right' },
  eyeTilt: { label: 'Tilt', title: 'Outer corners down to the left, up to the right' },
  eyeFold: { label: 'Inner fold', title: 'Less fold at the inner corner to the left, more to the right' },
  eyeDepth: { label: 'Depth', title: 'Eyes further out to the left, set deeper to the right' },
  browHeight: { label: 'Height', title: 'Brows lower to the left, higher to the right' },
  browAngle: { label: 'Angle', title: 'Outer ends down to the left, up to the right' },
  noseSize: { label: 'Size', title: 'Smaller nose to the left, bigger to the right' },
  noseWidth: { label: 'Width', title: 'Narrower nose to the left, wider to the right' },
  noseLength: { label: 'Length', title: 'Shorter nose to the left, longer to the right' },
  noseBridge: { label: 'Bridge', title: 'A curved-in bridge to the left, a bump to the right' },
  noseTip: { label: 'Tip', title: 'Tip down to the left, up to the right' },
  nostrils: { label: 'Nostrils', title: 'Narrower nostrils to the left, wider to the right' },
  noseDepth: { label: 'Depth', title: 'Flatter nose to the left, further out to the right' },
  mouthWidth: { label: 'Width', title: 'Narrower mouth to the left, wider to the right' },
  mouthHeight: { label: 'Height', title: 'Mouth lower to the left, higher to the right' },
  upperLip: { label: 'Upper lip', title: 'Thinner upper lip to the left, fuller to the right' },
  lowerLip: { label: 'Lower lip', title: 'Thinner lower lip to the left, fuller to the right' },
  mouthCorners: { label: 'Corners', title: 'Corners down to the left, up to the right' },
  cheekVolume: { label: 'Fullness', title: 'Thinner cheeks to the left, fuller to the right' },
  cheekBones: { label: 'Cheekbones', title: 'Flatter cheekbones to the left, stronger to the right' },
  cheekInner: { label: 'Puff', title: 'Hollow cheeks to the left, puffed to the right' },
  chinWidth: { label: 'Chin width', title: 'Narrower chin to the left, wider to the right' },
  chinHeight: { label: 'Chin height', title: 'Shorter chin to the left, taller to the right' },
  chinForward: { label: 'Chin forward', title: 'Chin back to the left, forward to the right' },
  jawWidth: { label: 'Jaw width', title: 'Narrower jaw to the left, wider to the right' },
  headWidth: { label: 'Width', title: 'Narrower head to the left, wider to the right' },
  headLength: { label: 'Length', title: 'Shorter head to the left, longer to the right' },
};

/** Labels of the hair, eyebrow and beard assets (HAIR-01; CC0 MakeHuman assets). */
const HAIR_LABEL: Record<string, string> = {
  'hair.short01': 'Short 1',
  'hair.short02': 'Short 2',
  'hair.short03': 'Short 3',
  'hair.short04': 'Short 4',
  'brows.eyebrow001': 'Thin',
  'brows.eyebrow006': 'Medium',
  'brows.eyebrow010': 'Thick',
  'beard.viking': 'Full beard',
  'beard.moustache': 'Moustache',
};
const HAIR_ROWS: ReadonlyArray<{ slot: keyof HumanHair; title: string; styles: readonly string[] }> = [
  { slot: 'head', title: 'Hair', styles: HUMAN_HAIR_STYLES },
  { slot: 'brows', title: 'Eyebrows', styles: HUMAN_BROW_STYLES },
  { slot: 'beard', title: 'Beard', styles: HUMAN_BEARD_STYLES },
];

/** Real hair, eyebrows and beard (owner, HAIR-01): one choice per part (or none) and the hair colour for all. */
function HairChoices({ editor }: { editor: CharacterEditor }) {
  const { recipe } = editor;
  const set = (slot: keyof HumanHair, style: string | undefined) =>
    editor.change((current) => {
      const hair: Record<string, string> = { ...current.hair };
      if (style) hair[slot] = style;
      else delete hair[slot];
      return { ...current, hair: hair as HumanHair };
    });
  return (
    <BuildGroup title="Hair, eyebrows and beard">
      {HAIR_ROWS.map((row) => (
        <div key={row.slot} className="flex flex-col gap-1">
          <p className="text-xs font-bold text-ink/75">{row.title}</p>
          <div className="grid grid-cols-3 gap-1">
            {[undefined, ...row.styles].map((style) => {
              const on = recipe.hair[row.slot] === style;
              return (
                <button
                  key={style ?? 'none'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set(row.slot, style)}
                  className={`rounded-lg px-1.5 py-1.5 text-xs font-bold transition ${
                    on ? 'bg-ink text-on-brand' : 'text-ink/75 ring-1 ring-ink/15 hover:text-ink'
                  }`}
                >
                  {style ? HAIR_LABEL[style] : 'None'}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <label className="flex items-center justify-between text-xs font-bold text-ink/75">
        Hair colour
        <input
          type="color"
          value={recipe.colors.hair}
          aria-label="Hair colour"
          onChange={(event) => {
            const hair = event.target.value;
            editor.change((current) => ({ ...current, colors: { ...current.colors, hair } }));
          }}
          className="h-7 w-12 cursor-pointer rounded-md bg-transparent"
        />
      </label>
    </BuildGroup>
  );
}

/**
 * Face from a photo (FACE-02, owner notes 82/86): the person picks a photo, the face model reads it in this browser
 * (the photo is never sent or kept), and the face controls are set to the nearest face our head can make. The
 * previous face can be put back.
 */
function FaceFromPhoto({ editor }: { editor: CharacterEditor }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previous, setPrevious] = useState<CharacterShape['face'] | null>(null);
  const read = async (file: File) => {
    setBusy(true);
    setMessage('Reading the face...');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const result = await readFace(image);
      if ('problem' in result) {
        setMessage(PHOTO_PROBLEM_TEXT[result.problem]);
        return;
      }
      const face = fitFace(result.measures);
      setPrevious(editor.recipe.shape.face);
      editor.change((current) => ({ ...current, shape: { ...current.shape, face } }));
      editor.stage.current?.focusFace();
      setMessage('The face follows the photo now. Fine-tune it with the sliders below.');
    } catch {
      setMessage('The face could not be read on this device.');
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <BuildGroup title="Face from a photo">
      <p className="text-xs text-ink/70">
        One face, looking straight into the camera, head straight, good light, the face filling most of the photo. The
        photo stays on this device and is not saved.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Photo of a face"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
        }}
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex-1 rounded-lg bg-ink px-2 py-1.5 text-xs font-bold text-on-brand disabled:opacity-50"
        >
          {busy ? 'Reading...' : 'Choose a photo'}
        </button>
        {previous && !busy ? (
          <button
            type="button"
            onClick={() => {
              editor.change((current) => ({ ...current, shape: { ...current.shape, face: previous } }));
              setPrevious(null);
              setMessage('The face is back as it was.');
            }}
            className="rounded-lg px-2 py-1.5 text-xs font-bold text-ink/70 ring-1 ring-ink/15 hover:text-ink"
          >
            Undo photo
          </button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-xs font-semibold text-ink/80">
          {message}
        </p>
      ) : null}
    </BuildGroup>
  );
}

/**
 * The face controls of a generated body (FACE-01, owner notes 82/86): one part at a time (eyes, brows, nose, mouth,
 * cheeks, jaw, head), each control from -100 to +100 %, the camera on the face while they are used.
 */
export function FaceSection({ editor }: { editor: CharacterEditor }) {
  const { recipe } = editor;
  const [part, setPart] = useState<FacePart>('eyes');
  // The camera goes to the face when the face controls open (only on a body that has them).
  const generated = findBody(recipe.body).generated === 'human';
  useEffect(() => {
    if (generated) editor.stage.current?.focusFace();
  }, [editor.stage, generated]);
  if (!generated)
    return <p className="text-xs font-semibold text-ink/60">{recipe.body === 'robot' ? 'Use Facial Expressions in Moves to change the screen expression.' : 'Face controls are for the generated human body.'}</p>;
  const face = recipe.shape.face;
  const set = (feature: FaceFeature, value: number) =>
    editor.change((current) => ({
      ...current,
      shape: { ...current.shape, face: { ...current.shape.face, [feature]: value } },
    }));
  const lookAtFace = () => editor.stage.current?.focusFace();
  return (
    <div className="flex flex-col gap-2.5">
      <FaceFromPhoto editor={editor} />
      <HairChoices editor={editor} />
      <nav aria-label="Face parts" className="grid grid-cols-7 gap-1">
        {(Object.keys(FACE_PARTS) as FacePart[]).map((one) => (
          <button
            key={one}
            type="button"
            aria-current={part === one ? 'step' : undefined}
            onClick={() => {
              setPart(one);
              lookAtFace();
            }}
            className={`truncate rounded-lg px-0.5 py-1.5 text-[10px] font-bold transition ${
              part === one ? 'bg-ink text-on-brand' : 'text-ink/70 ring-1 ring-ink/15 hover:text-ink'
            }`}
          >
            {FACE_PART_LABEL[one]}
          </button>
        ))}
      </nav>
      <BuildGroup title={FACE_PART_LABEL[part]}>
        {FACE_PARTS[part].map((feature) => (
          <BuildSlider
            key={feature}
            label={FACE_LABEL[feature].label}
            title={FACE_LABEL[feature].title}
            value={face[feature] ?? 0}
            onShow={lookAtFace}
            onChange={(value) => set(feature, value)}
          />
        ))}
      </BuildGroup>
      <button
        type="button"
        onClick={() => editor.change((current) => ({ ...current, shape: { ...current.shape, face: {} } }))}
        className="self-end rounded-lg px-2 py-1 text-xs font-bold text-ink/70 ring-1 ring-ink/15 hover:text-ink"
      >
        Reset face
      </button>
    </div>
  );
}

const PART_LABEL: Record<CharacterColorPart, string> = {
  skin: 'Skin',
  hair: 'Hair',
  top: 'Top',
  bottom: 'Bottom',
  shoes: 'Shoes',
  tint: 'Tint',
};

/**
 * Skin tones by look (owner, CHAR-02: every colour, with realistic, anime and cartoon skins, and fantasy skins),
 * from the shared palettes in lib/character-palettes.ts. The picker gives any other colour.
 */
const SKIN_GROUPS: { name: string; colors: string[] }[] = [
  { name: 'Realistic', colors: LOOK_PALETTES.realistic.skin },
  { name: 'Anime', colors: LOOK_PALETTES.anime.skin },
  { name: 'Cartoon', colors: LOOK_PALETTES.cartoon.skin },
  { name: 'Fantasy', colors: FANTASY_SKINS.map((skin) => skin.base) },
];

const PALETTES: Record<CharacterColorPart, string[]> = {
  skin: ['#fde7d6', '#f6d2b8', '#f0c4a6', '#e2a983', '#c98d63', '#a86b45', '#7f4d31', '#5a3522'],
  hair: LOOK_PALETTES.realistic.hair,
  top: CLOTHES_PALETTE,
  bottom: CLOTHES_PALETTE,
  shoes: CLOTHES_PALETTE,
  tint: ['#ffffff', '#f2e6d8', '#e6e6f2', '#dcefe4', '#f2dcdc', '#d8d8d8', '#bfbfbf'],
};

/** Colour areas: block bodies paint skin, hair and clothes; mesh bodies take one tint over their texture. */
export function ColorSection({ editor }: { editor: CharacterEditor }) {
  const { recipe } = editor;
  // Our generated body (CHAR-02) takes a skin colour; its base shorts are a test garment (clothes come later).
  const generated = findBody(recipe.body).generated === 'human';
  const mesh = !generated && (Boolean(findBody(recipe.body).model) || recipe.body.startsWith('user.'));
  const parts: CharacterColorPart[] = generated
    ? ['skin']
    : mesh
      ? ['tint']
      : ['skin', 'hair', 'top', 'bottom', 'shoes'];
  const [chosen, setChosen] = useState<CharacterColorPart>('top');
  const part = parts.includes(chosen) ? chosen : parts[0]!;
  // A plain skin colour takes the place of a fantasy skin material.
  const set = (color: string) =>
    editor.change((current) => ({
      ...current,
      colors: { ...current.colors, [part]: color, ...(part === 'skin' ? { skinMaterial: '' } : {}) },
    }));
  return (
    <div className="flex flex-col gap-3">
      {mesh ? (
        <p className="text-xs font-semibold text-ink/60">
          This body has one texture: the tint colours all of it. Colour areas come with the new body.
        </p>
      ) : generated ? (
        <p className="text-xs font-semibold text-ink/60">Skin colour</p>
      ) : (
        <div role="radiogroup" aria-label="Colour area" className="grid grid-cols-5 gap-1">
          {parts.map((entry) => (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={part === entry}
              onClick={() => setChosen(entry)}
              className="flex flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-bold text-ink/70 hover:text-ink aria-checked:text-ink"
            >
              <span
                className={`size-8 rounded-full ring-1 ring-ink/15 ${part === entry ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                style={{ backgroundColor: recipe.colors[entry] }}
              />
              {PART_LABEL[entry]}
            </button>
          ))}
        </div>
      )}
      {(part === 'skin' ? SKIN_GROUPS : [{ name: '', colors: PALETTES[part] }]).map((group) => (
        <div key={group.name} className="flex flex-col gap-2">
          {group.name ? <p className="text-[11px] font-bold text-ink/50">{group.name}</p> : null}
          <div className="grid grid-cols-6 justify-items-center gap-y-2">
            {group.colors.map((color) => {
              const on = recipe.colors[part].toLowerCase() === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`${PART_LABEL[part]} ${group.name} ${color}`}
                  aria-pressed={on}
                  onClick={() => set(color)}
                  className={`size-8 rounded-full ring-1 ring-ink/15 transition active:scale-90 ${on ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-6 justify-items-center gap-y-2">
        <label
          title="Any colour"
          className="relative flex size-8 cursor-pointer items-center justify-center rounded-full bg-paper text-ink/70 ring-1 ring-ink/15 hover:text-ink"
        >
          <Pipette className="size-4" aria-hidden />
          <span className="sr-only">Any {PART_LABEL[part]} colour</span>
          <input
            type="color"
            value={recipe.colors[part]}
            onChange={(event) => set(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      {generated ? <SkinMaterialSection editor={editor} /> : null}
    </div>
  );
}

/**
 * A CSS picture of a skin material's pattern for its swatch (owner: the swatches must show the skin, not one dot).
 * Rough stand-ins for the engine's procedural patterns: thin crossing lines for cracks and veins, dots for stars,
 * spots and freckles, scallops for scales, bands for stripes, soft streaks for marble.
 */
function skinSwatch(material: SkinMaterial): string {
  const { base, secondary, patternColor: ink, emissive } = material;
  const ground = `linear-gradient(135deg, ${base}, ${secondary})`;
  const line = (angle: number, at: number, width = 2) =>
    `linear-gradient(${angle}deg, transparent ${at - width}%, ${ink} ${at - width / 2}% ${at + width / 2}%, transparent ${at + width}%)`;
  const dot = (x: number, y: number, size: number, color = ink) =>
    `radial-gradient(circle at ${x}% ${y}%, ${color} 0 ${size}%, transparent ${size + 1.5}%)`;
  const glow = emissive ? `, radial-gradient(circle at 50% 50%, ${emissive}33, transparent 70%)` : '';
  switch (material.pattern) {
    case 'cracks':
      return `${line(35, 30)}, ${line(-55, 55)}, ${line(110, 70)}, ${line(10, 82)}, ${line(-20, 18)}${glow}, ${ground}`;
    case 'veins':
      return `${line(60, 40, 1.5)}, ${line(-30, 62, 1.5)}, ${line(100, 25, 1.5)}${glow}, ${ground}`;
    case 'stars':
      return `${dot(25, 30, 3)}, ${dot(70, 22, 2)}, ${dot(55, 60, 4)}, ${dot(30, 72, 2)}, ${dot(80, 70, 2.5)}${glow}, ${ground}`;
    case 'spots':
      return `${dot(30, 30, 10)}, ${dot(70, 45, 12)}, ${dot(40, 75, 9)}, ${ground}`;
    case 'freckles':
      return `${dot(30, 40, 3)}, ${dot(45, 35, 2.5)}, ${dot(60, 42, 3)}, ${dot(38, 55, 2)}, ${dot(55, 58, 2.5)}, ${ground}`;
    case 'scales':
      return `radial-gradient(circle at 50% 0%, transparent 55%, ${ink} 58% 66%, transparent 68%), ${ground}`;
    case 'stripes':
      return `repeating-linear-gradient(105deg, ${ink} 0 10%, transparent 10% 28%), ${ground}`;
    case 'marble':
      return `${line(30, 35, 3)}, ${line(50, 65, 2)}, ${line(15, 80, 1.5)}, ${ground}`;
    default:
      return ground;
  }
}

/** Scales repeat as small tiles; every other pattern fills the swatch once. */
const swatchSize = (material: SkinMaterial) => (material.pattern === 'scales' ? '10px 10px, auto' : 'auto');

/**
 * Fantasy skin materials (owner + ChatGPT, CHAR-02): lava cracks, galaxy, moss stone, ... from the Core Library,
 * drawn by the engine as patterns on the skin. Each swatch shows the material's base and pattern colours.
 */
function SkinMaterialSection({ editor }: { editor: CharacterEditor }) {
  const chosen = editor.recipe.colors.skinMaterial;
  const pick = (id: string) =>
    editor.change((current) => ({ ...current, colors: { ...current.colors, skinMaterial: id } }));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold text-ink/50">Skin material</p>
      <div className="grid grid-cols-4 gap-2">
        {SKIN_MATERIALS.map((material) => {
          const on = chosen === material.id;
          return (
            <button
              key={material.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(on ? '' : material.id)}
              className="flex flex-col items-center gap-1 text-[10px] font-bold text-ink/70 hover:text-ink"
            >
              <span
                className={`size-10 rounded-full ring-1 ring-ink/15 transition active:scale-90 ${on ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                style={{ background: skinSwatch(material), backgroundSize: swatchSize(material) }}
              />
              <span className="line-clamp-1 text-center">{material.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MOVE_ICONS: Record<string, LucideIcon> = {
  Idle: PersonStanding,
  Walk: Footprints,
  Run: Footprints,
  Jump: ArrowUp,
  Swim: Waves,
  Climb: Mountain,
  SitGround: Armchair,
  Build: Hammer,
  Strike: Swords,
  Backpedal: Undo2,
  CrouchIdle: ArrowDown,
  CrouchWalk: ArrowDown,
  Sneak: Footprints,
  StrafeLeft: ArrowLeft,
  StrafeRight: ArrowRight,
  SprintStart: Zap,
  SprintStop: Zap,
  TurnLeft90: RotateCcw,
  TurnRight90: RotateCw,
  Turn180: Redo2,
  JumpForward: ArrowUpRight,
  JumpBackward: Undo2,
  LongJump: ArrowUpRight,
  SoftLanding: ArrowDown,
  HardLanding: ArrowDown,
  Slide: ArrowRight,
};

/** Every Core move and emote, played in a loop on the character. */
export function MovesSection({
  editor,
  columns = 'grid-cols-3',
}: {
  editor: CharacterEditor;
  columns?: string;
}) {
  const host = useStudioHost();
  const [category, setCategory] = useState('All'), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const emotes = new Set(CORE_EMOTES.map(animation => animation.clip));
  const native = CORE_ANIMATIONS.map(animation => ({
    id: animation.clip, name: animation.manifest.name, title: animation.manifest.name,
    categories: motionCategories(animation.manifest.name),
    Icon: emotes.has(animation.clip) ? animationIcon(animation.manifest.id) : MOVE_ICONS[animation.clip] ?? PersonStanding,
  }));
  const imported = avatarMotionEntries().map(entry => {
    const name = entry.name.replace(/^GENVR-[A-Z]+-\d+\s*·\s*/, '');
    const categories = motionCategories(name, entry.category);
    const category = categories[0]!;
    const icons: Record<string, LucideIcon> = { Idle: PersonStanding, Walking: Footprints, Running: Footprints, Jumping: ArrowUp, Swimming: Waves, Traversal: Mountain, Combat: Swords, Dance: animationIcon('genvr.core.animation.dance'), Gestures: animationIcon('genvr.core.animation.wave') };
    return { id: entry.id, name, title: entry.name, categories, Icon: icons[category] ?? PersonStanding };
  });
  const faceIcons: Record<string, LucideIcon> = { neutral: Meh, smile: Smile, angry: Angry, sad: Frown, surprised: CircleHelp, thinking: Brain };
  const faces = EXPRESSIONS.map(expression => ({ id: `face:${expression}`, name: expression.charAt(0).toUpperCase() + expression.slice(1), title: `Facial expression: ${expression}`, categories: ['Facial expressions'], Icon: faceIcons[expression]! }));
  const all = [...native, ...imported, ...faces];
  const selected = (id: string) => id.startsWith('face:') ? (editor.info?.expression ?? 'neutral') === id.slice(5) : (editor.info?.clip ?? editor.clip) === id;
  const play = (id: string) => {
    if (!id.startsWith('face:')) { editor.play(id); return; }
    const expression = id.slice(5) as typeof EXPRESSIONS[number];
    if (host.presentAvatar) host.presentAvatar({ kind: 'expression', target: 'self', expression, duration: 60000 });
    else editor.stage.current?.presentExpression(expression);
  };
  const favourites = new Set(editor.recipe.animations.emotes), idle = editor.recipe.animations.idle;
  const chosen = all.find(row => !row.id.startsWith('face:') && row.id === (editor.info?.clip ?? editor.clip));
  /** ★ keeps a move on the character (recipe.animations.emotes); agents use avatar_studio set the same way. */
  const toggleFavourite = (id: string) => editor.change(r => ({ ...r, animations: { ...r.animations, emotes: r.animations.emotes.includes(id) ? r.animations.emotes.filter(one => one !== id) : [...r.animations.emotes, id].slice(-16) } }));
  const useAsIdle = (id: string) => editor.change(r => ({ ...r, animations: { ...r.animations, idle: id } }));
  const savable = (id: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id);
  const matching = all.filter(row => `${row.name} ${row.title}`.toLowerCase().includes(query.toLowerCase()));
  const categories = ['All', 'Favourites', 'Facial expressions', ...MOTION_CATEGORIES.filter(value => all.some(row => row.categories.includes(value)))];
  const inCategory = (row: (typeof all)[number], value: string) => value === 'All' || (value === 'Favourites' ? favourites.has(row.id) : row.categories.includes(value as typeof MOTION_CATEGORIES[number]));
  const filtered = matching.filter(row => inCategory(row, category));
  return <div className="space-y-2">
    {all.length ? <>
      <input aria-label="Search moves" placeholder="Search moves and expressions" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} className="w-full rounded-lg bg-paper px-3 py-2 text-xs text-ink ring-1 ring-ink/10" />
      <div role="tablist" aria-label="Motion categories" className="flex flex-wrap gap-1 border-b border-ink/10 pb-2">
        {categories.map(value => <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => { setCategory(value); setPage(0); }} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${category === value ? 'bg-ink text-on-brand' : 'bg-paper hover:bg-ink/5'}`}>{value === 'Favourites' ? <Star className="size-3" aria-hidden /> : null}<span>{value === 'Facial expressions' ? 'Faces' : value}</span><span className="text-[10px] opacity-60">{matching.filter(row => inCategory(row, value)).length}</span></button>)}
      </div>
      {chosen ? <div aria-label="Chosen move" className="flex items-center gap-1.5 rounded-xl bg-paper p-2 text-xs">
        <chosen.Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1"><b className="block truncate">{chosen.name}</b><span className="text-[10px] text-ink/55">{chosen.id === idle ? 'Idle of this character' : 'Playing'}</span></span>
        <button type="button" disabled={!savable(chosen.id)} aria-pressed={favourites.has(chosen.id)} aria-label={favourites.has(chosen.id) ? 'Remove from favourites' : 'Add to favourites'} title="Favourite" onClick={() => toggleFavourite(chosen.id)} className="rounded-md p-1.5 hover:bg-ink/10 disabled:opacity-35"><Star className={`size-4 ${favourites.has(chosen.id) ? 'fill-current' : ''}`} /></button>
        <button type="button" disabled={!savable(chosen.id) || chosen.id === idle} onClick={() => useAsIdle(chosen.id)} className="rounded-md border border-ink/10 px-2 py-1 font-semibold hover:bg-ink/10 disabled:opacity-35">Use as idle</button>
      </div> : null}
      <p className="text-[11px] text-ink/60">{filtered.length} {category === 'Facial expressions' ? 'expressions' : 'items'}{category === 'Favourites' && !filtered.length ? ' · Play a move, then ★ it.' : ' · Some moves match multiple categories.'}</p>
    </> : null}
    <div role="radiogroup" aria-label="Moves" className={`grid gap-1.5 ${columns}`}>
      {filtered.slice(page * 60, (page + 1) * 60).map(({ id, name, title, Icon }) => <button key={id} type="button" role="radio" aria-label={title} title={title} aria-checked={selected(id)} onClick={() => play(id)} className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold transition active:scale-95 ${selected(id) ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/5'}`}>
        <Icon className="size-5" strokeWidth={1.8} aria-hidden />
        <span className="w-full truncate text-center leading-tight">{favourites.has(id) ? '★ ' : ''}{name}</span>
      </button>)}
    </div>
    {filtered.length > 60 ? <div className="flex items-center justify-between text-xs font-bold"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-40">Previous</button><span>{page + 1} / {Math.ceil(filtered.length / 60)}</span><button type="button" disabled={(page + 1) * 60 >= filtered.length} onClick={() => setPage(value => value + 1)} className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-40">Next</button></div> : null}
  </div>;
}

/** Name, save in this browser, export and import the recipe file, and the saved recipes. */
export function RecipeSection({ editor }: { editor: CharacterEditor }) {
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { recipe } = editor;
  const download = () => {
    const blob = new Blob([editor.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${recipe.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'character'}.character.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs font-bold text-ink/75">
        Name
        <input
          value={recipe.name}
          maxLength={60}
          onChange={(event) => {
            const name = event.target.value;
            editor.change((current) => ({ ...current, name: name.trim() ? name : current.name }));
          }}
          className="rounded-xl bg-paper px-3 py-2 text-sm font-semibold text-ink ring-1 ring-ink/10 outline-none focus:ring-ink/40"
        />
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        <ActionButton
          Icon={Save}
          label="Save character"
          primary
          onClick={() => {
            editor.save();
            setMessage(`Saved "${recipe.name}" in this browser.`);
          }}
        />
        <ActionButton Icon={Download} label="Export recipe" onClick={download} />
        <ActionButton Icon={Upload} label="Import recipe" onClick={() => file.current?.click()} />
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (event) => {
          const chosen = event.target.files?.[0];
          event.target.value = '';
          if (!chosen) return;
          const error =
            chosen.size > 8192 ? 'Recipe is larger than 8 KB' : editor.importText(await chosen.text());
          setMessage(error ?? `Loaded "${chosen.name}".`);
        }}
      />
      {message ? (
        <p role="status" className="text-xs font-semibold text-ink/60">
          {message}
        </p>
      ) : null}
      {editor.saved.length > 0 ? (
        <ul aria-label="Saved characters" className="mt-1 flex flex-col gap-1">
          {editor.saved.map((entry) => (
            <li key={entry.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => editor.load(entry.recipe)}
                className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-ink hover:bg-ink/5"
              >
                <span className="block truncate">{entry.recipe.name}</span>
                <span className="block truncate text-[10px] font-semibold text-ink/50">
                  {entry.recipe.body.startsWith('user.')
                    ? 'Uploaded body'
                    : findBody(entry.recipe.body).manifest.name}{' '}
                  · {Math.round(entry.recipe.shape.height * 100)}% height
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${entry.recipe.name}`}
                title="Delete"
                onClick={() => editor.remove(entry.id)}
                className="rounded-lg p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ActionButton({
  Icon,
  label,
  onClick,
  primary = false,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold ${
        primary ? 'bg-brand text-on-brand' : 'bg-paper text-ink hover:bg-ink/5'
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

/** The left dock of the Studio's Avatar tab: body, shape, colours and the recipe. */
export function CharacterControls({ editor }: { editor: CharacterEditor }) {
  const host = useStudioHost();
  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 [scrollbar-width:none]">
      {host.userAvatarControls ? <EditorSection title="Characters">{host.userAvatarControls('characters', '', body => editor.change(recipe => ({ ...recipe, body })))}</EditorSection> : null}
      <EditorSection title="Body"><BodySection editor={editor} /></EditorSection>
      <EditorSection title="Shape">
        <ShapeSection editor={editor} />
      </EditorSection>
      <EditorSection title="Face">
        <FaceSection editor={editor} />
      </EditorSection>
      <EditorSection title="Colours">
        <ColorSection editor={editor} />
      </EditorSection>
      <EditorSection title="Character recipe">
        <RecipeSection editor={editor} />
      </EditorSection>
    </div>
  );
}

/** The right dock of the Studio's Avatar tab: moves to play. */
export function CharacterMoves({ editor }: { editor: CharacterEditor }) {
  const host = useStudioHost();
  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-1 pb-3 [scrollbar-width:none]">
      <MovesSection editor={editor} />
      {host.userAvatarControls?.('motions')}
      {host.presentationControls?.('motions')}
    </div>
  );
}
