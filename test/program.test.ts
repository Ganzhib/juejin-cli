import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';

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

test('schema rejects unknown paths instead of describing the parent command', async () => {
  const io = capture();
  const program = createProgram({ streams: io.streams });
  await assert.rejects(() => program.parseAsync(['schema', 'article', 'missing'], { from: 'user' }), /找不到命令路径/);
  assert.equal(io.result().stdout, '');
});
