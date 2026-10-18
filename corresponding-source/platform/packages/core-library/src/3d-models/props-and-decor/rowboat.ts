import { coreManifest } from '../../manifest.js';
import type { CoreItem } from '../_parts.js';

/** An original editable shore prop; it does not imply a drivable vehicle. */
const rowboat: CoreItem = {
  manifest: coreManifest({ id: 'genvr.core.rowboat', name: 'Wooden rowboat', type: 'model', category: '3d-models', subcategory: 'props-and-decor', styles: ['realistic'], triangles: 568,
    placement: { stands: ['ground', 'built', 'water'], soils: ['sand', 'grass', 'dirt', 'rock', 'mud'], maxSlope: 30, maxTilt: 15 } }),
  group: 'props', parts: [],
  looks: { realistic: { model: {
    levels: [{ url: '/models/realistic/rowboat/lod0.glb', bytes: 56892, triangles: 568 }],
    bounds: { min: [-1.322, 0, -1.845], max: [1.608, 0.688, 2.139] },
    picture: '/models/realistic/rowboat/picture.svg',
    source: { name: 'Genvr original procedural rowboat', page: 'https://github.com/Dpro-at/genvr-world-sdk', license: 'AGPL-3.0-only' },
  } } },
};
export default rowboat;
