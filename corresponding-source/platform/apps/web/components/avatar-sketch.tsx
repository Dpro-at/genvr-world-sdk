import {
  findBody,
  findWearable,
  lookParts,
  type AvatarBody,
  type LookInput,
  type LookPart,
} from '@genvr/core-library';

/** What a sketch shows: the whole avatar, head and shoulders, or the part where an item sits. */
export type SketchFocus = 'full' | 'portrait' | { item: string };

/** A flat 2D body is drawn from its side (decision 93): its front (+z) runs to the right. */
const profile = (part: LookPart): LookPart => ({
  ...part,
  center: [part.center[2], part.center[1], part.center[0]],
  size: [part.size[2], part.size[1], part.size[0]],
});

/** Moves an arm block from the T-pose to hanging down beside the body. */
function hang(part: LookPart, body: AvatarBody): LookPart {
  const side = part.joint.startsWith('Left') ? 1 : part.joint.startsWith('Right') ? -1 : 0;
  if (!side || !/(Arm|Hand)$/.test(part.joint)) return part;
  const arm = body.sketchArm;
  const along = part.center[0] * side - arm.start;
  const across = part.center[1] - arm.axisY;
  return {
    ...part,
    center: [(arm.hangX + across) * side, arm.topY - along, part.center[2]],
    size: [part.size[1], part.size[0], part.size[2]],
  };
}

type Frame = { left: number; bottom: number; right: number; top: number };

/** The area around some blocks, with a margin, never smaller than `min` meters across. */
function frameAround(parts: readonly LookPart[], margin: number, min = 0.3): Frame {
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (const part of parts) {
    left = Math.min(left, part.center[0] - part.size[0] / 2);
    right = Math.max(right, part.center[0] + part.size[0] / 2);
    bottom = Math.min(bottom, part.center[1] - part.size[1] / 2);
    top = Math.max(top, part.center[1] + part.size[1] / 2);
  }
  const grow = (low: number, high: number) => {
    const extra = Math.max(0, min - (high - low)) / 2 + margin;
    return [low - extra, high + extra] as const;
  };
  [left, right] = grow(left, right);
  [bottom, top] = grow(bottom, top);
  return { left, bottom, right, top };
}

/** The blocks to frame for a focus (items: their blocks and the body parts they sit on). */
function focusParts(parts: readonly LookPart[], focus: SketchFocus): readonly LookPart[] {
  if (focus === 'full') return parts;
  if (focus === 'portrait') {
    const head = parts.filter((part) => part.joint === 'Head' && !part.item);
    const top = Math.max(...head.map((part) => part.center[1] + part.size[1] / 2));
    const chin = Math.min(...head.map((part) => part.center[1] - part.size[1] / 2));
    // Head and the top of the shoulders.
    return parts.filter(
      (part) => part.center[1] + part.size[1] / 2 > chin - 0.25 && part.center[1] < top + 0.1,
    );
  }
  const item = findWearable(focus.item);
  const own = parts.filter((part) => part.item === focus.item);
  const joints = new Set(own.map((part) => part.joint));
  const areas = new Set(Object.keys(item?.paint ?? {}));
  const under = parts.filter(
    (part) => !part.item && (joints.has(part.joint) || (part.area !== undefined && areas.has(part.area))),
  );
  return [...own, ...under];
}

/**
 * A flat drawing of the avatar made from the same blocks as the 3D body (P2-20, P2-22): arms
 * down, seen from the front or the back, for any body type. Used for the look preview, the
 * clothing tiles, and player portraits.
 */
export function AvatarSketch({
  look,
  view = 'front',
  focus = 'full',
  className,
}: {
  look: LookInput;
  view?: 'front' | 'back';
  focus?: SketchFocus;
  className?: string;
}) {
  const body = findBody(look.body);
  // A mesh body (P2-35) has no blocks to draw: its picture stands in for the sketch.
  if (body.picture) return <img src={body.picture} alt="" className={`${className ?? ''} object-contain`} />;
  const sign = view === 'front' ? 1 : -1;
  const parts = lookParts(look).map((part) => (body.flat ? profile(part) : hang(part, body)));
  const frame = frameAround(focusParts(parts, focus), focus === 'full' ? 0.04 : 0.06);
  // Painter's order: the face nearest to the viewer is drawn last.
  const rects = parts
    .map((part) => ({ part, depth: sign * part.center[2] + part.size[2] / 2 }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <svg
      viewBox={`${frame.left} ${-frame.top} ${frame.right - frame.left} ${frame.top - frame.bottom}`}
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      {rects.map(({ part }, index) => {
        const [x, y] = part.center;
        const [w, h] = part.size;
        return (
          <rect
            key={index}
            x={sign * x - w / 2}
            y={-(y + h / 2)}
            width={w}
            height={h}
            rx={Math.min(w, h) * 0.12}
            fill={part.color}
            stroke="rgb(0 0 0 / 0.22)"
            strokeWidth={0.008}
          />
        );
      })}
    </svg>
  );
}
