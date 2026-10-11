import { Box3, Box3Helper, Group, Vector3, type Scene } from 'three/webgpu';

/** Red outline color of items that break a check (3D content, not UI chrome). */
const MARKER_COLOR = 0xff5a4f;

/**
 * Debug view of the world checks (P2-11, owner note): red boxes around items that break a rule
 * or another check, shown while the builder asks for them in the studio's Checks tab.
 */
export class RuleMarkers {
  readonly group = new Group();

  constructor(scene: Scene) {
    this.group.name = 'rule-markers';
    this.group.userData.helper = true;
    scene.add(this.group);
  }

  /** Replaces the markers with one box per entry (world-space bounds). */
  show(boxes: ReadonlyArray<{ min: readonly number[]; max: readonly number[] }>): void {
    this.clear();
    for (const { min, max } of boxes) {
      const box = new Box3(new Vector3(min[0], min[1], min[2]), new Vector3(max[0], max[1], max[2]));
      box.expandByScalar(0.05);
      const helper = new Box3Helper(box, MARKER_COLOR);
      helper.userData.helper = true;
      this.group.add(helper);
    }
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      (child as Box3Helper).geometry.dispose();
      this.group.remove(child);
    }
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
