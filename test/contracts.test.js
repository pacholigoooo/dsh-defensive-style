import test from 'node:test';
import assert from 'node:assert/strict';
import { styleMarkdown } from '../src/prose.js';
import { styleStream } from '../src/stream.js';
import { isProseCall } from '../src/index.js';

test('fills every prose sentence, preserves existing constructions and remains idempotent', () => {
  const natural = '不是文件没了，而是路径写错了。这并不意味着文件损坏。仅凭报错，还不能证明磁盘有问题。';
  assert.equal(styleMarkdown(natural), natural);
  const text = styleMarkdown('请求超时。客户端没有收到回复。请查看服务日志。');
  const parts = text.match(/[^。]+。/gu);
  assert.equal(parts.length, 3);
  assert.match(parts[0], /不是.+而是.+请求超时/);
  assert.match(parts[1], /客户端没有收到回复.+这并不意味着/);
  assert.match(parts[2], /请查看服务日志.+不能证明/);
  assert.equal(styleMarkdown(text), text);
});

test('protects Markdown literals, complete JSON, and exact output instructions', () => {
  const block = '# 标题\n\n> 引文。下一句。\n\n```js\nconsole.log("逐字保留。");\n```\n\n| 列名 | 内容 |\n|---|---|\n| 一 | 单元格。 |';
  assert.equal(styleMarkdown(block), block);
  assert.equal(styleMarkdown('{"句子":"你好。再见。"}'), '{"句子":"你好。再见。"}');
  const protectedSentence = styleMarkdown('函数 `read("第一句。第二句。");` 完成读取。');
  assert.ok(protectedSentence.includes('`read("第一句。第二句。");`'));
  assert.ok(protectedSentence.includes('而是'));
  const request = { sessionId: 'sample', messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '只返回 JSON' }] }] };
  assert.equal(isProseCall(request), false);
  const prose = { ...request, messages: [{ role: 'user', content: [{ type: 'text', text: '用三句话解释网络超时' }] }] };
  assert.equal(isProseCall(prose), true);
  const discussCode = { ...request, messages: [{ role: 'user', content: [{ type: 'text', text: '只用三句话解释这段代码' }] }] };
  assert.equal(isProseCall(discussCode), true);
  assert.equal(isProseCall({ ...prose, purpose: 'session-title' }), false);
});

test('rewrites an existing distinction in place and keeps its evidence, quoted text, and condition', () => {
  const pairs = [
    ['公布的是活动日期，这不代表报名已经开始。', '公布的是活动日期，这并不意味着报名已经开始。'],
    ['变化并非订单数量，只是展示顺序。', '变化不是订单数量，而是展示顺序。'],
    ['仅凭 `COUNT(*)`，还不能断定订单增加。', '仅凭 `COUNT(*)`，还不能证明订单增加。'],
    ['他说“其实是旧批次”，这不代表新批次已经售完。', '他说“其实是旧批次”，这并不意味着新批次已经售完。'],
    ['这个判断没有把50人的差额当作有待归因的线索，却直接把这50人整体算作周六晚上那条视频带来的效果，把时间先后当成了因果关系。',
      '这个判断不是把50人的差额当作有待归因的线索，而是直接把这50人整体算作周六晚上那条视频带来的效果，把时间先后当成了因果关系。'],
  ];
  for (const [original, expected] of pairs) {
    assert.equal(styleMarkdown(original), expected);
    assert.equal(styleMarkdown(expected), expected);
  }
  assert.match(styleMarkdown('如果两块样布来自同一批次，就可以进行比较。'), /并不意味着去掉“两块样布来自同一批次”这个前提/u);
  assert.equal(styleMarkdown('这并不一定就意味着样本有效。'), '这并不一定就意味着样本有效。');
  assert.equal(styleMarkdown('不能仅凭50人的差值证明视频带来了增量。'), '不能仅凭50人的差值证明视频带来了增量。');
});

test('releases an already styled sentence before the provider ends the block without duplicating it', async () => {
  const first = '照片记录的不是报名人数，而是当天签到的人数。';
  const second = '这不代表报名已经结束。';
  let observed = false;
  async function* provider() {
    yield { type: 'text-delta', index: 0, text: first.slice(0, 8) };
    yield { type: 'text-delta', index: 0, text: first.slice(8) + second.slice(0, 3) };
    assert.ok(observed, 'the first sentence should be visible before requesting another provider chunk');
    yield { type: 'text-delta', index: 0, text: second.slice(3) };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: first + second } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
  const stream = styleStream(provider());
  assert.equal((await stream.next()).value.type, 'block-start');
  const early = (await stream.next()).value;
  assert.equal(early.text, first);
  observed = true;
  const rest = await Array.fromAsync(stream);
  const live = early.text + rest.filter(c => c.type === 'text-delta').map(c => c.text).join('');
  assert.equal(live, first + '这并不意味着报名已经结束。');
  assert.equal(rest.find(c => c.type === 'block-end').block.text, live);
});

test('keeps protected Markdown literal across chunks and honors a corrected final block', async () => {
  const literal = '```text\n这并不意味着程序出错。\n```';
  const finish = { type: 'finish', reason: { kind: 'stop' }, replayState: { response: 'original' } };
  const chunks = Array.from(literal, text => ({ type: 'text-delta', index: 0, text }));
  const out = await Array.fromAsync(styleStream([...chunks, { type: 'block-end', index: 0, block: { type: 'text', text: literal } }, finish]));
  assert.equal(out.filter(c => c.type === 'text-delta').map(c => c.text).join(''), literal);
  assert.equal(out.at(-1), finish);

  const early = '这并不意味着预告已发布。';
  const final = '这并不意味着活动已结束。';
  const revised = await Array.fromAsync(styleStream([{ type: 'text-delta', index: 1, text: early },
    { type: 'block-end', index: 1, block: { type: 'text', text: final } }, finish]));
  assert.equal(revised.filter(c => c.type === 'text-delta').length, 1);
  assert.equal(revised.find(c => c.type === 'block-end').block.text, final);
});

test('streamed and stored text agree; tool arguments, reasoning and usage stay intact', async () => {
  const tool = { type: 'tool-call-delta', index: 2, id: 'call', name: 'read', argumentsDelta: '{"路径":"原文。"}' };
  const reasoning = { type: 'reasoning-delta', index: 0, text: '内部推理。' };
  const usage = { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } };
  const chunks = [reasoning, { type: 'text-delta', index: 1, text: '请求' }, tool,
    { type: 'text-delta', index: 1, text: '超时。' }, { type: 'block-end', index: 1, block: { type: 'text', text: '请求超时。' } },
    usage, { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { original: true } } }];
  const out = await Array.fromAsync(styleStream(chunks));
  assert.ok(out.includes(reasoning) && out.includes(tool) && out.includes(usage));
  assert.equal(out.find(c => c.type === 'text-delta').text, out.find(c => c.type === 'block-end').block.text);
  assert.match(out.find(c => c.type === 'text-delta').text, /不是.+而是/);
  assert.ok(!('replayState' in out.at(-1)));
  const fallback = await Array.fromAsync(styleStream([{ type: 'text-delta', index: 0, text: '一段内容。' }, { type: 'finish', reason: { kind: 'stop' } }]));
  assert.match(fallback.find(c => c.type === 'text-delta').text, /不是.+而是/);
  const aborted = await Array.fromAsync(styleStream([{ type: 'text-delta', index: 0, text: '半句' }, { type: 'finish', reason: { kind: 'aborted' } }]));
  assert.equal(aborted.find(c => c.type === 'text-delta').text, '半句');
});
