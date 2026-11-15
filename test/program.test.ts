import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VERSION } from '../src/package.js';

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    streams: { stdout: { write: (text: string) => { stdout += text; } }, stderr: { write: (text: string) => { stderr += text; } } },
    result: () => ({ stdout, stderr }),
  };
}

test('program instances isolate options and output while exposing live command metadata', async () => {
  const first = capture();
  const second = capture();
  const noServices = async (): Promise<never> => { throw new Error('schema must not load credentials or platform services'); };
  const programs = [first, second].map(io => createProgram({ streams: io.streams, services: noServices }));
  await Promise.all([
    programs[0]!.parseAsync(['schema', 'article', 'publish', '--json'], { from: 'user' }),
    programs[1]!.parseAsync(['schema', 'article', 'search', '--json'], { from: 'user' }),
  ]);
  const publish = JSON.parse(first.result().stdout).data;
  const search = JSON.parse(second.result().stdout).data;
  assert.equal(publish.command.name, 'publish');
  assert.equal(publish.command.options.find((option: { flags: string }) => option.flags === '--draft <id>').required, true);
  assert.deepEqual(search.command.options.find((option: { flags: string }) => option.flags === '--sort <sort>').choices, ['relevance', 'newest', 'hottest']);
  assert.equal(search.command.arguments[0].required, true);
  assert.equal(first.result().stderr + second.result().stderr, '');
});

test('agents can discover one level then query a returned command path', async () => {
  const io = capture();
  await createProgram({ streams: io.streams }).parseAsync(['schema', '--depth', '1', '--json'], { from: 'user' });
  const root = JSON.parse(io.result().stdout).data;
  assert.equal(root.schema_version, 1);
  assert.equal(root.cli_version, VERSION);
  assert.deepEqual(root.command.path, []);
  const article = root.command.commands.find((command: { name: string }) => command.name === 'article');
  assert.equal(article.has_subcommands, true);
  assert.deepEqual(article.commands, []);
  const detail = capture();
  await createProgram({ streams: detail.streams }).parseAsync(['schema', ...article.path, 'publish', '--depth', '0', '--json'], { from: 'user' });
  const publish = JSON.parse(detail.result().stdout).data.command;
  assert.deepEqual(publish.path, ['article', 'publish']);
  assert.equal(publish.has_subcommands, false);
  assert.equal(publish.options.find((option: { name: string }) => option.name === 'draft').required, true);
});

test('schema depth rejects invalid input and omitted depth still describes the full tree', async () => {
  for (const depth of ['-1', '1.5', 'Infinity', '9007199254740992']) {
    const io = capture();
    await assert.rejects(() => createProgram({ streams: io.streams }).parseAsync(['schema', '--depth', depth], { from: 'user' }));
    assert.equal(io.result().stdout, '');
  }
  const io = capture();
  await createProgram({ streams: io.streams }).parseAsync(['schema', '--json'], { from: 'user' });
  const root = JSON.parse(io.result().stdout).data.command;
  assert.ok(root.commands.find((command: { name: string }) => command.name === 'article').commands.some((command: { name: string }) => command.name === 'publish'));
});

test('skill show reads bundled content and resolvable resources without platform services', async () => {
  const io = capture();
  const noServices = async (): Promise<never> => { throw new Error('must stay offline'); };
  await createProgram({ streams: io.streams, services: noServices }).parseAsync(['skill', 'show', '--json'], { from: 'user' });
  const entry = JSON.parse(io.result().stdout).data;
  assert.equal(entry.name, 'juejin-cli');
  assert.equal(entry.version, VERSION);
  assert.equal(entry.content, await readFile(entry.path, 'utf8'));
  assert.ok(await readFile(join(entry.directory, 'assets/drawio/scripts/validate.py'), 'utf8'));
  assert.equal(io.result().stderr, '');
  const plain = capture();
  await createProgram({ streams: plain.streams, services: noServices }).parseAsync(['skill', 'show'], { from: 'user' });
  assert.equal(plain.result().stdout, entry.content);
});

test('schema rejects unknown paths instead of describing the parent command', async () => {
  const io = capture();
  const program = createProgram({ streams: io.streams });
  await assert.rejects(() => program.parseAsync(['schema', 'article', 'missing'], { from: 'user' }), /找不到命令路径/);
  assert.equal(io.result().stdout, '');
});
