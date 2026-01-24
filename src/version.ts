import packageJson from '../package.json' with { type: 'json' };

declare const __BWRB_VERSION__: string | undefined;

const injectedVersion = typeof __BWRB_VERSION__ === 'string'
  ? __BWRB_VERSION__
  : null;
const packageVersion = typeof packageJson.version === 'string' && packageJson.version.length > 0
  ? packageJson.version
  : null;
const resolvedVersion = injectedVersion ?? packageVersion;

if (!resolvedVersion) {
  throw new Error('Unable to determine bwrb version.');
}

export const BWRB_VERSION = resolvedVersion;
