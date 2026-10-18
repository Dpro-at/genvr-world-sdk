import { expect, it } from 'vitest';
import { motionCategories } from '../src/avatar-motion-categories.js';
it.each([
  ['Standing Clap', 'Interactions', 'Gestures'],
  ['Standing Death Forward 01', 'Reactions', 'Reactions'],
  ['Standing Aim Recoil', 'Interactions', 'Combat'],
  ['Standing Run Forward', 'Movement', 'Running'],
  ['Drunk Idle', 'Movement', 'Idle'],
  ['Stepping Backward', 'Movement', 'Walking'],
  ['SprintStart', '', 'Running'],
  ['SoftLanding', '', 'Jumping'],
])('classifies %s by action rather than a posture prefix', (name, source, expected) => {
  const categories = motionCategories(name, source);
  expect(categories).toContain(expected);
  expect(categories).not.toContain('Review');
  if (name !== 'Drunk Idle') expect(categories).not.toContain('Idle');
});
it('keeps combined locomotion discoverable without classifying drunk as run', () => {
  expect(motionCategories('Injured Run Jump', 'Movement')).toEqual(expect.arrayContaining(['Running', 'Jumping']));
  expect(motionCategories('Drunk Idle', 'Movement')).not.toContain('Running');
});
it('makes ambiguous unsupported labels visible for review', () => {
  expect(motionCategories('Unidentified Take', 'Movement')).toEqual(['Review']);
});
it('does not interpret a display code as an action', () => {
  expect(motionCategories('GENVR-IDLE-999 · Standing Clap', 'Idle')).toContain('Gestures');
  expect(motionCategories('GENVR-IDLE-999 · Standing Clap', 'Idle')).not.toContain('Idle');
});
