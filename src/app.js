import GameCtrl from './controllers/game/game.ctrl'
import MenuCtrl from './controllers/menu/menu.ctrl'
import createCloudSync from './platform/cloud-saves'
import createLeaderboardRound, { createPlatformRequest } from './platform/leaderboards'
import platformConfig from './platform/config'
import dom from './utils/dom'

require('./style.scss')
require('./platform/platform.scss')

document.getElementById('app-intro')?.remove()
const container = document.body
let cloud, round, initialized = false
const standalone = window.parent === window
const localKey = 'breaklock-progress-v1:' + (platformConfig.gameId || 'standalone')
const request = createPlatformRequest(platformConfig)
const myGame = new GameCtrl(() => showGame(false))
const myMenu = new MenuCtrl((type, difficulty) => {
  myGame.start(type, difficulty)
  showGame(true)
  myGame.lock.el.focus({ preventScroll: true })
})
myMenu.init()
container.appendChild(myGame.el)
container.appendChild(myMenu.el)
showGame(false)

function showGame (active) {
  myMenu.el.style.display = active ? 'none' : ''
  myGame.el.style.display = active ? '' : 'none'
}

const credit = dom.create('div', 'port-notes', [
  dom.create('a', { href: 'https://github.com/maxwellito/breaklock', target: '_blank', rel: 'noopener noreferrer' }, '#@port_credit'),
  dom.create('p', {}, '#@keyboard_help')
])
if (platformConfig.gameId && Object.values(platformConfig.boardIds).every(Boolean)) {
  credit.appendChild(dom.create('p', {}, '#@rank_hint'))
}
myMenu.el.querySelector('.menu-layout-instructions').appendChild(credit)
const rankingStatus = dom.create('p', { class: 'ranking-status', role: 'status' })
myGame.summary.detailsEl.after(rankingStatus)

const cloudStatus = dom.create('p', { role: 'status', 'aria-live': 'polite' })
const cloudActions = dom.create('div', 'cloud-actions')
const panel = dom.create('section', { class: 'cloud-panel', 'aria-label': '#@cloud_open', hidden: '' }, [cloudStatus, cloudActions])
const cloudButton = dom.create('button', { class: 'cloud-open', hidden: '' }, '#@cloud_open')
container.appendChild(panel)
container.appendChild(cloudButton)

const labels = {
  loading: '#@cloud_loading', syncing: '#@cloud_loading', ready: '#@cloud_saved',
  saved: '#@cloud_saved', 'restore-required': '#@cloud_pending', conflict: '#@cloud_conflict'
}
function renderCloud (state) {
  cloudButton.hidden = !state.enabled
  const attention = ['restore-required', 'conflict', 'error', 'incompatible', 'signed-out'].includes(state.status)
  panel.hidden = !attention && state.status !== 'loading'
  myMenu.btnStarlEl.disabled = state.status === 'loading' && !state.ready
  cloudStatus.textContent = labels[state.status] || '#@cloud_offline'
  cloudActions.replaceChildren()
  if (state.restoreAvailable || state.status === 'conflict') {
    addCloudAction('#@cloud_restore', () => cloud.restoreCloud())
    addCloudAction('#@cloud_keep', () => cloud.useLocal())
  } else if (state.status !== 'loading') {
    addCloudAction('#@cloud_retry', () => cloud.retry())
  }
  if (state.status !== 'loading') addCloudAction('#@cloud_later', async () => {
    await cloud.playOffline()
    panel.hidden = true
  })
}
function addCloudAction (label, action) {
  const button = dom.create('button', {}, label)
  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      const state = await action()
      if (state) renderCloud(state)
    } finally { button.disabled = false }
  })
  cloudActions.appendChild(button)
}
cloudButton.addEventListener('click', () => {
  renderCloud(cloud.getStatus())
  panel.hidden = false
})

cloud = createCloudSync({
  config: platformConfig,
  getState: () => myGame.exportState(),
  applyState: state => { myGame.importState(state); showGame(!!state.game) },
  onStatus: renderCloud
})
myGame.onRoundStart = options => {
  if (round) round.cancel()
  rankingStatus.textContent = ''
  round = createLeaderboardRound({ ...platformConfig, ...options, request })
  if (!options.restored) window.requestAnimationFrame(() => {
    if (myGame.active && !myGame.isEnded) myGame.lock.el.focus({ preventScroll: true })
  })
}
myGame.onRoundFinish = result => {
  const current = round
  if (!current) return
  current.finish(result).then(response => {
    if (round !== current) return
    rankingStatus.textContent = response.status === 'accepted' ? '#@rank_accepted'
      : response.status === 'unavailable' ? '#@rank_unavailable' : ''
  })
}
function persist () {
  if (!initialized) return
  // Standalone storage never shares platform-frame player identities.
  if (standalone) {
    try { localStorage.setItem(localKey, JSON.stringify(myGame.exportState())) } catch { /* Storage can be disabled. */ }
  }
  cloud.save()
}
myGame.onChange = persist
if (standalone) {
  try {
    const saved = localStorage.getItem(localKey)
    if (saved) { myGame.importState(JSON.parse(saved)); showGame(myGame.active) }
  } catch { /* Leave invalid data untouched until the next valid player action. */ }
}
initialized = true
cloud.load()
window.addEventListener('pagehide', persist)
document.addEventListener('visibilitychange', () => { if (document.hidden) persist() })
window.setInterval(() => { if (myGame.active) persist() }, 15000)
window.scrollTo(0, 0)
