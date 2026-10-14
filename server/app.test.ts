import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:net';
import type { AiDependencies, DeepSeekInput, GeminiInput } from './ai-api.ts';

const deepSeekBody = { messages: [{ role: 'user', content: '原文剧本' }] };

test('importing and constructing the API app does not listen or contact any provider', async t => {
  t.mock.method(Server.prototype, 'listen', () => assert.fail('app import must not listen'));
  t.mock.method(globalThis, 'fetch', async () => assert.fail('app import must not fetch'));
  const { createApp } = await import(new URL('./app.ts', import.meta.url).href);
  const app = createApp();
  assert.equal(typeof app, 'function');
  assert.equal(app.enabled('x-powered-by'), false);
});

async function fixture(t: TestContext, overrides: Partial<AiDependencies> = {}, realDeepSeek = false) {
  const { createApp } = await import('./app.ts');
  const calls = { verification: 0, deepseek: [] as DeepSeekInput[], gemini: [] as GeminiInput[] };
  const dependencies: Partial<AiDependencies> = {
    verifyIdToken: async token => {
      calls.verification++;
      if (token === 'invalid') throw new Error('private verification detail');
      return { uid: token, email_verified: token !== 'unverified' };
    },
    generateDeepSeek: async input => { calls.deepseek.push(input); return { content: 'mock script', usage: { total_tokens: 9 } }; },
    generateGemini: async input => { calls.gemini.push(input); return { content: 'mock image analysis', usage: { totalTokenCount: 8 } }; },
    ...overrides,
  };
  if (realDeepSeek) delete dependencies.generateDeepSeek;
  const app = createApp(dependencies);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const post = async (route: string, body: unknown, token: string | null = 'verified') => {
    const response = await fetch(`${url}/api/${route}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, body: JSON.stringify(body) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  return { calls, post, url };
}

test('shared app protects both original routes without invoking any supplier for anonymous requests', async t => {
  const { post, calls } = await fixture(t);
  for (const route of ['deepseek', 'gemini']) {
    const result = await post(route, route === 'deepseek' ? deepSeekBody : { prompt: '图片' }, null);
    assert.equal(result.status, 401); assert.equal(result.data.code, 'AUTH_REQUIRED');
    assert.equal(result.headers.get('x-powered-by'), null);
  }
  assert.deepEqual(calls, { verification: 0, deepseek: [], gemini: [] });
});

test('unknown API routes are JSON 404 before auth or supplier work', async t => {
  const { post, calls, url } = await fixture(t);
  const result = await post('does-not-exist', {}, null);
  assert.equal(result.status, 404); assert.equal(result.data.code, 'NOT_FOUND');
  const get = await fetch(`${url}/api/unknown`);
  assert.equal(get.status, 404); assert.equal((await get.json()).code, 'NOT_FOUND');
  assert.deepEqual(calls, { verification: 0, deepseek: [], gemini: [] });
});

test('token verification and email verification remain before per-request credentials', async t => {
  const { post, calls } = await fixture(t);
  const invalid = await post('deepseek', { ...deepSeekBody, apiConfig: { apiKey: 'invalid\nkey' } }, 'invalid');
  assert.equal(invalid.status, 401); assert.equal(invalid.data.code, 'INVALID_TOKEN');
  assert.ok(!JSON.stringify(invalid.data).includes('private verification'));
  assert.equal((await post('gemini', { prompt: '图', apiConfig: { apiKey: 'user-key' } }, 'unverified')).status, 403);
  assert.equal(calls.deepseek.length + calls.gemini.length, 0);
});

test('platform and independent BYOK routes return billing origin without returning the key or config', async t => {
  const { post, calls } = await fixture(t);
  assert.equal((await post('deepseek', deepSeekBody)).data.billingSource, 'platform');
  const deepseek = await post('deepseek', { ...deepSeekBody, apiConfig: { apiKey: 'client-text-secret', model: 'client-chat-model', baseUrl: 'https://api.openai.com/v1/' } });
  const gemini = await post('gemini', { prompt: '图', apiConfig: { apiKey: 'client-image-secret', model: 'gemini-2.5-flash' } });
  assert.equal(deepseek.data.billingSource, 'user'); assert.equal(gemini.data.billingSource, 'user');
  assert.equal(calls.deepseek[1].apiConfig!.baseUrl, 'https://api.openai.com/v1');
  assert.equal(calls.deepseek[1].apiConfig!.apiKey, 'client-text-secret');
  assert.equal(calls.gemini[0].apiConfig!.apiKey, 'client-image-secret');
  assert.ok(!JSON.stringify([deepseek.data, gemini.data]).includes('secret'));
  assert.ok(!('apiConfig' in deepseek.data));
});

test('BYOK cannot turn the authenticated endpoint into an arbitrary-host or redirect proxy', async t => {
  const { post, calls } = await fixture(t, { allowedBaseUrls: ['https://model.example/v1'] });
  for (const baseUrl of ['http://127.0.0.1/v1', 'https://api.openai.com.evil/v1', 'https://api.deepseek.com/private', 'https://user:pass@api.deepseek.com/v1', 'https://api.openai.com/v1?token=private', 'https://model.example/v2']) {
    const result = await post('deepseek', { ...deepSeekBody, apiConfig: { apiKey: 'client-key', model: 'chat-model', baseUrl } });
    assert.equal(result.status, 400); assert.equal(result.data.code, 'INVALID_API_CONFIG');
    assert.ok(!JSON.stringify(result.data).includes(baseUrl));
  }
  assert.equal(calls.deepseek.length, 0);
  assert.equal((await post('deepseek', { ...deepSeekBody, apiConfig: { apiKey: 'client-key', model: 'chat-model', baseUrl: 'https://model.example/v1/' } })).status, 200);
  assert.equal(calls.deepseek[0].apiConfig!.baseUrl, 'https://model.example/v1');
  assert.equal((await post('gemini', { prompt: '图', apiConfig: { apiKey: 'client-key', baseUrl: 'https://model.example/v1' } })).status, 400);
});

test('real adapter selects the request key, excludes it from JSON, and disables redirect following', async t => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  let failProvider = false;
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
    assert.equal(String(url), 'https://api.openai.com/v1/chat/completions');
    assert.equal(options!.redirect, 'error');
    assert.equal(new Headers(options!.headers).get('authorization'), 'Bearer client-request-secret');
    const body = JSON.parse(String(options!.body));
    assert.equal(body.model, 'deepseek-flash'); assert.equal(body.thinking, undefined);
    assert.ok(!String(options!.body).includes('client-request-secret')); assert.ok(!('apiConfig' in body));
    assert.ok(options!.signal instanceof AbortSignal); providerCalls++;
    return failProvider ? new Response('private-provider-secret', { status: 429 }) : new Response(JSON.stringify({ choices: [{ message: { content: 'mock-compatible-result' } }], usage: { total_tokens: 4 } }), { status: 200 });
  });
  const { post } = await fixture(t, {}, true);
  const body = { ...deepSeekBody, apiConfig: { apiKey: 'client-request-secret', model: 'deepseek-flash', baseUrl: 'https://api.openai.com/v1' } };
  const result = await post('deepseek', body);
  assert.equal(result.status, 200); assert.equal(result.data.content, 'mock-compatible-result'); assert.equal(result.data.billingSource, 'user');
  failProvider = true;
  const failed = await post('deepseek', body);
  assert.equal(failed.status, 503); assert.equal(failed.data.code, 'AI_PROVIDER_ERROR');
  assert.ok(!JSON.stringify(failed.data).includes('secret')); assert.equal(providerCalls, 2);
});

test('shared app still applies one user rate window across both providers and billing modes', async t => {
  const { post, calls } = await fixture(t, { requestsPerMinute: 1 });
  assert.equal((await post('deepseek', { ...deepSeekBody, apiConfig: { apiKey: 'client-key' } })).status, 200);
  const blocked = await post('gemini', { prompt: '图' });
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(calls.gemini.length, 0);
});
test('default adapter blocks both platform and BYOK upstream key echoes while retaining valid numeric usage', async t => {
  const platformKey = 'synthetic-platform-credential';
  const userKey = 'synthetic-client-credential';
  const previousPlatformKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = platformKey;
  t.after(() => { if (previousPlatformKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousPlatformKey; });
  const originalFetch = globalThis.fetch;
  let echo = true;
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
    assert.equal(String(url), 'https://api.deepseek.com/v1/chat/completions');
    const actualKey = new Headers(options!.headers).get('authorization')!.slice('Bearer '.length);
    assert.ok(actualKey === platformKey || actualKey === userKey);
    return new Response(JSON.stringify({ choices: [{ message: { content: echo ? `upstream credential: ${actualKey}` : '正常响应' } }],
      usage: { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7, debugCredential: actualKey } }), { status: 200 });
  });
  const { post } = await fixture(t, {}, true);
  for (const body of [deepSeekBody, { ...deepSeekBody, apiConfig: { apiKey: userKey } }]) {
    const result = await post('deepseek', body);
    assert.equal(result.status, 502); assert.equal(result.data.code, 'AI_UNSAFE_RESPONSE');
    assert.ok(!JSON.stringify(result.data).includes(platformKey)); assert.ok(!JSON.stringify(result.data).includes(userKey));
  }
  echo = false;
  const result = await post('deepseek', deepSeekBody);
  assert.equal(result.status, 200); assert.equal(result.data.billingSource, 'platform');
  assert.deepEqual(result.data.usage, { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7 });
  assert.ok(!JSON.stringify(result.data).includes(platformKey));
});
