import express, { type ErrorRequestHandler } from 'express';

const MAX_PROMPT_LENGTH = 100000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
// Keep aligned with the client's final UTF-8 JSON budget, below Vercel's 4.5 MB.
const MAX_API_BODY_BYTES = 4_300_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface GeminiInput {
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
  apiConfig?: RequestApiConfig;
}
export interface RequestApiConfig { apiKey: string; model?: string; baseUrl?: string }
export interface DeepSeekInput {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  responseFormat: { type: 'text' | 'json_object' };
  apiConfig?: RequestApiConfig;
}
interface GenerationResult { content: string; usage?: unknown }
export interface AiDependencies {
  verifyIdToken: (token: string) => Promise<{ uid: string; email_verified?: boolean }>;
  generateGemini: (input: GeminiInput, signal: AbortSignal) => Promise<GenerationResult>;
  generateDeepSeek: (input: DeepSeekInput, signal: AbortSignal) => Promise<GenerationResult>;
  timeoutMs?: number;
  requestsPerMinute?: number;
  concurrentRequests?: number;
  now?: () => number;
  allowedBaseUrls?: string[];
}

function invalidApiConfig(message: string): never { throw new ApiError(400, 'INVALID_API_CONFIG', message); }
function canonicalBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return invalidApiConfig('API 服务地址无效，请输入完整 HTTPS 地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) invalidApiConfig('API 服务地址必须为 HTTPS，且不能包含账号、查询参数或片段。');
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
}
/** Exact deployment allowlist, never hosts/paths taken from an authenticated user. */
export function normalizeDeepSeekBaseUrl(value: string, allowedBaseUrls: string[] = []): string {
  const base = canonicalBaseUrl(value);
  if (base === 'https://api.deepseek.com' || base === 'https://api.deepseek.com/v1') return 'https://api.deepseek.com/v1';
  if (base === 'https://api.openai.com/v1') return base;
  let allowed: string[];
  try { allowed = allowedBaseUrls.map(entry => canonicalBaseUrl(entry)); }
  catch { throw new ApiError(503, 'AI_NOT_CONFIGURED', '兼容服务地址白名单配置无效，请联系管理员。'); }
  if (!allowed.includes(base)) invalidApiConfig('该 API 服务地址未获部署者允许，请使用官方地址或联系管理员配置明确地址白名单。');
  return base;
}
function requestApiConfig(value: unknown, provider: 'deepseek' | 'gemini', allowedBaseUrls: string[] = []): RequestApiConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidApiConfig('API 配置必须包含本次请求的有效密钥。');
  const data = value as Record<string, unknown>;
  if (typeof data.apiKey !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(data.apiKey) || !data.apiKey.trim() || data.apiKey.trim().length > 512) invalidApiConfig('API 密钥不能为空，长度不能超过512字符，且不能包含控制字符。');
  const config: RequestApiConfig = { apiKey: (data.apiKey as string).trim() };
  if (data.model !== undefined) {
    if (typeof data.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(data.model.trim())) invalidApiConfig('模型名称须为1至128字符，只能包含字母、数字、点、下划线、冒号、斜杠和短横线。');
    config.model = (data.model as string).trim();
  }
  if (data.baseUrl !== undefined && (typeof data.baseUrl !== 'string' || !data.baseUrl.trim())) invalidApiConfig('API 服务地址不能为空。');
  if (provider === 'deepseek') {
    config.baseUrl = normalizeDeepSeekBaseUrl((data.baseUrl as string | undefined) || 'https://api.deepseek.com/v1', allowedBaseUrls);
    if (config.baseUrl !== 'https://api.deepseek.com/v1' && !config.model) invalidApiConfig('兼容服务需要明确填写其支持的模型名称。');
  } else if (data.baseUrl !== undefined) {
    const base = canonicalBaseUrl(data.baseUrl as string);
    if (!['https://generativelanguage.googleapis.com', 'https://generativelanguage.googleapis.com/v1beta'].includes(base)) invalidApiConfig('图像分析仅支持 Google Gemini 官方服务地址。');
    // The SDK remains fixed to its official service; no arbitrary host override.
    config.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }
  return config;
}

function invalidInput(message: string): never {
  throw new ApiError(400, 'INVALID_INPUT', message);
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_PROMPT_LENGTH) {
    invalidInput(`${label}不能为空，且长度不能超过 100,000 个字符。`);
  }
  return value;
}

function objectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidInput('请求内容必须为 JSON 对象。');
  return body as Record<string, unknown>;
}

export function validateGeminiInput(body: unknown): GeminiInput {
  const input = objectBody(body);
  const prompt = text(input.prompt, '提示词');
  const apiConfig = requestApiConfig(input.apiConfig, 'gemini');
  const hasImage = input.imageBase64 !== undefined && input.imageBase64 !== null;
  const hasMimeType = input.mimeType !== undefined && input.mimeType !== null;
  if (hasImage !== hasMimeType) invalidInput('图片和图片类型必须同时提供。');
  if (!hasImage) return { prompt, ...(apiConfig ? { apiConfig } : {}) };
  if (typeof input.mimeType !== 'string' || !IMAGE_TYPES.has(input.mimeType)) {
    invalidInput('请上传 JPEG、PNG、WebP、HEIC 或 HEIF 图片。');
  }
  const imageBase64 = input.imageBase64;
  if (typeof imageBase64 !== 'string' || !imageBase64.length
    || imageBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
    || imageBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)
    || Buffer.from(imageBase64, 'base64').length > MAX_IMAGE_BYTES) {
    invalidInput('图片数据无效，或图片超过 3 MB。');
  }
  return { prompt, imageBase64, mimeType: input.mimeType, ...(apiConfig ? { apiConfig } : {}) };
}

export function validateDeepSeekInput(body: unknown, allowedBaseUrls: string[] = []): DeepSeekInput {
  const input = objectBody(body);
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 16) {
    invalidInput('请提供 1 至 16 条对话消息。');
  }
  let totalLength = 0;
  const messages = input.messages.map((message) => {
    const entry = objectBody(message);
    if (!['system', 'user', 'assistant'].includes(entry.role as string)) invalidInput('消息角色无效。');
    const content = text(entry.content, '消息内容');
    totalLength += content.length;
    return { role: entry.role as DeepSeekInput['messages'][number]['role'], content };
  });
  if (totalLength > 200000) invalidInput('对话内容过长，请缩短后重试。');
  const responseFormat = input.responseFormat === undefined
    ? { type: 'text' }
    : objectBody(input.responseFormat);
  if (responseFormat.type !== 'text' && responseFormat.type !== 'json_object') {
    invalidInput('输出格式无效。');
  }
  const apiConfig = requestApiConfig(input.apiConfig, 'deepseek', allowedBaseUrls);
  return { messages, responseFormat: { type: responseFormat.type }, ...(apiConfig ? { apiConfig } : {}) };
}

export function requireContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new ApiError(502, 'AI_EMPTY_RESPONSE', 'AI 没有返回有效内容，请重试。');
  }
  return content;
}
/** Fail closed if an upstream echoes the exact credential used for this call. */
export function requireSafeContent(content: unknown, apiKey?: string): string {
  const value = requireContent(content);
  if (apiKey && value.includes(apiKey)) throw new ApiError(502, 'AI_UNSAFE_RESPONSE', 'AI 返回了不安全的凭据信息，响应已丢弃，请检查供应商配置后重试。');
  return value;
}
/** Usage is an explicit numeric schema, not an arbitrary upstream JSON object. */
export function sanitizeUsage(usage: unknown, provider: 'deepseek' | 'gemini'): Record<string, number> | undefined {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return undefined;
  const fields = provider === 'deepseek'
    ? ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens']
    : ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount', 'cachedContentTokenCount', 'thoughtsTokenCount', 'toolUsePromptTokenCount'];
  const source = usage as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result[field] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  if (parentSignal?.aborted) throw new ApiError(499, 'REQUEST_CANCELLED', '生成已停止。');
  let timer: ReturnType<typeof setTimeout>;
  let cancel: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      reject(new ApiError(499, 'REQUEST_CANCELLED', '生成已停止。'));
      controller.abort();
    };
    parentSignal?.addEventListener('abort', cancel, { once: true });
  });
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Reject first so a provider abort cannot replace the timeout message.
      reject(new ApiError(504, 'AI_TIMEOUT', 'AI 响应超时，请稍后重试。'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(controller.signal), timeout, cancelled]);
  } finally {
    clearTimeout(timer!);
    parentSignal?.removeEventListener('abort', cancel);
  }
}

export function createAiRouter(dependencies: AiDependencies) {
  const router = express.Router();
  const now = dependencies.now ?? Date.now;
  const requestsPerMinute = dependencies.requestsPerMinute ?? 20;
  const concurrentRequests = dependencies.concurrentRequests ?? 2;
  const active = new Map<string, number>();
  const windows = new Map<string, { startedAt: number; count: number }>();

  router.use(async (req, res, next) => {
    const authorization = req.get('authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match || match[1].length > 4096) {
      res.status(401).json({ error: '请先登录后再使用 AI 生成。', code: 'AUTH_REQUIRED' });
      return;
    }
    try {
      const user = await dependencies.verifyIdToken(match[1]);
      if (!user.uid) throw new Error('Invalid UID');
      if (user.email_verified !== true) {
        res.status(403).json({ error: '请先验证邮箱后再使用 AI 生成。', code: 'EMAIL_NOT_VERIFIED' });
        return;
      }
      res.locals.uid = user.uid;
      next();
    } catch {
      res.status(401).json({ error: '登录已过期，请重新登录后重试。', code: 'INVALID_TOKEN' });
    }
  });
  router.use(express.json({ limit: MAX_API_BODY_BYTES }));

  const providers = [
    { provider: 'gemini' as const, route: '/gemini', validate: validateGeminiInput, generate: dependencies.generateGemini },
    { provider: 'deepseek' as const, route: '/deepseek', validate: (body: unknown) => validateDeepSeekInput(body, dependencies.allowedBaseUrls), generate: dependencies.generateDeepSeek },
  ];
  for (const provider of providers) {
    router.post(provider.route, async (req, res, next) => {
      const uid: string = res.locals.uid;
      let acquired = false;
      const requestController = new AbortController();
      const disconnect = () => { if (!res.writableEnded) requestController.abort(); };
      req.once('aborted', disconnect);
      res.once('close', disconnect);
      try {
        const input = provider.validate(req.body);
        const timestamp = now();
        if (windows.size >= 1000) {
          for (const [key, value] of windows) {
            if (timestamp - value.startedAt >= 60000) windows.delete(key);
          }
        }
        const window = windows.get(uid);
        const current = window && timestamp - window.startedAt < 60000
          ? window : { startedAt: timestamp, count: 0 };
        if (current.count >= requestsPerMinute || (active.get(uid) ?? 0) >= concurrentRequests) {
          res.setHeader('Retry-After', '60');
          throw new ApiError(429, 'RATE_LIMITED', '生成请求较多，请等待当前任务完成后再重试。');
        }
        current.count += 1;
        windows.set(uid, current);
        active.set(uid, (active.get(uid) ?? 0) + 1);
        acquired = true;
        const result = await withTimeout(
          (signal) => provider.generate(input as GeminiInput & DeepSeekInput, signal),
          dependencies.timeoutMs ?? 90000,
          requestController.signal,
        );
        res.json({ content: requireSafeContent(result.content, input.apiConfig?.apiKey),
          usage: sanitizeUsage(result.usage, provider.provider), billingSource: input.apiConfig ? 'user' : 'platform' });
      } catch (error) {
        next(error);
      } finally {
        req.removeListener('aborted', disconnect);
        res.removeListener('close', disconnect);
        if (acquired) {
          const remaining = (active.get(uid) ?? 1) - 1;
          if (remaining > 0) active.set(uid, remaining);
          else active.delete(uid);
        }
      }
    });
  }

  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.destroyed || res.writableEnded) return;
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: '上传内容过大，请缩小图片后重试。', code: 'PAYLOAD_TOO_LARGE' });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: '请求内容不是有效的 JSON。', code: 'INVALID_JSON' });
      return;
    }
    console.error('AI generation failed: unexpected provider failure');
    res.status(502).json({ error: 'AI 服务暂时不可用，请稍后重试。', code: 'AI_PROVIDER_ERROR' });
  };
  router.use(handleError);
  return router;
}
