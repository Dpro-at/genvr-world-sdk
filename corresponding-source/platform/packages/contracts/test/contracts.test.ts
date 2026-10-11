import { describe, expect, it } from 'vitest';
import {
  AccessPolicy,
  Command,
  COMMAND_TYPES,
  contractJsonSchemas,
  EventName,
  EventProperties,
  GenvrManifest,
  isListed,
  SIZE_TIERS,
  WorldDocument,
} from '../src/index.js';
import { emptyWorld, seaWaterManifest } from './fixtures.js';

const envelope = {
  id: '4f0e1d6a-8c3b-4c5e-9a41-2b7f3c9d1e20',
  author: { kind: 'user', id: 'user-1' },
  experienceId: 'exp-001',
  baseVersion: 0,
  timestamp: 1_790_000_000_000,
} as const;

describe('WorldDocument', () => {
  it('accepts an empty private world and fills defaults', () => {
    const world = WorldDocument.parse(emptyWorld);
    expect(world.instances).toEqual([]);
    expect(world.terrain.chunkSizeMeters).toBe(64);
    expect(world.spawn.rotation).toEqual([0, 0, 0, 1]);
    expect(world.environment.water).toEqual([]);
  });

  it('rejects an unknown style', () => {
    const result = WorldDocument.safeParse({ ...emptyWorld, style: { base: 'pixel' } });
    expect(result.success).toBe(false);
  });

  it('rejects malformed terrain chunk keys', () => {
    const result = WorldDocument.safeParse({ ...emptyWorld, terrain: { chunks: { a: 'key' } } });
    expect(result.success).toBe(false);
  });
});

describe('Command', () => {
  it('accepts a draw_road command', () => {
    const command = Command.parse({
      ...envelope,
      type: 'draw_road',
      params: {
        roadId: 'road-1',
        points: [
          [0, 0],
          [10, 5],
          [20, 5],
        ],
      },
    });
    expect(command.type).toBe('draw_road');
  });

  it('rejects a road with a single point', () => {
    const result = Command.safeParse({
      ...envelope,
      type: 'draw_road',
      params: { roadId: 'road-1', points: [[0, 0]] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown command type', () => {
    const result = Command.safeParse({ ...envelope, type: 'delete_world', params: {} });
    expect(result.success).toBe(false);
  });

  it('rejects params that belong to another command type', () => {
    const result = Command.safeParse({
      ...envelope,
      type: 'place_item',
      params: {
        roadId: 'road-1',
        points: [
          [0, 0],
          [1, 1],
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('lists every command type once', () => {
    expect(new Set(COMMAND_TYPES).size).toBe(COMMAND_TYPES.length);
    expect(COMMAND_TYPES).toContain('place_item');
    expect(COMMAND_TYPES).toContain('draw_wall');
  });
});

describe('GenvrManifest', () => {
  it('accepts the core sea water item', () => {
    const manifest = GenvrManifest.parse(seaWaterManifest);
    expect(manifest.id).toBe('genvr.core.water.sea');
  });

  it('rejects a paid item without a positive coin price', () => {
    const result = GenvrManifest.safeParse({
      ...seaWaterManifest,
      price: { type: 'paid', coins: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects ids with uppercase letters', () => {
    const result = GenvrManifest.safeParse({ ...seaWaterManifest, id: 'Genvr.Core' });
    expect(result.success).toBe(false);
  });
});

describe('AccessPolicy', () => {
  it('requires a password hash for password mode', () => {
    expect(AccessPolicy.safeParse({ mode: 'password' }).success).toBe(false);
  });

  it('lists only public and subscription worlds', () => {
    expect(isListed({ mode: 'public' })).toBe(true);
    expect(isListed({ mode: 'private' })).toBe(false);
    expect(isListed({ mode: 'class', classId: 'class-7a' })).toBe(false);
  });
});

describe('size tiers', () => {
  it('caps the largest world at 8 km and 100 players', () => {
    expect(SIZE_TIERS.max).toEqual({ sideMeters: 8000, maxPlayers: 100 });
  });
});

describe('analytics events', () => {
  it('accepts catalog events with scalar properties', () => {
    expect(EventName.parse('experience_played')).toBe('experience_played');
    expect(EventProperties.parse({ genre: 'obby', fps: 58 })).toEqual({ genre: 'obby', fps: 58 });
  });

  it('rejects unknown events and free-text properties', () => {
    expect(EventName.safeParse('chat_sent').success).toBe(false);
    expect(EventProperties.safeParse({ message: 'hello' }).success).toBe(false);
  });
});

describe('JSON Schema export', () => {
  it('produces schemas for every contract', () => {
    const schemas = contractJsonSchemas();
    expect(Object.keys(schemas)).toEqual([
      'WorldDocument',
      'Command',
      'CommandPayload',
      'GenvrManifest',
      'AccessPolicy',
    ]);
    expect(schemas.GenvrManifest).toHaveProperty('properties');
  });
});
