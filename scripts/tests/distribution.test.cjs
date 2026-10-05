// Exercise the real packaging pipeline and guard the checked-in download against stale source.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
function normalizeBuildTime(html) {
  return html.replace(/(const BUILD_MANIFEST = .*?"generatedAtUtc":)"[^"]+"/, '$1"BUILD_TIME"');
}

test('checked-in download matches the freshly built release apart from build time', () => {
  assert.equal(hash(normalizeBuildTime(read('handy-convert.html'))), hash(normalizeBuildTime(read('dist/index.html'))),
    'handy-convert.html is stale. Run build-standalone.ps1 and commit the regenerated download.');
});

test('readable release contains the current template with only declared placeholders replaced', () => {
  const readable = read('dist/index.html');
  let expected = read('src/index.template.html');
  for (const [name, placeholder] of [['APP_CONFIG', '__APP_CONFIG_JSON__'], ['BUILD_MANIFEST', '__BUILD_MANIFEST_JSON__'], ['assetBundle', '__EMBEDDED_ASSET_BUNDLE_JSON__']]) {
    const match = readable.match(new RegExp(`const ${name} = (.*);`));
    assert.ok(match, `${name} is embedded in the readable release`);
    expected = expected.replace(placeholder, () => match[1]);
  }
  assert.equal(hash(readable), hash(expected), 'The readable release must match the current source.');
});

test('self-extracting payload restores the exact readable release bytes', () => {
  const match = read('dist/index.self-extract.html').match(/<script id="self-extract-payload" type="application\/octet-stream">([A-Za-z0-9+/=\r\n]+)<\/script>/);
  assert.ok(match, 'A gzip payload is embedded in the self-extracting release.');
  assert.equal(hash(gunzipSync(Buffer.from(match[1], 'base64'))), hash(fs.readFileSync(path.join(root, 'dist/index.html'))));
});

test('default builds refresh the root download while custom outputs leave it untouched', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'handy-distribution-'));
  try {
    for (const file of ['app.config.json', 'dependencies.json', 'dependencies.lock.json', 'build-standalone.ps1', 'src/index.template.html', 'scripts/build-self-extract.ps1', 'scripts/verify-standalone.ps1', 'scripts/verify-self-extract.ps1']) {
      const destination = path.join(fixture, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, file), destination);
    }
    const download = path.join(fixture, 'handy-convert.html');
    fs.writeFileSync(download, 'stale download');
    const build = (...args) => {
      const powershell = process.env.HANDY_CONVERT_POWERSHELL || (process.platform === 'win32' ? 'powershell.exe' : 'pwsh');
      const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(fixture, 'build-standalone.ps1'), ...args], { encoding: 'utf8' });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    };
    build();
    assert.equal(hash(fs.readFileSync(download)), hash(fs.readFileSync(path.join(fixture, 'dist/index.html'))), 'Default build must replace the stale download with the exact readable release.');
    fs.writeFileSync(download, 'custom builds must not publish over this file');
    build('-OutputPath', 'custom/example.html');
    assert.equal(fs.readFileSync(download, 'utf8'), 'custom builds must not publish over this file');
    assert.ok(fs.existsSync(path.join(fixture, 'custom/example.html')));
    assert.ok(fs.existsSync(path.join(fixture, 'custom/example.self-extract.html')));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
