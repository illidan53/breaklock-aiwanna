import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { applyI18n, getL10nData, playerDictionary } from './i18n.mjs';
import { buildFolder, rootFolder } from './paths.mjs';
import { productionCompiler } from './webpackCompiler.mjs';

async function listFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return paths.flat().sort();
}

async function compile() {
  await new Promise((resolve, reject) => {
    productionCompiler.run((error, stats) => {
      productionCompiler.close(closeError => {
        if (error || closeError) return reject(error || closeError);
        if (!stats || stats.hasErrors()) return reject(new Error(stats?.toString({ colors: false }) || 'Webpack returned no result'));
        if (stats.hasWarnings()) console.warn(stats.toString({ all: false, warnings: true, colors: false }));
        resolve();
      });
    });
  });
}

async function build() {
  await rm(buildFolder, { recursive: true, force: true });
  await mkdir(buildFolder, { recursive: true });
  console.log('Compiling JavaScript and Sass...');
  await compile();

  const locales = await getL10nData();
  const english = locales.find(locale => locale.code === 'en');
  if (!english) throw new Error('English fallback dictionary is required');
  if (!locales.some(locale => locale.code === 'zh')) throw new Error('Chinese original dictionary is required');
  for (const required of ['en', 'zh', 'ja', 'ko', 'es']) {
    if (!locales.some(locale => locale.code === required)) throw new Error(`Missing required language: ${required}`);
  }

  await cp(join(rootFolder, 'assets'), join(buildFolder, 'assets'), { recursive: true });
  await mkdir(join(buildFolder, 'i18n'));
  // Carry legal notices into the downloadable game, not just its source repo.
  const rootEntries = await readdir(rootFolder);
  for (const name of rootEntries.filter(name => /^(LICENSE|NOTICE|THIRD_PARTY|COPYING)([._-]|$)/i.test(name) || /^licenses$/i.test(name))) {
    await cp(join(rootFolder, name), join(buildFolder, name), { recursive: true });
  }

  const router = (await readFile(join(rootFolder, 'src/build/language-router.js'), 'utf8'))
    .replace('__SUPPORTED_LANGUAGES__', JSON.stringify(locales.map(locale => locale.code)));
  await writeFile(join(buildFolder, 'language-router.js'), router);

  console.log(`Generating ${locales.length} translated versions...`);
  const bundleNotices = (await readdir(buildFolder)).filter(name => /\.js\.LICENSE\.txt$/.test(name));
  await Promise.all(locales.map(async locale => {
    const folder = join(buildFolder, locale.code);
    await mkdir(folder);
    const dictionary = { ...english.data, ...locale.data, lang_code: locale.code };
    await Promise.all([
      applyI18n(join(rootFolder, 'index.html'), join(folder, 'index.html'), dictionary),
      applyI18n(join(buildFolder, 'app.js'), join(folder, 'app.js'), dictionary),
      applyI18n(join(buildFolder, 'bootstrap.js'), join(folder, 'bootstrap.js'), dictionary),
      applyI18n(join(rootFolder, 'manifest.json'), join(folder, 'manifest.json'), dictionary),
      cp(join(buildFolder, 'app.css'), join(folder, 'app.css')),
      writeFile(join(buildFolder, 'i18n', `${locale.code}.json`), JSON.stringify(playerDictionary(dictionary), null, 2) + '\n'),
      ...bundleNotices.map(name => cp(join(buildFolder, name), join(folder, name))),
    ]);
  }));

  const chinese = join(buildFolder, 'zh');
  await writeFile(join(buildFolder, 'index.html'), (await readFile(join(chinese, 'index.html'), 'utf8')).replace('<base href="../" />', '<base href="./" />'));
  const rootManifest = JSON.parse(await readFile(join(chinese, 'manifest.json'), 'utf8'));
  rootManifest.scope = './';
  rootManifest.start_url = './?lang=zh';
  for (const icon of rootManifest.icons) icon.src = icon.src.replace(/^\.\.\//, '');
  await writeFile(join(buildFolder, 'manifest.json'), JSON.stringify(rootManifest, null, 2) + '\n');
  // Only the localized bundles are entry points. Never ship the placeholder bundle.
  await rm(join(buildFolder, 'app.js'));
  await rm(join(buildFolder, 'bootstrap.js'));
  await rm(join(buildFolder, 'app.css'));

  const files = await listFiles(buildFolder);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(buildFolder, file));
    hash.update(await readFile(file));
  }
  const paths = files.map(file => './' + relative(buildFolder, file).split(sep).join('/'));
  const worker = (await readFile(join(rootFolder, 'service-worker.js'), 'utf8'))
    .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16))
    .replace('__PRECACHE_FILES__', JSON.stringify(paths));
  await writeFile(join(buildFolder, 'service-worker.js'), worker);
  console.log(`Built dist/ successfully (${locales.length} languages; original zh, fallback en).`);
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
