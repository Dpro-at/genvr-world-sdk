'use client';

import { useStudioHost } from '../../../lib/studio-host';

import type { CharacterStage } from '@genvr/runtime/character';
import {
  Bone,
  Box,
  Circle,
  Droplet,
  Eye,
  Grid3x3,
  HeartPulse,
  Orbit,
  PersonStanding,
  RotateCcw,
  ScanFace,
  ScanEye,
  SlidersHorizontal,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CharacterEditor } from './use-character-editor';

/**
 * Stage backdrops (owner, CHAR-02: pick a background the character stands out on). `theme` follows the site's
 * light or dark look; the others are fixed colours. Remembered in this browser only.
 */
const BACKDROPS = [
  { id: 'theme', label: 'Theme', css: 'radial-gradient(ellipse at 50% 40%, var(--surface), var(--paper) 75%)' },
  { id: 'white', label: 'White', css: 'radial-gradient(ellipse at 50% 40%, #ffffff, #e9e9ec 75%)' },
  { id: 'grey', label: 'Grey', css: 'radial-gradient(ellipse at 50% 40%, #a9abb2, #6f727a 75%)' },
  { id: 'dark', label: 'Dark', css: 'radial-gradient(ellipse at 50% 40%, #2b2c31, #0d0d10 75%)' },
  { id: 'sky', label: 'Sky', css: 'linear-gradient(180deg, #8ec5ff 0%, #d9ecff 62%, #c9d7b8 100%)' },
  { id: 'warm', label: 'Warm', css: 'radial-gradient(ellipse at 50% 40%, #f6e7d2, #c9b293 80%)' },
] as const;
type BackdropId = (typeof BACKDROPS)[number]['id'];
const BACKDROP_KEY = 'genvr.character.backdrop';

function readBackdrop(): BackdropId {
  try {
    const saved = window.localStorage.getItem(BACKDROP_KEY);
    return BACKDROPS.some((one) => one.id === saved) ? (saved as BackdropId) : 'theme';
  } catch {
    return 'theme';
  }
}

type ViewMode = CharacterEditor['view'];

const MODES: Array<{ id: ViewMode; label: string; Icon: LucideIcon }> = [
  { id: 'normal', label: 'Normal view', Icon: User },
  { id: 'first-person', label: 'First person (hands only)', Icon: Eye },
  { id: 'skeleton', label: 'Skeleton only', Icon: Bone },
  { id: 'skeleton-mesh', label: 'Skeleton and mesh', Icon: ScanEye },
  { id: 'wireframe', label: 'Wireframe (mesh topology)', Icon: Box },
  { id: 'clay', label: 'Clay (no texture)', Icon: Circle },
  { id: 'normals', label: 'Surface normals', Icon: Orbit },
  { id: 'muscles', label: 'Muscles (red)', Icon: HeartPulse },
  { id: 'fat', label: 'Body fat (yellow)', Icon: Droplet },
];

/** The page's ink and a soft grid colour from the theme tokens. */
function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue('--ink').trim() || '#0a0a0a';
  const grid = style.getPropertyValue('--neutral').trim() || '#d4d4d8';
  return { line: ink, grid };
}

const number = new Intl.NumberFormat('en');

/**
 * The 3D stage of the character editor (CHAR-01): the character centred on a calm gradient, one floating pill toolbar
 * at the bottom (view modes and view settings), the facts and the view cube at the top right.
 */
export function CharacterStageView({
  editor,
  compact = false,
}: {
  editor: CharacterEditor;
  compact?: boolean;
}) {
  const host = useStudioHost();
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [settings, setSettings] = useState(false);
  const [backdrop, setBackdrop] = useState<BackdropId>('theme');
  // Read after mount: the server render has no saved choice.
  useEffect(() => setBackdrop(readBackdrop()), []);
  const chooseBackdrop = (id: BackdropId) => {
    setBackdrop(id);
    try {
      window.localStorage.setItem(BACKDROP_KEY, id);
    } catch {
      // Private windows may refuse storage; the choice still applies now.
    }
  };
  const { recipe, view, shading, grid, handsUp, info, setInfo, stage } = editor;
  const first = useRef(recipe);
  first.current = recipe;

  useEffect(() => {
    let cancelled = false;
    let made: CharacterStage | null = null;
    let stop = () => {};
    void (async () => {
      try {
        const { createCharacterStage } = await import('@genvr/runtime/character');
        if (cancelled || !container.current) return;
        made = await createCharacterStage({
          container: container.current,
          recipe: first.current,
          colors: themeColors(),
          viewCube: !compact,
        });
        if (cancelled) {
          made.dispose();
          return;
        }
        stage.current = made;
        stop = made.onChange(setInfo);
        setInfo(made.info);
        host.presentationStage?.(made);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    // Theme switches recolour the bones, wire and grid.
    const recolor = () => stage.current?.setColors(themeColors());
    const observer = new MutationObserver(recolor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', recolor);
    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener('change', recolor);
      stop();
      made?.dispose();
      host.presentationStage?.(null);
      stage.current = null;
      setInfo(null);
    };
  }, [compact, setInfo, stage]);

  const ready = info !== null;
  useEffect(() => stage.current?.setRecipe(recipe), [recipe, ready, stage]);
  useEffect(() => stage.current?.setViewMode(view), [view, ready, stage]);
  useEffect(() => stage.current?.setShading(shading), [shading, ready, stage]);
  useEffect(() => stage.current?.setGrid(grid), [grid, ready, stage]);
  useEffect(() => stage.current?.setHandsUp(handsUp), [handsUp, ready, stage]);
  useEffect(() => {
    if (ready) stage.current?.play(editor.clip);
    // Only once the stage is up: later clips are played by `editor.play`.
  }, [ready]);

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden"
      style={{ background: BACKDROPS.find((one) => one.id === backdrop)!.css }}
    >
      <div ref={container} data-character-stage className="absolute inset-0" />
      {host.presentationOverlay?.()}
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-ink/60">
          This browser cannot show the 3D character.
        </p>
      ) : null}

      {/* Facts, top right beside the view cube. */}
      {info ? (
        <dl
          aria-label="Character facts"
          className={`pointer-events-none absolute top-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-xl bg-surface/80 px-3 py-2 text-[11px] font-semibold text-ink/70 shadow-sm backdrop-blur ${compact ? 'right-3' : 'right-[6.5rem]'}`}
        >
          <dt>Height</dt>
          <dd className="text-right font-black text-ink tabular-nums">{info.height.toFixed(2)} m</dd>
          {info.quads > 0 ? (
            <>
              <dt>Quads</dt>
              <dd className="text-right tabular-nums">{number.format(info.quads)}</dd>
            </>
          ) : null}
          <dt>{info.quads > 0 ? 'Triangles' : 'Faces'}</dt>
          <dd className="text-right tabular-nums">{number.format(info.faces)}</dd>
          {compact ? null : (
            <>
              <dt>Vertices</dt>
              <dd className="text-right tabular-nums">{number.format(info.vertices)}</dd>
            </>
          )}
          <dt>Bones</dt>
          <dd className="text-right tabular-nums">{info.bones}</dd>
          {info.ready ? null : (
            <dd role="status" className="col-span-2 pt-1 text-ink">
              Loading the model
            </dd>
          )}
        </dl>
      ) : null}

      {/* One pill toolbar at the bottom centre. */}
      <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
        <div
          role="toolbar"
          aria-label="View"
          className="relative flex max-w-full items-center gap-0.5 rounded-full bg-surface/90 p-1 shadow-lg ring-1 ring-ink/10 backdrop-blur"
        >
          <div role="radiogroup" aria-label="View mode" className="flex items-center gap-0.5">
            {MODES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={view === id}
                aria-label={label}
                title={label}
                onClick={() => editor.setView(id)}
                className={`flex size-9 items-center justify-center rounded-full transition ${
                  view === id ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/10 hover:text-ink'
                }`}
              >
                <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
              </button>
            ))}
          </div>
          <span aria-hidden className="mx-1 h-5 w-px bg-ink/15" />
          <button
            type="button"
            aria-label="View settings"
            title="View settings"
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
            className={`flex size-9 items-center justify-center rounded-full ${settings ? 'bg-ink/10 text-ink' : 'text-ink/70 hover:bg-ink/10 hover:text-ink'}`}
          >
            <SlidersHorizontal className="size-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Face close-up"
            title="Face close-up"
            onClick={() => editor.stage.current?.focusFace()}
            className="flex size-9 items-center justify-center rounded-full text-ink/70 hover:bg-ink/10 hover:text-ink"
          >
            <ScanFace className="size-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Reset camera"
            title="Reset camera"
            onClick={() => editor.stage.current?.resetView()}
            className="flex size-9 items-center justify-center rounded-full text-ink/70 hover:bg-ink/10 hover:text-ink"
          >
            <RotateCcw className="size-[18px]" aria-hidden />
          </button>

          {settings ? (
            <div
              role="dialog"
              aria-label="View settings"
              className="absolute right-0 bottom-12 w-60 space-y-3 rounded-2xl bg-surface p-3 text-xs font-bold text-ink shadow-xl ring-1 ring-ink/10"
            >
              <div>
                <p className="mb-1.5 text-ink/60">Shading</p>
                <div
                  role="radiogroup"
                  aria-label="Shading"
                  className="grid grid-cols-2 gap-1 rounded-xl bg-paper p-1"
                >
                  {(['smooth', 'flat'] as const).map((one) => (
                    <button
                      key={one}
                      type="button"
                      role="radio"
                      aria-checked={shading === one}
                      onClick={() => editor.setShading(one)}
                      className={`rounded-lg py-1.5 capitalize ${shading === one ? 'bg-surface shadow' : 'text-ink/60 hover:text-ink'}`}
                    >
                      {one}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-ink/60">Background</p>
                <div role="radiogroup" aria-label="Background" className="grid grid-cols-6 gap-1.5">
                  {BACKDROPS.map((one) => (
                    <button
                      key={one.id}
                      type="button"
                      role="radio"
                      aria-checked={backdrop === one.id}
                      aria-label={`${one.label} background`}
                      title={one.label}
                      onClick={() => chooseBackdrop(one.id)}
                      className={`size-7 rounded-full ring-1 ring-ink/15 ${backdrop === one.id ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                      style={{ background: one.css }}
                    />
                  ))}
                </div>
              </div>
              <Toggle Icon={Grid3x3} label="Floor grid" on={grid} onChange={editor.setGrid} />
              <Toggle
                Icon={PersonStanding}
                label="Hands up in first person"
                on={handsUp}
                onChange={editor.setHandsUp}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  Icon,
  label,
  on,
  onChange,
}: {
  Icon: LucideIcon;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-2 rounded-lg py-1 text-left"
    >
      <Icon className="size-4 text-ink/60" aria-hidden />
      <span className="flex-1">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-ink' : 'bg-ink/20'}`}>
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all ${on ? 'left-[1.125rem]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
