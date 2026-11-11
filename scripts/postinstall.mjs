import { access } from 'node:fs/promises';

const installer = new URL('../dist/runtime/skills.js', import.meta.url);
try {
  await access(installer);
} catch (error) {
  // A fresh source checkout runs postinstall before prepare builds dist/.
  if (error.code === 'ENOENT') process.exit(0);
  throw error;
}
const { autoInstallSkill } = await import(installer.href);
await autoInstallSkill();
