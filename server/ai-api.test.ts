import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAiRouter, validateDeepSeekInput, validateGeminiInput, normalizeDeepSeekBaseUrl, ApiError } from './ai-api.ts';

type Dependencies = Parameters<typeof createAiRouter>[0];
const deepSeekBody = { messages: [{ role: 'user', content: '生成一段剧本' }] };

async function fixture(t: TestContext, overrides: Partial<Dependencies> = {}) {
  const calls = { gemini: 0, deepseek: 0, verification: 0 };
  const app = express();
  app.use('/api', createAiRouter({
    verifyIdToken: async (token) => {
      calls.verification += 1;
      if (token === 'invalid') throw new Error('private verification detail');
      return { uid: token, email_verified: token !== 'unverified' };
    },
    generateGemini: async () => {
      calls.gemini += 1;
      return { content: '图片分析', usage: { totalTokenCount: 12 } };
    },
    generateDeepSeek: async () => {
      calls.deepseek += 1;
      return { content: '生成的剧本', usage: { total_tokens: 10 } };
    },
    ...overrides,
  }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api`;
  const post = async (route: string, body: unknown, token: string | null = 'verified') => {
    const response = await fetch(`${url}/${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  return { calls, post, url };
}

test('both generation endpoints reject anonymous requests before provider calls', async (t) => {
  const { post, calls } = await fixture(t);
  for (const route of ['deepseek', 'gemini']) {
    const response = await post(route, route === 'gemini' ? { prompt: '图片' } : deepSeekBody, null);
    assert.equal(response.status, 401);
    assert.equal(response.data.code, 'AUTH_REQUIRED');
  }
  assert.deepEqual(calls, { verification: 0, gemini: 0, deepseek: 0 });
});

test('invalid tokens return a safe error and never call the provider', async (t) => {
  const { post, calls } = await fixture(t);
  const response = await post('deepseek', deepSeekBody, 'invalid');
  assert.equal(response.status, 401);
  assert.equal(response.data.code, 'INVALID_TOKEN');
  assert(!JSON.stringify(response.data).includes('private verification detail'));
  assert.equal(calls.deepseek, 0);
});

test('unverified accounts cannot generate content', async (t) => {
  const { post, calls } = await fixture(t);
  const response = await post('gemini', { prompt: '图片' }, 'unverified');
  assert.equal(response.status, 403);
  assert.equal(response.data.code, 'EMAIL_NOT_VERIFIED');
  assert.equal(calls.gemini, 0);
});

test('valid authenticated requests preserve content and token usage', async (t) => {
  const { post, calls } = await fixture(t);
  const deepseek = await post('deepseek', deepSeekBody);
  const gemini = await post('gemini', { prompt: '图片' });
  assert.equal(deepseek.status, 200);
  assert.deepEqual(deepseek.data, { content: '生成的剧本', usage: { total_tokens: 10 }, billingSource: 'platform' });
  assert.equal(gemini.status, 200);
  assert.equal(gemini.data.content, '图片分析');
  assert.equal(calls.deepseek, 1);
  assert.equal(calls.gemini, 1);
});

test('malformed and oversized prompt inputs are rejected without provider calls', async (t) => {
  const { post, calls } = await fixture(t);
  const invalidBodies = [
    {},
    { messages: [] },
    { messages: [{ role: 'tool', content: 'x' }] },
    { messages: [{ role: 'user', content: ' '.repeat(10) }] },
    { messages: [{ role: 'user', content: 'x'.repeat(100001) }] },
    { ...deepSeekBody, responseFormat: { type: 'xml' } },
  ];
  for (const body of invalidBodies) {
    const response = await post('deepseek', body);
    assert.equal(response.status, 400);
    assert.equal(response.data.code, 'INVALID_INPUT');
  }
  assert.equal(calls.deepseek, 0);
});

test('Gemini image data requires supported MIME type and bounded base64', () => {
  const invalidBodies = [
    { prompt: '' },
    { prompt: 'x', imageBase64: 'YQ==' },
    { prompt: 'x', mimeType: 'image/png' },
    { prompt: 'x', imageBase64: 'YQ==', mimeType: 'text/html' },
    { prompt: 'x', imageBase64: 'data:image/png;base64,YQ==', mimeType: 'image/png' },
    { prompt: 'x', imageBase64: '!!!!', mimeType: 'image/png' },
    { prompt: 'x', imageBase64: 'AAAA'.repeat(3500000), mimeType: 'image/png' },
  ];
  for (const body of invalidBodies) {
    assert.throws(() => validateGeminiInput(body), (error) => error instanceof ApiError && error.status === 400);
  }
  assert.deepEqual(validateGeminiInput({ prompt: 'x', imageBase64: 'YQ==', mimeType: 'image/png' }), {
    prompt: 'x', imageBase64: 'YQ==', mimeType: 'image/png',
  });
});

test('DeepSeek validation defaults text output and bounds combined message size', () => {
  assert.equal(validateDeepSeekInput(deepSeekBody).responseFormat.type, 'text');
  assert.throws(() => validateDeepSeekInput({
    messages: Array.from({ length: 3 }, () => ({ role: 'user', content: 'x'.repeat(100000) })),
  }), ApiError);
});
test('request keys and models are bounded and cannot silently fall back to platform credentials', () => {
  for (const apiConfig of [null, {}, { apiKey: '' }, { apiKey: ' \t ' }, { apiKey: 'x'.repeat(513) }, { apiKey: 'private\nkey' }, { apiKey: 'private\u007fkey' }, { apiKey: 'key', model: '' }, { apiKey: 'key', model: 'gpt model' }, { apiKey: 'key', model: 'x'.repeat(129) }]) {
    assert.throws(() => validateDeepSeekInput({ ...deepSeekBody, apiConfig }), error => error instanceof ApiError && error.code === 'INVALID_API_CONFIG');
  }
  const input = validateDeepSeekInput({ ...deepSeekBody, apiConfig: { apiKey: ` ${'x'.repeat(512)} `, model: ' ft:chat-model/version_1 ' } });
  assert.equal(input.apiConfig!.apiKey.length, 512);
  assert.equal(input.apiConfig!.model, 'ft:chat-model/version_1');
  assert.equal(input.apiConfig!.baseUrl, 'https://api.deepseek.com/v1');
  assert.throws(() => validateDeepSeekInput({ ...deepSeekBody, apiConfig: { apiKey: 'key', baseUrl: 'https://api.openai.com/v1' } }), error => error instanceof ApiError && error.code === 'INVALID_API_CONFIG');
});
test('provider bases use exact normalized HTTPS allowlists and Gemini remains fixed to official hosts', () => {
  assert.equal(normalizeDeepSeekBaseUrl('https://api.deepseek.com/'), 'https://api.deepseek.com/v1');
  assert.equal(normalizeDeepSeekBaseUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1');
  assert.equal(normalizeDeepSeekBaseUrl('https://API.OPENAI.COM:443/v1/'), 'https://api.openai.com/v1');
  assert.equal(normalizeDeepSeekBaseUrl('https://proxy.example/model/v1/', ['https://proxy.example/model/v1']), 'https://proxy.example/model/v1');
  for (const base of ['https://api.openai.com', 'https://proxy.example/model/v1/chat/completions', 'https://api.deepseek.com/v1#token', 'https://api.deepseek.com/v1?token=x', 'https://user@api.deepseek.com/v1', 'http://api.deepseek.com/v1', 'https://api.openai.com:444/v1']) {
    assert.throws(() => normalizeDeepSeekBaseUrl(base), error => error instanceof ApiError && error.code === 'INVALID_API_CONFIG');
  }
  const gemini = validateGeminiInput({ prompt: '图', apiConfig: { apiKey: 'request-key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/', model: 'models/gemini-2.5-flash' } });
  assert.equal(gemini.apiConfig!.baseUrl, 'https://generativelanguage.googleapis.com/v1beta');
  assert.throws(() => validateGeminiInput({ prompt: '图', apiConfig: { apiKey: 'request-key', baseUrl: 'https://api.openai.com/v1' } }), error => error instanceof ApiError && error.code === 'INVALID_API_CONFIG');
  assert.throws(() => normalizeDeepSeekBaseUrl('https://custom.example/v1', ['http://private-service/']), error => error instanceof ApiError && error.status === 503);
});

test('malformed JSON receives a JSON error', async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(`${url}/deepseek`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer verified' }, body: '{',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_JSON');
});

test('oversized request bodies fail with 413 and do not call the provider', async (t) => {
  const { post, calls } = await fixture(t);
  const response = await post('gemini', { prompt: 'x'.repeat(16 * 1024 * 1024) });
  assert.equal(response.status, 413);
  assert.equal(response.data.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(calls.gemini, 0);
});

test('provider errors never expose raw provider details', async (t) => {
  const { post } = await fixture(t, {
    generateDeepSeek: async () => { throw new Error('secret-key-and-internal-url'); },
  });
  const response = await post('deepseek', deepSeekBody);
  assert.equal(response.status, 502);
  assert.equal(response.data.code, 'AI_PROVIDER_ERROR');
  assert(!JSON.stringify(response.data).includes('secret-key'));
});
test('BYOK response content cannot echo its request credential even through an injected provider', async t => {
  const apiKey = 'synthetic-client-credential';
  const { post } = await fixture(t, {
    generateDeepSeek: async () => ({ content: `上游回显 ${apiKey}`, usage: { total_tokens: 10 } }),
    generateGemini: async () => ({ content: apiKey }),
  });
  for (const [route, body] of [['deepseek', deepSeekBody], ['gemini', { prompt: '图' }]] as const) {
    const result = await post(route, { ...body, apiConfig: { apiKey } });
    assert.equal(result.status, 502); assert.equal(result.data.code, 'AI_UNSAFE_RESPONSE');
    assert.ok(!JSON.stringify(result.data).includes(apiKey));
    assert.ok(!('content' in result.data));
  }
});
test('unknown usage properties and invalid numeric counters never enter the response', async t => {
  const apiKey = 'synthetic-client-credential';
  const { post } = await fixture(t, {
    generateDeepSeek: async () => ({ content: '正常正文', usage: { total_tokens: 10, prompt_tokens: 2, completion_tokens: 8,
      prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 2, debugCredential: apiKey, raw: { apiKey }, invalid: 12 } }),
    generateGemini: async () => ({ content: '正常图像说明', usage: { totalTokenCount: 8, promptTokenCount: -1,
      candidatesTokenCount: 4, cachedContentTokenCount: 0, thoughtsTokenCount: Infinity, debugCredential: apiKey } }),
  });
  const deepseek = await post('deepseek', { ...deepSeekBody, apiConfig: { apiKey } });
  assert.equal(deepseek.status, 200);
  assert.deepEqual(deepseek.data.usage, { total_tokens: 10, prompt_tokens: 2, completion_tokens: 8, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 2 });
  const gemini = await post('gemini', { prompt: '图', apiConfig: { apiKey } });
  assert.deepEqual(gemini.data.usage, { totalTokenCount: 8, candidatesTokenCount: 4, cachedContentTokenCount: 0 });
  assert.ok(!JSON.stringify([deepseek.data, gemini.data]).includes(apiKey));
});
test('arbitrary upstream error names and messages are absent from logger and response', async t => {
  const apiKey = 'synthetic-private-error-name';
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...values: unknown[]) => { logged.push(values); });
  const { post } = await fixture(t, { generateDeepSeek: async () => { const error = new Error(apiKey); error.name = apiKey; throw error; } });
  const result = await post('deepseek', { ...deepSeekBody, apiConfig: { apiKey } });
  assert.equal(result.status, 502); assert.equal(result.data.code, 'AI_PROVIDER_ERROR');
  assert.ok(logged.length > 0);
  assert.ok(!JSON.stringify(logged).includes(apiKey));
  assert.ok(!JSON.stringify(result.data).includes(apiKey));
});

test('empty provider results are rejected before returning success', async (t) => {
  const { post } = await fixture(t, { generateGemini: async () => ({ content: '  ' }) });
  const response = await post('gemini', { prompt: 'x' });
  assert.equal(response.status, 502);
  assert.equal(response.data.code, 'AI_EMPTY_RESPONSE');
});

test('timeouts abort provider work and release the concurrency slot', async (t) => {
  let aborted = false;
  let invocation = 0;
  const { post } = await fixture(t, {
    timeoutMs: 25,
    concurrentRequests: 1,
    generateDeepSeek: async (_input, signal) => {
      invocation += 1;
      if (invocation > 1) return { content: 'recovered' };
      signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    },
  });
  const response = await post('deepseek', deepSeekBody);
  assert.equal(response.status, 504);
  assert.equal(response.data.code, 'AI_TIMEOUT');
  assert.equal(aborted, true);
  assert.equal((await post('deepseek', deepSeekBody)).status, 200);
});

test('per-user rate limits apply across providers and reset after one minute', async (t) => {
  let now = 0;
  const { post } = await fixture(t, { requestsPerMinute: 1, now: () => now });
  assert.equal((await post('deepseek', deepSeekBody, 'user-one')).status, 200);
  const blocked = await post('gemini', { prompt: 'x' }, 'user-one');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal((await post('gemini', { prompt: 'x' }, 'user-two')).status, 200);
  now = 60000;
  assert.equal((await post('gemini', { prompt: 'x' }, 'user-one')).status, 200);
});

test('the concurrency cap blocks a second in-flight generation', async (t) => {
  let release!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { post } = await fixture(t, {
    concurrentRequests: 1,
    generateDeepSeek: async () => { markStarted(); await gate; return { content: 'done' }; },
  });
  const first = post('deepseek', deepSeekBody);
  await started;
  assert.equal((await post('gemini', { prompt: 'x' })).status, 429);
  release();
  assert.equal((await first).status, 200);
});

test('stopping the client aborts provider work and frees its concurrency slot', async (t) => {
  let invocation = 0;
  let started!: () => void;
  let signalAborted!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const stopped = new Promise<void>(resolve => { signalAborted = resolve; });
  const { post, url } = await fixture(t, {
    concurrentRequests: 1,
    generateDeepSeek: async (_input, signal) => {
      invocation += 1;
      if (invocation > 1) return { content: 'next request' };
      signal.addEventListener('abort', signalAborted, { once: true });
      started();
      return new Promise(() => {});
    },
  });
  const controller = new AbortController();
  const request = fetch(`${url}/deepseek`, {
    method: 'POST', signal: controller.signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer verified' },
    body: JSON.stringify(deepSeekBody),
  });
  const rejected = assert.rejects(request, error => error instanceof Error && error.name === 'AbortError');
  await ready;
  controller.abort();
  await rejected;
  await stopped;
  assert.equal((await post('deepseek', deepSeekBody)).status, 200);
});
