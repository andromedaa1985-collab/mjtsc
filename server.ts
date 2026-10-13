import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createAiRouter, ApiError, requireContent } from './server/ai-api.ts';

const firebaseConfig = JSON.parse(
  readFileSync(new URL('./firebase-applet-config.json', import.meta.url), 'utf8'),
);
// Signature verification uses public certificates and an explicit project ID.
// This server does not perform Firestore Admin writes or require a service-account key.
const adminApp = getApps().find((app) => app.name === 'comic-platform-server')
  ?? initializeApp({ projectId: firebaseConfig.projectId }, 'comic-platform-server');

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const configuredTimeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || 90000);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 1000), 300000)
    : 90000;

  app.use('/api', createAiRouter({
    verifyIdToken: (token) => getAuth(adminApp).verifyIdToken(token),
    timeoutMs,
    async generateGemini(input, signal) {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey || apiKey.startsWith('MY_')) {
        throw new ApiError(503, 'AI_NOT_CONFIGURED', '图像分析服务尚未配置，请联系管理员。');
      }
      const ai = new GoogleGenAI({ apiKey });
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
        { text: input.prompt },
      ];
      if (input.imageBase64 && input.mimeType) {
        parts.push({ inlineData: { data: input.imageBase64, mimeType: input.mimeType } });
      }
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
        config: { abortSignal: signal, httpOptions: { timeout: timeoutMs } },
      });
      return { content: requireContent(response.text), usage: response.usageMetadata };
    },
    async generateDeepSeek(input, signal) {
      const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (!apiKey || apiKey.startsWith('MY_')) {
        throw new ApiError(503, 'AI_NOT_CONFIGURED', '剧本生成服务尚未配置，请联系管理员。');
      }
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: input.messages,
          response_format: input.responseFormat,
        }),
        signal,
      });
      if (!response.ok) {
        // Provider bodies can contain internal configuration; return only safe messages.
        await response.body?.cancel();
        throw new ApiError(
          response.status === 429 ? 503 : 502,
          'AI_PROVIDER_ERROR',
          response.status === 429 ? 'AI 服务当前繁忙，请稍后重试。' : 'AI 服务暂时不可用，请稍后重试。',
        );
      }
      const data = await response.json();
      return { content: requireContent(data?.choices?.[0]?.message?.content), usage: data?.usage };
    },
  }));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在。', code: 'NOT_FOUND' });
  });

  if (process.env.NODE_ENV !== 'production' && !process.argv.includes('--production')) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
