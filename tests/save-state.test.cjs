const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./source-fixture.cjs');
const Pattern = loadSource('src/models/pattern.js');
const validate = loadSource('src/models/save-state.js', { './pattern': Pattern });

function saved() {
  return { schemaVersion: 1, game: {
    type: 2, difficulty: 4, solution: [0, 1, 4, 8],
    history: [{ points: [2, 5, 6, 7], reveal: false }],
    count: 1, remaining: 60, counter: 9, outcome: null, outcomeCount: 0, summaryOpen: false,
  } };
}

test('save validation projects only known game data and returns detached patterns', () => {
  const input = saved();
  input.token = 'never-restore-credentials';
  input.game.runId = 'never-restore-ranking-runs';
  input.game.history[0].token = 'ignored';
  const result = validate(input);
  assert.equal(result.token, undefined);
  assert.equal(result.game.runId, undefined);
  assert.equal(result.game.history[0].token, undefined);
  input.game.solution[0] = 8;
  input.game.history[0].points[0] = 0;
  assert.equal(result.game.solution[0], 0);
  assert.equal(result.game.history[0].points[0], 2);
});

test('wrong versions, impossible dots, duplicate points, Android-invalid jumps and oversized saves are rejected', () => {
  for (const mutate of [
    input => { input.schemaVersion = 2; },
    input => { input.game.type = 4; },
    input => { input.game.difficulty = 9; },
    input => { input.game.solution = [0, 1, 4, 9]; },
    input => { input.game.solution = [0, 1, 4, 4]; },
    input => { input.game.solution = [0, 2, 4, 8]; },
    input => { input.game.history[0].points = [0, 2, 4, 8]; },
    input => { input.game.history = new Array(301).fill(input.game.history[0]); },
    input => { input.game.count = 1.5; },
    input => { input.game.remaining = 61; },
    input => { input.game.summaryOpen = true; },
    input => { input.game.history[0].reveal = true; },
    input => { input.game.outcome = 'win'; input.game.outcomeCount = 0; },
    input => { input.game.count = 10; },
    input => { input.game.type = 3; input.game.remaining = 0; },
  ]) {
    const input = saved();
    mutate(input);
    assert.throws(() => validate(input));
  }
});

test('an unfinished challenge cannot restore a counter that disagrees with its used attempts', () => {
  for (const counter of [0, 10, 999]) {
    const input = saved();
    input.game.counter = counter;
    assert.throws(() => validate(input), /Invalid saved progress/);
  }
});
