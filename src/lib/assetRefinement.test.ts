import assert from 'node:assert/strict';
import test from 'node:test';
import { refineCharacterSceneSettings } from './assetRefinement.ts';

const output = JSON.stringify({ characters: [{ name: '林月', description: '握着信封', keywords: ['信封'] }], scenes: [] });

test('text setting refinement succeeds with no image connection and no image prompt', async () => {
  const requests: unknown[] = [];
  const result = await refineCharacterSceneSettings('把她的披风改成深蓝色', null, {
    text: async (prompt, json) => { requests.push({ prompt, json }); return output; },
    vision: async () => { throw new Error('image connection is not configured'); },
  });
  assert.deepEqual(requests, [{ prompt: '把她的披风改成深蓝色', json: true }]);
  assert.equal(result.characters[0].imagenPrompt, '');
});

test('a deliberate reference image remains on the vision request with its actual payload', async () => {
  const requests: unknown[] = [];
  const result = await refineCharacterSceneSettings('参考服装材质', { data: 'dGVzdA==', mimeType: 'image/png' }, {
    text: async () => { throw new Error('text provider must not process an image'); },
    vision: async (prompt, data, mimeType) => { requests.push({ prompt, data, mimeType }); return output; },
  });
  assert.deepEqual(requests, [{ prompt: '参考服装材质', data: 'dGVzdA==', mimeType: 'image/png' }]);
  assert.equal(result.characters[0].name, '林月');
});

test('an invalid chosen image is rejected before either provider is called', async () => {
  const provider = async () => { assert.fail('providers must not be called'); return output; };
  for (const reference of [{ data: '', mimeType: 'image/png' }, { data: 'dGVzdA==', mimeType: 'image/svg+xml' }]) {
    await assert.rejects(refineCharacterSceneSettings('参考服装', reference, { text: provider, vision: provider }), /参考图片不完整/);
  }
});

test('provider errors and invalid text setting responses cannot silently succeed', async () => {
  const fail = async () => { throw new Error('文本模型暂时不可用'); };
  await assert.rejects(refineCharacterSceneSettings('微调', null, { text: fail, vision: fail }), /文本模型暂时不可用/);
  await assert.rejects(refineCharacterSceneSettings('微调', null, { text: async () => '{"characters":[{}],"scenes":[]}', vision: fail }), /数据格式不完整/);
});
