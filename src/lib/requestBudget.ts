// Keep the final UTF-8 JSON below Vercel's function request-body limit.
// Base64 image size, Unicode prompts and user API configuration all count.
export const MAX_AI_REQUEST_BYTES = 4_300_000;
export const MAX_IMAGE_FILE_BYTES = 3 * 1024 * 1024;

export function serializeAiRequest(body: unknown): string {
  const serialized = JSON.stringify(body);
  if (serialized === undefined) throw new Error('AI 请求格式不正确。');
  if (new TextEncoder().encode(serialized).byteLength > MAX_AI_REQUEST_BYTES) {
    throw new Error('图片与提示词合计超过当前部署的请求上限。请减小图片或精简提示词后重试，当前内容已保留。');
  }
  return serialized;
}
