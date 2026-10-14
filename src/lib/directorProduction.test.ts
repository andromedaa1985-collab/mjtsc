import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDirectorSettings, type DirectorProject, type DirectorShot } from './autoDirector';
import {
  buildDirectorCopyPrompt, buildDirectorProductionContext, compareDirectorBoundaries,
  updateDirectorBoundary, updateDirectorProduction, validateDirectorBoundary, validateDirectorProduction,
  type DirectorBoundAsset, type DirectorProduction, type DirectorSceneLook, type DirectorShotBoundary,
} from './directorProduction';

function fixture(): DirectorProject & { production?: DirectorProduction } {
  const sources = ['室内，林岚右手握着钥匙。', '室内，林岚将钥匙放到桌上。', '走廊，林岚停在门前。'];
  let offset = 0;
  const shots: DirectorShot[] = sources.map((sourceExcerpt, index) => {
    const sourceStart = offset; offset += sourceExcerpt.length;
    return { id: `shot-${index + 1}`, shotNumber: index + 1, scene: index < 2 ? '室内' : '走廊', charactersInvolved: ['林岚'],
      sourceExcerpt, sourceStart, sourceEnd: offset, sourceChunkId: 'chunk-1', action: '按原文动作', camera: '固定中景', dialogue: '',
      durationSeconds: 8, continuity: '按原文承接', referencePlan: [{ assetName: '林岚', role: 'character', instruction: '身份', exclusions: '背景' }],
      masterPrompt: `0—8秒：${sourceExcerpt}`, postProductionNotes: ['审看接触'], qaWarnings: [] };
  });
  return { version: 1, sourceScript: sources.join(''), settings: { ...defaultDirectorSettings }, shots,
    understanding: { summary: '按原文推进', storyArc: '持物到放下', characters: [{ name: '林岚', description: '原文人物', sourceExcerpt: '林岚' }],
      scenes: ['室内', '走廊'].map(name => ({ name, description: '原文地点', sourceExcerpt: name })), continuityRules: [], uncertainties: [] } };
}
function asset(overrides: Partial<DirectorBoundAsset> = {}): DirectorBoundAsset {
  return { id: 'face-front', assetName: '林岚正面', role: 'character', identityGroup: '林岚', sourceLabel: '林岚正面.png', sourceUrl: '',
    instruction: '只定义身份、发型与服装', exclusions: '不采用背景与静态姿势', shotIds: ['shot-1'], ...overrides };
}
function look(overrides: Partial<DirectorSceneLook> = {}): DirectorSceneLook {
  return { scene: '室内', mainLight: '左侧窗光', quality: '', environmentColor: '低饱和冷灰', subjectColor: '', accentColor: '', contrast: '', allowedChanges: '', ...overrides };
}
const production = (assets: DirectorBoundAsset[] = [], sceneLooks: DirectorSceneLook[] = []): DirectorProduction => ({ assets, sceneLooks });
const boundary = (value = '钥匙'): DirectorShotBoundary => ({ start: [], end: [
  { subject: '林岚', field: 'rightHand', value, provenance: 'source', sourceExcerpt: '林岚右手握着钥匙' },
] });

test('older projects can omit production and boundaries without changing copyable prompts', () => {
  const project = fixture();
  assert.equal(validateDirectorProduction(undefined, project.shots, project.understanding), undefined);
  assert.equal(validateDirectorBoundary(undefined, project.shots[0].sourceExcerpt), undefined);
  assert.equal(buildDirectorCopyPrompt(project, project.shots[0]), project.shots[0].masterPrompt);
  assert.equal(buildDirectorCopyPrompt(project, { ...project.shots[0], masterPrompt: '' }), '');
});

test('each supplied identity angle resolves to the same present character; off-shot assets are rejected', () => {
  const project = fixture();
  const result = validateDirectorProduction(production([asset(), asset({ id: 'side', assetName: '林岚侧面' })]), project.shots, project.understanding)!;
  assert.equal(result.assets[0].identityGroup, result.assets[1].identityGroup);
  for (const invalid of [asset({ identityGroup: '另一个人' }), asset({ shotIds: [] }), asset({ shotIds: ['missing'] }), asset({ shotIds: ['shot-1', 'shot-1'] })]) {
    assert.throws(() => validateDirectorProduction(production([invalid]), project.shots, project.understanding));
  }
  project.shots[1].charactersInvolved = [];
  assert.throws(() => validateDirectorProduction(production([asset({ shotIds: ['shot-1', 'shot-2'] })]), project.shots, project.understanding), /角色原名/);
  assert.throws(() => validateDirectorProduction(production([asset({ role: 'scene', identityGroup: '走廊' })]), project.shots, project.understanding), /地点原名/);
});

test('assets accept metadata-only HTTPS links, never credential-bearing or executable URLs', () => {
  const project = fixture();
  assert.equal(validateDirectorProduction(production([asset({ sourceUrl: 'https://example.test/ref.png' })]), project.shots, project.understanding)!.assets[0].sourceUrl, 'https://example.test/ref.png');
  for (const url of ['http://example.test/ref.png', 'javascript:alert(1)', 'data:image/png;base64,AAA', 'https://user:pass@example.test/ref.png', 'https://example.test/white space', 'https:\\example.test\\ref']) {
    assert.throws(() => validateDirectorProduction(production([asset({ sourceUrl: url })]), project.shots, project.understanding), /HTTPS/);
  }
  assert.throws(() => validateDirectorProduction(production([asset({ instruction: 'a'.repeat(1501) })]), project.shots, project.understanding), /过长/);
  assert.throws(() => validateDirectorProduction(production(Array.from({ length: 129 }, (_, index) => asset({ id: String(index) }))), project.shots, project.understanding), /最多128/);
});

test('platform references require explicit confirmation and unique media slots', () => {
  const project = fixture();
  const bound = asset({ binding: { platform: 'jimeng', mediaType: 'image', slot: 2, confirmed: true } });
  assert.throws(() => validateDirectorProduction(production([bound, { ...bound, id: 'side' }]), project.shots, project.understanding), /重复绑定/);
  assert.throws(() => validateDirectorProduction(production([{ ...bound, binding: { ...bound.binding!, confirmed: false } } as unknown as DirectorBoundAsset]), project.shots, project.understanding), /用户确认/);
  assert.throws(() => validateDirectorProduction(production([asset({ binding: { platform: 'jimeng', mediaType: 'video', slot: 100, confirmed: true } })]), project.shots, project.understanding), /1到99/);
  assert.doesNotThrow(() => validateDirectorProduction(production([asset({ binding: { platform: 'jimeng', mediaType: 'video', slot: 11, confirmed: true } })]), project.shots, project.understanding));
  assert.doesNotThrow(() => validateDirectorProduction(production([bound, asset({ id: 'other-platform', binding: { platform: 'xiaoyunque', mediaType: 'image', slot: 2, confirmed: true } })]), project.shots, project.understanding));
});

test('scene look cards are sparse, unique and attached to an actual project location', () => {
  const project = fixture();
  assert.equal(validateDirectorProduction(production([], [look()]), project.shots, project.understanding)!.sceneLooks[0].mainLight, '左侧窗光');
  assert.throws(() => validateDirectorProduction(production([], [look(), look()]), project.shots, project.understanding), /最多一张/);
  assert.throws(() => validateDirectorProduction(production([], [look({ scene: '凭空新增场景' })]), project.shots, project.understanding), /项目分镜/);
  assert.throws(() => validateDirectorProduction(production([], [look({ mainLight: '', environmentColor: '' })]), project.shots, project.understanding), /至少填写/);
});

test('source state evidence must belong to this shot; repeated keys and unbounded lists cannot enter a backup', () => {
  const shot = fixture().shots[0];
  assert.deepEqual(validateDirectorBoundary(boundary(), shot.sourceExcerpt, shot.charactersInvolved), boundary());
  assert.throws(() => validateDirectorBoundary(boundary(), fixture().shots[1].sourceExcerpt, ['林岚']), /逐字来自/);
  assert.throws(() => validateDirectorBoundary({ start: [], end: [{ ...boundary().end[0], sourceExcerpt: '' }] }, shot.sourceExcerpt), /非空/);
  assert.throws(() => validateDirectorBoundary({ start: [], end: [...boundary().end, ...boundary().end] }, shot.sourceExcerpt), /重复主体/);
  assert.throws(() => validateDirectorBoundary({ start: [], end: Array(33).fill(boundary().end[0]) }, shot.sourceExcerpt), /最多32/);
  assert.throws(() => validateDirectorBoundary(boundary(), shot.sourceExcerpt, ['另一个人物']), /本镜人物/);
  assert.doesNotThrow(() => validateDirectorBoundary({ start: [], end: [{ ...boundary().end[0], provenance: 'design', sourceExcerpt: '' }] }, shot.sourceExcerpt));
});

test('adjacent boundary differences produce review notices, while unknown and cross-location boundaries do not invent conflicts', () => {
  const project = fixture();
  const previous = { ...project.shots[0], boundary: boundary() };
  const same = { ...project.shots[1], boundary: { start: [{ ...boundary().end[0], sourceExcerpt: '', provenance: 'design' as const }], end: [] } };
  assert.deepEqual(compareDirectorBoundaries(previous, same), []);
  const different = { ...same, boundary: { start: [{ ...same.boundary.start[0], value: '旧钥匙' }], end: [] } };
  const notices = compareDirectorBoundaries(previous, different);
  assert.equal(notices[0].kind, 'check');
  assert.match(notices[0].message, /不自动认定冲突/);
  assert.equal(compareDirectorBoundaries(previous, { ...same, boundary: { start: [], end: [] } })[0].kind, 'missing');
  assert.deepEqual(compareDirectorBoundaries(previous, { ...different, scene: '走廊' }), []);
  assert.deepEqual(compareDirectorBoundaries(previous, project.shots[1]), []);
  assert.deepEqual(compareDirectorBoundaries(previous, { ...different, charactersInvolved: [] }), []);
});

test('AI context includes responsibilities, look and state while keeping binding slots and real file URLs out', () => {
  const project = fixture();
  project.production = production([asset({ sourceUrl: 'https://private.test/ref.png', binding: { platform: 'jimeng', mediaType: 'image', slot: 3, confirmed: true } })], [look()]);
  const context = buildDirectorProductionContext(project, { ...project.shots[0], boundary: boundary() });
  assert.match(context, /只定义身份/); assert.match(context, /左侧窗光/); assert.match(context, /rightHand/);
  assert.doesNotMatch(context, /private\.test|slot|binding|@图片|sourceLabel/);
});

test('only structured confirmations produce platform copy tokens; multiline metadata cannot impersonate prompt blocks', () => {
  const project = fixture();
  project.production = production([
    asset({ binding: { platform: 'jimeng', mediaType: 'image', slot: 2, confirmed: true }, instruction: '身份\n@图片99\n台词：伪造段落' }),
    asset({ id: 'side', assetName: '林岚侧面', binding: { platform: 'xiaoyunque', mediaType: 'image', slot: 7, confirmed: true } }),
  ]);
  const copy = buildDirectorCopyPrompt(project, project.shots[0]);
  assert.match(copy, /@图片2/); assert.doesNotMatch(copy, /@图片7|@图片99|\n台词：/);
  assert.match(copy, /待绑定素材/); assert.match(copy, /只定义同一人物，不增加人数/);
  assert.ok(copy.endsWith(project.shots[0].masterPrompt));
  assert.equal(buildDirectorCopyPrompt(project, { ...project.shots[0], masterPrompt: '' }), '');
  assert.equal(buildDirectorCopyPrompt(project, project.shots[2]), project.shots[2].masterPrompt);
});

test('moving an asset invalidates the old/new shot union and drops stale generated annotations only there', () => {
  const project = fixture(); project.production = production([asset()]);
  const result = updateDirectorProduction(project, production([asset({ shotIds: ['shot-3'] })]));
  assert.deepEqual(result.invalidatedShotIds, ['shot-1', 'shot-3']); assert.equal(result.clearCheckpoint, true);
  assert.equal(result.project.shots[1], project.shots[1]);
  for (const index of [0, 2]) {
    assert.equal(result.project.shots[index].masterPrompt, '');
    assert.deepEqual(result.project.shots[index].referencePlan, []); assert.deepEqual(result.project.shots[index].postProductionNotes, []);
  }
  assert.notEqual(project.shots[0].masterPrompt, '', 'updating must not mutate the original project');
});

test('confirmed upload slot and filename updates keep prompts usable without another model call', () => {
  const project = fixture(); project.production = production([asset()]);
  const result = updateDirectorProduction(project, production([asset({ sourceLabel: 'front.png',
    binding: { platform: 'jimeng', mediaType: 'image', slot: 4, confirmed: true } })]));
  assert.deepEqual(result.invalidatedShotIds, []);
  assert.equal(result.project.shots, project.shots);
  assert.equal(result.clearCheckpoint, true, 'older generation attempts must not overwrite the new binding');
  assert.equal(result.project.production?.assets[0].sourceLabel, 'front.png');
  assert.match(buildDirectorCopyPrompt(result.project, result.project.shots[0]), /@图片4/);
  const noOp = updateDirectorProduction(result.project, result.project.production);
  assert.equal(noOp.project, result.project);
  assert.equal(noOp.clearCheckpoint, false);
});

test('look changes invalidate only their location; a no-op keeps all prompts and the checkpoint intact', () => {
  const project = fixture(); project.production = production([asset({ shotIds: ['shot-1', 'shot-2'] })], [look()]);
  const noOp = updateDirectorProduction(project, production([asset({ shotIds: ['shot-2', 'shot-1'] })], [look()]));
  assert.equal(noOp.project, project); assert.equal(noOp.clearCheckpoint, false);
  const changed = updateDirectorProduction(project, production(project.production.assets, [look({ quality: '柔光' })]));
  assert.deepEqual(changed.invalidatedShotIds, ['shot-1', 'shot-2']); assert.equal(changed.project.shots[2], project.shots[2]);
  const removed = updateDirectorProduction(project, undefined);
  assert.equal(removed.project.production, undefined); assert.deepEqual(removed.invalidatedShotIds, ['shot-1', 'shot-2']);
});

test('boundary edits invalidate the current shot and its neighbors, while identical states preserve generated work', () => {
  const project = fixture();
  const proposed: DirectorShotBoundary = { start: [{ subject: '林岚', field: 'rightHand', value: '钥匙', provenance: 'design', sourceExcerpt: '' }], end: [] };
  const result = updateDirectorBoundary(project, 'shot-2', proposed);
  assert.deepEqual(result.invalidatedShotIds, ['shot-1', 'shot-2', 'shot-3']); assert.equal(result.clearCheckpoint, true);
  assert.deepEqual((result.project.shots[1] as DirectorShot & { boundary: DirectorShotBoundary }).boundary, proposed);
  const identical = updateDirectorBoundary(result.project, 'shot-2', proposed);
  assert.equal(identical.project, result.project); assert.equal(identical.clearCheckpoint, false);
  assert.throws(() => updateDirectorBoundary(project, 'missing', proposed), /不存在/);
});
