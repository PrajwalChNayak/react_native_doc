import {makeRows, rowHeight, ROW_HEIGHT, ROW_HEIGHT_TALL} from '../src/data';

describe('makeRows', () => {
  it('produces the requested number of rows', () => {
    expect(makeRows(10)).toHaveLength(10);
    expect(makeRows(10000)).toHaveLength(10000);
  });

  it('is deterministic for a given seed, so measurements are comparable', () => {
    expect(makeRows(50, 7)).toEqual(makeRows(50, 7));
  });

  it('produces different data for a different seed', () => {
    expect(makeRows(50, 1)).not.toEqual(makeRows(50, 2));
  });

  it('gives every row a unique, stable key', () => {
    const rows = makeRows(500);
    const ids = new Set(rows.map(r => r.id));
    expect(ids.size).toBe(rows.length);
  });

  it('reports the height the getItemLayout variant would need', () => {
    const rows = makeRows(9);
    for (const row of rows) {
      expect(rowHeight(row)).toBe(row.tall ? ROW_HEIGHT_TALL : ROW_HEIGHT);
    }
  });

  it('mixes row heights, which is why getItemLayout is not free here', () => {
    const rows = makeRows(300);
    const heights = new Set(rows.map(rowHeight));
    expect(heights.size).toBeGreaterThan(1);
  });
});
