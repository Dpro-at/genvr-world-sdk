/** On-demand scene inventory. No renderer hooks, GPU queries or per-frame work. */
import type { Mesh, Object3D, InstancedBufferGeometry } from 'three';

export interface DiagnosticOptions {
  instanceId?: string;
}
export interface DiagnosticItem {
  instanceId: string;
  itemId: string;
  name?: string | undefined;
}
export interface DiagnosticResource {
  id: string;
  label: string;
  root: Object3D | null;
  detail?: string;
}
export interface ItemDiagnostic extends DiagnosticItem {
  meshParts: number;
  visibleTriangles: number;
  sharedBatch: boolean;
  status: 'scene-visible' | 'hidden' | 'not represented';
}
export interface ResourceDiagnostic {
  id: string;
  label: string;
  detail?: string;
  status: 'scene-visible' | 'hidden' | 'unavailable';
  objects: number;
  meshes: number;
  visibleMeshes: number;
  visibleTriangles: number;
  geometryBytes: number;
}
export interface RuntimeDiagnostics {
  capturedAt: number;
  scanMs: number;
  backend: string;
  paused: boolean;
  resources: ResourceDiagnostic[];
  items: ItemDiagnostic[];
  geometryBytes: number;
  visitedObjects: number;
  truncated: boolean;
}
export interface DiagnosticInput {
  backend: string;
  paused: boolean;
  resources: readonly DiagnosticResource[];
  items: readonly DiagnosticItem[];
}
/** Hard work/storage caps: incomplete snapshots are explicitly labelled in the UI. */
export const DIAGNOSTIC_LIMITS = {
  objects: 8192,
  slots: 16384,
  items: 1000,
  itemLookups: 16384,
  resources: 64,
  scanMs: 12,
} as const;
const text = (value: string) => value.slice(0, 160);
const count = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
function triangleCount(mesh: Mesh): number {
  const geometry = mesh.geometry;
  const available = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  const start = Math.min(available, count(geometry.drawRange.start));
  const range = geometry.drawRange.count === Infinity ? available : count(geometry.drawRange.count);
  const end = start + Math.min(available - start, range);
  if (!Array.isArray(mesh.material)) return mesh.material.visible ? Math.floor((end - start) / 3) : 0;
  let triangles = 0;
  for (const group of geometry.groups) {
    if (!mesh.material[group.materialIndex ?? 0]?.visible) continue;
    triangles += Math.floor(
      Math.max(0, Math.min(end, group.start + group.count) - Math.max(start, group.start)) / 3,
    );
  }
  return triangles;
}
function buffers(mesh: Mesh): Set<ArrayBufferLike> {
  const result = new Set<ArrayBufferLike>();
  const add = (attribute: unknown) => {
    const attr = attribute as { array?: unknown; data?: { array?: unknown } } | null;
    const array = attr?.array ?? attr?.data?.array;
    if (ArrayBuffer.isView(array)) result.add(array.buffer);
  };
  for (const attribute of Object.values(mesh.geometry.attributes)) add(attribute);
  for (const attributes of Object.values(mesh.geometry.morphAttributes))
    for (const attribute of attributes ?? []) add(attribute);
  add(mesh.geometry.index);
  const instanced = mesh as Mesh & { instanceMatrix?: unknown; instanceColor?: unknown };
  add(instanced.instanceMatrix);
  add(instanced.instanceColor);
  return result;
}
export function inspectResources(
  input: DiagnosticInput,
  options: DiagnosticOptions = {},
): RuntimeDiagnostics {
  const started = performance.now(),
    deadline = started + DIAGNOSTIC_LIMITS.scanMs;
  const result: RuntimeDiagnostics = {
    capturedAt: Date.now(),
    scanMs: 0,
    backend: text(input.backend),
    paused: input.paused,
    resources: [],
    items: [],
    geometryBytes: 0,
    visitedObjects: 0,
    truncated: false,
  };
  const rows = new Map<string, ItemDiagnostic>();
  const allBuffers = new Set<ArrayBufferLike>();
  // An explicit item probe remains available even when the full list exceeds the row cap.
  const wanted = options.instanceId;
  let lookedUp = 0;
  for (const item of input.items) {
    if (
      ++lookedUp > DIAGNOSTIC_LIMITS.itemLookups ||
      (lookedUp % 128 === 0 && performance.now() >= deadline)
    ) {
      result.truncated = true;
      break;
    }
    if (wanted && item.instanceId !== wanted) continue;
    if (rows.size >= DIAGNOSTIC_LIMITS.items) {
      result.truncated = true;
      break;
    }
    rows.set(item.instanceId, {
      instanceId: text(item.instanceId),
      itemId: text(item.itemId),
      ...(item.name ? { name: text(item.name) } : {}),
      meshParts: 0,
      visibleTriangles: 0,
      sharedBatch: false,
      status: 'not represented',
    });
    if (wanted) break;
  }
  let slots = 0;
  const markItem = (id: unknown, triangles: number, visible: boolean, shared: boolean) => {
    if (typeof id !== 'string' || (wanted && id !== wanted)) return;
    const row = rows.get(id);
    if (!row) return; // Scatter/helper IDs aren't saved item instances.
    row.meshParts++;
    row.visibleTriangles += visible ? triangles : 0;
    row.sharedBatch ||= shared;
    if (visible) row.status = 'scene-visible';
    else if (row.status === 'not represented') row.status = 'hidden';
  };
  const visited = new Set<Object3D>();
  for (const resource of input.resources.slice(0, DIAGNOSTIC_LIMITS.resources)) {
    const row: ResourceDiagnostic = {
      id: text(resource.id),
      label: text(resource.label),
      ...(resource.detail ? { detail: text(resource.detail) } : {}),
      status: resource.root ? 'hidden' : 'unavailable',
      objects: 0,
      meshes: 0,
      visibleMeshes: 0,
      visibleTriangles: 0,
      geometryBytes: 0,
    };
    result.resources.push(row);
    const ownBuffers = new Set<ArrayBufferLike>();
    const stack: Array<{ node: Object3D; visible: boolean; instanceId?: string | undefined }> = [];
    if (resource.root) {
      let visible = true;
      for (let parent: Object3D | null = resource.root.parent; parent; parent = parent.parent)
        visible &&= parent.visible;
      stack.push({ node: resource.root, visible });
    }
    while (stack.length) {
      if (result.visitedObjects >= DIAGNOSTIC_LIMITS.objects || performance.now() >= deadline) {
        result.truncated = true;
        break;
      }
      const entry = stack.pop()!,
        node = entry.node;
      if (visited.has(node)) continue; // Roots must not double-count a nested component.
      visited.add(node);
      result.visitedObjects++;
      row.objects++;
      const visible = entry.visible && node.visible;
      const instanceId =
        typeof node.userData.itemInstanceId === 'string' ? node.userData.itemInstanceId : entry.instanceId;
      if ((node as Mesh).isMesh) {
        const mesh = node as Mesh & { isInstancedMesh?: boolean; count?: number };
        const geometry = mesh.geometry as typeof mesh.geometry & Partial<InstancedBufferGeometry>;
        const triangles = triangleCount(mesh),
          instances = mesh.isInstancedMesh
            ? count(mesh.count ?? 0)
            : geometry.isInstancedBufferGeometry
              ? count(geometry.instanceCount ?? 0)
              : 1;
        const meshVisible = visible && instances > 0 && triangles > 0;
        row.meshes++;
        if (meshVisible) {
          row.visibleMeshes++;
          row.visibleTriangles += triangles * instances;
          row.status = 'scene-visible';
        }
        for (const buffer of buffers(mesh)) {
          if (!ownBuffers.has(buffer)) {
            ownBuffers.add(buffer);
            row.geometryBytes += buffer.byteLength;
          }
          if (!allBuffers.has(buffer)) {
            allBuffers.add(buffer);
            result.geometryBytes += buffer.byteLength;
          }
        }
        const ids: unknown = node.userData.slots;
        if (mesh.isInstancedMesh && Array.isArray(ids)) {
          for (let i = 0; i < Math.min(instances, ids.length); i++) {
            if (++slots > DIAGNOSTIC_LIMITS.slots || (slots % 128 === 0 && performance.now() >= deadline)) {
              result.truncated = true;
              break;
            }
            markItem(ids[i], triangles, meshVisible, instances > 1);
          }
        } else markItem(instanceId, triangles * instances, meshVisible, instances > 1);
      }
      for (const child of node.children) {
        if (stack.length + result.visitedObjects >= DIAGNOSTIC_LIMITS.objects) {
          result.truncated = true;
          break;
        }
        stack.push({ node: child, visible, instanceId });
      }
    }
  }
  if (input.resources.length > DIAGNOSTIC_LIMITS.resources) result.truncated = true;
  result.items = [...rows.values()].sort(
    (a, b) => b.visibleTriangles - a.visibleTriangles || a.instanceId.localeCompare(b.instanceId),
  );
  result.scanMs = performance.now() - started;
  return result;
}
