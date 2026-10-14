import type { DirectorProject, DirectorShot, DirectorUnderstanding } from './autoDirector';

export type DirectorReferenceRole = 'character' | 'scene' | 'prop' | 'action' | 'voice' | 'look' | 'composition' | 'previs';
export interface DirectorBoundAsset {
  id: string; assetName: string; role: DirectorReferenceRole; identityGroup: string;
  sourceLabel: string; sourceUrl: string; instruction: string; exclusions: string; shotIds: string[];
  binding?: { platform: 'jimeng' | 'xiaoyunque'; mediaType: 'image' | 'video' | 'audio'; slot: number; confirmed: true };
}
export interface DirectorSceneLook {
  scene: string; mainLight: string; quality: string; environmentColor: string; subjectColor: string;
  accentColor: string; contrast: string; allowedChanges: string;
}
export interface DirectorProduction { assets: DirectorBoundAsset[]; sceneLooks: DirectorSceneLook[] }
export type DirectorStateField = 'position' | 'facing' | 'leftHand' | 'rightHand' | 'objectState' | 'movement' | 'lighting' | 'unfinishedAction';
export interface DirectorStateItem {
  subject: string; field: DirectorStateField; value: string;
  provenance: 'source' | 'design' | 'confirmed'; sourceExcerpt: string;
}
export interface DirectorShotBoundary { start: DirectorStateItem[]; end: DirectorStateItem[] }
export interface DirectorBoundaryComparison {
  subject: string; field: DirectorStateField; previousValue: string; nextValue: string;
  kind: 'check' | 'missing'; message: string;
}
type ProductionProject = DirectorProject & { production?: DirectorProduction };
type BoundaryShot = DirectorShot & { boundary?: DirectorShotBoundary };
export interface DirectorProductionUpdate {
  project: ProductionProject; invalidatedShotIds: string[]; clearCheckpoint: boolean;
}

export const DIRECTOR_REFERENCE_ROLES: DirectorReferenceRole[] = ['character', 'scene', 'prop', 'action', 'voice', 'look', 'composition', 'previs'];
export const DIRECTOR_STATE_FIELDS: DirectorStateField[] = ['position', 'facing', 'leftHand', 'rightHand', 'objectState', 'movement', 'lighting', 'unfinishedAction'];
export const DIRECTOR_REFERENCE_LABELS: Record<DirectorReferenceRole, string> = {
  character: '身份与造型', scene: '场景与空间', prop: '道具', action: '动作', voice: '音色',
  look: '光色与材质', composition: '构图', previs: '白模与预演',
};
export const DIRECTOR_STATE_LABELS: Record<DirectorStateField, string> = {
  position: '位置', facing: '朝向', leftHand: '左手持物', rightHand: '右手持物', objectState: '物件状态',
  movement: '运动方向', lighting: '光源', unfinishedAction: '未完成动作',
};
const LOOK_FIELDS = ['mainLight', 'quality', 'environmentColor', 'subjectColor', 'accentColor', 'contrast', 'allowedChanges'] as const;
const fail = (message: string): never => { throw new Error(message); };
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}格式无效。`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, empty = false, maximum = 1500): string {
  if (typeof value !== 'string' || (!empty && !value.trim())) fail(`${label}必须是${empty ? '' : '非空'}文字。`);
  if ((value as string).length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value as string)) fail(`${label}过长或含无效控制字符。`);
  return value as string;
}
function list(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label}必须是最多${maximum}项的列表。`);
  return value as unknown[];
}
function httpsUrl(value: unknown): string {
  const urlText = text(value, '素材链接', true, 2048);
  if (!urlText.trim()) return '';
  let url: URL;
  try { url = new URL(urlText); } catch { return fail('素材链接必须是完整HTTPS地址。'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /[\s\\]/.test(urlText)) fail('素材链接必须是无账号密码的HTTPS地址。');
  return urlText;
}

/** Metadata only: this validator neither uploads files nor confirms platform bindings. */
export function validateDirectorProduction(value: unknown, shots: readonly DirectorShot[], info: DirectorUnderstanding): DirectorProduction | undefined {
  if (value === undefined) return undefined;
  const data = record(value, '制作素材与光色');
  const shotMap = new Map(shots.map(shot => [shot.id, shot]));
  const assetIds = new Set<string>();
  const occupiedSlots = new Set<string>();
  const assets = list(data.assets, '制作素材', 128).map(item => {
    const entry = record(item, '制作素材');
    const id = text(entry.id, '素材ID', false, 128);
    if (assetIds.has(id)) fail('素材ID重复。');
    assetIds.add(id);
    const role = text(entry.role, '素材职责') as DirectorReferenceRole;
    if (!DIRECTOR_REFERENCE_ROLES.includes(role)) fail('素材职责无效。');
    const identityGroup = text(entry.identityGroup, '主体身份组', true);
    const shotIds = list(entry.shotIds, '素材适用镜头', Math.max(1, shots.length)).map(id => text(id, '素材镜头ID', false, 128));
    if (!shotIds.length || new Set(shotIds).size !== shotIds.length) fail('素材必须关联至少一个镜头，不能重复镜头ID。');
    for (const shotId of shotIds) {
      const shot = shotMap.get(shotId);
      if (!shot) fail('素材关联了不存在的镜头。');
      if (role === 'character' || role === 'voice') {
        if (!info.characters.some(character => character.name === identityGroup) || !shot.charactersInvolved.includes(identityGroup)) fail('人物或音色素材的身份组必须是每个适用镜头中的角色原名。');
      }
      if (role === 'scene' && (identityGroup !== shot.scene || !info.scenes.some(scene => scene.name === identityGroup))) fail('场景素材的身份组必须是每个适用镜头的地点原名。');
    }
    const asset: DirectorBoundAsset = { id, assetName: text(entry.assetName, '素材名称'), role, identityGroup,
      sourceLabel: text(entry.sourceLabel, '文件名或素材标签', true), sourceUrl: httpsUrl(entry.sourceUrl),
      instruction: text(entry.instruction, '素材采用职责'), exclusions: text(entry.exclusions, '素材排除项', true), shotIds };
    if (entry.binding !== undefined) {
      const binding = record(entry.binding, '平台素材绑定');
      if (!['jimeng', 'xiaoyunque'].includes(String(binding.platform)) || !['image', 'video', 'audio'].includes(String(binding.mediaType)) || binding.confirmed !== true) fail('平台绑定必须包含有效入口、素材类型与用户确认。');
      // This is a local metadata bound, not a claim about any platform quota.
      if (!Number.isInteger(binding.slot) || Number(binding.slot) < 1 || Number(binding.slot) > 99) fail('素材引用序号必须是1到99的整数，请填写当前平台的实际序号。');
      const slotKey = `${binding.platform}/${binding.mediaType}/${binding.slot}`;
      if (occupiedSlots.has(slotKey)) fail('同一平台、素材类型和引用序号不能重复绑定。');
      occupiedSlots.add(slotKey);
      asset.binding = { platform: binding.platform as 'jimeng' | 'xiaoyunque', mediaType: binding.mediaType as 'image' | 'video' | 'audio', slot: Number(binding.slot), confirmed: true };
    }
    return asset;
  });
  const lookScenes = new Set<string>();
  const sceneLooks = list(data.sceneLooks, '场景光色卡', 128).map(item => {
    const entry = record(item, '场景光色卡');
    const scene = text(entry.scene, '光色卡地点');
    if (!info.scenes.some(item => item.name === scene) || !shots.some(shot => shot.scene === scene)) fail('光色卡必须对应项目分镜中的地点。');
    if (lookScenes.has(scene)) fail('每个场景最多一张光色卡。');
    lookScenes.add(scene);
    const look = { scene } as DirectorSceneLook;
    for (const field of LOOK_FIELDS) look[field] = text(entry[field], '光色卡内容', true);
    if (!LOOK_FIELDS.some(field => look[field].trim())) fail('光色卡至少填写一项内容。');
    return look;
  });
  return { assets, sceneLooks };
}

export function validateDirectorBoundary(value: unknown, shotSource: string, characters?: readonly string[]): DirectorShotBoundary | undefined {
  if (value === undefined) return undefined;
  const data = record(value, '镜头起止状态');
  const parse = (items: unknown, label: string): DirectorStateItem[] => {
    const keys = new Set<string>();
    return list(items, label, 32).map(item => {
      const entry = record(item, '状态项');
      const subject = text(entry.subject, '状态主体');
      const field = text(entry.field, '状态字段') as DirectorStateField;
      if (!DIRECTOR_STATE_FIELDS.includes(field)) fail('状态字段无效。');
      if (characters && ['leftHand', 'rightHand'].includes(field) && !characters.includes(subject)) fail('持物状态必须对应本镜人物。');
      const key = JSON.stringify([subject, field]);
      if (keys.has(key)) fail('同一状态列表不能重复主体与状态字段。');
      keys.add(key);
      const provenance = text(entry.provenance, '状态依据') as DirectorStateItem['provenance'];
      if (!['source', 'design', 'confirmed'].includes(provenance)) fail('状态依据无效。');
      const sourceExcerpt = text(entry.sourceExcerpt, '状态原文依据', provenance !== 'source');
      if (sourceExcerpt && !shotSource.includes(sourceExcerpt)) fail('状态原文依据必须逐字来自当前镜头原文。');
      return { subject, field, value: text(entry.value, '状态内容'), provenance, sourceExcerpt };
    });
  };
  return { start: parse(data.start, '起始状态'), end: parse(data.end, '结束状态') };
}

/** A wording difference is a review request, never proof of a continuity error. */
export function compareDirectorBoundaries(previous: BoundaryShot | undefined, next: BoundaryShot | undefined): DirectorBoundaryComparison[] {
  if (!previous || !next || previous.scene !== next.scene || !previous.boundary || !next.boundary) return [];
  const starts = new Map(next.boundary.start.map(item => [JSON.stringify([item.subject, item.field]), item]));
  return previous.boundary.end.flatMap(item => {
    if (previous.charactersInvolved.includes(item.subject) && !next.charactersInvolved.includes(item.subject)) return [];
    const start = starts.get(JSON.stringify([item.subject, item.field]));
    if (start && start.value === item.value) return [];
    const kind = start ? 'check' as const : 'missing' as const;
    return [{ subject: item.subject, field: item.field, previousValue: item.value, nextValue: start?.value || '', kind,
      message: start ? `${item.subject}的${DIRECTOR_STATE_LABELS[item.field]}写法不同，请核对是否承接或存在有依据的变化；不自动认定冲突。` : `下一镜未记录${item.subject}的${DIRECTOR_STATE_LABELS[item.field]}，请确认是否需要承接；未说明不等于发生变化。` }];
  });
}

/** Do not send URLs, upload slots or confirmation claims to the writing model. */
export function buildDirectorProductionContext(project: ProductionProject, shot: BoundaryShot): string {
  const production = project.production;
  const assets = (production?.assets || []).filter(asset => asset.shotIds.includes(shot.id)).map(asset => ({
    assetName: asset.assetName, role: asset.role, identityGroup: asset.identityGroup,
    instruction: asset.instruction, exclusions: asset.exclusions,
  }));
  return JSON.stringify({ assets, sceneLook: production?.sceneLooks.find(look => look.scene === shot.scene) || null, boundary: shot.boundary || null });
}

// Scalar quoting prevents a filename or multiline note from becoming another
// instruction block. Only a confirmed structured binding can create @ tokens.
const scalar = (value: string): string => JSON.stringify(value.replace(/@\s*(?:(?:图片|图像|视频|音频|image|video|audio)\s*)?\d+/gi, '（未采用的文字引用）'));
export function buildDirectorCopyPrompt(project: ProductionProject, shot: BoundaryShot): string {
  if (!shot.masterPrompt) return '';
  const assets = project.production?.assets.filter(asset => asset.shotIds.includes(shot.id)) || [];
  if (!assets.length) return shot.masterPrompt;
  const lines = assets.map(asset => {
    const bound = asset.binding?.confirmed === true && asset.binding.platform === project.settings.platform ? asset.binding : undefined;
    const token = bound ? `@${({ image: '图片', video: '视频', audio: '音频' })[bound.mediaType]}${bound.slot}` : '待绑定素材';
    const group = asset.identityGroup ? `；主体组：${scalar(asset.identityGroup)}` : '';
    return `${token}｜${scalar(asset.assetName)}｜职责：${DIRECTOR_REFERENCE_LABELS[asset.role]}${group}；采用：${scalar(asset.instruction)}；不采用：${scalar(asset.exclusions)}`;
  });
  const identityGroups = [...new Set(assets.filter(asset => asset.role === 'character').map(asset => asset.identityGroup))];
  if (identityGroups.length) lines.push(`同一主体组的不同视角只定义同一人物，不增加人数：${identityGroups.map(scalar).join('、')}。`);
  if (assets.some(asset => !asset.binding || asset.binding.platform !== project.settings.platform)) lines.push('待绑定素材请先在当前平台上传并核对实际顺序；这里没有替你上传或生成素材。');
  return `参考素材职责（按当前平台的用户确认记录）：\n${lines.join('\n')}\n\n${shot.masterPrompt}`;
}

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function invalidate(project: ProductionProject, changed: Set<string>, message: string): DirectorProductionUpdate {
  const invalidatedShotIds = project.shots.filter(shot => changed.has(shot.id)).map(shot => shot.id);
  if (!invalidatedShotIds.length) return { project, invalidatedShotIds, clearCheckpoint: false };
  return { project: { ...project, shots: project.shots.map(shot => changed.has(shot.id) ? {
    ...shot, masterPrompt: '', referencePlan: [], postProductionNotes: [], qaWarnings: [...new Set([...shot.qaWarnings, message])],
  } : shot) }, invalidatedShotIds, clearCheckpoint: true };
}
export function updateDirectorProduction(project: ProductionProject, value: unknown): DirectorProductionUpdate {
  const production = validateDirectorProduction(value, project.shots, project.understanding);
  const old = project.production;
  const changed = new Set<string>();
  let metadataChanged = false;
  const oldAssets = new Map((old?.assets || []).map(asset => [asset.id, asset]));
  const newAssets = new Map((production?.assets || []).map(asset => [asset.id, asset]));
  for (const id of new Set([...oldAssets.keys(), ...newAssets.keys()])) {
    const before = oldAssets.get(id), after = newAssets.get(id);
    const comparable = (asset: DirectorBoundAsset | undefined) => asset ? { ...asset, shotIds: [...asset.shotIds].sort() } : undefined;
    if (!equal(comparable(before), comparable(after))) metadataChanged = true;
    // Actual platform slots and file labels are rendered locally. Updating them
    // must not force another paid text generation for an unchanged direction.
    const direction = (asset: DirectorBoundAsset | undefined) => {
      if (!asset) return undefined;
      const { binding, sourceLabel, sourceUrl, ...creative } = asset;
      return { ...creative, shotIds: [...creative.shotIds].sort() };
    };
    if (!equal(direction(before), direction(after))) [...(before?.shotIds || []), ...(after?.shotIds || [])].forEach(id => changed.add(id));
  }
  for (const scene of new Set([...(old?.sceneLooks || []).map(look => look.scene), ...(production?.sceneLooks || []).map(look => look.scene)])) {
    if (!equal(old?.sceneLooks.find(look => look.scene === scene), production?.sceneLooks.find(look => look.scene === scene))) project.shots.filter(shot => shot.scene === scene).forEach(shot => changed.add(shot.id));
  }
  if (!changed.size && !metadataChanged) return { project, invalidatedShotIds: [], clearCheckpoint: false };
  const next = { ...project };
  if (production) next.production = production;
  else delete next.production;
  if (!changed.size) return { project: next, invalidatedShotIds: [], clearCheckpoint: true };
  return invalidate(next, changed, '素材职责或场景光色已修改，提示词需要重新生成。');
}
export function updateDirectorBoundary(project: ProductionProject, shotId: string, value: unknown): DirectorProductionUpdate {
  const index = project.shots.findIndex(shot => shot.id === shotId);
  if (index < 0) fail('要更新的镜头不存在。');
  const shot = project.shots[index] as BoundaryShot;
  const boundary = validateDirectorBoundary(value, shot.sourceExcerpt, shot.charactersInvolved);
  if (equal(shot.boundary, boundary)) return { project, invalidatedShotIds: [], clearCheckpoint: false };
  const nextShot: BoundaryShot = { ...shot };
  if (boundary) nextShot.boundary = boundary;
  else delete nextShot.boundary;
  const next = { ...project, shots: project.shots.map((entry, current) => current === index ? nextShot : entry) };
  return invalidate(next, new Set(project.shots.slice(Math.max(0, index - 1), index + 2).map(shot => shot.id)), '起止状态已修改，请核对相邻承接并重新生成提示词。');
}
