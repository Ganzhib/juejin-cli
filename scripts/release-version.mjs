import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function planRelease(metadata, registry, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full Git commit SHA is required');
  if (!stable.test(metadata.version)) throw new Error('Only stable versions are released from main');
  if (!registry || typeof registry.versions !== 'object' || !registry.versions) throw new Error('Invalid registry response');
  const versions = Object.entries(registry.versions);
  const published = versions.find(([, item]) => item.gitHead === commit);
  if (published) return { publish: false, version: published[0] };
  const ordered = versions.map(([version]) => version).filter(version => stable.test(version))
    .sort((a, b) => {
      const left = a.split('.').map(Number), right = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
      return 0;
    });
  const highest = ordered.at(-1);
  let version = metadata.version;
  if (highest) {
    const requested = version.split('.').map(Number), current = highest.split('.').map(Number);
    const difference = requested.map((part, i) => part - current[i]).find(value => value !== 0) ?? 0;
    if (difference <= 0) version = `${current[0]}.${current[1]}.${current[2] + 1}`;
  }
  return { publish: true, version };
}

async function main() {
  const metadata = JSON.parse(await readFile('package.json', 'utf8'));
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(metadata.name)}`,
    { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Cannot read npm versions: HTTP ${response.status}`);
  const plan = planRelease(metadata, await response.json(), process.env.GITHUB_SHA);
  if (plan.publish) {
    metadata.version = plan.version;
    metadata.gitHead = process.env.GITHUB_SHA;
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
    lock.version = plan.version;
    lock.packages[''].version = plan.version;
    await writeFile('package.json', JSON.stringify(metadata, null, 2) + '\n');
    await writeFile('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
    `publish=${plan.publish}\nversion=${plan.version}\narchive=./release/${metadata.name.replace('@', '').replace('/', '-')}-${plan.version}.tgz\n`);
  console.log(plan.publish ? `Release ${metadata.name}@${plan.version}` : `Commit already published as ${plan.version}; skipped`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
