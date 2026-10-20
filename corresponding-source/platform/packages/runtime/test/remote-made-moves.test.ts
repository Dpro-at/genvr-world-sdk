import { describe, expect, it } from 'vitest';
import { LabMadeMotion } from '@genvr/contracts';
import { RemotePlayers } from '../src/remote-players.js';
import { labStandPose } from '../src/lab/index.js';

describe('other players and made motions (board M19)', () => {
  const motion = LabMadeMotion.parse({ id: 'made-wave', name: 'Wave', frames: 30, keys: [{ frame: 0, values: { ...labStandPose(), 'R.arm.up': 150 } }] });
  it("plays a place's made motion on another player who joins before or after it is known", () => {
    const remotes = new RemotePlayers();
    const state = { x: 0, y: 0, z: 0, yaw: 0, clip: 'Idle', name: 'Sam', look: '' };
    remotes.upsert('a', state);
    expect(remotes.playPresentation('a', 'motion:made-wave-v1')).toBe(false);
    remotes.setMadeMoves([{ id: 'wave-v1', motion, once: true }]);
    expect(remotes.playPresentation('a', 'motion:made-wave-v1')).toBe(true);
    remotes.upsert('b', { ...state, name: 'Lee' });
    expect(remotes.playPresentation('b', 'motion:made-wave-v1')).toBe(true);
  });
});
