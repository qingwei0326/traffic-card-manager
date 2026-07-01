const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { path7za } = require('7zip-bin');

const rootDir = path.resolve(__dirname, '..');
const pkg = require(path.join(rootDir, 'package.json'));
const artifactName = pkg.name;
const version = pkg.version;
const releaseDir = path.join(rootDir, 'release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const zipPath = path.join(releaseDir, `${artifactName}-${version}-portable.zip`);

if (process.platform !== 'win32') {
  console.log('Portable zip is only created on Windows builds.');
  process.exit(0);
}

if (!fs.existsSync(unpackedDir)) {
  throw new Error(`Cannot create portable zip because ${unpackedDir} does not exist.`);
}

if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath, { force: true });
}

const result = spawnSync(path7za, [
  'a',
  '-tzip',
  '-mx=9',
  zipPath,
  path.join(unpackedDir, '*'),
], {
  cwd: unpackedDir,
  stdio: 'inherit',
});

if (result?.error) {
  throw result.error;
}

if (result?.status !== 0) {
  process.exit(result?.status ?? 1);
}

console.log(`Portable zip created: ${zipPath}`);
