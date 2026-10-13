/** Validate untrusted model output before replacing the user's working data. */
const invalidResponse = 'AI 返回的数据格式不完整，当前内容已保留。请重试。';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(invalidResponse);
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(invalidResponse);
  return value.trim();
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(invalidResponse);
  return value.map(item => item.trim()).filter(Boolean);
}

export function parseAIJson(response: string): Record<string, unknown> {
  if (!response?.trim()) throw new Error('AI 未返回内容，当前内容已保留。请重试。');
  const cleaned = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return object(JSON.parse(cleaned));
  } catch {
    // Some providers put a short explanation around a complete JSON object.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return object(JSON.parse(cleaned.slice(start, end + 1))); } catch { /* reject below */ }
    }
    throw new Error(invalidResponse);
  }
}

export function parseCharactersAndScenes(response: string) {
  const data = parseAIJson(response);
  const parseElements = (value: unknown) => {
    if (!Array.isArray(value)) throw new Error(invalidResponse);
    return value.map(item => {
      const entry = object(item);
      return { name: text(entry.name), description: text(entry.description), keywords: strings(entry.keywords), imagenPrompt: text(entry.imagenPrompt) };
    });
  };
  const characters = parseElements(data.characters);
  const scenes = parseElements(data.scenes);
  if (!characters.length && !scenes.length) throw new Error('未提取到人物或场景，请补充剧本内容后重试。');
  return { characters, scenes };
}

export function parseStoryboards(response: string, startNumber = 1) {
  const data = parseAIJson(response);
  if (!Array.isArray(data.storyboards) || !data.storyboards.length) throw new Error(invalidResponse);
  return data.storyboards.map((item, index) => {
    const shot = object(item);
    return { shotNumber: startNumber + index, action: text(shot.action), camera: text(shot.camera), charactersInvolved: strings(shot.charactersInvolved), scene: text(shot.scene), dialogue: typeof shot.dialogue === 'string' ? shot.dialogue : '', continuity: typeof shot.continuity === 'string' ? shot.continuity : '', sourceExcerpt: typeof shot.sourceExcerpt === 'string' ? shot.sourceExcerpt : '' };
  });
}

export function parseVideoPrompt(response: string) {
  const data = parseAIJson(response);
  return { masterPrompt: text(data.masterPrompt), postProductionNotes: data.postProductionNotes === undefined ? [] : strings(data.postProductionNotes) };
}

export function parsePromptReview(response: string) {
  const data = parseAIJson(response);
  if (!Number.isInteger(data.score) || Number(data.score) < 0 || Number(data.score) > 100) throw new Error(invalidResponse);
  return { score: Number(data.score), critique: text(data.critique), improvedPrompt: text(data.improvedPrompt) };
}

export function parseShotSuggestions(response: string) {
  const data = parseAIJson(response);
  const duration = text(data.duration);
  const lighting = text(data.lighting);
  const vfx = text(data.vfx);
  if (!['5秒', '10秒', '15秒'].includes(duration) ||
      !['自然光', '自然光/电影感', '逆光剪影', '丁达尔体积光', '赛博霓虹', '暖色调', '冷色调'].includes(lighting) ||
      !['无特殊特效', '粒子消散', '烟雾弥漫', '暴雨', '飘雪', '火花飞溅'].includes(vfx)) throw new Error(invalidResponse);
  return { duration, lighting: lighting === '自然光' ? '自然光/电影感' : lighting, vfx, sound: text(data.sound) };
}

export function errorMessage(error: unknown, fallback = '操作失败，当前内容已保留。请重试。') {
  return error instanceof Error ? error.message : fallback;
}

export function validateImageFile(file: Pick<File, 'type' | 'size'>) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('请选择大小不超过 5 MB 的有效图片。');
}

export function readImageFile(file: File): Promise<string> {
  validateImageFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败，请重新选择。'));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
}
