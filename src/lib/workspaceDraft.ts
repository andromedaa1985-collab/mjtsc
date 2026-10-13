import { defaultDirectorSettings, validateDirectorProject, validateDirectorCheckpoint, validateDirectorSettings, type DirectorProject, type DirectorCheckpoint, type DirectorSettings } from './autoDirector';

export type Stage = 'auto-director' | 'script' | 'characters' | 'storyboard' | 'video' | 'single-prompt';
export interface WorkspaceDraft {
  version: 1;
  currentStage: Stage;
  showLanding: boolean;
  scriptData: string;
  analyzedScript?: string;
  charactersAndScenes: any;
  storyboards: any[] | null;
  directorSettings: DirectorSettings;
  directorProject: DirectorProject | null;
  directorCheckpoint: DirectorCheckpoint | null;
}

export const emptyDraft: WorkspaceDraft = {
  version: 1, currentStage: 'auto-director', showLanding: true,
  scriptData: '', charactersAndScenes: null, storyboards: null,
  directorSettings: { ...defaultDirectorSettings }, directorProject: null, directorCheckpoint: null,
};
const stages: Stage[] = ['auto-director', 'script', 'characters', 'storyboard', 'video', 'single-prompt'];
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
    directorSettings: value.directorSettings === undefined ? { ...defaultDirectorSettings } : validateDirectorSettings(value.directorSettings),
    directorProject: value.directorProject == null ? null : validateDirectorProject(value.directorProject),
    directorCheckpoint: value.directorCheckpoint == null ? null : validateDirectorCheckpoint(value.directorCheckpoint),
    ...(typeof value.analyzedScript === 'string' ? { analyzedScript: value.analyzedScript } : {}) };
}

export function draftKey(uid: string) { return `cp_workspace_v1_${uid}`; }

export function loadDraft(storage: Pick<Storage, 'getItem'>, uid: string) {
  let raw: string | null = null;
  try {
    raw = storage.getItem(draftKey(uid));
    if (!raw) return { draft: { ...emptyDraft }, error: '', raw, recoveredFields: [] as string[] };
    const value = JSON.parse(raw);
    try { return { draft: validateDraft(value), error: '', raw, recoveredFields: [] as string[] }; }
    catch {
      // Optional progress or result damage must not discard a readable authority script.
      if (!isRecord(value) || value.version !== 1 || typeof value.scriptData !== 'string') throw new Error('草稿主结构无效');
      const recoveredFields: string[] = [];
      const recover = <K extends keyof WorkspaceDraft>(key: K, label: string, fallback: WorkspaceDraft[K]): WorkspaceDraft[K] => {
        if (value[key] === undefined) return fallback;
        try { return validateDraft({ ...emptyDraft, [key]: value[key] })[key]; }
        catch { recoveredFields.push(label); return fallback; }
      };
      const draft: WorkspaceDraft = {
        ...emptyDraft, scriptData: value.scriptData,
        currentStage: recover('currentStage', '当前步骤', 'auto-director'),
        showLanding: recover('showLanding', '首页状态', false),
        charactersAndScenes: recover('charactersAndScenes', '人物与场景', null),
        storyboards: recover('storyboards', '逐步分镜', null),
        directorSettings: recover('directorSettings', '创作设置', { ...defaultDirectorSettings }),
        directorProject: recover('directorProject', '自动创作成果', null),
        directorCheckpoint: recover('directorCheckpoint', '中断进度', null),
        ...(typeof value.analyzedScript === 'string' ? { analyzedScript: value.analyzedScript } : {}),
      };
      // A damaged settings block can be recovered from valid progress tied to
      // this exact script; do not replace legitimate settings or changed input.
      let settingsRecovery = '';
      if (recoveredFields.includes('创作设置')) {
        const authority = draft.directorCheckpoint?.sourceScript === draft.scriptData ? draft.directorCheckpoint :
          draft.directorProject?.sourceScript === draft.scriptData ? draft.directorProject : null;
        if (authority) {
          draft.directorSettings = { ...authority.settings };
          settingsRecovery = draft.directorCheckpoint === authority ? '创作设置已由有效中断进度恢复。' : '创作设置已由完整项目恢复。';
        }
      }
      return { draft, raw, recoveredFields,
        error: `已恢复可读取的剧本和成果；${recoveredFields.join('、') || '部分数据'}无法读取。${settingsRecovery}原始缓存已保留，请备份后启用保存。` };
    }
  } catch {
    return { draft: { ...emptyDraft }, raw, recoveredFields: [] as string[], error: '浏览器草稿无法读取。原始缓存已保留，请先导出备份，再重新保存。' };
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

export type DraftSaveResult = { status: 'saved'; raw: string; error: '' } |
  { status: 'conflict' | 'unavailable'; error: string };

/** Recheck storage before delayed saves or pagehide so stale windows cannot blindly overwrite it. */
export function saveDraftWithBaseline(storage: Pick<Storage, 'getItem' | 'setItem'>, uid: string, draft: WorkspaceDraft, baseline: string | null): DraftSaveResult {
  try {
    const raw = JSON.stringify(draft);
    const current = storage.getItem(draftKey(uid));
    if (current !== baseline && current !== raw) return {
      status: 'conflict', error: '草稿已在另一标签页更新。本窗口的自动保存已暂停，请先导出或选择要保留的版本。',
    };
    if (current !== raw) storage.setItem(draftKey(uid), raw);
    return { status: 'saved', raw, error: '' };
  } catch {
    return { status: 'unavailable', error: '草稿未能保存到浏览器，可能空间已满或存储被禁用。请立即导出备份。' };
  }
}
