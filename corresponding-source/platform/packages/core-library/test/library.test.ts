import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_AVATAR_LOOK, DEFAULT_PLACE_AVATAR, GenvrManifest } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  AVATAR_CLIPS,
  CORE_ANIMATIONS,
  CORE_ACCESSORIES,
  CORE_CLOTHING,
  AVATAR_BODIES,
  CORE_EMOTES,
  lookParts,
  normalizeAvatarLook,
  planarAngle,
  PLAYER_BODIES,
  sizedBody,
  CORE_WEARABLES,
  DEFAULT_FAVORITE_ANIMATIONS,
  findAnimation,
  getLibraryItem,
  LIBRARY,
  priceLabel,
  toggleWearable,
  applyPlaceAvatar,
  WEAR_SLOTS,
  wornItems,
  queryLibrary,
  type LibraryEntry,
} from '../src/index.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Item files: `<category>/<subcategory>/<slug>.ts`; helpers start with "_", plus index files. */
function itemFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return itemFiles(path);
    if (!name.endsWith('.ts') || name.startsWith('_') || name === 'index.ts') return [];
    const parts = relative(SRC, path).split(sep);
    const publishedTidewater = parts.length === 4 && parts[0] === '3d-models' && parts[1] === 'tidewater'
      && getLibraryItem(`genvr.core.tidewater.${basename(path, '.ts')}`);
    return parts.length === 3 || publishedTidewater ? [path] : [];
  });
}

/** File name of an item: the id after "genvr.core." without the type word, dots as dashes. */
const slugOf = (id: string) =>
  id
    .replace(/^genvr\.core\./, '')
    .replace(
      /^(gameplay|road|animation|sky|weather|style|wall|opening|water|surface|ground|block|part|clothing|accessory|body)./,
      '',
    )
    .replaceAll('.', '-');

describe('core library layout', () => {
  it('keeps one item per file at <category>/<subcategory>/<slug>.ts, all registered', async () => {
    const files = itemFiles();
    expect(files.length).toBeGreaterThanOrEqual(45);
    for (const file of files) {
      const { default: item } = (await import(pathToFileURL(file).href)) as { default: LibraryEntry };
      const segments = relative(SRC, file).split(sep);
      const category = segments[0], subcategory = segments.length === 4 ? segments[2] : segments[1];
      const where = relative(SRC, file);
      expect(GenvrManifest.safeParse(item.manifest).success, where).toBe(true);
      expect(item.manifest.category, where).toBe(category);
      expect(item.manifest.subcategory, where).toBe(subcategory);
      expect(slugOf(item.manifest.id), where).toBe((segments.length === 4 ? 'tidewater-' : '') + basename(file, '.ts'));
      expect(getLibraryItem(item.manifest.id), `${where} is not in the registry`).toBe(item);
    }
    expect(LIBRARY.length).toBe(files.length);
  });

  it('has a climbable ladder that does not block players (P2-23)', () => {
    const ladder = LIBRARY.find((entry) => entry.manifest.id === 'genvr.core.ladder')!;
    expect(ladder.manifest.physics).toEqual({ collider: 'none', climbable: true });
    expect(AVATAR_CLIPS).toContain('Climb');
  });

  it('has unique Core ids', () => {
    const ids = LIBRARY.map((entry) => entry.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('genvr.core.')).toBe(true);
  });
});

describe('library filter', () => {
  it('filters by type, category, subcategory, style, and text', () => {
    expect(queryLibrary({ type: 'animation' }).length).toBe(CORE_ANIMATIONS.length);
    expect(queryLibrary({ category: 'avatar-appearance', subcategory: 'emotes' }).length).toBe(
      CORE_EMOTES.length,
    );
    expect(
      queryLibrary({ category: '3d-models', subcategory: 'nature' }).map((e) => e.manifest.name),
    ).toContain('Pine Tree');
    // Animations fit every style; only models with a realistic look (P2-38) claim the realistic style.
    expect(queryLibrary({ type: 'animation', style: 'realistic' }).length).toBe(CORE_ANIMATIONS.length);
    const realistic = queryLibrary({
      category: '3d-models',
      subcategory: ['nature', 'props-and-decor', 'structures', 'building-blocks'],
      style: 'realistic',
    });
    expect(realistic.map((e) => e.manifest.name)).toContain('Pine Tree');
    expect(realistic.map((e) => e.manifest.name)).not.toContain('Crate');
    // Walls, doors, and windows work in every style and start their build tool.
    expect(queryLibrary({ subcategory: ['walls', 'openings'], style: 'realistic' }).length).toBe(3);
    expect(queryLibrary({ text: 'robot dance' }).map((e) => e.manifest.id)).toEqual([
      'genvr.core.animation.robot-dance',
    ]);
    expect(queryLibrary({ type: ['model', 'material'], text: 'railway' }).length).toBe(1);
    // The Core Library is free and made by Genvr.
    expect(queryLibrary({ price: 'free', source: 'core' }).length).toBe(LIBRARY.length);
    expect(queryLibrary({ price: 'paid' })).toEqual([]);
    expect(priceLabel(LIBRARY[0]!.manifest)).toBe('Free');
    expect(priceLabel({ ...LIBRARY[0]!.manifest, price: { type: 'paid', coins: 50 } })).toBe('50 coins');
  });
});

describe('animations', () => {
  it('have unique clips with keys inside their duration, starting at 0 and ending at the end', () => {
    expect(new Set(AVATAR_CLIPS).size).toBe(AVATAR_CLIPS.length);
    for (const animation of CORE_ANIMATIONS) {
      const times = animation.keys.map(([t]) => t);
      expect(times[0], animation.clip).toBe(0);
      expect(times.at(-1), animation.clip).toBeCloseTo(animation.duration);
      for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    }
  });

  it('offer 8 favorites from the player moves', () => {
    expect(DEFAULT_FAVORITE_ANIMATIONS).toHaveLength(8);
    for (const id of DEFAULT_FAVORITE_ANIMATIONS)
      expect(findAnimation(id)?.manifest.subcategory).toBe('emotes');
  });
});

describe('clothing and accessories', () => {
  it('are store types clothing and avatar, fit the blocky style, and stay near the body', () => {
    for (const item of CORE_CLOTHING) expect(item.manifest.type).toBe('clothing');
    for (const item of CORE_ACCESSORIES) expect(item.manifest.type).toBe('avatar');
    for (const item of CORE_WEARABLES) {
      const id = item.manifest.id;
      expect(WEAR_SLOTS, id).toContain(item.slot);
      expect(item.manifest.styles, id).toContain('blocky');
      expect(item.parts.length + Object.keys(item.paint).length, `${id} changes nothing`).toBeGreaterThan(0);
      for (const part of item.parts) {
        expect(
          part.size.every((v) => v > 0 && v < 1),
          id,
        ).toBe(true);
        expect(Math.abs(part.center[0]), id).toBeLessThan(0.9);
        expect(part.center[1], id).toBeGreaterThan(0);
        expect(part.center[1], id).toBeLessThan(2.3);
        expect(Math.abs(part.center[2]), id).toBeLessThan(0.5);
      }
    }
  });

  it('wear one item per slot: a new hat replaces the old one, a second click takes it off', () => {
    const cap = 'genvr.core.accessory.cap';
    const crown = 'genvr.core.accessory.crown';
    const glasses = 'genvr.core.accessory.glasses';
    let worn = toggleWearable([], cap);
    worn = toggleWearable(worn, glasses);
    worn = toggleWearable(worn, crown);
    expect(worn).toEqual([glasses, crown]);
    expect(toggleWearable(worn, glasses)).toEqual([crown]);
    expect(wornItems(['nope', cap, crown]).map((item) => item.manifest.id)).toEqual([crown]);
  });

  it('layer: an outer top goes over an inner one, and the inner blocks it covers hide (decision 92)', () => {
    const hoodie = 'genvr.core.clothing.hoodie';
    const jacket = 'genvr.core.clothing.jacket';
    const vest = 'genvr.core.clothing.vest';
    // A jacket goes over the hoodie; a vest replaces the jacket (same layer), not the hoodie.
    let worn = toggleWearable([], jacket);
    worn = toggleWearable(worn, hoodie);
    expect(worn).toEqual([jacket, hoodie]);
    expect(wornItems(worn).map((item) => item.manifest.id)).toEqual([hoodie, jacket]);
    expect(toggleWearable(worn, vest)).toEqual([hoodie, vest]);
    expect(normalizeAvatarLook({ wear: [jacket, hoodie] }).wear).toEqual([hoodie, jacket]);

    const look = { ...DEFAULT_AVATAR_LOOK, body: 'starter' as const, shirt: '#123456' };
    const parts = (wear: string[]) => lookParts({ ...look, wear });
    const hoodieBlocks = (wear: string[]) => parts(wear).filter((part) => part.item === hoodie).length;
    const onlyHoodie = hoodieBlocks([hoodie]);
    // The collar and the pocket hide under the jacket; the hood and the strings stay.
    expect(hoodieBlocks([hoodie, jacket])).toBe(onlyHoodie - 2);
    // The outer layer's colors win: the jacket colors the torso and the sleeves.
    const torso = (wear: string[]) => parts(wear).find((part) => part.area === 'torso' && !part.item)!.color;
    const forearm = (wear: string[]) =>
      parts(wear).find((part) => part.area === 'forearms' && !part.item)!.color;
    expect(forearm([hoodie])).toBe('#123456');
    expect(torso([hoodie, jacket])).toBe('#264653');
    expect(forearm([hoodie, jacket])).toBe('#264653');
    // A vest has no sleeves: the hoodie's long sleeves show.
    expect(forearm([hoodie, vest])).toBe('#123456');
    expect(torso([hoodie, vest])).toBe('#6b705c');
  });

  it('follow the place: own look, limited (no large items), or the place outfit (P2-21)', () => {
    const look = {
      skin: '#553222',
      hair: '#ff7eb6',
      shirt: '#123456',
      pants: '#2b2d42',
      shoes: '#f2f2ee',
      body: 'classic' as const,
      scale: { height: 1.1, width: 0.9, head: 1.1 },
      wear: ['genvr.core.accessory.cape', 'genvr.core.accessory.cap'],
    };
    const outfit = {
      ...look,
      skin: '#ffffff',
      hair: '#000000',
      shirt: '#e63946',
      wear: ['genvr.core.clothing.jacket'],
    };
    expect(applyPlaceAvatar(look, { mode: 'player', body: 'any', outfit }).wear).toEqual(look.wear);
    expect(applyPlaceAvatar(look, { mode: 'player', body: 'starter', outfit }).body).toBe('starter');
    expect(applyPlaceAvatar(look, { mode: 'place', body: 'starter', outfit }).body).toBe('starter');
    expect(applyPlaceAvatar(look, { mode: 'player', body: 'any', outfit }).scale.height).toBe(1.1);
    // Limited places and place outfits use the normal size.
    expect(applyPlaceAvatar(look, { mode: 'player-limited', body: 'any', outfit }).scale).toEqual({
      height: 1,
      width: 1,
      head: 1,
    });
    expect(applyPlaceAvatar(look, { mode: 'place', body: 'any', outfit }).scale).toEqual({
      height: 1,
      width: 1,
      head: 1,
    });
    expect(applyPlaceAvatar(look, { mode: 'player-limited', body: 'any', outfit }).wear).toEqual([
      'genvr.core.accessory.cap',
    ]);
    const team = applyPlaceAvatar(look, { mode: 'place', body: 'any', outfit });
    expect(team).toMatchObject({ skin: '#553222', hair: '#ff7eb6', shirt: '#e63946' });
    expect(team.wear).toEqual(['genvr.core.clothing.jacket']);
  });
});

describe('avatar body types (P2-22)', () => {
  it('have a proper skeleton: root first, parents before children, blocks on real joints', () => {
    for (const body of AVATAR_BODIES) {
      const seen = new Set<string>();
      expect(body.joints[0]!.parent, body.id).toBeNull();
      for (const joint of body.joints) {
        if (joint.parent) expect(seen.has(joint.parent), `${body.id} ${joint.name}`).toBe(true);
        seen.add(joint.name);
      }
      expect(seen.size, body.id).toBe(body.joints.length);
      for (const part of body.parts) expect(seen.has(part.joint), `${body.id} ${part.joint}`).toBe(true);
      for (const joint of Object.keys(body.animation))
        expect(seen.has(joint), `${body.id} ${joint}`).toBe(true);
      for (const target of Object.values(body.fit)) expect(seen.has(target!.joint), body.id).toBe(true);
    }
  });

  it('Classic is a Roblox-like 15-part body, Simple has six stiff parts, Starter keeps the 52-bone rig', () => {
    const [classic, simple, starter] = AVATAR_BODIES;
    expect(classic!.id).toBe('classic');
    expect(classic!.joints).toHaveLength(15);
    expect(simple!.id).toBe('simple');
    expect(simple!.joints.map((joint) => joint.name).sort()).toEqual(
      ['Head', 'LeftArm', 'LeftLeg', 'RightArm', 'RightLeg', 'Torso'].sort(),
    );
    // Stiff limbs: elbows and knees do not drive anything.
    const driven = Object.values(simple!.animation).flat();
    expect(driven).not.toContain('LeftForeArm');
    expect(driven).not.toContain('LeftLeg');
    expect(starter!.joints).toHaveLength(52);
  });

  it('the anime boy is a mesh body on the 52-bone rig in a T-pose (decision 111, P2-35)', () => {
    const boy = AVATAR_BODIES.find((body) => body.id === 'anime-boy')!;
    const starter = AVATAR_BODIES.find((body) => body.id === 'starter')!;
    expect(PLAYER_BODIES).toContain(boy);
    expect(boy.model).toBe('/bodies/anime-boy.glb');
    expect(boy.picture).toBeTruthy();
    // The same bones as the Starter body, parents first, so every clip plays on it.
    expect(boy.joints.map((joint) => joint.name).sort()).toEqual(
      starter.joints.map((joint) => joint.name).sort(),
    );
    const seen = new Set<string>();
    for (const joint of boy.joints) {
      if (joint.parent) expect(seen.has(joint.parent), joint.name).toBe(true);
      seen.add(joint.name);
    }
    // A T-pose: the arms are level (shoulder, elbow, and wrist at one height), feet near the ground.
    const at = (name: string) => boy.joints.find((joint) => joint.name === name)!.at;
    for (const side of ['Left', 'Right'])
      for (const joint of ['ForeArm', 'Hand'])
        expect(Math.abs(at(`${side}${joint}`)[1] - at(`${side}Arm`)[1])).toBeLessThan(0.01);
    expect(at('LeftFoot')[1]).toBeLessThan(0.15);
    // It draws its own model: no blocks, no block clothing, one fixed size.
    expect(
      lookParts({ ...DEFAULT_AVATAR_LOOK, body: 'anime-boy', wear: ['genvr.core.accessory.cap'] }),
    ).toEqual([]);
    expect(sizedBody('anime-boy', { height: 1.1, width: 1, head: 1 })).toBe(boy);
  });

  it('fit every Core item onto every body, near the body', () => {
    const colors = { skin: '#f2c49b', hair: '#3b2a20', shirt: '#6d4aff', pants: '#2b2d42', shoes: '#f2f2ee' };
    // Mesh bodies wear no block clothing yet (P2-35).
    for (const body of AVATAR_BODIES.filter((entry) => !entry.model))
      for (const item of CORE_WEARABLES) {
        const blocks = lookParts({ ...colors, body: body.id, wear: [item.manifest.id] }).filter(
          (part) => part.item === item.manifest.id,
        );
        expect(blocks.length, `${item.manifest.id} on ${body.id}`).toBe(item.parts.length);
        for (const block of blocks) {
          expect(block.center[1]).toBeGreaterThan(0);
          expect(block.center[1]).toBeLessThan(2.4);
          expect(Math.abs(block.center[0])).toBeLessThan(1);
        }
      }
  });

  it('the 2D body is flat, seen in profile, and worn only where a side-view place asks for it (decision 93)', () => {
    const flat = AVATAR_BODIES.find((body) => body.id === 'flat')!;
    expect(flat.flat).toBe(true);
    expect(PLAYER_BODIES.map((body) => body.id)).not.toContain('flat');
    // Thin across, deeper front to back: a profile.
    for (const part of flat.parts) expect(part.size[0], part.joint).toBeLessThan(0.16);
    // A jacket cuff made for the T-pose forearm lands low on the hanging arm.
    const colors = { skin: '#f2c49b', hair: '#3b2a20', shirt: '#6d4aff', pants: '#2b2d42', shoes: '#f2f2ee' };
    const cuffs = lookParts({ ...colors, body: 'flat', wear: ['genvr.core.clothing.jacket'] }).filter(
      (part) => part.item && part.joint.endsWith('LowerArm'),
    );
    expect(cuffs).toHaveLength(2);
    for (const cuff of cuffs) {
      expect(cuff.center[1]).toBeLessThan(1.11);
      expect(cuff.center[1]).toBeGreaterThan(0.85);
    }
    // Only a place that uses the 2D body shows it; elsewhere the player's Classic look.
    const saved = { ...DEFAULT_AVATAR_LOOK, body: 'flat' as const, shirt: '#111111' };
    const sidePlace = { ...DEFAULT_PLACE_AVATAR, body: 'flat' as const };
    expect(applyPlaceAvatar(saved, sidePlace).body).toBe('flat');
    expect(applyPlaceAvatar(saved, DEFAULT_PLACE_AVATAR).body).toBe('classic');
    // Joints turn in one plane: a sideways arm raise becomes a forward raise, rest stays at 0.
    expect(planarAngle('LeftArm', [0, 0, -78])).toBe(0);
    expect(planarAngle('LeftArm', [0, 0, 12])).toBe(-90);
    expect(planarAngle('RightArm', [0, 0, -12])).toBe(-90);
    expect(planarAngle('LeftUpLeg', [-28, 5, 3])).toBe(-28);
  });

  it('grow and shrink with body sizes: joints, blocks, and clothes together', () => {
    const colors = { skin: '#f2c49b', hair: '#3b2a20', shirt: '#6d4aff', pants: '#2b2d42', shoes: '#f2f2ee' };
    const top = (scale?: { height: number; width: number; head: number }) =>
      Math.max(
        ...lookParts({ ...colors, ...(scale ? { scale } : {}), wear: ['genvr.core.accessory.cap'] }).map(
          (p) => p.center[1] + p.size[1] / 2,
        ),
      );
    const normal = top();
    expect(top({ height: 1.1, width: 1, head: 1 })).toBeCloseTo(normal * 1.1, 2);
    expect(top({ height: 1, width: 1, head: 1.15 })).toBeGreaterThan(normal);
    const tall = sizedBody('classic', { height: 1.1, width: 0.8, head: 1 });
    expect(tall).toBe(sizedBody('classic', { height: 1.1, width: 0.8, head: 1 }));
    const hip = tall.joints.find((j) => j.name === 'LeftUpperLeg')!.at;
    expect(hip[0]).toBeCloseTo(0.155 * 0.8, 5);
    expect(hip[1]).toBeCloseTo(0.8 * 1.1, 5);
    expect(sizedBody('classic')).toBe(AVATAR_BODIES[0]);
  });
});
