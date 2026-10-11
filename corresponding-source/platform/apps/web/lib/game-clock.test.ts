import { describe, expect, it } from 'vitest';
import { clockText, remaining } from './game-clock';

describe('remaining', () => {
  it('counts down in server time and never goes below zero', () => {
    expect(remaining(10_000, 500, 4_500)).toBe(5); // server now = 5000
    expect(remaining(10_000, 0, 12_000)).toBe(0);
  });
});

describe('clockText', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(clockText(300)).toBe('5:00');
    expect(clockText(65)).toBe('1:05');
    expect(clockText(0)).toBe('0:00');
  });
});
