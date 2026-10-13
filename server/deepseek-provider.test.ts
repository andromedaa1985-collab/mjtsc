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
