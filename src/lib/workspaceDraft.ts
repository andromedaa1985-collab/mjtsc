export type Stage = 'script' | 'characters' | 'storyboard' | 'video' | 'single-prompt';
export interface WorkspaceDraft {
  version: 1;
  currentStage: Stage;
  showLanding: boolean;
  scriptData: string;
  analyzedScript?: string;
  charactersAndScenes: any;
  storyboards: any[] | null;
}

export const emptyDraft: WorkspaceDraft = {
  version: 1, currentStage: 'script', showLanding: true,
  scriptData: '', charactersAndScenes: null, storyboards: null,
};
const stages: Stage[] = ['script', 'characters', 'storyboard', 'video', 'single-prompt'];
const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isAsset = (value: unknown) => isRecord(value) &&
  typeof value.name === 'string' && typeof value.description === 'string' &&
  Array.isArray(value.keywords) && value.keywords.every((keyword: unknown) => typeof keyword === 'string') &&
  typeof value.imagenPrompt === 'string';
const isShot = (value: unknown) => isRecord(value) &&
  Number.isInteger(value.shotNumber) && value.shotNumber > 0 && typeof value.action === 'string' &&
  typeof value.camera === 'string' && typeof value.scene === 'string' &&
  Array.isArray(value.charactersInvolved) && value.charactersInvolved.every((name: unknown) => typeof name === 'string') &&
  ['dialogue', 'continuity', 'sourceExcerpt'].every(field => value[field] === undefined || typeof value[field] === 'string') &&
  (value.videoParams === undefined || (isRecord(value.videoParams) && Object.values(value.videoParams).every(entry => typeof entry === 'string'))) &&
  (value.videoPromptData === undefined || (isRecord(value.videoPromptData) && typeof value.videoPromptData.masterPrompt === 'string' &&
    (value.videoPromptData.postProductionNotes === undefined || (Array.isArray(value.videoPromptData.postProductionNotes) && value.videoPromptData.postProductionNotes.every((note: unknown) => typeof note === 'string'))) &&
    (value.videoPromptData.review === undefined || (isRecord(value.videoPromptData.review) && Number.isInteger(value.videoPromptData.review.score) &&
      typeof value.videoPromptData.review.critique === 'string' && typeof value.videoPromptData.review.improvedPrompt === 'string'))));

export function validateDraft(value: unknown): WorkspaceDraft {
  if (!isRecord(value) || value.version !== 1 || !stages.includes(value.currentStage) ||
      typeof value.showLanding !== 'boolean' || typeof value.scriptData !== 'string') {
    throw new Error('草稿格式不正确。');
  }
  const assets = value.charactersAndScenes;
  if (assets !== null && (!isRecord(assets) || !Array.isArray(assets.characters) ||
      !Array.isArray(assets.scenes) || !assets.characters.every(isAsset) || !assets.scenes.every(isAsset))) {
    throw new Error('人物与场景草稿格式不正确。');
  }
  if (value.storyboards !== null && (!Array.isArray(value.storyboards) || !value.storyboards.every(isShot) ||
      new Set(value.storyboards.map((shot: any) => shot.shotNumber)).size !== value.storyboards.length)) {
    throw new Error('分镜草稿格式不正确。');
  }
  return { version: 1, currentStage: value.currentStage, showLanding: value.showLanding,
    scriptData: value.scriptData, charactersAndScenes: assets, storyboards: value.storyboards,
    ...(typeof value.analyzedScript === 'string' ? { analyzedScript: value.analyzedScript } : {}) };
}

export function draftKey(uid: string) { return `cp_workspace_v1_${uid}`; }

export function loadDraft(storage: Pick<Storage, 'getItem'>, uid: string) {
  try {
    const saved = storage.getItem(draftKey(uid));
    return { draft: saved ? validateDraft(JSON.parse(saved)) : { ...emptyDraft }, error: '' };
  } catch {
    return { draft: { ...emptyDraft }, error: '浏览器草稿无法读取。原始缓存已保留，请先导出备份，再重新保存。' };
  }
}

// Old drafts are only imported through an explicit user action: they have no account owner.
export function loadLegacyDraft(storage: Pick<Storage, 'getItem'>): WorkspaceDraft {
  return validateDraft({
    version: 1, showLanding: false,
    currentStage: storage.getItem('cp_currentStage') || 'script',
    scriptData: storage.getItem('cp_scriptData') || '',
    charactersAndScenes: JSON.parse(storage.getItem('cp_charactersAndScenes') || 'null'),
    storyboards: JSON.parse(storage.getItem('cp_storyboards') || 'null'),
  });
}

export function saveDraft(storage: Pick<Storage, 'setItem'>, uid: string, draft: WorkspaceDraft) {
  try {
    storage.setItem(draftKey(uid), JSON.stringify(draft));
    return '';
  } catch {
    return '草稿未能保存到浏览器，可能空间已满或存储被禁用。请立即导出备份。';
  }
}
