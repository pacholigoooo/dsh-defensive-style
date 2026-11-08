import { prompt } from './prompt.js';
import { styleStream } from './stream.js';

export const name = 'defensive-sentence-style';
export const inject = ['systemPrompt', 'llm'];

const exactFormatRequests = [
  new RegExp([
    /(?:只|仅)(?:需要?|能|要)?\s*/,
    /(?:输出|返回|给出|提供|回答|回复|打印|说)\s*/,
    /(?:一个|一份|一段|以下|下面的|有效的|合法的|纯|可解析的|标准(?:的)?|正确的|对应的|最终的|\s)*/,
    /(?:json\b|yaml\b|xml\b|csv\b|代码|命令|数字|单词|选项|是或否|对或错|原文|译文|文件内容|[“「"‘']|ok\b|yes\b|no\b)/,
  ].map(pattern => pattern.source).join(''), 'iu'),
  /(?:逐字|原样)(?:返回|输出|复述|抄写)|^(?:请|请你|帮我)?(?:照抄|翻译(?:一下|为|成|下面|以下|这|[:：\s]|$))|(?:把|将)[^。！？\n]{1,60}(?:翻译|译)(?:成|为)/u,
  /(?:output|respond|return) only\s+(?:valid\s+|the\s+|a\s+)*(?:json|code|commands?|numbers?|words?|yes or no)\b|\bverbatim\b|^(?:please\s+)?translate\b/iu,
];

export function isProseCall(options) {
  if (!options.sessionId || options.purpose != null) return false;
  const user = options.messages.findLast(message => message.role === 'user' &&
    (!message.source || message.source.kind === 'user'));
  const instruction = user?.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n') ?? '';
  return !exactFormatRequests.some(pattern => pattern.test(instruction));
}

export function apply(ctx) {
  ctx.effect(function* () {
    yield ctx.systemPrompt.section({ name, order: 10190, interpolate: false, text: prompt });
    yield ctx.on('llm/stream', (options, next) => {
      const stream = next();
      return isProseCall(options) ? styleStream(stream) : stream;
    });
  });
}
