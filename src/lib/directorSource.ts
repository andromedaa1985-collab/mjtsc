import type { DirectorChunk } from './autoDirector';

export interface DirectorSourceUnit {
  id: string;
  /** Local UTF-16 offsets within the existing checkpoint chunk. */
  start: number;
  end: number;
  text: string;
}

/** Exact source slices; the model chooses ranges instead of rewriting prose. */
export function buildDirectorSourceUnits(chunk: DirectorChunk): DirectorSourceUnit[] {
  const units: DirectorSourceUnit[] = [];
  const text = chunk.text;
  let start = 0;
  while (start < text.length) {
    let contentStart = start;
    while (contentStart < text.length && /\p{White_Space}/u.test(text[contentStart])) contentStart++;
    let limit = Math.min(contentStart + 96, text.length);
    if (limit < text.length && /[\uD800-\uDBFF]/.test(text[limit - 1]) && /[\uDC00-\uDFFF]/.test(text[limit])) limit--;
    if (limit < text.length && text[limit - 1] === '\r' && text[limit] === '\n') limit--;
    const candidate = text.slice(start, limit);
    const hard = [...candidate.matchAll(/[。！？!?；;\n]/g)].find(match => candidate.slice(0, match.index! + 1).trim());
    let end = hard ? start + hard.index! + 1 : limit;
    if (!hard && limit < text.length) {
      const soft = Math.max(candidate.lastIndexOf('，'), candidate.lastIndexOf(','), candidate.lastIndexOf('、'));
      if (soft >= 48) end = start + soft + 1;
    }
    // Include sentence wrappers and whitespace in the original slice. Neither
    // their presence nor formatting should require an extra empty shot.
    while (end < text.length && /[”」』"）)]/.test(text[end]) && end - contentStart < 96) end++;
    while (end < text.length && /\p{White_Space}/u.test(text[end])) end++;
    const source = text.slice(start, end);
    if (!source.trim() && units.length) {
      const previous = units.at(-1)!;
      previous.end = end;
      previous.text = text.slice(previous.start, end);
    } else {
      units.push({ id: `u${units.length + 1}`, start, end, text: source });
    }
    start = end;
  }
  return units;
}

/** Older responses may change whitespace, never words, punctuation or order. */
export function resolveDirectorExcerptEnd(source: string, cursor: number, excerpt: string, shotNumber: number): number {
  const target = excerpt.replace(/\p{White_Space}/gu, '');
  if (!target) throw new Error(`第${shotNumber}镜的原文片段为空，请使用当前原文编号。`);
  let at = cursor;
  for (let index = 0; index < target.length; index++) {
    while (at < source.length && /\p{White_Space}/u.test(source[at])) at++;
    if (source[at] !== target[index]) {
      throw new Error(`第${shotNumber}镜的原文不能从当前进度连续匹配，存在遗漏、改写或重复。下一段原文：${JSON.stringify(source.slice(at, at + 80))}；返回摘录：${JSON.stringify(excerpt.slice(0, 80))}。请改用sourceStartUnit与sourceEndUnit，按原文编号顺序完整覆盖，不重抄或概括原文。`);
    }
    at++;
  }
  if (at < source.length && /[\uD800-\uDBFF]/.test(source[at - 1]) && /[\uDC00-\uDFFF]/.test(source[at])) throw new Error(`第${shotNumber}镜的原文不能切开完整Unicode字符。`);
  return at;
}
