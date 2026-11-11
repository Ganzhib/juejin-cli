import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const metadata = JSON.parse(await readFile('package.json', 'utf8'));
// Only poll reads. A delayed registry response must never trigger another publish.
// npm's accepted publication can take several minutes to become public. Keep the release queue
// occupied while it propagates so the next commit cannot choose the same still-pending version.
const deadline = Date.now() + 10 * 60 * 1000;
for (let attempt = 0; Date.now() < deadline; attempt++) {
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
  if (attempt % 12 === 0) console.log(`Waiting for npm visibility: ${metadata.version} (read-only check ${attempt + 1})`);
  await delay(Math.min(5000, Math.max(0, deadline - Date.now())));
}
throw new Error('Publication submitted, but npm latest is not visible yet. Check npm before rerunning.');
