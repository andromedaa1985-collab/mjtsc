import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPromptTimeline, buildVideoPrompt, buildSinglePrompt } from './creativePrompts.ts';
test('time ranges may be a continuous long take or adjoining cuts', () => {
  assert.deepEqual(checkPromptTimeline('0-5秒：固定镜头。', '5秒'), []);
  assert.deepEqual(checkPromptTimeline('0—3秒：走近。3—8秒：停住。8—15秒：望向门口。', '15秒'), []);
});
test('time checker detects gaps, overlap, wrong ending and reversed ranges', () => {
  assert.ok(checkPromptTimeline('0-3秒：走近。4-15秒：停住。', '15秒').some(value => value.includes('空隙')));
  assert.ok(checkPromptTimeline('0-8秒：走近。7-15秒：停住。', '15秒').some(value => value.includes('重叠')));
  assert.ok(checkPromptTimeline('2-8秒：停住。', '10秒').length === 2);
  assert.ok(checkPromptTimeline('0-5秒：停住。5-4秒：后退。', '5秒').some(value => value.includes('倒序')));
});
test('video creation receives exact dialogue, neighbors and matching assets', () => {
  const shot = { shotNumber: 2, action: '她收回手', camera: '近景', scene: '庭院', charactersInvolved: ['林月'], dialogue: '你……还会回来吗？' };
  const params = { style: '动漫', aspectRatio: '16:9', duration: '10秒', lighting: '暮光', vfx: '无', sound: '环境音', reference: '林月定妆图' };
  const prompt = buildVideoPrompt(shot, params, { ...shot, action: '他递来玉佩' }, { ...shot, action: '门合上' }, { characters: [{ name: '林月', description: '持玉佩' }, { name: '路人', description: '不应混入' }], scenes: [{ name: '庭院', description: '石阶' }] });
  for (const text of ['你……还会回来吗？', '他递来玉佩', '门合上', '持玉佩', '石阶', '10秒']) assert.ok(prompt.includes(text));
  assert.ok(!prompt.includes('不应混入'));
});
test('character request uses a still-image template', () => {
  const prompt = buildSinglePrompt('古装女主', 'banana', 'character', true);
  assert.ok(prompt.includes('人物设定图'));
  assert.ok(!prompt.includes('时间段从0开始'));
});
test('regeneration does not include old saved prompts, reviews, or obsolete control parameters', () => {
  const shot = { shotNumber: 1, action: '她收回玉佩', camera: '近景', scene: '庭院', charactersInvolved: ['林月'],
    videoPromptData: { masterPrompt: 'STALE_PROMPT_SENTINEL', review: { critique: 'STALE_REVIEW_SENTINEL' } },
    videoParams: { reference: 'STALE_REFERENCE_SENTINEL' },
  };
  const params = { style: '动漫', aspectRatio: '16:9', duration: '10秒', lighting: '暮光', vfx: '无', sound: '环境音', reference: '当前角色参考' };
  const prompt = buildVideoPrompt(shot, params);
  assert.ok(prompt.includes('她收回玉佩'));
  assert.ok(prompt.includes('当前角色参考'));
  for (const stale of ['STALE_PROMPT_SENTINEL', 'STALE_REVIEW_SENTINEL', 'STALE_REFERENCE_SENTINEL']) assert.ok(!prompt.includes(stale));
});
