import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, emptyDraft, loadDraft, loadLegacyDraft, saveDraft, saveDraftWithBaseline, validateDraft } from './workspaceDraft.ts';
import { chunkDirectorScript } from './autoDirector.ts';

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
test('drafts are isolated between account owners', () => {
  const storage = memory();
  saveDraft(storage, 'writer-a', { ...emptyDraft, scriptData: 'A的剧本' });
  assert.equal(loadDraft(storage, 'writer-a').draft.scriptData, 'A的剧本');
  assert.equal(loadDraft(storage, 'writer-b').draft.scriptData, '');
});
test('malformed cache is retained and a recoverable empty state is returned', () => {
  const storage = memory(); storage.setItem(draftKey('writer'), '{broken');
  const result = loadDraft(storage, 'writer');
  assert.ok(result.error); assert.equal(result.draft.scriptData, '');
  assert.equal(storage.getItem(draftKey('writer')), '{broken');
});
test('storage denial does not crash reads or writes', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.ok(loadDraft(storage, 'writer').error);
  assert.ok(saveDraft(storage, 'writer', emptyDraft));
});
test('saved AI structures must be safe to render', () => {
  assert.throws(() => validateDraft({ ...emptyDraft, charactersAndScenes: { characters: 'bad', scenes: [] } }));
  assert.throws(() => validateDraft({ ...emptyDraft, storyboards: [{ shotNumber: 1, action: {} }] }));
  assert.throws(() => validateDraft({ ...emptyDraft, currentStage: 'unknown' }));
});
test('legacy drafts require explicit import and malformed legacy data is rejected', () => {
  const storage = memory(); storage.setItem('cp_scriptData', '旧版剧本');
  assert.equal(loadDraft(storage, 'writer').draft.scriptData, '');
  assert.equal(loadLegacyDraft(storage).scriptData, '旧版剧本');
  storage.setItem('cp_storyboards', '{}'); assert.throws(() => loadLegacyDraft(storage));
});
test('roundtrip retains edited prompts and shot parameters', () => {
  const storage = memory();
  const draft = { ...emptyDraft, storyboards: [{ shotNumber: 1, action: '停住', camera: '固定近景', scene: '门口', charactersInvolved: ['她'], dialogue: '别走。', videoParams: { duration: '5秒' }, videoPromptData: { masterPrompt: '0-5秒：她停住。' } }] };
  assert.equal(saveDraft(storage, 'writer', draft), '');
  assert.deepEqual(loadDraft(storage, 'writer').draft, draft);
});
test('duplicate shot identities cannot hide another saved shot', () => {
  const shot = { shotNumber: 1, action: '停住', camera: '固定近景', scene: '门口', charactersInvolved: [] };
  assert.throws(() => validateDraft({ ...emptyDraft, storyboards: [shot, { ...shot, action: '开门' }] }));
});

test('new drafts open the automatic studio while old drafts retain their workflow', () => {
  assert.equal(emptyDraft.currentStage, 'auto-director');
  const oldDraft = { version: 1, currentStage: 'script', showLanding: false, scriptData: '旧剧本', charactersAndScenes: null, storyboards: null };
  const restored = validateDraft(oldDraft);
  assert.equal(restored.currentStage, 'script');
  assert.equal(restored.directorProject, null);
  assert.equal(restored.directorCheckpoint, null);
  assert.equal(restored.directorSettings.platform, emptyDraft.directorSettings.platform);
});

test('automatic studio settings are persisted and invalid checkpoints are rejected', () => {
  const storage = memory();
  const draft = { ...emptyDraft, directorSettings: { ...emptyDraft.directorSettings, platform: 'jimeng' as const, rhythm: 'dialogue' as const } };
  assert.equal(saveDraft(storage, 'writer', draft), '');
  assert.deepEqual(loadDraft(storage, 'writer').draft.directorSettings, draft.directorSettings);
  assert.throws(() => validateDraft({ ...draft, directorCheckpoint: { version: 1, sourceScript: '错误结构' } }));
  assert.throws(() => validateDraft({ ...draft, directorProject: { version: 1, shots: '错误结构' } }));
  assert.throws(() => validateDraft({ ...draft, directorSettings: { ...draft.directorSettings, platform: 'unsupported' } }));
});

test('a broken optional checkpoint does not erase a valid script or edited storyboard', () => {
  const storage = memory();
  const shot = { shotNumber: 1, action: '她停住。', camera: '近景', scene: '门口', charactersInvolved: ['她'] };
  const raw = JSON.stringify({ ...emptyDraft, scriptData: '有效剧本', storyboards: [shot], directorCheckpoint: { version: 0 } });
  storage.setItem(draftKey('writer'), raw);
  const recovered = loadDraft(storage, 'writer');
  assert.equal(recovered.draft.scriptData, '有效剧本');
  assert.deepEqual(recovered.draft.storyboards, [shot]);
  assert.equal(recovered.draft.directorCheckpoint, null);
  assert.deepEqual(recovered.recoveredFields, ['中断进度']);
  assert.equal(recovered.raw, raw);
  assert.equal(storage.getItem(draftKey('writer')), raw);
  assert.match(recovered.error, /中断进度/);
});

test('optional damage is isolated and an unsupported root version remains recoverable raw data', () => {
  const storage = memory();
  storage.setItem(draftKey('writer'), JSON.stringify({ ...emptyDraft, scriptData: '原文保留', currentStage: 'future', directorSettings: { platform: 'bad' }, charactersAndScenes: { characters: 'bad' } }));
  const result = loadDraft(storage, 'writer');
  assert.equal(result.draft.scriptData, '原文保留');
  assert.equal(result.draft.currentStage, 'auto-director');
  assert.deepEqual(result.recoveredFields, ['当前步骤', '人物与场景', '创作设置']);
  storage.setItem(draftKey('writer'), '{"version":99,"scriptData":"未来版本"}');
  assert.equal(loadDraft(storage, 'writer').draft.scriptData, '');
  assert.ok(loadDraft(storage, 'writer').error);
});

test('stale tabs and pagehide flushes cannot replace a newer draft', () => {
  const storage = memory();
  saveDraft(storage, 'writer', { ...emptyDraft, scriptData: '旧稿' });
  const first = loadDraft(storage, 'writer');
  const second = loadDraft(storage, 'writer');
  const newest = { ...first.draft, scriptData: '新稿' };
  const saved = saveDraftWithBaseline(storage, 'writer', newest, first.raw);
  assert.equal(saved.status, 'saved');
  const blocked = saveDraftWithBaseline(storage, 'writer', { ...second.draft, currentStage: 'script' }, second.raw);
  assert.equal(blocked.status, 'conflict');
  assert.equal(loadDraft(storage, 'writer').draft.scriptData, '新稿');
  assert.equal(saveDraftWithBaseline(storage, 'writer', second.draft, second.raw).status, 'conflict');
  // Explicitly adopting the current baseline can resolve the conflict after backup.
  const adopted = loadDraft(storage, 'writer');
  assert.equal(saveDraftWithBaseline(storage, 'writer', { ...adopted.draft, scriptData: '合并稿' }, adopted.raw).status, 'saved');
});

test('identical saves are harmless and guarded writes handle read/write denial', () => {
  const storage = memory();
  const first = saveDraftWithBaseline(storage, 'writer', emptyDraft, null);
  assert.equal(first.status, 'saved');
  assert.equal(saveDraftWithBaseline(storage, 'writer', emptyDraft, null).status, 'saved');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(saveDraftWithBaseline(blocked, 'writer', emptyDraft, null).status, 'unavailable');
});

test('damaged settings recover from valid same-source progress while legitimate settings and changed input remain intact', () => {
  const storage = memory();
  const sourceScript = '林澈推开车站的门。';
  const settings = { ...emptyDraft.directorSettings, aspectRatio: '9:16' as const, lighting: '窗边冷光', sound: '雨声，无配乐' };
  const checkpoint = { version: 1, sourceScript, settings, chunks: chunkDirectorScript(sourceScript), analyses: [], shots: [], completedPromptShotIds: [] };
  const input = { ...emptyDraft, scriptData: sourceScript, directorSettings: { platform: 'broken' }, directorCheckpoint: checkpoint };
  const raw = JSON.stringify(input); storage.setItem(draftKey('writer'), raw);
  const recovered = loadDraft(storage, 'writer');
  assert.deepEqual(recovered.draft.directorSettings, settings);
  assert.deepEqual(recovered.draft.directorCheckpoint, checkpoint);
  assert.match(recovered.error, /创作设置已由有效中断进度恢复/);
  assert.equal(storage.getItem(draftKey('writer')), raw);
  storage.setItem(draftKey('writer'), JSON.stringify({ ...input, scriptData: '已经修改的剧本' }));
  assert.deepEqual(loadDraft(storage, 'writer').draft.directorSettings, emptyDraft.directorSettings);
  storage.setItem(draftKey('writer'), JSON.stringify({ ...input, directorSettings: emptyDraft.directorSettings, currentStage: 'broken' }));
  assert.deepEqual(loadDraft(storage, 'writer').draft.directorSettings, emptyDraft.directorSettings);
});
