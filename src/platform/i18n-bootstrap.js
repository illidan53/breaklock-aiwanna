import platformConfig from './config'
import { createI18n } from './i18n'

// Run before app.js: some upstream labels are initialized at module scope.
if (!window.__breaklockLanguageRedirect) {
  const i18n = createI18n({ ...platformConfig, keys: __BREAKLOCK_I18N_KEYS__ })
  i18n.initialize().finally(() => {
    const script = document.createElement('script')
    script.src = new URL('#@lang_code/app.js', document.baseURI).href
    document.body.appendChild(script)
  })
}
