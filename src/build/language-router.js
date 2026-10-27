// The build inserts the actual available dictionaries. Query language wins over
// the current translated page; the root page is rendered in original Chinese.
(function () {
  var supported = __SUPPORTED_LANGUAGES__;
  function normalize(value) {
    var language = String(value || '').toLowerCase().replace(/_/g, '-');
    if (language === 'pt-br') return supported.indexOf('pt_br') >= 0 ? 'pt_br' : 'en';
    if (/^zh-(tw|hk|hant)(-|$)/.test(language)) return supported.indexOf('zh-tw') >= 0 ? 'zh-tw' : 'zh';
    if (supported.indexOf(language) >= 0) return language;
    var primary = language.split('-')[0];
    return supported.indexOf(primary) >= 0 ? primary : 'en';
  }
  var current = normalize(document.documentElement.lang || 'zh');
  var url = new URL(window.location.href);
  var selected = url.searchParams.has('lang') ? normalize(url.searchParams.get('lang')) : current;
  if (selected !== current) {
    window.__breaklockLanguageRedirect = true;
    var destination = new URL(selected + '/', document.baseURI);
    destination.search = url.search;
    destination.hash = url.hash;
    window.location.replace(destination.href);
  }
})();
