const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const productName = pkg.build?.productName || pkg.productName || pkg.name;
const iconPath = path.resolve(rootDir, pkg.build?.win?.icon || 'build/icon.ico');

function resolveExePath(packContext) {
  if (packContext?.appOutDir) {
    return path.join(packContext.appOutDir, `${productName}.exe`);
  }

  return path.join(rootDir, pkg.build?.directories?.output || 'release', 'win-unpacked', `${productName}.exe`);
}

function updateWindowsExecutableIcon(target = undefined) {
  const exePath = typeof target === 'string' ? target : resolveExePath(target);

  if (!fs.existsSync(exePath)) {
    throw new Error(`Windows executable not found: ${exePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`Windows icon not found: ${iconPath}`);
  }

  const executable = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  const groupId = groups[0]?.id ?? 1;
  const lang = groups[0]?.lang ?? 1033;

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    groupId,
    lang,
    iconFile.icons.map((item) => item.data),
  );

  const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
  if (versionInfo) {
    const languages = versionInfo.getAllLanguagesForStringValues();
    const language = languages[0] ?? { lang, codepage: 1200 };
    const values = {
      FileDescription: pkg.description || productName,
      ProductName: productName,
      InternalName: productName,
      OriginalFilename: `${productName}.exe`,
    };

    versionInfo.setStringValues(language, values);
    versionInfo.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(executable);
  fs.writeFileSync(exePath, Buffer.from(executable.generate()));

  console.log(`Updated Windows executable icon: ${path.relative(rootDir, exePath)}`);
}

module.exports = updateWindowsExecutableIcon;

if (require.main === module) {
  updateWindowsExecutableIcon();
}
