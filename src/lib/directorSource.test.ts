import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectorSourceUnits } from './directorSource.ts';

function unitsFor(text: string, chunkStart = 0) {
  return buildDirectorSourceUnits({ id: 'chunk-2', start: chunkStart, end: chunkStart + text.length, text });
}

function assertExactPartition(text: string, chunkStart = 0) {
  const units = unitsFor(text, chunkStart);
  assert.ok(units.length > 0);
  assert.equal(units.map(unit => unit.text).join(''), text, 'all source characters are preserved in their original order');
  let cursor = 0;
  for (const [index, unit] of units.entries()) {
    assert.equal(unit.id, `u${index + 1}`);
    assert.equal(unit.start, cursor, 'unit offsets are local and have no gap or overlap');
    assert.ok(unit.end > unit.start);
    assert.equal(unit.text, text.slice(unit.start, unit.end));
    assert.ok(!(unit.end < text.length && /[\uD800-\uDBFF]/.test(text[unit.end - 1]) && /[\uDC00-\uDFFF]/.test(text[unit.end])), 'a boundary cannot cut a Unicode surrogate pair');
    assert.ok(!(unit.end < text.length && text[unit.end - 1] === '\r' && text[unit.end] === '\n'), 'a boundary cannot divide CRLF');
    cursor = unit.end;
  }
  assert.equal(cursor, text.length);
  return units;
}

test('source units retain Unicode, exact line endings and local offsets for a later chunk', () => {
  const text = '\t旧车站，夜。\r\n林澈说：“你看见🌌了吗？我叫她「阿兰」。别改我的Ａ型钥匙。”\r\n\r\n门边的字样是『等你回来』，e\u0301与汉字并列。\n他停住。  \r\n';
  const units = assertExactPartition(text, 2_487);
  assert.deepEqual(units, unitsFor(text, 2_487), 'the same chunk produces the same stable unit table');
});

test('long unpunctuated speech can be assigned to individually valid video segments', () => {
  const text = '李明：“' + '请逐字保留原话'.repeat(70) + '”';
  const units = assertExactPartition(text);
  assert.ok(units.length >= 5, 'long speech is not left as one unmanageable source unit');
  for (const unit of units) {
    const nonWhitespace = unit.text.replace(/\p{White_Space}/gu, '');
    assert.ok(nonWhitespace.length <= 96, `unit ${unit.id} has too much continuous speech to fit one supported segment`);
  }
});

test('maximum-length boundaries do not split an emoji or a CRLF pair', () => {
  for (const text of [
    '字'.repeat(95) + '🌌' + '字'.repeat(100),
    '字'.repeat(95) + '\r\n' + '字'.repeat(100),
    '字'.repeat(94) + '👩‍🚀' + '字'.repeat(100),
  ]) assertExactPartition(text, 5_001);
});

test('identical repeated sentences have distinct sequential source identifiers', () => {
  const text = '门关上。门关上。门关上。';
  const units = assertExactPartition(text);
  assert.equal(new Set(units.map(unit => unit.id)).size, units.length);
  assert.equal(units.length, 3, 'sentence units permit repeated events to be assigned independently');
  assert.deepEqual(units.map(unit => unit.text), ['门关上。', '门关上。', '门关上。']);
});

test('normal leading, intervening and trailing blank lines stay with actual source content', () => {
  const text = ' \r\n\t室内。\r\n\r\n李明停住。 \t\r\n\r\n';
  const units = assertExactPartition(text);
  assert.ok(units.every(unit => unit.text.trim()), 'formatting does not create a standalone blank shot requirement');
});

test('a natural comma after a substantial clause provides a usable long-speech split', () => {
  const clause = '我还记得那天'.repeat(8);
  const text = `${clause}，${'请别删掉后半句'.repeat(8)}。`;
  const units = assertExactPartition(text);
  assert.equal(units[0].text, `${clause}，`, 'prefer a natural pause to cutting the next clause mid-word');
});

test('a long leading whitespace run stays with its following content rather than creating an empty first unit', () => {
  const text = ' \t\r\n'.repeat(50) + '室内。李明停住。';
  const units = assertExactPartition(text);
  assert.ok(units.every(unit => unit.text.trim()));
  assert.ok(units[0].text.endsWith('室内。'));
});
