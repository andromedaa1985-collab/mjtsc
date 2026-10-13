import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, emptyDraft, loadDraft, loadLegacyDraft, saveDraft, validateDraft } from './workspaceDraft.ts';

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
