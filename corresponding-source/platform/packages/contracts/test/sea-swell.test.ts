import { describe, expect, it } from 'vitest';
import { CommandPayload as Command, Sea, SeaSwell, WorldDocument } from '../src/index.js';
import { emptyWorld } from './fixtures.js';

// The sea's optional swell (Tidewater sea, plan task 3): direction, period and height of the shore waves.
describe('sea swell', () => {
  it('reads an old sea unchanged: no swell key appears', () => {
    const sea = Sea.parse({ level: 20, params: {} });
    expect(sea).toEqual({ level: 20, params: {} });
    expect('swell' in sea).toBe(false);
    const doc = WorldDocument.parse({ ...emptyWorld, environment: { ...emptyWorld.environment, sea: { level: -1 } } });
    expect(doc.environment.sea).toEqual({ level: -1, params: {} });
  });

  it('keeps a swell with any of its three parts', () => {
    expect(Sea.parse({ level: 2, swell: { direction: 200 } }).swell).toEqual({ direction: 200 });
    expect(Sea.parse({ level: 2, swell: { period: 9, height: 0.34 } }).swell).toEqual({ period: 9, height: 0.34 });
    expect(Sea.parse({ level: 2, swell: {} }).swell).toEqual({});
  });

  it('refuses a swell out of range', () => {
    expect(SeaSwell.safeParse({ direction: 360 }).success).toBe(false);
    expect(SeaSwell.safeParse({ direction: -1 }).success).toBe(false);
    expect(SeaSwell.safeParse({ period: 5 }).success).toBe(false);
    expect(SeaSwell.safeParse({ period: 15 }).success).toBe(false);
    expect(SeaSwell.safeParse({ height: 1.6 }).success).toBe(false);
    expect(SeaSwell.safeParse({ height: -0.1 }).success).toBe(false);
  });

  it('set_sea takes a swell, null to clear it, or none to keep it', () => {
    expect(Command.safeParse({ type: 'set_sea', params: { level: 3 } }).success).toBe(true);
    expect(Command.safeParse({ type: 'set_sea', params: { level: 3, swell: { direction: 90 } } }).success).toBe(true);
    expect(Command.safeParse({ type: 'set_sea', params: { level: 3, swell: null } }).success).toBe(true);
    expect(Command.safeParse({ type: 'set_sea', params: { level: 3, swell: { period: 30 } } }).success).toBe(false);
  });
});
