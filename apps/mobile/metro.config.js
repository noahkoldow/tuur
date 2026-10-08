const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Windows can label pnpm hard-linked files as symlinks in Dirent even though
// lstat identifies them correctly. Expo's cold crawler trusts Dirent, attempts
// readlink, and then drops these regular files. Confirm only reported links;
// real package junctions retain their symlink identity.
if (process.platform === 'win32') {
  const isSymbolicLink = fs.Dirent.prototype.isSymbolicLink;
  fs.Dirent.prototype.isSymbolicLink = function () {
    if (!isSymbolicLink.call(this)) return false;
    const parent = this.parentPath ?? this.path;
    if (typeof parent !== 'string') return true;
    try {
      return fs.lstatSync(path.join(parent, this.name.toString())).isSymbolicLink();
    } catch {
      return true;
    }
  };
}

// Expo detects pnpm/Turborepo monorepos automatically; assets live outside the app dir.
const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../../assets')];

// pnpm can keep its virtual store outside the repository (e.g. to avoid Windows
// path limits). Metro must watch symlink targets as well as workspace node_modules.
// Resolve the installed Expo package instead of hard-coding a machine-specific path.
const expoDir = path.dirname(fs.realpathSync(require.resolve('expo/package.json')));
const pnpmPackageDir = path.dirname(path.dirname(expoDir));
if (
  path.basename(path.dirname(expoDir)) === 'node_modules' &&
  path.basename(pnpmPackageDir).startsWith('expo@')
) {
  const virtualStoreDir = path.dirname(pnpmPackageDir);
  const alreadyWatched = config.watchFolders.some((folder) => {
    const relative = path.relative(folder, virtualStoreDir);
    return (
      relative === '' ||
      (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    );
  });
  if (!alreadyWatched) config.watchFolders.push(virtualStoreDir);
}

/**
 * UI preview in Expo Go (`pnpm --filter @tuur/mobile go`): Expo Go lacks our native modules, so app sources with an
 * `.expogo` sibling (e.g. the react-native-maps map) or else a `.web` sibling (demo backend, simulated audio, ...)
 * resolve to it and native-only packages become empty modules. Never used for real builds.
 */
if (process.env.EXPO_PUBLIC_EXPO_GO === '1') {
  const srcDir = path.join(__dirname, 'src') + path.sep;
  const nativeOnly = [
    /^@react-native-firebase\//,
    /^react-native-track-player/,
    /^@maplibre\/maplibre-react-native/,
    /^react-native-google-mobile-ads/,
    /^react-native-purchases/,
    /^@react-native-google-signin\//,
  ];
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (nativeOnly.some((re) => re.test(moduleName))) return { type: 'empty' };
    const resolved = (upstream ?? context.resolveRequest)(context, moduleName, platform);
    if (
      resolved.type === 'sourceFile' &&
      resolved.filePath.startsWith(srcDir) &&
      !/\.(web|expogo)\.tsx?$/.test(resolved.filePath)
    ) {
      for (const variant of ['expogo', 'web']) {
        const file = resolved.filePath.replace(/\.(tsx?)$/, `.${variant}.$1`);
        if (fs.existsSync(file)) return { type: 'sourceFile', filePath: file };
      }
    }
    return resolved;
  };
}

module.exports = config;
