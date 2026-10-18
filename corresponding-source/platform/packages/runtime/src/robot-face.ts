import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three/webgpu';
import type { MouthShape } from '@genvr/contracts';
import type { AvatarExpression } from './avatar-expression.js';

/** A screen face attached to the head bone, independent of skin deformation. */
export function createRobotFace(width: number, height: number) {
  const root = new Group(); root.name = 'robot-face';
  const geometry = new BoxGeometry(1, 1, 1);
  const dark = new MeshBasicMaterial({ color: '#0b1726' });
  const light = new MeshBasicMaterial({ color: '#67e8f9' });
  const unit = width / .36, vertical = height / .36;
  const panel = new Mesh(geometry, dark); panel.scale.set(.304 * unit, .245 * vertical, .009); root.add(panel);
  const pixel = () => { const mesh = new Mesh(geometry, light); mesh.position.z = .007; root.add(mesh); return mesh; };
  const eyes = [pixel(), pixel()], brows = [pixel(), pixel()];
  const mouth = Array.from({ length: 12 }, pixel);
  let expression: AvatarExpression = 'neutral', speech: MouthShape = 'X', clock = 0;
  const line = (mesh: Mesh, a: number[], b: number[]) => {
    mesh.position.set((a[0]! + b[0]!) * .5 * unit, (a[1]! + b[1]!) * .5 * vertical, .007);
    const dx = (b[0]! - a[0]!) * unit, dy = (b[1]! - a[1]!) * vertical;
    mesh.scale.set(Math.hypot(dx, dy) + .003 * unit, .008 * vertical, .003);
    mesh.rotation.z = Math.atan2(dy, dx);
  };
  const draw = () => {
    for (let i = 0; i < 2; i++) {
      const sign = i ? 1 : -1;
      eyes[i]!.position.set(sign * .07 * unit, .025 * vertical, .007);
      const blink = clock % 4.3 > 4.16 ? .12 : 1;
      const eyeHeight = expression === 'surprised' ? .078 : expression === 'smile' ? .023 : expression === 'angry' ? .035 : .058;
      eyes[i]!.scale.set(.035 * unit, eyeHeight * vertical * blink, .003);
      eyes[i]!.rotation.z = expression === 'smile' ? sign * -.18 : 0;
      brows[i]!.position.set(sign * .07 * unit, (expression === 'surprised' || (expression === 'thinking' && i === 1) ? .092 : .077) * vertical, .007);
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
    update(delta: number) { clock += Math.max(0, delta); draw(); },
    dispose() { root.removeFromParent(); geometry.dispose(); dark.dispose(); light.dispose(); },
  };
}
