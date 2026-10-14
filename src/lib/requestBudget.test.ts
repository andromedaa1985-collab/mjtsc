import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AI_REQUEST_BYTES, MAX_IMAGE_FILE_BYTES, serializeAiRequest } from './requestBudget.ts';

test('request budget measures final UTF-8 including Unicode instead of JavaScript character count', () => {
  const body = { prompt: '镜'.repeat(Math.floor(MAX_AI_REQUEST_BYTES / 3)) };
  assert.ok(JSON.stringify(body).length < MAX_AI_REQUEST_BYTES);
  assert.throws(() => serializeAiRequest(body), /请求上限/);
  assert.deepEqual(JSON.parse(serializeAiRequest({ prompt: '镜头🙂', apiConfig: { apiKey: 'test-only' } })), { prompt: '镜头🙂', apiConfig: { apiKey: 'test-only' } });
});

test('a valid-sized image and long prompt can exceed the combined deployment budget', () => {
  const imageBase64 = 'A'.repeat(Math.ceil(MAX_IMAGE_FILE_BYTES / 3) * 4);
  const small = { imageBase64, mimeType: 'image/png', prompt: '分析图片' };
  assert.doesNotThrow(() => serializeAiRequest(small));
  const large = { ...small, prompt: '镜'.repeat(100_000), apiConfig: { apiKey: 'never-print-this-key' } };
  assert.throws(() => serializeAiRequest(large), error => error instanceof Error && /请求上限/.test(error.message) && !error.message.includes('never-print-this-key'));
});
