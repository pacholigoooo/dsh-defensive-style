import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';
import { sentenceBreaks, styleSentence } from './sentences.js';

const markdownOptions = { extensions: [gfmTable()], mdastExtensions: [gfmTableFromMarkdown()] };
const protectedNodes = new Set(['inlineCode', 'link', 'linkReference', 'image', 'imageReference', 'html']);
const literal = /“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"(?:\\.|[^"\\])*"|\$[^$\n]+\$|https?:\/\/[^\s<>，。！？；]+/gu;

function maskLiterals(node, source) {
  const start = node.position.start.offset;
  const raw = source.slice(start, node.position.end.offset);
  // Markdown 偏移和 String.slice 都按 UTF-16 计数，遮罩须占同样的长度。
  const chars = raw.split('');
  function visit(child) {
    if (protectedNodes.has(child.type)) {
      chars.fill('\uE000', child.position.start.offset - start, child.position.end.offset - start);
    } else {
      child.children?.forEach(visit);
    }
  }
  node.children.forEach(visit);
  for (const match of chars.join('').matchAll(literal)) {
    chars.fill('\uE000', match.index, match.index + match[0].length);
  }
  return { raw, visible: chars.join('') };
}

function isJsonDocument(text) {
  const first = text.trimStart()[0];
  if (first !== '{' && first !== '[') return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export function styleMarkdown(text, cursor = { value: 0 }) {
  if (!text.trim() || isJsonDocument(text)) return text;
  let output = '';
  let copied = 0;
  function visit(node) {
    if (node.type === 'paragraph') {
      const { raw, visible } = maskLiterals(node, text);
      let result = '';
      for (const piece of sentenceBreaks.segment(visible)) {
        result += styleSentence(raw.slice(piece.index, piece.index + piece.segment.length), piece.segment, cursor);
      }
      if (result !== raw) {
        output += text.slice(copied, node.position.start.offset) + result;
        copied = node.position.end.offset;
      }
    } else if (['root', 'list', 'listItem'].includes(node.type)) {
      node.children.forEach(visit);
    }
  }
  visit(fromMarkdown(text, markdownOptions));
  return output + text.slice(copied);
}
