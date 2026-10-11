import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANT_DEFORMATION_WGSL } from '../src/vegetation/deformation.js';

const source = readFileSync(new URL(
  '../../../../tooling/other-programs/tidewater/src/world/vegetation/VegNodes.js', import.meta.url,
), 'utf8');
function body(text: string, name: string): string {
  text = text.replaceAll('\r\n', '\n');
  const start = text.indexOf('\nfn ' + name + '(');
  expect(start).toBeGreaterThanOrEqual(0);
  const opening = text.indexOf('{', start);
  return text.slice(opening, text.indexOf('\n}', opening) + 2);
}
describe('source plant deformation equations', () => {
  it('preserves stem, crown, flutter, dead-frond and kind rules verbatim after binding adaptation', () => {
    const expected = body(source, 'vegPlantDeform')
      .replace('frame.time', 'time').replace('vegWindStrength()', 'strength')
      .replace('vegGustAt( base.xz )', 'gust').replace('vegWindDir3()', 'windDirection')
      .replace('vegWindPerp3()', 'windPerpendicular').replaceAll('vegParams.camPos', 'camera')
      .replace('vegLodScale( base, lodRange )', 'vegLodScale( base, lodRange, camera )')
      .replace('${ f( UNDER_FERN_FADE[ 0 ] ) }', '42.0')
      .replace('${ f( UNDER_FERN_FADE[ 1 ] ) }', '58.0');
    expect(body(PLANT_DEFORMATION_WGSL, 'vegPlantDeform')).toBe(expected);
  });
  it('preserves the source rotation and main-camera LOD helper', () => {
    expect(body(PLANT_DEFORMATION_WGSL, 'vegRotUpTo')).toBe(body(source, 'vegRotUpTo'));
    expect(body(PLANT_DEFORMATION_WGSL, 'vegLodScale'))
      .toBe(body(source, 'vegLodScale').replaceAll('vegParams.camPos', 'camera'));
  });
});
