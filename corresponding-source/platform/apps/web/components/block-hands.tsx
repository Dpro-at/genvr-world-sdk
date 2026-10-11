'use client';

import type { PlaceBlockLook } from '@genvr/contracts';
import { BLOCK_PIXELS, getBlock } from '@genvr/core-library';
import { HAND_BLOCKS, type GenvrRuntime, type HandsMode } from '@genvr/runtime';
import { ChevronUp, Pickaxe, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type RefObject } from 'react';

type HandBlock = (typeof HAND_BLOCKS)[number];

/** A block's side face as an image URL (clean or pixel, as the place looks). */
function sideImage(block: string, look: PlaceBlockLook): string | null {
  const pictures = getBlock(block)?.look;
  if (!pictures || typeof document === 'undefined') return null;
  const pixels = look === 'plain' ? pictures.plain.side : pictures.side;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BLOCK_PIXELS;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(BLOCK_PIXELS, BLOCK_PIXELS);
  pixels.forEach((color, i) =>
    image.data.set([(color >> 16) & 255, (color >> 8) & 255, color & 255, 255], i * 4),
  );
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

const label = (block: string) => block.charAt(0).toUpperCase() + block.slice(1);

/**
 * Building with the avatar's hands (decision 109, P2-28): the block in hand, blocks left, and on
 * touch screens whether a tap places or digs. Computers dig with the left mouse button and place
 * with the right. Short answers (too far, another player's block) show above it for a moment.
 */
export function BlockHands({
  runtime,
  blockLook,
  left,
  note,
  forceTouch = false,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  blockLook: PlaceBlockLook;
  /** Blocks this player may still place, or null before the room said. */
  left: number | null;
  /** The latest answer to show for a moment (a new object each time). */
  note: { text: string } | null;
  /** Studio device emulator: touch controls even with a mouse. */
  forceTouch?: boolean;
}) {
  const [block, setBlock] = useState<HandBlock>('planks');
  const [mode, setMode] = useState<HandsMode>('place');
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const faces = useMemo(
    () => Object.fromEntries(HAND_BLOCKS.map((name) => [name, sideImage(name, blockLook)])),
    [blockLook],
  );

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    setTouch(query.matches);
    const onChange = (event: MediaQueryListEvent) => setTouch(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    runtime.current?.setHands({ block, mode });
  }, [runtime, block, mode]);
  useEffect(() => {
    if (!note) return;
    setShown(note.text);
    const timer = window.setTimeout(() => setShown(null), 2500);
    return () => window.clearTimeout(timer);
  }, [note]);

  const touchScreen = touch || forceTouch;
  const face = faces[block];
  return (
    <div className="relative flex flex-col items-center gap-2">
      {shown ? (
        <p role="status" className="rounded-xl bg-ink px-3 py-1.5 text-xs font-bold text-on-brand shadow">
          {shown}
        </p>
      ) : null}
      {open ? (
        <div
          role="listbox"
          aria-label="Block in hand"
          className="grid grid-cols-4 gap-1.5 rounded-2xl bg-surface/95 p-2 shadow-lg sm:grid-cols-6"
        >
          {HAND_BLOCKS.map((name) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={name === block}
              title={label(name)}
              onClick={() => {
                setBlock(name);
                setMode('place');
                setOpen(false);
              }}
              className={`rounded-lg p-1 ${name === block ? 'bg-ink/15 ring-2 ring-ink' : 'hover:bg-ink/10'}`}
            >
              {faces[name] ? (
                <img src={faces[name]!} alt="" className="size-9 rounded-md [image-rendering:pixelated]" />
              ) : (
                <span className="block size-9 rounded-md bg-ink/10" />
              )}
            </button>
          ))}
        </div>
      ) : null}
      <div
        role="toolbar"
        aria-label="Build with your hands"
        className="flex items-center gap-1 rounded-3xl bg-surface/90 p-1.5 shadow-lg"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Block in hand: ${label(block)}`}
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-1.5 rounded-2xl px-1.5 py-1 hover:bg-ink/10"
        >
          {face ? <img src={face} alt="" className="size-8 rounded-md [image-rendering:pixelated]" /> : null}
          <ChevronUp className={`size-4 transition ${open ? '' : 'rotate-180'}`} aria-hidden />
        </button>
        {touchScreen ? (
          <div className="flex rounded-2xl bg-ink/5 p-0.5">
            {(
              [
                ['place', Plus, 'Place'],
                ['dig', Pickaxe, 'Dig'],
              ] as const
            ).map(([id, Icon, name]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                aria-label={name}
                onClick={() => setMode(id)}
                className={`flex size-9 items-center justify-center rounded-xl ${
                  mode === id ? 'bg-ink text-on-brand' : 'text-ink/70'
                }`}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[11px] leading-tight text-ink/60">
            Left click digs
            <br />
            Right click places
          </p>
        )}
        {left !== null ? (
          <p className="px-2 text-xs font-bold tabular-nums text-ink/70" aria-label={`${left} blocks left`}>
            {left.toLocaleString('en-US')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
