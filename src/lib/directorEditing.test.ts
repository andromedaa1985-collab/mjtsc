import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDirectorSettings, validateDirectorProject, type DirectorProject } from './autoDirector.ts';
import { commitDirectorShotEdit, createDirectorShotEdit, readDirectorShotEdit, rebaseDirectorShotEdit } from './directorEditing.ts';

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
