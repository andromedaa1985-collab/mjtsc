import test from 'node:test';
import assert from 'node:assert/strict';
import { deepSeekRequest, deepSeekResult } from './deepseek-provider.ts';
import { ApiError } from './ai-api.ts';

const input = { messages: [{ role: 'user' as const, content: '请返回完整JSON' }], responseFormat: { type: 'json_object' as const } };
test('provider model and output budget are controlled by server configuration', () => {
  const body = deepSeekRequest(input, {});
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.max_tokens, 16000);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(deepSeekRequest(input, { DEEPSEEK_MODEL: 'configured-model', DEEPSEEK_MAX_OUTPUT_TOKENS: '8192' }).model, 'configured-model');
  assert.throws(() => deepSeekRequest(input, { DEEPSEEK_MAX_OUTPUT_TOKENS: 'invalid' }), ApiError);
  assert.throws(() => deepSeekRequest(input, { DEEPSEEK_MAX_OUTPUT_TOKENS: '999999' }), ApiError);
});
test('a truncated provider response is rejected even if its prefix happens to be valid JSON', () => {
  assert.throws(() => deepSeekResult({ choices: [{ finish_reason: 'length', message: { content: '{"shots":[]}' } }] }), error => error instanceof ApiError && error.code === 'AI_OUTPUT_TRUNCATED');
  assert.deepEqual(deepSeekResult({ choices: [{ finish_reason: 'stop', message: { content: '完整结果' } }], usage: { total_tokens: 10 } }), { content: '完整结果', usage: { total_tokens: 10 } });
  assert.throws(() => deepSeekResult(null), ApiError);
});
test('user model overrides the platform default but thinking fields stay exclusive to official DeepSeek', () => {
  const official = deepSeekRequest({ ...input, apiConfig: { apiKey: 'dummy-user-key', model: 'deepseek-v4-pro', baseUrl: 'https://api.deepseek.com/v1' } }, { DEEPSEEK_MODEL: 'platform-model' });
  assert.equal(official.model, 'deepseek-v4-pro'); assert.deepEqual(official.thinking, { type: 'disabled' });
  const compatible = deepSeekRequest({ ...input, apiConfig: { apiKey: 'dummy-user-key', model: 'deepseek-flash', baseUrl: 'https://api.openai.com/v1' } }, {});
  assert.equal(compatible.model, 'deepseek-flash'); assert.equal(compatible.thinking, undefined);
  assert.ok(!JSON.stringify(compatible).includes('dummy-user-key'));
  const fallback = deepSeekRequest({ ...input, apiConfig: { apiKey: 'dummy-user-key', baseUrl: 'https://api.deepseek.com/v1' } }, { DEEPSEEK_MODEL: 'configured-model' });
  assert.equal(fallback.model, 'configured-model');
});
test('provider decoding rejects the actual credential in content and strips untrusted usage objects', () => {
  const apiKey = 'synthetic-platform-credential';
  assert.throws(() => deepSeekResult({ choices: [{ message: { content: `模型回显${apiKey}` } }] }, apiKey), error => error instanceof ApiError && error.code === 'AI_UNSAFE_RESPONSE');
  const result = deepSeekResult({ choices: [{ message: { content: '正常正文' } }], usage: { total_tokens: 9,
    completion_tokens: -1, prompt_tokens: NaN, prompt_cache_hit_tokens: 0, debugCredential: apiKey, object: { apiKey } } }, apiKey);
  assert.deepEqual(result, { content: '正常正文', usage: { total_tokens: 9, prompt_cache_hit_tokens: 0 } });
  assert.ok(!JSON.stringify(result).includes(apiKey));
});
