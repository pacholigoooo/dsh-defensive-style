import { styleMarkdown } from './prose.js';
import { canShowVerbatim } from './sentences.js';

// 后续的 Markdown 标记可能改变整段的解析结果，提前显示的部分必须能原样输出。
class TextBlock {
  parts = [];
  candidate = [];
  shownLength = 0;

  append(delta) {
    this.parts.push(delta);
    if (this.candidate === null) return '';
    this.candidate.push(delta);
    if (!/[。！？]/u.test(delta)) return '';

    const pending = this.candidate.join('');
    let end = 0;
    for (const stop of pending.matchAll(/[。！？]+/gu)) {
      const next = stop.index + stop[0].length;
      if (!canShowVerbatim(pending.slice(end, next))) {
        this.candidate = null;
        break;
      }
      end = next;
    }
    if (this.candidate) this.candidate = [pending.slice(end)];
    this.shownLength += end;
    return pending.slice(0, end);
  }

  finish(authoritative, cursor, complete) {
    const received = this.parts.join('');
    const raw = authoritative ?? received;
    const text = complete ? styleMarkdown(raw, cursor) : raw;
    const shown = received.slice(0, this.shownLength);
    // 供应商修订了已显示的文字时，由宿主用 block-end 的全文替换预览。
    const tail = text.startsWith(shown) ? text.slice(shown.length) : '';
    return { text, tail, changed: text !== raw };
  }
}

export async function* styleStream(input) {
  const blocks = new Map();
  const cursor = { value: 0 };
  let rewritten = false;

  function* finishBlock(index, authoritative, complete) {
    const block = blocks.get(index) ?? new TextBlock();
    blocks.delete(index);
    const { text, tail, changed } = block.finish(authoritative?.text, cursor, complete);
    rewritten ||= changed;
    if (tail) yield { type: 'text-delta', index, text: tail };
    if (authoritative) yield { type: 'block-end', index, block: { ...authoritative, text } };
  }

  function* flush(complete) {
    for (const index of blocks.keys()) yield* finishBlock(index, undefined, complete);
  }

  try {
    for await (const chunk of input) {
      if (chunk.type === 'text-delta') {
        let block = blocks.get(chunk.index);
        if (!block) {
          block = new TextBlock();
          blocks.set(chunk.index, block);
          yield { type: 'block-start', index: chunk.index, blockType: 'text' };
        }
        const text = block.append(chunk.text);
        if (text) yield { ...chunk, text };
      } else if (chunk.type === 'block-start' && chunk.blockType === 'text') {
        if (!blocks.has(chunk.index)) blocks.set(chunk.index, new TextBlock());
        yield chunk;
      } else if (chunk.type === 'block-end' && chunk.block.type === 'text') {
        yield* finishBlock(chunk.index, chunk.block, true);
      } else if (chunk.type === 'finish') {
        yield* flush(!['error', 'aborted', 'max-tokens'].includes(chunk.reason.kind));
        if (rewritten && chunk.replayState !== undefined) {
          // 回放状态绑定供应商的原文。
          const { replayState, ...finish } = chunk;
          yield finish;
        } else yield chunk;
      } else yield chunk;
    }
    yield* flush(true);
  } catch (error) {
    yield* flush(false);
    throw error;
  }
}
