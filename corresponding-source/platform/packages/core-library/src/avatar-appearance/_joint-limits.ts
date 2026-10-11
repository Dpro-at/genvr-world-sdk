import type { Pose, RigBone, V3 } from './_animation.js';
import { HUMAN_JOINT_CONSTRAINTS } from './_joint-constraints.js';
import { dot3, qFromEuler, qRotate, swingTwist, type Q } from './_joint-math.js';

const C = HUMAN_JOINT_CONSTRAINTS.joints;

/**
 * The joint law (owner rule, CHAR-02: "every bone moves only the way it can in nature; turning my arm the wrong way
 * breaks it"): how far each joint of a human body can turn, in the clips' own rotations (T-pose rest, world-aligned
 * frames, +x the body's left, +y up, +z the chest's facing). Every Core move is checked against it by
 * `core-library/test/joint-limits.test.ts`, and every new or generated move must pass it before it joins the library.
 *
 * The numbers come from `HUMAN_JOINT_CONSTRAINTS` (`_joint-constraints.ts`, the one source for every human joint
 * limit, owner 2026-10-05); the geometric ones (shoulder, hip: where the limb may point) stay here. Degrees.
 */
export const JOINT_LIMITS = {
  /** Elbow: a hinge that only bends forward, no sideways bend; the forearm turns the palm at most this far. */
  elbow: { bend: C.elbow.flexion[1], back: -C.elbow.flexion[0], offHinge: 12, twist: 95 },
  /** Knee: a hinge that only bends backward, a little turn when bent. */
  knee: { bend: C.knee.flexion[1], back: -C.knee.flexion[0], offHinge: 12, twist: 25 },
  /** Wrist: bends up and down, little sideways; it does not twist (the forearm does). */
  wrist: { swing: C.wrist.flexion[1] + 5, twist: 20 },
  /** Shoulder joint: the arm cannot point back through the body, nor far behind it, nor twist far. */
  shoulder: { behind: -0.9, through: 0.25, twist: 120 },
  /** Hip joint: not far behind the body (a sprinter's back leg reaches about 45), not far across, limited turn. */
  hip: { behind: -0.75, across: -0.55, twist: 60 },
  /** Collarbone (Shoulder bone): a small lift and shrug. */
  collarbone: { swing: Math.round(Math.hypot(C.clavicle.elevation[1], C.clavicle.protraction[1])) },
  /** Each spine bone, and the neck and head together. */
  spine: { swing: Math.max(C.lumbar.flexion[1], C.thoracic.flexion[1] + C.thoracic.sideBend[1] / 2) },
  /** The neck and head together (one budget). */
  neck: {
    turn: C.neck.twist[1] + C.head.twist[1],
    down: C.neck.flexion[1] + C.head.flexion[1],
    up: -(C.neck.flexion[0] + C.head.flexion[0]),
  },
  /** Ankle: toes down (positive X) and up, little sideways. */
  ankle: { down: C.ankle.flexion[1], up: -C.ankle.flexion[0], side: C.subtalar.inversion[1] },
} as const;

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];

/** What is wrong with one pose under the joint law (empty: a pose a human body can make). */
export function jointProblems(pose: Pose): string[] {
  const problems: string[] = [];
  const q = (bone: RigBone): Q | null => (pose[bone] ? qFromEuler(pose[bone]!) : null);
  const say = (bone: string, text: string, value: number) => problems.push(`${bone}: ${text} (${Math.round(value)})`);

  for (const side of ['Left', 'Right'] as const) {
    const sign = side === 'Left' ? 1 : -1;
    const along: V3 = [sign, 0, 0];

    const fore = q(`${side}ForeArm`);
    if (fore) {
      const { twist, swingAxis, swing } = swingTwist(fore, X);
      if (Math.abs(twist) > JOINT_LIMITS.elbow.twist) say(`${side}ForeArm`, 'forearm turned too far', twist);
      if (swing > 3) {
        // Bending forward is a turn about -y on the left and +y on the right.
        const onHinge = dot3(swingAxis, Y) * -sign;
        const offHinge = Math.asin(Math.min(1, Math.sqrt(Math.max(0, 1 - onHinge * onHinge)))) * (180 / Math.PI);
        if (onHinge < 0 && swing > JOINT_LIMITS.elbow.back) say(`${side}ForeArm`, 'elbow bent backward', swing);
        else if (swing * Math.sin((offHinge * Math.PI) / 180) > JOINT_LIMITS.elbow.offHinge)
          say(`${side}ForeArm`, 'elbow bent sideways', swing * Math.sin((offHinge * Math.PI) / 180));
        if (swing > JOINT_LIMITS.elbow.bend) say(`${side}ForeArm`, 'elbow bent too far', swing);
      }
    }

    const leg = q(`${side}Leg`);
    if (leg) {
      const { twist, swingAxis, swing } = swingTwist(leg, Y);
      if (Math.abs(twist) > JOINT_LIMITS.knee.twist) say(`${side}Leg`, 'knee turned too far', twist);
      if (swing > 3) {
        const onHinge = dot3(swingAxis, X);
        if (onHinge < 0 && swing > JOINT_LIMITS.knee.back) say(`${side}Leg`, 'knee bent forward', swing);
        else if (swing * Math.sqrt(Math.max(0, 1 - onHinge * onHinge)) > JOINT_LIMITS.knee.offHinge)
          say(`${side}Leg`, 'knee bent sideways', swing * Math.sqrt(1 - onHinge * onHinge));
        if (swing > JOINT_LIMITS.knee.bend) say(`${side}Leg`, 'knee bent too far', swing);
      }
    }

    const hand = q(`${side}Hand`);
    if (hand) {
      const { twist, swing } = swingTwist(hand, along);
      if (Math.abs(twist) > JOINT_LIMITS.wrist.twist) say(`${side}Hand`, 'wrist twisted (the forearm turns the hand)', twist);
      if (swing > JOINT_LIMITS.wrist.swing) say(`${side}Hand`, 'wrist bent too far', swing);
    }

    const arm = q(`${side}Arm`);
    if (arm) {
      const d = qRotate(arm, along);
      if (d[2] < JOINT_LIMITS.shoulder.behind) say(`${side}Arm`, 'arm pointing far behind the back', d[2] * 100);
      // Across the body (toward the other side) is fine in front of the chest, never through the torso.
      if (d[0] * sign < -0.2 && d[2] < JOINT_LIMITS.shoulder.through)
        say(`${side}Arm`, 'arm pointing through the body', d[0] * sign * 100);
      const { twist } = swingTwist(arm, along);
      if (Math.abs(twist) > JOINT_LIMITS.shoulder.twist) say(`${side}Arm`, 'upper arm twisted too far', twist);
    }

    const thigh = q(`${side}UpLeg`);
    if (thigh) {
      const d = qRotate(thigh, [0, -1, 0]);
      if (d[2] < JOINT_LIMITS.hip.behind) say(`${side}UpLeg`, 'leg far behind the body', d[2] * 100);
      if (d[0] * sign < JOINT_LIMITS.hip.across) say(`${side}UpLeg`, 'leg across the other leg', d[0] * sign * 100);
      const { twist } = swingTwist(thigh, [0, -1, 0]);
      if (Math.abs(twist) > JOINT_LIMITS.hip.twist) say(`${side}UpLeg`, 'thigh twisted too far', twist);
    }

    const collar = q(`${side}Shoulder`);
    if (collar && swingTwist(collar, along).swing > JOINT_LIMITS.collarbone.swing)
      say(`${side}Shoulder`, 'collarbone turned too far', swingTwist(collar, along).swing);

    const foot = pose[`${side}Foot`];
    if (foot) {
      if (foot[0] > JOINT_LIMITS.ankle.down) say(`${side}Foot`, 'toes pointed too far', foot[0]);
      if (foot[0] < -JOINT_LIMITS.ankle.up) say(`${side}Foot`, 'toes pulled up too far', foot[0]);
      if (Math.abs(foot[2]) > JOINT_LIMITS.ankle.side) say(`${side}Foot`, 'ankle bent sideways too far', foot[2]);
    }
  }

  for (const bone of ['Spine', 'Spine1', 'Spine2'] as const) {
    const spine = q(bone);
    if (spine) {
      const { swing, twist } = swingTwist(spine, Y);
      if (swing > JOINT_LIMITS.spine.swing) say(bone, 'spine bent too far', swing);
      if (Math.abs(twist) > JOINT_LIMITS.spine.swing) say(bone, 'spine twisted too far', twist);
    }
  }
  const neck = pose.Neck ?? [0, 0, 0];
  const head = pose.Head ?? [0, 0, 0];
  const turn = neck[1] + head[1];
  const nod = neck[0] + head[0];
  if (Math.abs(turn) > JOINT_LIMITS.neck.turn) say('Neck+Head', 'head turned too far', turn);
  if (nod > JOINT_LIMITS.neck.down) say('Neck+Head', 'head bent down too far', nod);
  if (nod < -JOINT_LIMITS.neck.up) say('Neck+Head', 'head bent back too far', nod);
  return problems;
}
