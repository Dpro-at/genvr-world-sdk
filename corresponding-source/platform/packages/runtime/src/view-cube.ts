import type { Camera } from 'three/webgpu';

/** A face of the view cube; clicking it turns the camera to look from that side. */
export type ViewFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** Direction from the target to the camera for each face (world axes, +Y up, front = +Z). */
export const FACE_DIRECTIONS: Record<ViewFace, readonly [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
};

/** CSS placement of each face on a cube of half size `h` (CSS y points down, world y up). */
const FACE_TRANSFORMS: Record<ViewFace, string> = {
  front: 'translateZ(var(--h))',
  back: 'rotateY(180deg) translateZ(var(--h))',
  right: 'rotateY(90deg) translateZ(var(--h))',
  left: 'rotateY(-90deg) translateZ(var(--h))',
  top: 'rotateX(90deg) translateZ(var(--h))',
  bottom: 'rotateX(-90deg) translateZ(var(--h))',
};

const AXES = [
  { label: 'X', vector: [1, 0, 0], color: '#e5484d' },
  { label: 'Y', vector: [0, 1, 0], color: '#30a46c' },
  { label: 'Z', vector: [0, 0, 1], color: '#3e63dd' },
] as const;

/**
 * The camera's rotation as a CSS matrix: the rotation part of the view matrix with the y axis
 * flipped on both sides (CSS y points down), so the cube turns exactly like the world.
 */
export function cssRotation(viewMatrix: ArrayLike<number>): string {
  const e = viewMatrix;
  const m = [e[0]!, -e[1]!, e[2]!, 0, -e[4]!, e[5]!, -e[6]!, 0, e[8]!, -e[9]!, e[10]!, 0, 0, 0, 0, 1];
  return `matrix3d(${m.map((value) => (Math.abs(value) < 1e-10 ? 0 : value)).join(',')})`;
}

/**
 * Orientation compass for 3D views (owner note, docs/reference/tools/01): a small cube in a
 * corner that turns with the camera, with the X (red), Y (green), and Z (blue) axes. Clicking a
 * face looks at the scene from that side. Plain HTML and CSS 3D (no second renderer), themed
 * with the page's `--surface` and `--ink` colors when they exist.
 */
export class ViewCube {
  readonly element: HTMLDivElement;
  readonly #cube: HTMLDivElement;
  readonly #axes: SVGSVGElement;
  #last = '';

  constructor(
    container: HTMLElement,
    onPick: (face: ViewFace) => void,
    { size = 64, corner = 'bottom-left' }: { size?: number; corner?: 'bottom-left' | 'top-right' } = {},
  ) {
    const box = size + 36;
    const element = document.createElement('div');
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', 'View directions');
    Object.assign(element.style, {
      position: 'absolute',
      width: `${box}px`,
      height: `${box}px`,
      zIndex: '5',
      userSelect: 'none',
      ...(corner === 'bottom-left' ? { left: '8px', bottom: '8px' } : { right: '8px', top: '8px' }),
    });
    element.style.setProperty('--h', `${size / 2}px`);

    const stage = document.createElement('div');
    Object.assign(stage.style, {
      position: 'absolute',
      left: `${(box - size) / 2}px`,
      top: `${(box - size) / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      perspective: `${size * 6}px`,
    });
    const cube = document.createElement('div');
    Object.assign(cube.style, {
      position: 'absolute',
      inset: '0',
      transformStyle: 'preserve-3d',
    });
    for (const face of Object.keys(FACE_TRANSFORMS) as ViewFace[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = face[0]!.toUpperCase() + face.slice(1);
      button.title = `View from the ${face}`;
      button.setAttribute('aria-label', `View from the ${face}`);
      Object.assign(button.style, {
        position: 'absolute',
        inset: '0',
        transform: FACE_TRANSFORMS[face],
        backfaceVisibility: 'hidden',
        display: 'grid',
        placeItems: 'center',
        padding: '0',
        border: '1px solid color-mix(in srgb, var(--ink, #111) 25%, transparent)',
        borderRadius: '8px',
        background: 'color-mix(in srgb, var(--surface, #fff) 88%, transparent)',
        color: 'var(--ink, #111)',
        font: `700 ${Math.round(size / 5.5)}px system-ui, sans-serif`,
        cursor: 'pointer',
      });
      button.addEventListener('pointerenter', () => {
        button.style.background = 'color-mix(in srgb, var(--ink, #111) 16%, var(--surface, #fff))';
      });
      button.addEventListener('pointerleave', () => {
        button.style.background = 'color-mix(in srgb, var(--surface, #fff) 88%, transparent)';
      });
      // The 3D view underneath must not start a drag from a click on the cube.
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        onPick(face);
      });
      cube.appendChild(button);
    }
    stage.appendChild(cube);

    const axes = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    axes.setAttribute('width', String(box));
    axes.setAttribute('height', String(box));
    axes.setAttribute('aria-hidden', 'true');
    Object.assign(axes.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'visible',
    });

    element.append(stage, axes);
    container.appendChild(element);
    this.element = element;
    this.#cube = cube;
    this.#axes = axes;
  }

  /** Turns the cube and the axes with the camera (call every frame; cheap when nothing moved). */
  update(camera: Camera): void {
    camera.updateMatrixWorld();
    const e = camera.matrixWorldInverse.elements;
    const key = [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]].map((v) => v.toFixed(3)).join();
    if (key === this.#last) return;
    this.#last = key;
    this.#cube.style.transform = `translateZ(calc(var(--h) * -1)) ${cssRotation(e)}`;
    // Axes from the cube's back-left-bottom corner, in screen space (view x right, view y up).
    const box = Number(this.#axes.getAttribute('width'));
    const half = parseFloat(this.element.style.getPropertyValue('--h'));
    const view = (x: number, y: number, z: number) => [
      e[0]! * x + e[4]! * y + e[8]! * z,
      e[1]! * x + e[5]! * y + e[9]! * z,
      e[2]! * x + e[6]! * y + e[10]! * z,
    ];
    const [cx, cy] = view(-half, -half, -half);
    const origin = [box / 2 + cx!, box / 2 - cy!];
    const length = half * 2 + 12;
    this.#axes.innerHTML = AXES.map(({ label, vector, color }) => {
      const [x, y] = view(vector[0] * length, vector[1] * length, vector[2] * length);
      const end = [origin[0]! + x!, origin[1]! - y!];
      const tx = origin[0]! + x! * 1.13;
      const ty = origin[1]! - y! * 1.13;
      return (
        `<line x1="${origin[0]}" y1="${origin[1]}" x2="${end[0]}" y2="${end[1]}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>` +
        `<text x="${tx}" y="${ty}" fill="${color}" font-size="10" font-weight="800" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle">${label}</text>`
      );
    }).join('');
  }

  set visible(on: boolean) {
    this.element.style.display = on ? '' : 'none';
  }

  dispose(): void {
    this.element.remove();
  }
}
