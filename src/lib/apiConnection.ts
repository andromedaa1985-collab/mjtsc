export type ApiConnectionProvider = 'text' | 'gemini';
export type ApiConnectionMode = 'platform' | 'user';
export interface ApiConnectionInput { mode: ApiConnectionMode; apiKey: string; model: string; baseUrl: string }
export interface ApiRequestConfig { apiKey: string; model?: string; baseUrl?: string }
export interface ApiConnectionInputs { text: ApiConnectionInput; gemini: ApiConnectionInput }
export const DEFAULT_TEXT_BASE_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
export function emptyApiConnectionInputs(): ApiConnectionInputs {
  return { text: { mode: 'platform', apiKey: '', model: 'deepseek-flash', baseUrl: DEFAULT_TEXT_BASE_URL },
    gemini: { mode: 'platform', apiKey: '', model: 'gemini-2.5-flash', baseUrl: DEFAULT_GEMINI_BASE_URL } };
}

/** Client checks are preliminary; the server independently enforces its supplier allowlist. */
export function validateApiConnection(provider: ApiConnectionProvider, input: ApiConnectionInput): ApiRequestConfig | null {
  if (input.mode === 'platform') return null;
  if (input.mode !== 'user') throw new Error('请选择服务端默认或自带密钥。');
  const label = provider === 'text' ? '文本接口' : 'Gemini';
  const apiKey = input.apiKey.trim();
  if (!apiKey || apiKey.length > 512 || /[\u0000-\u0020\u007f]/.test(apiKey)) throw new Error(label + '密钥不能为空，且不能包含空格或控制字符。');
  const rawBase = input.baseUrl.trim() || (provider === 'text' ? DEFAULT_TEXT_BASE_URL : DEFAULT_GEMINI_BASE_URL);
  let url: URL;
  try { url = new URL(rawBase); } catch { throw new Error(label + '基础地址格式不正确，请填写完整 HTTPS 地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /\s/.test(rawBase)) throw new Error(label + '基础地址须使用 HTTPS，且不能包含账号、查询参数或片段。');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) throw new Error(label + '基础地址必须是公开供应商域名，不能使用本机或 IP 地址。');
  let baseUrl = url.href.replace(/\/+$/, '');
  if (provider === 'gemini') {
    if (host !== 'generativelanguage.googleapis.com' || url.port || !['', '/', '/v1beta', '/v1beta/'].includes(url.pathname)) throw new Error('Gemini 仅支持 Google 官方接口，不支持自定义代理地址。');
    baseUrl = DEFAULT_GEMINI_BASE_URL;
  } else if (host === 'api.deepseek.com') {
    if (url.port || !['', '/', '/v1', '/v1/'].includes(url.pathname)) throw new Error('DeepSeek 官方基础地址请填写域名或 /v1。');
    baseUrl = DEFAULT_TEXT_BASE_URL;
  } else if (host === 'api.openai.com' && (url.port || !['/v1', '/v1/'].includes(url.pathname))) throw new Error('该兼容供应商的基础地址应以 /v1 结尾。');
  const model = input.model.trim() || (provider === 'gemini' ? 'gemini-2.5-flash' : host === 'api.deepseek.com' ? 'deepseek-flash' : '');
  if (!model || model.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) throw new Error(label + '模型名称须填写供应商模型 ID，最多 128 个字符。');
  return { apiKey, model, ...(provider === 'text' ? { baseUrl } : {}) };
}

let owner: string | null = null;
let configs: Record<ApiConnectionProvider, ApiRequestConfig | null> = { text: null, gemini: null };
const requests = new Set<{ owner: string; controller: AbortController }>();
const listeners = new Set<() => void>();
const EMPTY_SUMMARY = Object.freeze({ textUsesUserKey: false, geminiUsesUserKey: false, activeRequests: 0 });
let summary = EMPTY_SUMMARY as { textUsesUserKey: boolean; geminiUsesUserKey: boolean; activeRequests: number };
function notify() {
  summary = Object.freeze({ textUsesUserKey: !!configs.text, geminiUsesUserKey: !!configs.gemini, activeRequests: [...requests].filter(item => item.owner === owner).length });
  for (const listener of listeners) listener();
}
export function subscribeApiConnection(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getApiConnectionSummary(uid: string | null) { return uid && uid === owner ? summary : EMPTY_SUMMARY; }
export function setApiConnectionOwner(uid: string | null) {
  if (owner === uid) return;
  for (const request of requests) request.controller.abort();
  owner = uid; configs = { text: null, gemini: null }; notify();
}
export function clearApiConnectionOwner(uid: string) { if (owner === uid) setApiConnectionOwner(null); }
function requireOwner(uid: string) { if (!uid || uid !== owner) throw new Error('账号已切换，请重新打开 API 设置。'); }
function requireIdle() { if (summary.activeRequests) throw new Error('正在生成，请结束当前请求后修改 API 设置。'); }
export function getApiRequestConfig(provider: ApiConnectionProvider, uid: string | null): ApiRequestConfig | undefined {
  const config = uid && owner === uid ? configs[provider] : null;
  return config ? { ...config } : undefined;
}
export function getApiConnectionInputs(uid: string): ApiConnectionInputs {
  requireOwner(uid); const defaults = emptyApiConnectionInputs();
  for (const provider of ['text', 'gemini'] as const) if (configs[provider]) defaults[provider] = { ...defaults[provider], ...configs[provider], mode: 'user' };
  return defaults;
}
export function saveApiConnections(uid: string, input: ApiConnectionInputs) {
  requireOwner(uid); requireIdle();
  const text = validateApiConnection('text', input.text), gemini = validateApiConnection('gemini', input.gemini);
  configs = { text, gemini }; notify();
}
export function clearApiConnections(uid: string) { requireOwner(uid); requireIdle(); configs = { text: null, gemini: null }; notify(); }
export function beginApiConnectionRequest(provider: ApiConnectionProvider, uid: string) {
  requireOwner(uid);
  const request = { owner: uid, controller: new AbortController() };
  const apiConfig = getApiRequestConfig(provider, uid);
  requests.add(request); notify();
  let released = false;
  return { apiConfig, signal: request.controller.signal, release: () => { if (!released) { released = true; requests.delete(request); notify(); } } };
}

/** Cancel waiting for authentication too; a late token must never start a cancelled supplier request. */
export async function waitForApiOperation<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let stop = () => {};
  const aborted = new Promise<never>((_, reject) => { stop = () => reject(signal.reason || new DOMException('请求已停止。', 'AbortError')); signal.addEventListener('abort', stop, { once: true }); });
  try { return await Promise.race([work(), aborted]); }
  finally { signal.removeEventListener('abort', stop); }
}
