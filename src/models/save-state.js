import Pattern from './pattern'

// Cloud payloads are data only: never restore tokens, DOM, timers or run IDs.
export default function validateSaveState (input) {
  if (!input || input.schemaVersion !== 1) throw new Error('Unsupported save format')
  if (input.game === null) return { schemaVersion: 1, game: null }
  const game = input.game
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
  if (!game || ![1, 2, 3].includes(game.type) || ![4, 5, 6].includes(game.difficulty) ||
      !integer(game.count, 0, 1000000) || !integer(game.remaining, 0, 60) ||
      !integer(game.counter, 0, 1000000) || ![null, 'win', 'loss'].includes(game.outcome) ||
      !integer(game.outcomeCount, 0, game.count) || typeof game.summaryOpen !== 'boolean' ||
      !Array.isArray(game.history) || game.history.length > 300) throw new Error('Invalid saved game')
  const path = points => {
    if (!Array.isArray(points) || points.length !== game.difficulty ||
        points.some(point => !integer(point, 0, 8)) || new Set(points).size !== points.length) throw new Error('Invalid saved pattern')
    const pattern = new Pattern(game.difficulty)
    points.forEach(point => pattern.addDot(point))
    if (pattern.suite.some((point, i) => point !== points[i])) throw new Error('Invalid saved path')
    return points.slice()
  }
  const solution = path(game.solution)
  const history = game.history.map(entry => {
    if (!entry || typeof entry.reveal !== 'boolean' || (entry.reveal && !game.outcome)) throw new Error('Invalid saved history')
    return { points: path(entry.points), reveal: entry.reveal }
  })
  if ((!game.outcome && game.summaryOpen) || (game.outcome === 'win' && game.outcomeCount < 1) ||
      (!game.outcome && game.type === 2 && game.count >= 10) ||
      (!game.outcome && game.type === 2 && game.counter !== 10 - game.count) ||
      (!game.outcome && game.type === 1 && game.counter !== game.count) ||
      (!game.outcome && game.type === 3 && game.remaining === 0)) throw new Error('Invalid saved progress')
  return { schemaVersion: 1, game: {
    type: game.type, difficulty: game.difficulty, solution, history,
    count: game.count, remaining: game.remaining, counter: game.counter,
    outcome: game.outcome, outcomeCount: game.outcomeCount, summaryOpen: game.summaryOpen
  } }
}
