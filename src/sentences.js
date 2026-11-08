export const sentenceBreaks = new Intl.Segmenter('zh', { granularity: 'sentence' });

const markers = [
  /(?:不是|并非)[\s\S]+?而是/u,
  /(?:并非|不)(?:一定|必然)?(?:就)?意味着/u,
  /(?:不能|无法|不足以)(?:单独|直接|据此)?证明/u,
  /不能(?:仅凭|单凭|只凭)[^，,。！？；\n]{1,64}证明/u,
  /\bnot\b[\s\S]+?\bbut\b|\b(?:does not|doesn't) mean\b|\b(?:cannot|can't|does not|doesn't) prove\b/iu,
];

const connectiveRules = [
  { pattern: /(不是|并非)[^，,。！？；\n]+[，,]\s*(其实是|实际(?:上)?是|只是)/du,
    words: ['不是', '而是'] },
  { pattern: /(并没有|没有|并未)(?=把)[^，,。！？；\n]+[，,]\s*(却|反而|而是)(?=(?:直接|仍然|一概|仅仅|只)?把)/du,
    words: ['不是', '而是'] },
  // “代表某人的意见”应保留原意，只处理后接推断的用法。
  { pattern: /(?:这(?:一点|一结果|一现象)?)(并不代表|不代表|并不表示|不表示)(?=[^，,。！？；\n]{0,30}(?:已经|必然|一定|可以|正在|会|能够|同样|需要|仍然))/du,
    words: ['并不意味着'] },
  { pattern: /(仅凭|单凭|只凭)[^。！？；\n]{1,64}?(不能断定|无法断定|不能认定|不足以断定)(?!是否|能否|究竟|哪)/du,
    words: ['仅凭', '不能证明'] },
];

function hasMarker(text) {
  return markers.some(pattern => pattern.test(text));
}

function clarifyExisting(source, visible) {
  for (const { pattern, words } of connectiveRules) {
    const match = pattern.exec(visible);
    if (!match) continue;
    // 从句尾往前换连接词，保持较早捕获组的原文偏移。
    for (let i = words.length - 1; i >= 0; i--) {
      const [start, end] = match.indices[i + 1];
      source = source.slice(0, start) + words[i] + source.slice(end);
    }
    return source;
  }
}

function chineseSentence(body, visible, punctuation, variant) {
  const corrected = clarifyExisting(body, visible);
  if (corrected) return corrected + punctuation;
  if (/[?？]/u.test(punctuation)) return `想确认的不是别的问题，而是：${body}${punctuation}`;

  const condition = /^(?:如果|若)([^，,。！？；\n\uE000]{1,40})[，,]/u.exec(visible);
  if (condition) {
    return `${body}，这并不意味着去掉“${condition[1]}”这个前提也会得到相同的结果${punctuation}`;
  }
  if (/^(?:建议(?:先|再|把|将|检查|核实|核对|查看|比较)|请(?:先|再|检查|查看|核对|核实|确认|提供|运行|看|把|将)|可以先|不妨|下一步(?:可以|应|要)|需要(?:先|再|检查|核实|确认))/u.test(visible)) {
    return `${body}；仅凭这项建议，还不能证明这一步已经完成${punctuation}`;
  }
  if (/(?:可能|也许|或许|推测|猜测)/u.test(visible) && !/(?:不可能|没有可能|排除.*可能|并非可能)/u.test(visible)) {
    return `${body}，这并不意味着这个推测已经得到证实${punctuation}`;
  }

  return [
    `这里说的不是别的情况，而是这一点：${body}${punctuation}`,
    `${body}，这并不意味着其他情况也一定如此${punctuation}`,
    `${body}；仅凭这一点，还不能证明更广的结论${punctuation}`,
  ][variant];
}

export function styleSentence(raw, visible, cursor) {
  if (!/\p{L}/u.test(visible) || hasMarker(visible)) return raw;
  const [, leading, trimmed, trailing] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
  const terminal = /[。！？.!?]+$/.exec(trimmed)?.[0] ?? '';
  const body = terminal ? trimmed.slice(0, -terminal.length) : trimmed;
  const visibleBody = visible.slice(leading.length, leading.length + body.length);
  const chinese = /\p{Script=Han}/u.test(visible);
  const punctuation = terminal || (chinese ? '。' : '.');
  const variant = cursor.value++ % 3;
  let sentence;
  if (chinese) sentence = chineseSentence(body, visibleBody, punctuation, variant);
  else if (/[?？]/u.test(terminal)) sentence = `The question is not about another case, but this one: ${body}${punctuation}`;
  else sentence = [
    `The point is not a broader claim, but this: ${body}${punctuation}`,
    `${body}; this does not mean other cases necessarily follow${punctuation}`,
    `${body}; this alone cannot prove a broader claim${punctuation}`,
  ][variant];
  return leading + sentence + trailing;
}

export function canShowVerbatim(sentence) {
  if (/[\r\n`#$[\]{}\\|*_~<>"'“”‘’「」『』/&]/u.test(sentence)) return false;
  for (const { segment } of sentenceBreaks.segment(sentence)) {
    if (/\p{L}/u.test(segment) && !hasMarker(segment)) return false;
  }
  return true;
}
