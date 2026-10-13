import { validateDirectorProject, type DirectorProject, type DirectorShot } from './autoDirector';

export type DirectorShotDraft = { action: string; camera: string; continuity: string; durationSeconds: string };
export type DirectorShotEdit = {
  sourceExcerpt: string; sourceStart: number; sourceEnd: number;
  base: DirectorShotDraft; values: DirectorShotDraft;
};

export function directorShotDraft(shot: DirectorShot): DirectorShotDraft {
  return { action: shot.action, camera: shot.camera, continuity: shot.continuity, durationSeconds: String(shot.durationSeconds) };
}

const sameDraft = (first: DirectorShotDraft, second: DirectorShotDraft) =>
  (['action', 'camera', 'continuity', 'durationSeconds'] as const).every(key => first[key] === second[key]);

export function createDirectorShotEdit(shot: DirectorShot): DirectorShotEdit {
  const base = directorShotDraft(shot);
  return { sourceExcerpt: shot.sourceExcerpt, sourceStart: shot.sourceStart, sourceEnd: shot.sourceEnd, base, values: { ...base } };
}

/** Prompt invalidation changes no editable fields, so another local edit remains valid. */
export function readDirectorShotEdit(shot: DirectorShot, edit?: DirectorShotEdit) {
  const saved = directorShotDraft(shot);
  const originChanged = !!edit && (edit.sourceExcerpt !== shot.sourceExcerpt || edit.sourceStart !== shot.sourceStart || edit.sourceEnd !== shot.sourceEnd);
  const dirty = !!edit && !sameDraft(edit.values, saved);
  return { values: edit?.values || saved, dirty, originChanged, conflict: !!edit && (originChanged || !sameDraft(edit.base, saved)) && dirty };
}

/** Rebase is an explicit user choice. Never reuse an edit for another source excerpt. */
export function rebaseDirectorShotEdit(shot: DirectorShot, edit: DirectorShotEdit): DirectorShotEdit {
  if (readDirectorShotEdit(shot, edit).originChanged) throw new Error('这镜对应的原文已经变化。请取消本地修改，重新核对分镜。');
  const next = createDirectorShotEdit(shot);
  for (const key of ['action', 'camera', 'continuity', 'durationSeconds'] as const) {
    if (edit.values[key] !== edit.base[key]) next.values[key] = edit.values[key];
  }
  return next;
}

export function commitDirectorShotEdit(project: DirectorProject, shotId: string, edit: DirectorShotEdit) {
  const index = project.shots.findIndex(shot => shot.id === shotId);
  const original = project.shots[index];
  if (!original) throw new Error('这镜已不在当前项目中，修改没有保存。');
  const state = readDirectorShotEdit(original, edit);
  if (state.originChanged) throw new Error('这镜对应的原文已经变化。请取消本地修改，重新核对分镜。');
  if (state.conflict) throw new Error('这镜的已保存内容发生变化。你的修改仍保留，请先核对并选择保留本地修改，或取消修改。');
  const values = { action: edit.values.action.trim(), camera: edit.values.camera.trim(), continuity: edit.values.continuity.trim(), durationSeconds: Number(edit.values.durationSeconds) };
  const affectsNeighbors = values.action !== original.action || values.camera !== original.camera || values.continuity !== original.continuity;
  const changed = affectsNeighbors || values.durationSeconds !== original.durationSeconds;
  const invalidatedShotIds: string[] = [];
  const candidate = { ...project, shots: project.shots.map((shot, shotIndex) => {
    if (!changed || (shotIndex !== index && (!affectsNeighbors || Math.abs(shotIndex - index) !== 1))) return shot;
    invalidatedShotIds.push(shot.id);
    return { ...shot, ...(shotIndex === index ? values : {}), masterPrompt: '', postProductionNotes: [], referencePlan: [],
      qaWarnings: [shotIndex === index ? '分镜已修改，提示词待重新生成。' : '相邻镜的承接内容已调整，提示词待重新生成。'] };
  }) };
  // Validate before committing; invalid temporary form input cannot damage a saved project.
  const validated = validateDirectorProject(candidate);
  // Only a real manual revision supersedes an earlier generation attempt.
  // Whitespace-only edits must preserve a still-valid checkpoint.
  return { project: validated, clearCheckpoint: changed, affectsNeighbors, invalidatedShotIds };
}
