import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const metadata = JSON.parse(await readFile('package.json', 'utf8'));
// Only poll reads. A delayed registry response must never trigger another publish.
for (let attempt = 0; attempt < 36; attempt++) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(metadata.name)}/latest`,
      { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (response.ok) {
      const published = await response.json();
      if (published.version === metadata.version && published.gitHead === metadata.gitHead) {
        console.log(`Verified npm latest: ${published.name}@${published.version} (${published.gitHead})`);
        process.exit(0);
      }
    }
  } catch { /* npm may still be processing the accepted publication. */ }
  await delay(5000);
}
throw new Error('Publication submitted, but npm latest is not visible yet. Check npm before rerunning.');
