import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs, parsePoly, ringsBounds } from './geofabrik-load.mjs';

const poly = `brandenburg
1
   1.4E+01   5.1E+01
   1.5E+01   5.1E+01
   1.5E+01   5.3E+01
   1.4E+01   5.3E+01
END
END
`;

test('parses an Osmosis polygon file without mistaking its name for a section', () => {
  const rings = parsePoly(poly);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], [14, 51]);
  assert.deepEqual(ringsBounds(rings), { south: 51, west: 14, north: 53, east: 15 });
});

test('rejects polygons without a usable ring or with broken points', () => {
  assert.throws(() => parsePoly('name\nEND\n'), /no usable ring/);
  assert.throws(() => parsePoly('name\n1\n x y\nEND\nEND\n'), /Invalid polygon point/);
  assert.throws(() => parsePoly('name\n1\n 1 2\n 3 4\nEND\nEND\n'), /no usable ring/);
});

test('requires both input files and validates optional values', () => {
  assert.throws(() => parseArgs(['--input=a.jsonl']), /required/);
  assert.throws(() => parseArgs(['--input=a', '--poly=b', '--extracted-at=nope']), /ISO/);
  assert.throws(() => parseArgs(['--input=a', '--poly=b', '--other']), /Unknown argument/);
  assert.deepEqual(parseArgs(['--input=a', '--poly=b', '--run']), { run: true, input: 'a', poly: 'b' });
});
