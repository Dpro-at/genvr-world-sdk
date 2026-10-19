'use client';

import {
  CHARACTER_RECIPE_VERSION,
  DEFAULT_CHARACTER_RECIPE,
  parseCharacterRecipe,
  readCharacterRecipe,
  type CharacterRecipe,
} from '@genvr/contracts';
import type {
  CharacterShading,
  CharacterStage,
  CharacterStageInfo,
  CharacterViewMode,
} from '@genvr/runtime/character';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { api } from '../../../lib/api';

/** A recipe kept in this browser (phase 1; the account and look items come in phase 2). */
export interface SavedRecipe {
  id: string;
  savedAt: number;
  recipe: CharacterRecipe;
}

const DRAFT_KEY = 'genvr-character-draft-v1';
const SAVED_KEY = 'genvr-character-recipes-v1';
const MAX_SAVED = 24;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and full storage: the editor still works, it just does not remember.
  }
}

/** The character editor's shared state: the stage view, the dock panels and the simple layout all use it. */
export interface CharacterEditor {
  recipe: CharacterRecipe;
  change: (update: (current: CharacterRecipe) => CharacterRecipe) => void;
  load: (recipe: CharacterRecipe) => void;
  view: CharacterViewMode;
  setView: (view: CharacterViewMode) => void;
  shading: CharacterShading;
  setShading: (shading: CharacterShading) => void;
  grid: boolean;
  setGrid: (on: boolean) => void;
  handsUp: boolean;
  setHandsUp: (on: boolean) => void;
  clip: string;
  play: (clip: string) => void;
  info: CharacterStageInfo | null;
  setInfo: (info: CharacterStageInfo | null) => void;
  /** The live stage (null until the 3D view is up). */
  stage: RefObject<CharacterStage | null>;
  saved: SavedRecipe[];
  save: () => void;
  remove: (id: string) => void;
  /** Reads a recipe file; returns an error message, or null when it was loaded. */
  importText: (text: string) => string | null;
  exportJson: () => string;
  /** The creator's own uploaded bodies (signed in), shown after Genvr's bodies. */
  myBodies: Array<{ id: `user.${string}`; name: string }>;
  /** Character edits step back and forward (AV-UNDO): a slider drag is one step. */
  undo: () => boolean;
  redo: () => boolean;
}

/** Changes closer together than this (a slider drag, typing a name) are one undo step. */
const STEP_GAP_MS = 700;
const MAX_STEPS = 100;

export function useCharacterEditor(): CharacterEditor {
  const [recipe, setRecipe] = useState<CharacterRecipe>(DEFAULT_CHARACTER_RECIPE);
  const [view, setView] = useState<CharacterViewMode>('normal');
  const [shading, setShading] = useState<CharacterShading>('smooth');
  const [grid, setGrid] = useState(true);
  const [handsUp, setHandsUp] = useState(true);
  const [clip, setClip] = useState('Idle');
  const [info, setInfo] = useState<CharacterStageInfo | null>(null);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [myBodies, setMyBodies] = useState<CharacterEditor['myBodies']>([]);
  const stage = useRef<CharacterStage | null>(null);

  // The draft and the saved list from this browser.
  useEffect(() => {
    setRecipe(readCharacterRecipe(readStorage<unknown>(DRAFT_KEY, null)));
    const list = readStorage<unknown>(SAVED_KEY, []);
    setSaved(
      (Array.isArray(list) ? list : [])
        .filter(
          (entry): entry is SavedRecipe => typeof entry === 'object' && entry !== null && 'recipe' in entry,
        )
        .map((entry) => ({
          id: String(entry.id),
          savedAt: Number(entry.savedAt) || 0,
          recipe: readCharacterRecipe(entry.recipe),
        }))
        .slice(0, MAX_SAVED),
    );
  }, []);

  // Uploaded bodies the signed-in creator may use (failures leave Genvr's bodies only).
  useEffect(() => {
    let cancelled = false;
    api
      .GET('/v1/me/bodies')
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMyBodies(
          data.bodies
            .filter(
              (body) =>
                body.status !== 'rejected' && body.status !== 'removed' && body.id.startsWith('user.'),
            )
            .map((body) => ({ id: body.id as `user.${string}`, name: body.name })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = useRef(recipe);
  latest.current = recipe;
  const past = useRef<CharacterRecipe[]>([]);
  const future = useRef<CharacterRecipe[]>([]);
  const lastStep = useRef(0);
  const change = useCallback((update: (current: CharacterRecipe) => CharacterRecipe) => {
    setRecipe((current) => {
      const next = readCharacterRecipe(update(current));
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      const now = Date.now();
      if (now - lastStep.current > STEP_GAP_MS) {
        past.current = [...past.current, current].slice(-MAX_STEPS);
        future.current = [];
      }
      lastStep.current = now;
      writeStorage(DRAFT_KEY, next);
      return next;
    });
  }, []);
  const step = useCallback((from: RefObject<CharacterRecipe[]>, to: RefObject<CharacterRecipe[]>) => {
    const target = from.current.at(-1);
    if (!target) return false;
    from.current = from.current.slice(0, -1);
    // Read outside the state updater, which React may run twice.
    to.current = [...to.current, latest.current].slice(-MAX_STEPS);
    writeStorage(DRAFT_KEY, target);
    setRecipe(target);
    lastStep.current = 0;
    return true;
  }, []);
  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);
  const load = useCallback((next: CharacterRecipe) => change(() => next), [change]);

  const play = useCallback((name: string) => {
    setClip(name);
    stage.current?.play(name);
  }, []);

  const save = useCallback(() => {
    setSaved((list) => {
      const same = list.find((entry) => entry.recipe.name === recipe.name);
      const entry: SavedRecipe = {
        id: same?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        savedAt: Date.now(),
        recipe,
      };
      const next = [entry, ...list.filter((one) => one.id !== entry.id)].slice(0, MAX_SAVED);
      writeStorage(SAVED_KEY, next);
      return next;
    });
  }, [recipe]);

  const remove = useCallback((id: string) => {
    setSaved((list) => {
      const next = list.filter((entry) => entry.id !== id);
      writeStorage(SAVED_KEY, next);
      return next;
    });
  }, []);

  const importText = useCallback(
    (text: string) => {
      const result = parseCharacterRecipe(text);
      if (!result.ok) return result.error;
      load(result.recipe);
      return null;
    },
    [load],
  );

  const exportJson = useCallback(
    () => JSON.stringify({ ...recipe, version: CHARACTER_RECIPE_VERSION }, null, 2),
    [recipe],
  );

  return {
    recipe,
    change,
    load,
    view,
    setView,
    shading,
    setShading,
    grid,
    setGrid,
    handsUp,
    setHandsUp,
    clip,
    play,
    info,
    setInfo,
    stage,
    saved,
    save,
    remove,
    importText,
    exportJson,
    undo,
    redo,
    myBodies,
  };
}
