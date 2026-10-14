import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginApiConnectionRequest, clearApiConnections, clearApiConnectionOwner, emptyApiConnectionInputs, getApiConnectionInputs,
  getApiConnectionSummary, getApiRequestConfig, saveApiConnections, setApiConnectionOwner, validateApiConnection, waitForApiOperation } from './apiConnection.ts';
const input = () => { const value = emptyApiConnectionInputs(); value.text = { mode: 'user', apiKey: 'synthetic-test-key', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' }; return value; };

test('server-default mode and an unconfigured session omit user config', () => {
  setApiConnectionOwner('a'); clearApiConnections('a');
  assert.equal(getApiRequestConfig('text', 'a'), undefined);
  assert.equal(emptyApiConnectionInputs().text.model, 'deepseek-flash');
  assert.equal(validateApiConnection('text', { ...input().text, model: '' })!.model, 'deepseek-flash');
  assert.equal(validateApiConnection('text', emptyApiConnectionInputs().text), null);
  const configured = input(); configured.text.apiKey = '';
  assert.throws(() => saveApiConnections('a', configured), /密钥不能为空/);
  assert.equal(getApiRequestConfig('text', 'a'), undefined);
});
test('account switches and logout clear session keys, and other owners cannot read or write them', () => {
  setApiConnectionOwner('a'); saveApiConnections('a', input());
  assert.equal(getApiRequestConfig('text', 'b'), undefined);
  assert.throws(() => saveApiConnections('b', input()), /账号已切换/);
  setApiConnectionOwner('b'); assert.equal(getApiRequestConfig('text', 'b'), undefined);
  clearApiConnectionOwner('a'); saveApiConnections('b', input());
  setApiConnectionOwner(null); assert.equal(getApiRequestConfig('text', 'b'), undefined);
});
test('configuration and request snapshots are isolated from caller mutation', () => {
  setApiConnectionOwner('a'); const value = input(); saveApiConnections('a', value); value.text.apiKey = 'changed';
  const copy = getApiRequestConfig('text', 'a')!; assert.equal(copy.apiKey, 'synthetic-test-key'); copy.apiKey = 'changed-again';
  assert.equal(getApiRequestConfig('text', 'a')!.apiKey, 'synthetic-test-key');
  const form = getApiConnectionInputs('a'); form.text.apiKey = '';
  assert.equal(getApiRequestConfig('text', 'a')!.baseUrl, 'https://api.deepseek.com/v1');
});
test('active requests lock settings and abort on owner changes; release is idempotent', () => {
  setApiConnectionOwner('a'); saveApiConnections('a', input()); const request = beginApiConnectionRequest('text', 'a');
  assert.equal(getApiConnectionSummary('a').activeRequests, 1);
  assert.throws(() => clearApiConnections('a'), /正在生成/);
  assert.throws(() => saveApiConnections('a', input()), /正在生成/);
  setApiConnectionOwner('b'); assert.equal(request.signal.aborted, true); assert.equal(getApiConnectionSummary('b').activeRequests, 0);
  request.release(); request.release(); assert.equal(getApiConnectionSummary('b').activeRequests, 0);
});
test('cancelling authentication wait returns promptly and never starts already-cancelled work', async () => {
  const controller = new AbortController(); let started = false;
  const waiting = waitForApiOperation(() => new Promise<string>(() => { started = true; }), controller.signal);
  assert.equal(started, true); controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  let lateStarted = false;
  await assert.rejects(waitForApiOperation(async () => { lateStarted = true; return 'token'; }, controller.signal), { name: 'AbortError' });
  assert.equal(lateStarted, false);
});
test('URL and model validation reject insecure or malformed destinations without echoing secrets', () => {
  const config = input().text;
  for (const baseUrl of ['http://api.deepseek.com/v1', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://user:password@api.deepseek.com/v1', 'https://api.deepseek.com/v1?key=x', 'https://api.deepseek.com/v1#x', 'https://api.openai.com']) assert.throws(() => validateApiConnection('text', { ...config, baseUrl }));
  assert.throws(() => validateApiConnection('text', { ...config, model: 'bad model' }), /模型名称/);
  assert.throws(() => validateApiConnection('text', { ...config, baseUrl: 'https://public.example/v1', model: '' }), /模型名称/);
  assert.equal(validateApiConnection('text', { ...config, baseUrl: 'https://api.openai.com/v1/', model: 'model-id' })!.baseUrl, 'https://api.openai.com/v1');
  assert.equal(validateApiConnection('text', { ...config, baseUrl: 'https://public.example/v1', model: 'model-id' })!.baseUrl, 'https://public.example/v1');
});
test('Gemini uses only its official destination and own model/key', () => {
  const config = { ...emptyApiConnectionInputs().gemini, mode: 'user' as const, apiKey: 'synthetic-gemini-key' };
  assert.deepEqual(validateApiConnection('gemini', config), { apiKey: 'synthetic-gemini-key', model: 'gemini-2.5-flash' });
  assert.throws(() => validateApiConnection('gemini', { ...config, baseUrl: 'https://proxy.example' }), /官方接口/);
});
test('save is atomic and never accesses localStorage or sessionStorage', () => {
  const descriptors = ['localStorage', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  try {
    for (const [key] of descriptors) Object.defineProperty(globalThis, key, { configurable: true, get: () => { throw new Error('persistent storage forbidden'); } });
    setApiConnectionOwner('a'); saveApiConnections('a', input());
    const invalid = input(); invalid.text.model = 'another-model'; invalid.gemini.mode = 'user';
    assert.throws(() => saveApiConnections('a', invalid), /Gemini密钥/);
    assert.equal(getApiRequestConfig('text', 'a')!.model, 'deepseek-flash'); clearApiConnections('a');
  } finally {
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
    setApiConnectionOwner(null);
  }
});
