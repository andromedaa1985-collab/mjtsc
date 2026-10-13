import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDirectorSettings, validateDirectorProject, type DirectorProject } from './autoDirector.ts';
import { commitDirectorShotEdit, createDirectorShotEdit, directorShotEditHasChanges, DIRECTOR_CRAFT_FIELDS, readDirectorShotEdit, rebaseDirectorShotEdit } from './directorEditing.ts';

function fixture(): DirectorProject {
  const pieces = ['室内。开门。\n', '抬头。\n', '转身。\n', '坐下。'];
  let start = 0;
  return validateDirectorProject({ version: 1, sourceScript: pieces.join(''), settings: defaultDirectorSettings,
    understanding: { summary: '依次完成四个动作', storyArc: '开门、抬头、转身、坐下', characters: [],
      scenes: [{ name: '室内', description: '原文中的室内', sourceExcerpt: '室内' }], continuityRules: [], uncertainties: [] },
    shots: pieces.map((sourceExcerpt, index) => {
      const sourceStart = start; start += sourceExcerpt.length;
      return { id: 'shot-' + (index + 1), shotNumber: index + 1, scene: '室内', charactersInvolved: [], sourceExcerpt, sourceStart,
        sourceEnd: start, sourceChunkId: 'chunk-1', action: sourceExcerpt.trim(), camera: '固定中景', dialogue: '', durationSeconds: 10,
        continuity: '在室内承接前镜并完成动作', masterPrompt: '0—10秒：依照原文动作推进。', referencePlan: [],
        postProductionNotes: ['检查接缝'], qaWarnings: [] };
    }) });
}

test('manual shot commit invalidates current and adjacent prompts and explicitly clears stale generation checkpoint', () => {
  const project = fixture(); const before = structuredClone(project);
  const edit = createDirectorShotEdit(project.shots[1]); edit.values.action = '抬头后观察门口';
  const result = commitDirectorShotEdit(project, 'shot-2', edit);
  assert.equal(result.clearCheckpoint, true);
  assert.deepEqual(result.invalidatedShotIds, ['shot-1', 'shot-2', 'shot-3']);
  for (const shot of result.project.shots.slice(0, 3)) { assert.equal(shot.masterPrompt, ''); assert.deepEqual(shot.postProductionNotes, []); }
  assert.deepEqual(result.project.shots[3], project.shots[3]);
  assert.deepEqual(project, before);
});

test('saving one shot never hides an unsaved adjacent shot edit', () => {
  const project = fixture();
  const first = createDirectorShotEdit(project.shots[1]); first.values.camera = '从门口平稳推进';
  const neighbor = createDirectorShotEdit(project.shots[2]); neighbor.values.action = '缓慢转身，停在门侧';
  const result = commitDirectorShotEdit(project, 'shot-2', first);
  const remaining = readDirectorShotEdit(result.project.shots[2], neighbor);
  assert.equal(remaining.values.action, '缓慢转身，停在门侧');
  assert.equal(remaining.dirty, true); assert.equal(remaining.conflict, false);
  const second = commitDirectorShotEdit(result.project, 'shot-3', neighbor);
  assert.equal(second.project.shots[1].camera, '从门口平稳推进');
  assert.equal(second.project.shots[2].action, '缓慢转身，停在门侧');
  assert.equal(second.project.shots[1].masterPrompt, '');
});

test('same-origin external revision retains local input and requires an explicit conflict decision', () => {
  const project = fixture(); const edit = createDirectorShotEdit(project.shots[1]); edit.values.action = '本地正在编辑的动作';
  const replaced = structuredClone(project); replaced.shots[1].camera = '新保存的俯视镜头';
  const state = readDirectorShotEdit(replaced.shots[1], edit);
  assert.equal(state.values.action, '本地正在编辑的动作'); assert.equal(state.conflict, true);
  assert.throws(() => commitDirectorShotEdit(replaced, 'shot-2', edit), /已保存内容发生变化/);
  const rebased = rebaseDirectorShotEdit(replaced.shots[1], edit);
  assert.equal(readDirectorShotEdit(replaced.shots[1], rebased).conflict, false);
  assert.equal(rebased.values.camera, '新保存的俯视镜头');
  assert.equal(commitDirectorShotEdit(replaced, 'shot-2', rebased).project.shots[1].action, '本地正在编辑的动作');
});

test('an edit for changed source stays visible but cannot be committed or rebased to another excerpt', () => {
  const project = fixture(); const edit = createDirectorShotEdit(project.shots[1]); edit.values.action = '保留本地动作';
  const other = { ...project.shots[1], sourceExcerpt: '另一份原文' };
  assert.equal(readDirectorShotEdit(other, edit).values.action, '保留本地动作');
  assert.equal(readDirectorShotEdit(other, edit).originChanged, true);
  assert.throws(() => rebaseDirectorShotEdit(other, edit), /原文已经变化/);
  assert.throws(() => commitDirectorShotEdit({ ...project, shots: project.shots.map(shot => shot.id === other.id ? other : shot) }, other.id, edit), /原文已经变化/);
});

test('invalid temporary input does not mutate a saved project or invalidate prompts', () => {
  const project = fixture(); const before = structuredClone(project); const edit = createDirectorShotEdit(project.shots[1]);
  edit.values.action = ''; assert.throws(() => commitDirectorShotEdit(project, 'shot-2', edit), /非空文字/);
  assert.deepEqual(project, before);
  edit.values.action = project.shots[1].action; edit.values.durationSeconds = '';
  assert.throws(() => commitDirectorShotEdit(project, 'shot-2', edit), /4到30/); assert.deepEqual(project, before);
});

test('duration-only commit invalidates the selected prompt and preserves neighboring shot content', () => {
  const project = fixture(); const edit = createDirectorShotEdit(project.shots[1]); edit.values.durationSeconds = '12';
  const result = commitDirectorShotEdit(project, 'shot-2', edit);
  assert.equal(result.clearCheckpoint, true);
  assert.deepEqual(result.invalidatedShotIds, ['shot-2']); assert.equal(result.project.shots[1].durationSeconds, 12);
  assert.deepEqual(result.project.shots[0], project.shots[0]); assert.deepEqual(result.project.shots[2], project.shots[2]);
});

test('whitespace-only edit preserves ready prompts and does not clear valid generation checkpoint', () => {
  const project = fixture(); const edit = createDirectorShotEdit(project.shots[1]); edit.values.camera = ' ' + edit.values.camera + ' ';
  const result = commitDirectorShotEdit(project, 'shot-2', edit);
  assert.equal(result.clearCheckpoint, false);
  assert.deepEqual(result.invalidatedShotIds, []); assert.deepEqual(result.project, project);
});

test('unchanged edit preserves valid generation progress', () => {
  const project = fixture();
  const result = commitDirectorShotEdit(project, 'shot-2', createDirectorShotEdit(project.shots[1]));
  assert.equal(result.clearCheckpoint, false); assert.deepEqual(result.invalidatedShotIds, []); assert.deepEqual(result.project, project);
});

test('each craft field persists and invalidates selected and neighboring prompts without changing dialogue', () => {
  for (const key of DIRECTOR_CRAFT_FIELDS) {
    const project = fixture(); const edit = createDirectorShotEdit(project.shots[1]); edit.values[key] = '设计建议：围绕原文观察人物反应';
    assert.equal(directorShotEditHasChanges(edit), true, key);
    assert.equal(readDirectorShotEdit(project.shots[1], edit).dirty, true, key);
    const result = commitDirectorShotEdit(project, 'shot-2', edit);
    assert.equal(result.project.shots[1].craft?.[key], edit.values[key], key);
    assert.equal(result.clearCheckpoint, true, key);
    assert.deepEqual(result.invalidatedShotIds, ['shot-1', 'shot-2', 'shot-3'], key);
    assert.equal(result.project.shots[1].dialogue, project.shots[1].dialogue, key);
    assert.deepEqual(result.project.shots[3], project.shots[3], key);
  }
});

test('legacy shots do not gain an empty craft object after unchanged or action-only edits', () => {
  const project = fixture(); const edit = createDirectorShotEdit(project.shots[1]);
  assert.ok(DIRECTOR_CRAFT_FIELDS.every(key => edit.values[key] === ''));
  edit.values.emotionStart = ' \n ';
  const unchanged = commitDirectorShotEdit(project, 'shot-2', edit);
  assert.equal(unchanged.clearCheckpoint, false);
  assert.equal(Object.hasOwn(unchanged.project.shots[1], 'craft'), false);
  edit.values.action = '依据原文抬头后稍作停顿';
  const actionOnly = commitDirectorShotEdit(project, 'shot-2', edit);
  assert.equal(actionOnly.clearCheckpoint, true);
  assert.equal(Object.hasOwn(actionOnly.project.shots[1], 'craft'), false);
});

test('craft whitespace-only changes preserve prompts and valid generation progress', () => {
  const project = fixture(); const initial = createDirectorShotEdit(project.shots[1]); initial.values.cameraPurpose = '观察原文中抬头的反应';
  const withCraft = commitDirectorShotEdit(project, 'shot-2', initial).project;
  const edit = createDirectorShotEdit(withCraft.shots[1]); edit.values.cameraPurpose = ' ' + edit.values.cameraPurpose + '\n';
  const result = commitDirectorShotEdit(withCraft, 'shot-2', edit);
  assert.equal(result.clearCheckpoint, false); assert.deepEqual(result.invalidatedShotIds, []); assert.deepEqual(result.project, withCraft);
});

test('clearing a craft field is a real edit, and other optional craft fields may remain empty', () => {
  const project = fixture(); const first = createDirectorShotEdit(project.shots[1]); first.values.spatialAnchor = '门内左侧';
  const withCraft = commitDirectorShotEdit(project, 'shot-2', first).project;
  const edit = createDirectorShotEdit(withCraft.shots[1]); edit.values.spatialAnchor = '';
  const result = commitDirectorShotEdit(withCraft, 'shot-2', edit);
  assert.equal(result.clearCheckpoint, true);
  assert.ok(DIRECTOR_CRAFT_FIELDS.every(key => result.project.shots[1].craft?.[key] === ''));
  assert.deepEqual(result.invalidatedShotIds, ['shot-1', 'shot-2', 'shot-3']);
});

test('craft conflict rebase retains locally edited fields and adopts externally updated untouched craft fields', () => {
  const project = fixture(); const edit = createDirectorShotEdit(project.shots[1]); edit.values.emotionStart = '设计建议：目光停在门上';
  const external = structuredClone(project); const outside = createDirectorShotEdit(external.shots[1]); outside.values.lightSoundCue = '原文动作后听见门轴声';
  const updated = commitDirectorShotEdit(external, 'shot-2', outside).project;
  assert.equal(readDirectorShotEdit(updated.shots[1], edit).conflict, true);
  assert.equal(readDirectorShotEdit(updated.shots[1], edit).values.emotionStart, edit.values.emotionStart);
  assert.throws(() => commitDirectorShotEdit(updated, 'shot-2', edit), /已保存内容发生变化/);
  const rebased = rebaseDirectorShotEdit(updated.shots[1], edit);
  assert.equal(rebased.values.emotionStart, edit.values.emotionStart);
  assert.equal(rebased.values.lightSoundCue, '原文动作后听见门轴声');
  assert.equal(readDirectorShotEdit(updated.shots[1], rebased).conflict, false);
});

test('saving adjacent craft changes preserves another pending craft edit', () => {
  const project = fixture(); const first = createDirectorShotEdit(project.shots[1]); first.values.emotionEnd = '设计建议：仍朝向门口';
  const next = createDirectorShotEdit(project.shots[2]); next.values.emotionalTrigger = '原文中的转身动作';
  const saved = commitDirectorShotEdit(project, 'shot-2', first).project;
  const state = readDirectorShotEdit(saved.shots[2], next);
  assert.equal(state.values.emotionalTrigger, '原文中的转身动作'); assert.equal(state.dirty, true); assert.equal(state.conflict, false);
  const result = commitDirectorShotEdit(saved, 'shot-3', next);
  assert.equal(result.project.shots[1].craft?.emotionEnd, '设计建议：仍朝向门口');
  assert.equal(result.project.shots[2].craft?.emotionalTrigger, '原文中的转身动作');
});

test('oversized craft input is rejected before damaging a saved project', () => {
  const project = fixture(); const before = structuredClone(project); const edit = createDirectorShotEdit(project.shots[1]); edit.values.cameraPurpose = '字'.repeat(1501);
  assert.throws(() => commitDirectorShotEdit(project, 'shot-2', edit), /1,500/); assert.deepEqual(project, before);
});
