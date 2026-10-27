const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./source-fixture.cjs');
const Pattern = loadSource('src/models/pattern.js');
const config = loadSource('src/config.js');

function pattern(points, length = points.length) {
  const result = new Pattern(length);
  for (const point of points) result.addDot(point);
  return result;
}

test('the three original difficulties require exactly 4, 5 and 6 dots', () => {
  assert.deepEqual(Object.values(config.GAME.DIFFICULTY), [4, 5, 6]);
});

test('all directed grid jumps insert an unvisited midpoint only when it is geometrically on the segment', () => {
  for (let start = 0; start < 9; start++) {
    for (let end = 0; end < 9; end++) {
      if (start === end) continue;
      const result = pattern([start], 9);
      const x = ((start % 3) + (end % 3)) / 2;
      const y = (Math.floor(start / 3) + Math.floor(end / 3)) / 2;
      const expected = Number.isInteger(x) && Number.isInteger(y) ? [y * 3 + x, end] : [end];
      assert.deepEqual(Array.from(result.addDot(end)), expected, `${start} → ${end}`);
      assert.deepEqual(Array.from(result.suite), [start, ...expected]);
    }
  }
});

test('a previously visited midpoint is crossed without visiting it twice', () => {
  const result = pattern([4, 0], 6);
  assert.deepEqual(Array.from(result.addDot(8)), [8]);
  assert.deepEqual(Array.from(result.suite), [4, 0, 8]);
  assert.deepEqual(Array.from(result.addDot(4)), []);
  assert.deepEqual(Array.from(result.suite), [4, 0, 8]);
});

test('a midpoint that fills the last slot ends the pattern before the dragged-to endpoint', () => {
  const result = pattern([0, 1, 3], 4);
  assert.deepEqual(Array.from(result.addDot(5)), [4]);
  assert.deepEqual(Array.from(result.suite), [0, 1, 3, 4]);
  assert.equal(result.isComplete(), true);
  assert.deepEqual(Array.from(result.addDot(8)), []);
});

test('feedback distinguishes exact position, present elsewhere, and absent dots', () => {
  const secret = pattern([0, 1, 4, 8]);
  for (const [guess, expected] of [
    [[0, 1, 4, 8], [4, 0, 0]],
    [[8, 4, 1, 0], [0, 4, 0]],
    [[0, 4, 5, 8], [2, 1, 1]],
    [[2, 5, 6, 7], [0, 0, 4]],
  ]) {
    const result = Array.from(secret.compare(pattern(guess)));
    assert.deepEqual(result, expected);
    assert.equal(result.reduce((sum, count) => sum + count, 0), 4);
  }
});

test('reset permits a fresh pattern without carrying previous dots', () => {
  const result = pattern([0, 2], 4);
  result.reset();
  assert.equal(result.isComplete(), false);
  assert.equal(Boolean(result.gotDot(0)), false);
  assert.deepEqual(Array.from(result.addDot(8)), [8]);
});

test('random generation produces complete, unique, legal Android-style paths for every difficulty', () => {
  let seed = 0x12345678;
  const math = Object.create(Math);
  math.random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  const RandomPattern = loadSource('src/models/pattern.js', {}, { Math: math });
  for (const difficulty of [4, 5, 6]) {
    for (let sample = 0; sample < 200; sample++) {
      const result = new RandomPattern(difficulty);
      result.fillRandomly();
      const points = Array.from(result.suite);
      assert.equal(points.length, difficulty);
      assert.equal(new Set(points).size, difficulty);
      assert.equal(result.isComplete(), true);
      points.forEach(point => assert.ok(Number.isInteger(point) && point >= 0 && point <= 8));
      for (let i = 1; i < points.length; i++) {
        const x = ((points[i - 1] % 3) + (points[i] % 3)) / 2;
        const y = (Math.floor(points[i - 1] / 3) + Math.floor(points[i] / 3)) / 2;
        if (Number.isInteger(x) && Number.isInteger(y)) {
          assert.ok(points.slice(0, i).includes(y * 3 + x), 'Jump must cross an already visited midpoint');
        }
      }
    }
  }
});
