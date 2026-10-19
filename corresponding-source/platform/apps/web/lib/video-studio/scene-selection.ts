import { useSyncExternalStore } from 'react';

/** The scene chosen in the Scenes tab (FILM-C1): new takes join it and use its sound; the right panel shows its sheet. */
let chosen: string | null = null, workflow = false, shot: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const sceneSelection = {
  get: () => chosen,
  set: (id: string | null) => { if (id !== chosen) { chosen = id; emit(); } },
  workflow: () => workflow,
  setWorkflow: (open: boolean) => { if (open !== workflow) { workflow = open; if (!open) shot = null; emit(); } },
  /** The shot (media id) chosen in Workflow; the right panel shows its details. */
  shot: () => shot,
  setShot: (id: string | null) => { if (id !== shot) { shot = id; emit(); } },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useSceneSelection = () => useSyncExternalStore(sceneSelection.subscribe, sceneSelection.get, () => null);
export const useWorkflowOpen = () => useSyncExternalStore(sceneSelection.subscribe, sceneSelection.workflow, () => false);
export const useWorkflowShot = () => useSyncExternalStore(sceneSelection.subscribe, sceneSelection.shot, () => null);
