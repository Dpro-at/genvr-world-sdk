'use client';

import { useEffect, useRef } from 'react';

/**
 * Calls `onPress(button)` once each time a game-controller button goes down (standard mapping,
 * see PAD in controls.ts). Movement, camera, jump, and sit are handled by the engine; this is for
 * the platform buttons (menu, chat, moves, menu actions).
 */
export function useGamepadButtons(onPress: (button: number) => void): void {
  const handler = useRef(onPress);
  handler.current = onPress;
  useEffect(() => {
    let frame = 0;
    let down: boolean[] = [];
    const poll = () => {
      const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected);
      const now = pad ? pad.buttons.map((button) => button.pressed) : [];
      now.forEach((pressed, index) => {
        if (pressed && !down[index]) handler.current(index);
      });
      down = now;
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);
}
