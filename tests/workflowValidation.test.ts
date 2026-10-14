import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCharactersAndScenes, parseStoryboards, parseVideoPrompt, parsePromptReview, parseShotSuggestions, validateImageFile } from '../src/lib/workflowValidation.ts';

test('model output must have complete character and scene structures before replacing a draft', () => {
  const character = { name: '林月', description: '青衣少女', keywords: ['青衣'], imagenPrompt: 'Character reference' };
  assert.deepEqual(parseCharactersAndScenes('```json\n' + JSON.stringify({ characters: [character], scenes: [] }) + '\n```'), { characters: [character], scenes: [] });
  assert.throws(() => parseCharactersAndScenes('{"characters":"林月","scenes":[]}'));
  assert.throws(() => parseCharactersAndScenes('{"characters":[{"name":"林月"}],"scenes":[]}'));
  assert.throws(() => parseCharactersAndScenes('{"characters":[],"scenes":[]}'));
});

test('storyboard numbering is continuous across chunks and retains exact dialogue and source text', () => {
  const shot = { shotNumber: 99, action: '她停在门口。', camera: '中景', scene: '宫门', charactersInvolved: ['林月'], dialogue: '“我回来了。”', continuity: '手握信封，停在门口', sourceExcerpt: '林月停在门口：我回来了。' };
  const result = parseStoryboards(JSON.stringify({ storyboards: [shot, { ...shot, shotNumber: 99 }] }), 4);
  assert.deepEqual(result.map(item => item.shotNumber), [4, 5]);
  assert.equal(result[0].dialogue, shot.dialogue);
  assert.equal(result[0].sourceExcerpt, shot.sourceExcerpt);
  assert.throws(() => parseStoryboards('{"storyboards":[]}'));
  assert.throws(() => parseStoryboards(JSON.stringify({ storyboards: [{ ...shot, charactersInvolved: '林月' }] })));
});

test('legacy storyboard responses remain readable without optional creative context', () => {
  const [shot] = parseStoryboards('{"storyboards":[{"action":"开门","camera":"中景","scene":"房间","charactersInvolved":[]}]}');
  assert.equal(shot.dialogue, '');
  assert.equal(shot.continuity, '');
});

test('invalid generation and review outputs cannot enter the editable prompt', () => {
  assert.equal(parseVideoPrompt('{"masterPrompt":"0-5秒：她开门。"}').masterPrompt, '0-5秒：她开门。');
  assert.throws(() => parseVideoPrompt('{"masterPrompt":{"text":"错误结构"}}'));
  assert.throws(() => parseVideoPrompt('{"masterPrompt":""}'));
  assert.throws(() => parsePromptReview('{"score":101,"critique":"评分错误","improvedPrompt":"测试"}'));
  assert.throws(() => parsePromptReview('{"score":80,"critique":"评分完整"}'));
});

test('post-production notes remain separate from generation text and reject invalid values', () => {
  assert.deepEqual(parseVideoPrompt('{"masterPrompt":"0-5秒：她开门。"}').postProductionNotes, []);
  assert.deepEqual(parseVideoPrompt('{"masterPrompt":"0-5秒：她开门。","postProductionNotes":["检查镜间白平衡。"]}').postProductionNotes, ['检查镜间白平衡。']);
  assert.throws(() => parseVideoPrompt('{"masterPrompt":"0-5秒：她开门。","postProductionNotes":"错误结构"}'));
  assert.throws(() => parseVideoPrompt('{"masterPrompt":"0-5秒：她开门。","postProductionNotes":[42]}'));
});

test('shot suggestions accept only the controls the user can actually select', () => {
  const suggestion = { duration: '10秒', lighting: '自然光', vfx: '无特殊特效', sound: '脚步声' };
  assert.equal(parseShotSuggestions(JSON.stringify(suggestion)).lighting, '自然光/电影感');
  assert.throws(() => parseShotSuggestions(JSON.stringify({ ...suggestion, duration: '90秒' })));
});

test('reference files reject unsupported formats and oversized payloads before reading', () => {
  validateImageFile({ type: 'image/png', size: 1024 });
  validateImageFile({ type: 'image/png', size: 3 * 1024 * 1024 });
  assert.throws(() => validateImageFile({ type: 'image/svg+xml', size: 1024 }));
  assert.throws(() => validateImageFile({ type: 'image/png', size: 3 * 1024 * 1024 + 1 }), /3 MB/);
});
