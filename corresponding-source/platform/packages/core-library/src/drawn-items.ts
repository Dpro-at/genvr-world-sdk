import basicWall from './3d-models/walls/basic.js';
import door from './3d-models/openings/door.js';
import windowOpening from './3d-models/openings/window.js';
import pond from './environment/water/pond.js';
import type { DrawnItem } from './drawn.js';

/** Every Core item that is drawn with a build tool (walls, openings, water), in library order. */
export const DRAWN_ITEMS: readonly DrawnItem[] = [basicWall, door, windowOpening, pond];
