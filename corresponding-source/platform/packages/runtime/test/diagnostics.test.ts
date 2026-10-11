import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, InstancedBufferGeometry } from 'three';
import { DIAGNOSTIC_LIMITS, inspectResources } from '../src/diagnostics.js';

afterEach(() => vi.restoreAllMocks());
describe('on-demand resource inventory', () => {
  it('counts native InstancedBufferGeometry draws and zero-instance hidden state', () => {
    const base = new BoxGeometry();
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(base.index);
    for (const [name, attribute] of Object.entries(base.attributes)) geometry.setAttribute(name, attribute);
    geometry.instanceCount = 7;
    const root = new Mesh(geometry, new MeshBasicMaterial());
    root.userData.itemInstanceId = 'native';
    const input = {
      backend: 'test',
      paused: false,
      items: [{ instanceId: 'native', itemId: 'native-resource', name: undefined }],
      resources: [{ id: 'ground', label: 'Ground', root }],
    };
    expect(inspectResources(input).resources[0]?.visibleTriangles).toBe(12 * 7);
    expect(inspectResources(input).items[0]?.visibleTriangles).toBe(12 * 7);
    geometry.instanceCount = 0;
    expect(inspectResources(input).resources[0]?.visibleMeshes).toBe(0);
    expect(inspectResources(input).resources[0]?.visibleTriangles).toBe(0);
  });
  it('honours invisible materials and intersects visible material groups with the draw range', () => {
    const hidden = new MeshBasicMaterial();
    hidden.visible = false;
    const geometry = new BoxGeometry();
    geometry.setDrawRange(0, 12);
    const root = new Group();
    const invisible = new Mesh(geometry, hidden);
    invisible.userData.itemInstanceId = 'hidden';
    root.add(invisible, new Mesh(geometry, [hidden, new MeshBasicMaterial()]));
    const result = inspectResources({
      backend: 'test',
      paused: false,
      items: [{ instanceId: 'hidden', itemId: 'box' }],
      resources: [{ id: 'items', label: 'Items', root }],
    });
    expect(result.resources[0]?.visibleTriangles).toBe(2);
    expect(result.resources[0]?.visibleMeshes).toBe(1);
    expect(result.items[0]?.status).toBe('hidden');
  });
  it('stops an exact lookup after its match and bounds unsuccessful metadata searches', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const items = [{ instanceId: 'first', itemId: 'box' }];
    Object.defineProperty(items, 1, {
      get() {
        throw new Error('Read beyond matched item');
      },
    });
    expect(
      inspectResources({ backend: 'test', paused: false, items, resources: [] }, { instanceId: 'first' })
        .items,
    ).toHaveLength(1);
    const many = Array.from({ length: DIAGNOSTIC_LIMITS.itemLookups + 1 }, (_, i) => ({
      instanceId: String(i),
      itemId: 'box',
    }));
    const result = inspectResources(
      { backend: 'test', paused: false, items: many, resources: [] },
      { instanceId: 'missing' },
    );
    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(0);
  });
  it('counts shared geometry buffers once globally, and honours parent visibility and draw ranges', () => {
    const geometry = new BoxGeometry();
    geometry.setDrawRange(0, 6);
    const first = new Mesh(geometry, new MeshBasicMaterial()),
      second = first.clone();
    const parent = new Group();
    parent.visible = false;
    parent.add(second);
    const result = inspectResources({
      backend: 'WebGPU',
      paused: false,
      items: [],
      resources: [
        { id: 'first', label: 'First', root: first },
        { id: 'hidden', label: 'Hidden', root: second },
      ],
    });
    expect(result.resources[0]?.visibleTriangles).toBe(2);
    expect(result.resources[1]?.visibleTriangles).toBe(0);
    expect(result.resources[1]?.status).toBe('hidden');
    expect(result.geometryBytes).toBe(result.resources[0]?.geometryBytes);
    expect(result.resources[1]?.geometryBytes).toBe(result.geometryBytes);
    expect(first.visible).toBe(true);
    expect(parent.visible).toBe(false);
  });
  it('attributes instanced parts only to active slots and preserves hidden LOD status', () => {
    const root = new Group(),
      geometry = new BoxGeometry();
    const batch = new InstancedMesh(geometry, new MeshBasicMaterial(), 3);
    batch.count = 2;
    batch.userData.slots = ['a', 'b', 'inactive'];
    root.add(batch);
    const hidden = new Mesh(geometry, new MeshBasicMaterial());
    hidden.visible = false;
    hidden.userData.itemInstanceId = 'c';
    root.add(hidden);
    const result = inspectResources({
      backend: 'WebGL2',
      paused: true,
      resources: [{ id: 'items', label: 'Items', root }],
      items: ['a', 'b', 'c', 'inactive'].map((instanceId) => ({ instanceId, itemId: 'box' })),
    });
    expect(result.resources[0]?.visibleTriangles).toBe(24);
    expect(result.items.find((item) => item.instanceId === 'a')).toMatchObject({
      visibleTriangles: 12,
      meshParts: 1,
      sharedBatch: true,
      status: 'scene-visible',
    });
    expect(result.items.find((item) => item.instanceId === 'c')?.status).toBe('hidden');
    expect(result.items.find((item) => item.instanceId === 'inactive')?.status).toBe('not represented');
    expect(result.paused).toBe(true);
  });
  it('inherits animated item IDs, distinguishes unavailable roots and does not double-count nested roots', () => {
    const parent = new Group();
    parent.userData.itemInstanceId = 'actor';
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    parent.add(mesh);
    const result = inspectResources({
      backend: 'WebGPU',
      paused: false,
      items: [{ instanceId: 'actor', itemId: 'fish' }],
      resources: [
        { id: 'actors', label: 'Actors', root: parent },
        { id: 'nested', label: 'Nested', root: mesh },
        { id: 'pending', label: 'Pending', root: null, detail: 'Loading' },
      ],
    });
    expect(result.items[0]).toMatchObject({ meshParts: 1, visibleTriangles: 12 });
    expect(result.resources[1]?.objects).toBe(0);
    expect(result.visitedObjects).toBe(2);
    expect(result.resources[2]?.status).toBe('unavailable');
    expect(result.resources[2]?.detail).toBe('Loading');
  });
  it('caps large inventories and allows probing an item beyond the default row limit', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const items = Array.from({ length: DIAGNOSTIC_LIMITS.items + 1 }, (_, i) => ({
      instanceId: `item-${i}`,
      itemId: 'box',
    }));
    const input = { backend: 'WebGPU', paused: false, items, resources: [] };
    const all = inspectResources(input);
    expect(all.items).toHaveLength(DIAGNOSTIC_LIMITS.items);
    expect(all.truncated).toBe(true);
    const one = inspectResources(input, { instanceId: `item-${DIAGNOSTIC_LIMITS.items}` });
    expect(one.items).toHaveLength(1);
    expect(one.truncated).toBe(false);
  });
  it('bounds graph scanning and marks incomplete snapshots rather than claiming every item was checked', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const root = new Group();
    for (let i = 0; i < DIAGNOSTIC_LIMITS.objects + 5; i++) root.add(new Group());
    const snapshot = inspectResources({
      backend: 'WebGL2',
      paused: false,
      items: [],
      resources: [{ id: 'large', label: 'Large', root }],
    });
    expect(snapshot.visitedObjects).toBeLessThanOrEqual(DIAGNOSTIC_LIMITS.objects);
    expect(snapshot.truncated).toBe(true);
  });
  it('bounds instance-slot scanning and ignores unsupported scatter IDs without new rows', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const batch = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), DIAGNOSTIC_LIMITS.slots + 5);
    batch.userData.slots = Array.from({ length: batch.count }, () => 'scatter');
    const result = inspectResources({
      backend: 'WebGPU',
      paused: false,
      items: [],
      resources: [{ id: 'cover', label: 'Cover', root: batch }],
    });
    expect(result.truncated).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.resources[0]?.visibleTriangles).toBe(batch.count * 12);
  });
});
