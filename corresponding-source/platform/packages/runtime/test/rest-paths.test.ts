import { describe, expect, it } from 'vitest';
import { makeItemToolsForTest } from './helpers/item-tools.js';

describe('placement paths ask for rest (P2-43)', () => {
  it('a tap on the ground places with rest', () => {
    const { tools, applied, pointAt } = makeItemToolsForTest();
    tools.setPlaceItem('genvr.core.oak-tree');
    pointAt(4, 6);
    tools.tapPlace(0, 0);
    expect(applied.at(-1)).toMatchObject({
      type: 'place_item',
      params: { itemId: 'genvr.core.oak-tree', position: [4, 0, 6], rest: true },
    });
  });

  it('a grid block keeps its exact cell', () => {
    const { tools, applied, pointAt } = makeItemToolsForTest();
    tools.setPlaceItem('genvr.core.block');
    pointAt(4.2, 6.7);
    tools.tapPlace(0, 0);
    expect(applied.at(-1)).toMatchObject({ type: 'place_item', params: { position: [4.5, 0, 6.5] } });
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
  });

  it('dropping a moved item asks for rest; a moved grid block keeps its cell', () => {
    const { tools, applied, select, pointAt } = makeItemToolsForTest();
    select('balloon-1');
    tools.startMove();
    pointAt(12, 14);
    tools.tapSelect(0, 0);
    expect(applied.at(-1)).toMatchObject({
      type: 'transform_item',
      params: { instanceId: 'balloon-1', position: [12, 0, 14], rest: true },
    });
    select('block-1');
    tools.startMove();
    pointAt(12.2, 14.2);
    tools.tapSelect(0, 0);
    expect(applied.at(-1)).toMatchObject({ type: 'transform_item', params: { instanceId: 'block-1' } });
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
  });

  it('dragging on x or z moves with rest; dragging on y keeps the height asked for', () => {
    const { applied, select, dragAxis } = makeItemToolsForTest();
    select('tree-1');
    dragAxis(0, 2);
    expect(applied.at(-1)).toMatchObject({
      type: 'transform_item',
      params: { instanceId: 'tree-1', position: [12, 0, 10], rest: true },
    });
    dragAxis(2, -2);
    expect(applied.at(-1)).toMatchObject({ params: { position: [12, 0, 8], rest: true } });
    dragAxis(1, 2);
    expect(applied.at(-1)).toMatchObject({ type: 'transform_item', params: { position: [12, 2, 8] } });
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
  });

  it('a grid block dragged on x keeps its exact cell', () => {
    const { applied, select, dragAxis } = makeItemToolsForTest();
    select('block-1');
    dragAxis(0, 2);
    expect(applied.at(-1)).toMatchObject({ type: 'transform_item', params: { position: [32.5, 0, 30.5] } });
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
  });

  it('copies and rows of a resting item rest; of an item in the air keep its height', () => {
    const { tools, applied, select } = makeItemToolsForTest();
    select('tree-1');
    tools.duplicate();
    expect(applied.at(-1)).toMatchObject({ type: 'place_item', params: { rest: true } });
    select('balloon-1');
    tools.duplicate();
    expect(applied.at(-1)).toMatchObject({ type: 'place_item', params: { position: [21.25, 5, 20] } });
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
    applied.length = 0;
    select('tree-1');
    tools.row(3);
    expect(applied).toHaveLength(3);
    for (const command of applied)
      expect(command).toMatchObject({ type: 'place_item', params: { rest: true } });
  });

  it('arrow keys across the ground ask for rest; up and down keep the height asked for', () => {
    const { tools, applied, select } = makeItemToolsForTest();
    select('tree-1');
    tools.nudge(1, 0, 0);
    expect(applied.at(-1)).toMatchObject({ params: { position: [11, 0, 10], rest: true } });
    tools.nudge(0, 0, -1);
    expect(applied.at(-1)).toMatchObject({ params: { position: [11, 0, 9], rest: true } });
    tools.nudge(0, 1, 0);
    expect(applied.at(-1)).toMatchObject({ params: { position: [11, 1, 9] } });
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
    select('block-1');
    tools.nudge(1, 0, 0);
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
  });

  it('turning and resizing ask for rest (a new footprint rests anew); a grid block keeps its cell', () => {
    const { tools, applied, select, dragHandle } = makeItemToolsForTest();
    select('tree-1');
    tools.rotate();
    expect(applied.at(-1)).toMatchObject({ type: 'transform_item', params: { rest: true } });
    dragHandle('turn', [0, 2], [2, 0]);
    expect(applied.at(-1)).toMatchObject({ type: 'transform_item', params: { rest: true } });
    dragHandle('size', [2, 0], [3, 0]);
    expect(applied.at(-1)).toMatchObject({
      type: 'transform_item',
      params: { scale: [1.5, 1.5, 1.5], rest: true },
    });
    select('block-1');
    tools.rotate();
    expect(applied.at(-1)!.params).not.toHaveProperty('rest');
  });
});
