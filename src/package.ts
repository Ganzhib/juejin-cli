import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Both src/ and the published dist/ are one directory below package.json.
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string; version: string };
export const PACKAGE_NAME = metadata.name;
export const VERSION = metadata.version;
export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
