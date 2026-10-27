import StatusBarCtrl from '../statusBar/statusBar.ctrl'
import HistoryCtrl   from '../history/history.ctrl'
import LockCtrl      from '../lock/lock.ctrl'
import SummaryCtrl   from '../summary/summary.ctrl'
import Pattern       from '../../models/pattern'
import PatternSVG    from '../../utils/patternSVG'
import config        from '../../config'
import dom           from '../../utils/dom'
import color         from '../../utils/color'
import {pluralize}   from '../../utils/pluralize'
import validateSaveState from '../../models/save-state'

require('./game.scss');

/**
 * Game Controller
 * The playground, the arena
 * It combines a status bar, a pattern history
 * and a lock.
 */
class GameCtrl {

  /**
   * Setup the controller
   * The callback provided will be called with
   * different parameter depending on the type
   * of end (abort, success, fail)
   * @param  {function} onEnd Callback for end of game
   * @return {[type]}       [description]
   */
  constructor (onEnd) {
    // Lets leave it empty for now
    // just init the shite to help V8
    this.statusBar = new StatusBarCtrl(this.abort.bind(this))
    this.history   = new HistoryCtrl()
    this.lock      = new LockCtrl(this.newAttempt.bind(this))
    this.summary   = new SummaryCtrl(this.action.bind(this))
    this.pattern   = null
    this.type      = null
    this.isEnded   = false
    this.onEnd     = onEnd
    this.onChange  = () => {}
    this.onRoundStart = () => {}
    this.onRoundFinish = () => {}
    this.active = false
    this.savedHistory = []
    this.outcome = null
    this.outcomeCount = 0
    this.summaryOpen = false

    this.statusBar.init()
    this.lock.init()

    this.setupTemplate()
  }

  /**
   * Build template of the controller
   * @return {SVGDOMElement}
   */
  setupTemplate () {
    this.el = dom.create('div', 'game-layout view', [
      dom.create('div', 'view-bloc game-layout-dashboard', [
        this.statusBar.el,
        dom.create('div', 'history-wrap', [this.history.el])
      ]),
      dom.create('div', 'view-bloc game-layout-lock', [this.lock.el]),
      this.summary.el
    ])
    return this.el
  }


  /* Controls **********************************/

  /**
   * Start a new game
   * @param  {int} type       Type ID
   * @param  {int} difficulty Number of dots
   */
  start (type, difficulty) {
    this.statusBar.stopCountdown()
    this.summary.toggle(false)
    this.summaryOpen = false
    this.active = true
    this.savedHistory = []
    this.outcome = null
    this.outcomeCount = 0
    this.type = type
    this.difficulty = difficulty
    this.lock.setDotLength(difficulty)
    this.pattern = new Pattern(difficulty)
    this.pattern.fillRandomly()
    this.history.clear('#@connect_first ' + difficulty + ' ' + pluralize('#@connect_second', difficulty))
    this.count = 0
    this.isEnded = false

    switch (type) {
      case config.GAME.TYPE.PRACTICE:
        this.statusBar.setCounter(0)
        break
      case config.GAME.TYPE.CHALLENGE:
        this.statusBar.setCounter(10)
        break
      case config.GAME.TYPE.COUNTDOWN:
        this.statusBar.setCountdown(60)
        break
    }
    this.onRoundStart({ mode: type, difficulty, restored: false })
    this.onChange()
  }

  /**
   * Listener for new pattern drawn by the user
   * and provided via the the Lock controller.
   * @param  {Pattern} pattern Pattern to test
   * @return {Boolean}         True if the pattern is correct
   */
  newAttempt (pattern) {
    // Generate a SVG from the pattern provided
    let match      = this.pattern.compare(pattern),
        svgPattern = this.buildPatternSVG(pattern, match),
        isUnlocked = (match[0] === this.pattern.dotLength)

    this.count++

    if (this.isEnded) {
      this.statusBar.incrementCounter()
    }
    else if (isUnlocked) {
      // Success case
      if (this.type === config.GAME.TYPE.COUNTDOWN)
        this.statusBar.stopCountdown()

      this.isEnded = svgPattern
      this.outcome = 'win'
      this.outcomeCount = this.count
      this.summaryOpen = true
      this.summary.setContent(true, this.count)
      this.onRoundFinish({ success: true, attempts: this.count })
    }
    else {
      // Fail case
      switch (this.type) {
        case config.GAME.TYPE.PRACTICE:
          this.statusBar.incrementCounter()
          break
        case config.GAME.TYPE.CHALLENGE:
          if (this.statusBar.decrementCounter() === 0) {
            this.isEnded = true
            this.outcome = 'loss'
            this.outcomeCount = this.count
            this.summaryOpen = true
            this.summary.setContent(false, this.count)
            this.onRoundFinish({ success: false, attempts: this.count })
          }
          break
      }
    }
    this.history.stackPattern(svgPattern)
    this.rememberPattern(pattern, false)
    this.onChange()
    return isUnlocked
  }

  /**
   * Cancel listener for the status bar
   * @param  {Number} exitCode Exit code from the status bar
   */
  abort (exitCode) {
    this.statusBar.stopCountdown()
    if (exitCode) {
      if (this.isEnded) return
      // Exit from countdown
      this.isEnded = true
      this.outcome = 'loss'
      this.outcomeCount = this.count
      this.summaryOpen = true
      this.statusBar.stopCountdown()
      this.summary.setContent(false, this.count)
      this.onRoundFinish({ success: false, attempts: this.count })
    }
    else {
      // Abort from the user
      this.isEnded = true
      this.active = false
      this.onRoundFinish({ success: false, attempts: this.count })
      this.onEnd()
    }
    this.onChange()
  }

  /**
   * Action listener for the action of the summary
   * controller. To continue, try again or go back
   * to the home menu.
   * @param  {Number} actionId Action code to apply
   */
  action (actionId) {
    switch (actionId) {
    case config.GAME.ACTIONS.NEW_GAME:
      this.start(this.type, this.difficulty)
      break;
    case config.GAME.ACTIONS.BACK_HOME:
      this.abort()
      break;
    case config.GAME.ACTIONS.SOLUTION:
      // Nothing for now
      if (this.isEnded === true) {
        let match      = this.pattern.compare(this.pattern)
        let svgPattern = this.buildPatternSVG(this.pattern, match)
        this.history.stackPattern(svgPattern)
        this.rememberPattern(this.pattern, true)
      }
      this.statusBar.setCounter(this.count)
      break;
    }
    this.summary.toggle(false)
    this.summaryOpen = false
    this.onChange()
  }

  rememberPattern (pattern, reveal) {
    this.savedHistory.push({ points: pattern.suite.slice(), reveal })
    // Bound the cloud document while retaining the total attempt count.
    if (this.savedHistory.length > 300) this.savedHistory.shift()
  }

  exportState () {
    if (!this.active) return { schemaVersion: 1, game: null }
    return { schemaVersion: 1, game: {
      type: this.type, difficulty: this.difficulty, solution: this.pattern.suite.slice(),
      history: this.savedHistory.map(entry => ({ points: entry.points.slice(), reveal: entry.reveal })),
      count: this.count, outcome: this.outcome, outcomeCount: this.outcomeCount,
      summaryOpen: this.summaryOpen,
      remaining: this.type === 3 ? this.statusBar.countdown.remaining : 60,
      counter: this.statusBar.counterVal || 0
    } }
  }

  importState (input) {
    // Validate everything before changing the live scene or stopping a timer.
    const state = validateSaveState(input)
    this.statusBar.stopCountdown()
    if (this.lock.pattern) this.lock.reset()
    this.summary.toggle(false)
    this.active = !!state.game
    if (!state.game) {
      this.isEnded = true
      this.onRoundStart({ restored: true })
      this.onEnd()
      return
    }
    const game = state.game
    this.type = game.type
    this.difficulty = game.difficulty
    this.count = game.count
    this.outcome = game.outcome
    this.outcomeCount = game.outcomeCount
    this.summaryOpen = game.summaryOpen
    this.savedHistory = game.history
    this.pattern = new Pattern(game.difficulty)
    this.pattern.suite = game.solution
    this.lock.setDotLength(game.difficulty)
    this.history.clear('#@connect_first ' + game.difficulty + ' ' + pluralize('#@connect_second', game.difficulty))
    game.history.forEach(entry => {
      const attempt = new Pattern(game.difficulty)
      attempt.suite = entry.points
      this.history.stackPattern(this.buildPatternSVG(attempt, this.pattern.compare(attempt)))
    })
    this.isEnded = game.outcome === 'loss' ? true : game.outcome === 'win'
      ? this.buildPatternSVG(this.pattern, this.pattern.compare(this.pattern)) : false
    this.statusBar.setCounter(game.counter)
    if (game.type === 3) {
      this.statusBar.setCountdown(60)
      this.statusBar.countdown.remaining = game.remaining
      if (game.outcome) this.statusBar.countdown.endCallback = null
      this.statusBar.countdown.render()
      if (game.outcome) this.statusBar.stopCountdown()
    }
    if (game.summaryOpen) this.summary.setContent(game.outcome === 'win', game.outcomeCount)
    // A restored answer is never eligible for a fresh leaderboard run.
    this.onRoundStart({ mode: game.type, difficulty: game.difficulty, restored: true })
  }

  /**
   * Generate the pattern SVG from a pattern object
   * 
   * @param  {Pattern} pattern Pattern object to use to generate the SVG
   * @param  {Array}   match   Pattern match array
   * @return {SVGDOMElement}
   */
  buildPatternSVG (pattern, match) {
    // Generate a SVG from the pattern provided
    let attemptSVG = new PatternSVG()
    attemptSVG.addDots(1)
    attemptSVG.addPattern(pattern, 14, color.greydient(
      config.PATTERN.HEX_COLOR_START,
      config.PATTERN.HEX_COLOR_END,
      pattern.dotLength - 3
    ))

    // Add the feedback on the SVG
    if (match)
      PatternSVG.prototype.addCombinaison.apply(attemptSVG, match)

    let svgPattern = attemptSVG.getSVG()

    // Add the success class to the SVG
    if ((match[0] === pattern.dotLength))
      svgPattern.classList.add('success')

    return svgPattern
  }
}

export default GameCtrl
