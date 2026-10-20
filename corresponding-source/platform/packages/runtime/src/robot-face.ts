import { BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three/webgpu';
import type { MouthShape } from '@genvr/contracts';
import type { AvatarExpression } from './avatar-expression.js';

/** Round screen eyes: iris ring radius, eye centres (face units, the head is .36 wide) and how far the pupils travel. */
const EYE_R = .036, EYE_X = .07, EYE_Y = .025, GAZE = .012;
/** Upper-lid cover (part of the eye hidden from the top), lid tilt and lower-lid cover for each expression. */
const LIDS: Record<AvatarExpression, { top: number; tilt: number; bottom: number }> = {
  neutral: { top: 0, tilt: 0, bottom: 0 },
  smile: { top: .18, tilt: 0, bottom: .38 },
  angry: { top: .42, tilt: .35, bottom: 0 },
  sad: { top: .4, tilt: -.3, bottom: 0 },
  surprised: { top: 0, tilt: 0, bottom: 0 },
  thinking: { top: .3, tilt: 0, bottom: 0 },
};

/** A screen face attached to the head bone, independent of skin deformation. */
export function createRobotFace(width: number, height: number) {
  const root = new Group(); root.name = 'robot-face';
  const geometry = new BoxGeometry(1, 1, 1), ring = new RingGeometry(EYE_R * .78, EYE_R, 40), disc = new CircleGeometry(1, 28);
  const dark = new MeshBasicMaterial({ color: '#0b1726' });
  const light = new MeshBasicMaterial({ color: '#67e8f9' });
  const shine = new MeshBasicMaterial({ color: '#e6fdff' });
  const unit = width / .36, vertical = height / .36;
  const panel = new Mesh(geometry, dark); panel.scale.set(.304 * unit, .245 * vertical, .009); root.add(panel);
  const add = <T extends Mesh>(mesh: T, z: number) => { mesh.position.z = z; root.add(mesh); return mesh; };
  const pixel = () => add(new Mesh(geometry, light), .007);
  // Back to front: iris ring and pupil, the screen-coloured lids over them, brows on top.
  const eyes = [0, 1].map(() => ({
    iris: add(new Mesh(ring, light), .0095), pupil: add(new Mesh(disc, light), .0096), glint: add(new Mesh(disc, shine), .0097),
    top: add(new Mesh(geometry, dark), .0105), bottom: add(new Mesh(geometry, dark), .0105),
  }));
  const brows = [pixel(), pixel()].map(mesh => { mesh.position.z = .0115; return mesh; });
  const mouth = Array.from({ length: 12 }, pixel);
  let expression: AvatarExpression = 'neutral', speech: MouthShape = 'X', clock = 0, gazeX = 0, gazeY = 0;
  const line = (mesh: Mesh, a: number[], b: number[]) => {
    mesh.position.set((a[0]! + b[0]!) * .5 * unit, (a[1]! + b[1]!) * .5 * vertical, .007);
    const dx = (b[0]! - a[0]!) * unit, dy = (b[1]! - a[1]!) * vertical;
    mesh.scale.set(Math.hypot(dx, dy) + .003 * unit, .008 * vertical, .003);
    mesh.rotation.z = Math.atan2(dy, dx);
  };
  const draw = () => {
    const blinking = clock % 4.3 > 4.16;
    const lid = LIDS[expression];
    for (let i = 0; i < 2; i++) {
      const sign = i ? 1 : -1, eye = eyes[i]!, x = sign * EYE_X, r = EYE_R * (expression === 'surprised' ? 1.12 : 1);
      eye.iris.position.set(x * unit, EYE_Y * vertical, eye.iris.position.z); eye.iris.scale.set(unit * r / EYE_R, vertical * r / EYE_R, 1);
      const pupil = (expression === 'surprised' ? .011 : .016), lookY = expression === 'thinking' ? .6 : gazeY, lookX = expression === 'thinking' ? .5 : gazeX;
      const px = x + lookX * GAZE, py = EYE_Y + lookY * GAZE;
      eye.pupil.position.set(px * unit, py * vertical, eye.pupil.position.z); eye.pupil.scale.set(pupil * unit, pupil * vertical, 1);
      eye.glint.position.set((px - pupil * .38) * unit, (py + pupil * .38) * vertical, eye.glint.position.z); eye.glint.scale.set(pupil * .3 * unit, pupil * .3 * vertical, 1);
      eye.pupil.visible = eye.glint.visible = !blinking;
      // Upper lid: a screen-coloured box whose lower edge sits `top` of the eye's height below its top; a blink closes it.
      // .05 tall keeps a tilted lid inside the screen (its top edge is at .1225).
      const cover = blinking ? 1.02 : lid.top, lidH = .05, edge = EYE_Y + r - cover * 2 * r;
      eye.top.visible = cover > 0;
      eye.top.position.set(x * unit, (edge + lidH / 2) * vertical, eye.top.position.z);
      eye.top.scale.set(2.6 * r * unit, lidH * vertical, .002); eye.top.rotation.z = sign * lid.tilt;
      eye.bottom.visible = !blinking && lid.bottom > 0;
      const low = EYE_Y - r + lid.bottom * 2 * r;
      eye.bottom.position.set(x * unit, (low - lidH / 2) * vertical, eye.bottom.position.z); eye.bottom.scale.set(2.6 * r * unit, lidH * vertical, .002);
      brows[i]!.position.set(x * unit, (expression === 'surprised' || (expression === 'thinking' && i === 1) ? .092 : .077) * vertical, .0115);
      brows[i]!.scale.set(.06 * unit, .008 * vertical, .003);
      brows[i]!.rotation.z = expression === 'angry' ? sign * .30 : expression === 'sad' ? sign * -.25 : 0;
    }
    let points: number[][];
    if (expression === 'surprised' || (speech !== 'X' && speech !== 'A')) {
      const wide = speech === 'D' || speech === 'C' ? .044 : .025;
      const tall = speech === 'F' ? .018 : .030;
      points = Array.from({ length: 13 }, (_, i) => { const a = i / 12 * Math.PI * 2; return [Math.cos(a) * wide, -.064 + Math.sin(a) * tall]; });
    } else if (speech === 'A') points = [[-.05, -.064], [.05, -.064]];
    else if (expression === 'smile') points = [[-.06, -.05], [-.035, -.073], [0, -.080], [.035, -.073], [.06, -.05]];
    else if (expression === 'sad') points = [[-.06, -.078], [-.03, -.056], [0, -.05], [.03, -.056], [.06, -.078]];
    else if (expression === 'thinking') points = [[-.045, -.057], [.04, -.072]];
    else points = [[-.05, -.064], [.05, -.064]];
    mouth.forEach((mesh, i) => { mesh.visible = i < points.length - 1; if (mesh.visible) line(mesh, points[i]!, points[i + 1]!); });
  };
  draw();
  return {
    root,
    setExpression(value: AvatarExpression) { expression = value; draw(); },
    setMouth(value: MouthShape) { speech = value; draw(); },
    /** Where the pupils look: -1…1 across (screen left to right) and up; 0, 0 looks straight out of the screen. */
    setGaze(x: number, y: number) { gazeX = Math.max(-1, Math.min(1, x)); gazeY = Math.max(-1, Math.min(1, y)); draw(); },
    update(delta: number) { clock += Math.max(0, delta); draw(); },
    dispose() { root.removeFromParent(); geometry.dispose(); ring.dispose(); disc.dispose(); dark.dispose(); light.dispose(); shine.dispose(); },
  };
}
