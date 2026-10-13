import { ApiError, requireContent, type DeepSeekInput } from './ai-api.ts';

// Verified against the provider's official API docs on 2026-10-13.
// Model selection stays on the server; no provider key or setting is sent to clients.
export function deepSeekRequest(input: DeepSeekInput, environment: Record<string, string | undefined>) {
  const model = environment.DEEPSEEK_MODEL?.trim() || 'deepseek-flash';
  const configured = Number(environment.DEEPSEEK_MAX_OUTPUT_TOKENS || 16000);
  if (!Number.isInteger(configured) || configured < 1024 || configured > 32768) {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', '文本服务的输出上限配置无效，请联系管理员。');
  }
  return {
    model, messages: input.messages, response_format: input.responseFormat,
    max_tokens: configured,
    ...(['deepseek-flash', 'deepseek-v4-pro'].includes(model) ? { thinking: { type: 'disabled' } } : {}),
  };
}

export function deepSeekResult(value: unknown) {
  const data = value as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }>; usage?: unknown } | null;
  if (data?.choices?.[0]?.finish_reason === 'length') {
    throw new ApiError(502, 'AI_OUTPUT_TRUNCATED', 'AI 输出被截断，已完成步骤保留。请缩短本次剧本，或调整服务输出上限后继续。');
  }
  return { content: requireContent(data?.choices?.[0]?.message?.content), usage: data?.usage };
}
