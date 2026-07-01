const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const node = process.execPath;

function hasPublishArg(args) {
  return args.some(arg => arg === '--publish' || arg.startsWith('--publish='));
}

function cleanReleaseDir() {
  const releaseDir = path.join(rootDir, 'release');
  const resolvedReleaseDir = path.resolve(releaseDir);
  if (path.dirname(resolvedReleaseDir) !== rootDir) {
    throw new Error(`Refusing to clean unexpected release directory: ${resolvedReleaseDir}`);
  }
  fs.rmSync(resolvedReleaseDir, { recursive: true, force: true });
}

function run(label, script, args = []) {
  console.log(`\n> ${label}`);

  const result = spawnSync(node, [script, ...args], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const builderArgs = ['--win', ...process.argv.slice(2)];
if (!hasPublishArg(builderArgs)) {
  builderArgs.push('--publish', 'never');
}

cleanReleaseDir();
run('vite', path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'), ['build']);
run('electron-builder', path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js'), builderArgs);

if (process.platform === 'win32') {
  run('portable zip', path.join(rootDir, 'scripts', 'create-portable-zip.js'));
}
