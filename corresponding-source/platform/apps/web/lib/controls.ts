/**
 * Controls of every device in one place (docs/PLAYER-UI.md section 8). The Help tab shows these
 * lists, and the game-controller handling uses the same buttons, so Help never goes out of date.
 */
export type ControlDevice = 'computer' | 'touch' | 'xbox' | 'playstation' | 'vr';

export interface ControlGroup {
  title: string;
  rows: Array<[action: string, input: string]>;
  /** Only for owners and builders. */
  builders?: boolean;
}

/**
 * Standard controller buttons (Gamepad API standard mapping) and their names on each controller.
 * Index: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle, 5 RB/R1, 8 View/Create, 9 Menu/Options,
 * 12-15 D-pad up/down/left/right.
 */
export const PAD = {
  jump: 0,
  sit: 1,
  leave: 2,
  respawn: 3,
  /** Dash in side-view places that have it (decision 95); the runtime reads this button. */
  dash: 5,
  chat: 8,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

const BUTTON_NAMES: Record<'xbox' | 'playstation', Record<keyof typeof PAD, string>> = {
  xbox: {
    jump: 'A',
    sit: 'B',
    leave: 'X',
    respawn: 'Y',
    dash: 'RB',
    chat: 'View',
    menu: 'Menu',
    up: 'D-pad up',
    down: 'D-pad down',
    left: 'D-pad left',
    right: 'D-pad right',
  },
  playstation: {
    jump: 'Cross',
    sit: 'Circle',
    leave: 'Square',
    respawn: 'Triangle',
    dash: 'R1',
    chat: 'Create',
    menu: 'Options',
    up: 'D-pad up',
    down: 'D-pad down',
    left: 'D-pad left',
    right: 'D-pad right',
  },
};

function controllerGroups(kind: 'xbox' | 'playstation'): ControlGroup[] {
  const b = BUTTON_NAMES[kind];
  return [
    {
      title: 'Moving',
      rows: [
        ['Move', 'Left stick'],
        ['Look around', 'Right stick'],
        ['Jump', b.jump],
        ['Climb a ladder', 'Left stick up / down'],
        ['Dash (2D places that have it)', b.dash],
        ['Sit', b.sit],
        ['Moves 1 to 4', 'D-pad'],
      ],
    },
    {
      title: 'Menu',
      rows: [
        ['This menu', b.menu],
        ['Chat', b.chat],
        ['Back to the game (in the menu)', b.sit],
        ['Respawn (in the menu)', b.respawn],
        ['Leave (in the menu)', b.leave],
      ],
    },
  ];
}

export const CONTROLS: Record<ControlDevice, ControlGroup[]> = {
  computer: [
    {
      title: 'Moving',
      rows: [
        ['Move', 'W A S D'],
        ['Run', 'Shift'],
        ['Jump', 'Space'],
        ['Climb a ladder', 'W / S'],
        ['Drop through a platform (2D places)', 'S'],
        ['Dash (2D places that have it)', 'E'],
        ['Sit', 'C'],
        ['Moves', '1 - 8'],
        ['Look around', 'Drag'],
        ['Zoom', 'Wheel'],
      ],
    },
    {
      title: 'Menu',
      rows: [
        ['This menu', 'Esc'],
        ['Chat', '/'],
        ['Respawn', 'R'],
        ['Leave', 'L'],
      ],
    },
    {
      title: 'Building',
      builders: true,
      rows: [
        ['Undo / redo', 'Ctrl+Z / Y'],
        ['Finish road or wall', 'Enter'],
        ['Stop the tool', 'Esc'],
        ['Back a point', 'Backspace'],
        ['Turn / delete item', 'R / Delete'],
      ],
    },
  ],
  touch: [
    {
      title: 'Moving',
      rows: [
        ['Move', 'Left thumb'],
        ['Look around', 'Drag on the right'],
        ['Jump', 'Jump button'],
        ['Climb a ladder', 'Left thumb up / down'],
        ['Drop through a platform (2D places)', 'Left thumb down'],
        ['Dash (2D places that have it)', 'Dash button'],
        ['Moves and sitting', 'Avatar button'],
      ],
    },
    {
      title: 'Menu',
      rows: [
        ['This menu', 'g button'],
        ['Chat', 'Chat button'],
      ],
    },
    {
      title: 'Building',
      builders: true,
      rows: [
        ['Pick a tool', 'Tap the toolbar'],
        ['Place or draw', 'Tap the ground'],
        ['Finish a road or wall', 'Done'],
        ['Undo / redo', 'Arrows in the toolbar'],
      ],
    },
  ],
  xbox: controllerGroups('xbox'),
  playstation: controllerGroups('playstation'),
  // Planned for VR mode (WebXR, Meta Quest first; backlog): shown in Help as coming soon.
  vr: [
    {
      title: 'Moving',
      rows: [
        ['Move', 'Left thumbstick'],
        ['Turn', 'Right thumbstick'],
        ['Jump', 'A'],
        ['Sit', 'B'],
        ['Grab', 'Grip'],
      ],
    },
    {
      title: 'Menu',
      rows: [
        ['This menu', 'Menu button'],
        ['Point and choose', 'Trigger'],
      ],
    },
  ],
};

/** Devices whose controls do not work yet (Help says "coming soon"). */
export const COMING_SOON: ReadonlySet<ControlDevice> = new Set(['vr']);

/** Which controller is connected, from its id (PlayStation: Sony's vendor id 054c or its names). */
export function controllerKind(id: string): 'xbox' | 'playstation' {
  return /054c|dualsense|dualshock|playstation|wireless controller/i.test(id) ? 'playstation' : 'xbox';
}

/** The device the player is most likely using right now. */
export function currentDevice(): ControlDevice {
  if (typeof window === 'undefined') return 'computer';
  const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected);
  if (pad) return controllerKind(pad.id);
  return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'computer';
}
