// node test/harness-smoke.mjs <DSH 安装目录> [打包后的插件入口]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const install = resolve(process.argv[2]);
const cli = createRequire(await realpath(join(install, 'runtime/node_modules/@deepseek-ai/dsh/package.json')));
const base = createRequire(cli.resolve('@deepseek-ai/dsh-base/package.json'));
const load = (resolver, id) => import(pathToFileURL(resolver.resolve(id)).href);
const { Context } = await load(cli, '@deepseek-ai/cordis');
const { default: SystemPrompt, renderPrompt } = await load(base, '@deepseek-ai/dsh-system-prompt');
const { LlmRuntime, LlmAdapter, BlockAssembler } = await load(base, '@deepseek-ai/dsh-llm');
const entry = process.argv[3];
const plugin = entry
  ? await import(pathToFileURL(resolve(entry)).href)
  : await load(createRequire(join(install, 'home/profiles/web/package.json')), 'dsh-defensive-style');
const first = '记录的不是服务器状态，而是客户端的等待时间。';
const rest = '收到的是超时提示，这不代表数据库已经宕机。仅凭一条日志，还不能断定故障在数据库。';
let firstWasVisible = false;

class Fixture extends LlmAdapter {
  async *stream(options) {
    assert.match(options.system, /不是 A，而是 B/);
    yield { type: 'text-delta', index: 0, text: first };
    assert.ok(firstWasVisible, 'the installed DSH hook must release the first sentence before block-end');
    yield { type: 'text-delta', index: 0, text: rest };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: first + rest } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

const ctx = new Context();
try {
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(LlmRuntime);
  await ctx.plugin(plugin);
  ctx.llm.registerAdapter(['style-fixture'], new Fixture());
  const system = renderPrompt(await ctx.systemPrompt.assemble());
  const request = { provider: 'style-fixture', model: 'sample', sessionId: 'style-verification', system,
    messages: [{ role: 'user', content: [{ type: 'text', text: '用三句话解释现象' }] }] };
  const assembler = new BlockAssembler();
  let live = '';
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk);
    if (chunk.type === 'text-delta') {
      live += chunk.text;
      if (live === first) firstWasVisible = true;
    }
    if (chunk.type === 'finish') assert.equal(chunk.reason.kind, 'stop', JSON.stringify(chunk.reason));
  }
  assert.equal(assembler.blocks()[0].text, live);
  assert.equal(live, first + '收到的是超时提示，这并不意味着数据库已经宕机。仅凭一条日志，还不能证明故障在数据库。');
  console.log(live);
} finally { await ctx.fiber.dispose(); }
