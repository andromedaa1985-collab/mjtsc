import { parseCharactersAndScenes } from './workflowValidation';

export interface AssetReferenceImage { data: string; mimeType: string }

/** Text-only setting changes must not depend on an image-model connection. */
export async function refineCharacterSceneSettings(
  prompt: string,
  reference: AssetReferenceImage | null,
  providers: {
    text: (prompt: string, json: boolean) => Promise<string>;
    vision: (prompt: string, data: string, mimeType: string) => Promise<string>;
  },
) {
  if (reference && (!reference.data.trim() || !['image/jpeg', 'image/png', 'image/webp'].includes(reference.mimeType))) {
    throw new Error('参考图片不完整，请重新选择或移除图片后进行文字微调。');
  }
  const response = reference
    ? await providers.vision(prompt, reference.data, reference.mimeType)
    : await providers.text(prompt, true);
  return parseCharactersAndScenes(response);
}
