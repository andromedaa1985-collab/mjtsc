import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { createAiRouter, ApiError, requireSafeContent, sanitizeUsage, type AiDependencies } from './ai-api.ts';
import { deepSeekRequest, deepSeekResult } from './deepseek-provider.ts';

function configuredTimeout(): number {
  const value = Number(process.env.AI_REQUEST_TIMEOUT_MS || 90000);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 300000) : 90000;
}

/** API-only app: importing this module never listens, starts Vite, or generates. */
export function createApp(overrides: Partial<AiDependencies> = {}): express.Express {
  const timeoutMs = overrides.timeoutMs ?? configuredTimeout();
  const dependencies: AiDependencies = {
    timeoutMs,
    allowedBaseUrls: (process.env.AI_ALLOWED_BASE_URLS || '').split(/[,\n]/).map(value => value.trim()).filter(Boolean),
    async verifyIdToken(token) {
      // Public certificates verify the explicit project; no service-account
      // credential or Firestore Admin write is needed. Initialize lazily.
      const adminApp = getApps().find(app => app.name === 'comic-platform-server')
        ?? initializeApp({ projectId: firebaseConfig.projectId }, 'comic-platform-server');
      return getAuth(adminApp).verifyIdToken(token);
    },
    async generateGemini(input, signal) {
      const apiKey = input.apiConfig?.apiKey || process.env.GEMINI_API_KEY?.trim();
      if (!apiKey || (!input.apiConfig && apiKey.startsWith('MY_'))) throw new ApiError(503, 'AI_NOT_CONFIGURED', '图像分析服务尚未配置，请填写本次 API 配置或联系管理员。');
      const ai = new GoogleGenAI({ apiKey });
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [{ text: input.prompt }];
      if (input.imageBase64 && input.mimeType) parts.push({ inlineData: { data: input.imageBase64, mimeType: input.mimeType } });
      const response = await ai.models.generateContent({
        model: input.apiConfig?.model || process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
        config: { abortSignal: signal, httpOptions: { timeout: timeoutMs } },
      });
      return { content: requireSafeContent(response.text, apiKey), usage: sanitizeUsage(response.usageMetadata, 'gemini') };
    },
    async generateDeepSeek(input, signal) {
      const apiKey = input.apiConfig?.apiKey || process.env.DEEPSEEK_API_KEY?.trim();
      if (!apiKey || (!input.apiConfig && apiKey.startsWith('MY_'))) throw new ApiError(503, 'AI_NOT_CONFIGURED', '剧本生成服务尚未配置，请填写本次 API 配置或联系管理员。');
      const baseUrl = input.apiConfig?.baseUrl || 'https://api.deepseek.com/v1';
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(deepSeekRequest(input, process.env)), signal,
      });
      if (!response.ok) {
        // Never return/log provider bodies, configuration, or the request key.
        await response.body?.cancel();
        throw new ApiError(response.status === 429 ? 503 : 502, 'AI_PROVIDER_ERROR',
          response.status === 429 ? 'AI 服务当前繁忙，请稍后重试。' : 'AI 服务暂时不可用，请检查模型与账户配置后重试。');
      }
      return deepSeekResult(await response.json(), apiKey);
    },
    ...overrides,
  };
  const app = express();
  app.disable('x-powered-by');
  const aiRouter = createAiRouter(dependencies);
  app.use('/api', (req, res, next) => {
    // Do not let authentication middleware claim unknown API paths.
    const route = req.path.replace(/\/$/, '').toLowerCase();
    if (route === '/deepseek' || route === '/gemini') aiRouter(req, res, next);
    else next();
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。', code: 'NOT_FOUND' }));
  return app;
}
