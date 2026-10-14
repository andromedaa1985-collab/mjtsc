import React, { useEffect, useId, useRef, useState } from 'react';
import type { DirectorProject } from '../lib/autoDirector';
import {
  DIRECTOR_REFERENCE_LABELS, DIRECTOR_REFERENCE_ROLES, validateDirectorProduction,
  type DirectorBoundAsset, type DirectorProduction, type DirectorReferenceRole, type DirectorSceneLook,
} from '../lib/directorProduction';

const control = 'min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:opacity-50';
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:cursor-not-allowed disabled:opacity-50';
type AssetDraft = Omit<DirectorBoundAsset, 'binding'> & { binding: {
  platform: 'jimeng' | 'xiaoyunque'; mediaType: 'image' | 'video' | 'audio'; slot: string; confirmed: boolean;
} };
type ProductionDraft = { assets: AssetDraft[]; sceneLooks: DirectorSceneLook[] };
interface Props {
  project: DirectorProject; disabled: boolean; onSave: (production: DirectorProduction) => void;
  onDirtyChange?: (dirty: boolean) => void;
}
const lookFields: { key: Exclude<keyof DirectorSceneLook, 'scene'>; label: string; placeholder: string }[] = [
  { key: 'mainLight', label: '主光来源与方向', placeholder: '例如左侧窗外晨光；按剧本选择' },
  { key: 'quality', label: '光的软硬与质感', placeholder: '例如柔和漫射光；可留空' },
  { key: 'environmentColor', label: '环境主色', placeholder: '墙面、天空与暗部的主要颜色' },
  { key: 'subjectColor', label: '主体保护色', placeholder: '人物服装与肤色需要保留的关系' },
  { key: 'accentColor', label: '点缀色与注意力', placeholder: '需要时填写小面积视觉焦点' },
  { key: 'contrast', label: '明暗与高光边界', placeholder: '例如暗部可辨、金属高光保留细节' },
  { key: 'allowedChanges', label: '允许变化与触发原因', placeholder: '例如角色开灯后桌面局部变亮' },
];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function toDraft(value: DirectorProduction | undefined, platform: 'jimeng' | 'xiaoyunque'): ProductionDraft {
  return { assets: (value?.assets || []).map(asset => ({ ...clone(asset), binding: asset.binding ? {
    ...asset.binding, slot: String(asset.binding.slot),
  } : { platform, mediaType: asset.role === 'voice' ? 'audio' : ['action', 'previs'].includes(asset.role) ? 'video' : 'image', slot: '1', confirmed: false } })), sceneLooks: clone(value?.sceneLooks || []) };
}
function serializeDraft(draft: ProductionDraft): DirectorProduction {
  return { assets: draft.assets.map(({ binding, ...asset }) => ({ ...asset, ...(binding.confirmed ? {
    binding: { platform: binding.platform, mediaType: binding.mediaType, slot: Number(binding.slot), confirmed: true as const },
  } : {}) })), sceneLooks: draft.sceneLooks };
}
function Text({ label, value, onChange, disabled, multiline = false, required = false, placeholder, maxLength = 1500, errorId }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean; multiline?: boolean;
  required?: boolean; placeholder?: string; maxLength?: number; errorId?: string;
}) {
  const common = { 'aria-label': label, value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), disabled, required, placeholder, maxLength, 'aria-describedby': errorId, className: control };
  return <label className="block space-y-2"><span className="block text-sm text-zinc-300">{label}{required && <span className="text-zinc-400"> · 必填</span>}</span>{multiline ? <textarea {...common} rows={2} className={control + ' resize-y leading-7'} /> : <input {...common} />}</label>;
}

export default function DirectorProductionPanel({ project, disabled, onSave, onDirtyChange }: Props) {
  const id = useId();
  const incomingProduction = (project as DirectorProject & { production?: DirectorProduction }).production;
  const incomingKey = JSON.stringify({ production: incomingProduction, source: project.sourceScript });
  const [baseKey, setBaseKey] = useState(incomingKey);
  const [baseDraft, setBaseDraft] = useState(() => toDraft(incomingProduction, project.settings.platform));
  const [draft, setDraft] = useState(() => toDraft(incomingProduction, project.settings.platform));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [template, setTemplate] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseDraft);
  const conflict = dirty && baseKey !== incomingKey;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const callbackRef = useRef(onDirtyChange); callbackRef.current = onDirtyChange;
  useEffect(() => { callbackRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => { if (!dirtyRef.current) callbackRef.current?.(false); }, []);
  useEffect(() => {
    if (!dirtyRef.current) {
      const next = toDraft(incomingProduction, project.settings.platform);
      setDraft(next); setBaseDraft(next); setBaseKey(incomingKey); setError('');
    }
  }, [incomingKey]);
  const change = (next: ProductionDraft) => { setDraft(next); setError(''); setNotice(''); };
  const editAsset = (assetId: string, update: Partial<AssetDraft>) => change({ ...draft, assets: draft.assets.map(asset => asset.id === assetId ? { ...asset, ...update } : asset) });
  const editBinding = (asset: AssetDraft, update: Partial<AssetDraft['binding']>) => editAsset(asset.id, { binding: { ...asset.binding, ...update } });
  const addAsset = (prefill?: { assetName: string; role: DirectorReferenceRole; instruction: string; exclusions: string; shotId: string }) => {
    const role = prefill?.role || 'character';
    const shot = project.shots.find(shot => shot.id === prefill?.shotId);
    const identityGroup = role === 'scene' ? shot?.scene || '' : ['character', 'voice'].includes(role) ? shot?.charactersInvolved.find(name => name === prefill?.assetName) || '' : '';
    change({ ...draft, assets: [...draft.assets, { id: `asset-${crypto.randomUUID()}`, assetName: prefill?.assetName || '', role, identityGroup,
      sourceLabel: '', sourceUrl: '', instruction: prefill?.instruction || '', exclusions: prefill?.exclusions || '', shotIds: prefill ? [prefill.shotId] : [],
      binding: { platform: project.settings.platform, mediaType: role === 'voice' ? 'audio' : ['action', 'previs'].includes(role) ? 'video' : 'image', slot: '1', confirmed: false } }] });
  };
  const cancel = () => {
    const next = toDraft(incomingProduction, project.settings.platform);
    setDraft(next); setBaseDraft(next); setBaseKey(incomingKey); setError(''); setNotice('已取消本地修改，恢复当前已保存的制作资料。');
  };
  const save = () => {
    try {
      if (baseKey !== incomingKey) throw new Error('已保存的制作资料或原文发生变化。你的本地修改已保留，请先核对，取消后再基于当前版本编辑。');
      const result = validateDirectorProduction(serializeDraft(draft), project.shots, project.understanding)!;
      onSave(result);
      const next = toDraft(result, project.settings.platform);
      setDraft(next); setBaseDraft(next); setError(''); setNotice('制作资料已保存。职责或光色变化会标记相关镜头待更新；仅修改文件记录或引用编号时，正文可继续使用。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '制作资料无法保存，请核对填写内容。'); }
  };
  const candidates = project.shots.flatMap(shot => shot.referencePlan.map((item, index) => ({ ...item, shotId: shot.id, shotNumber: shot.shotNumber, value: `${shot.id}:${index}` })));
  const availableScenes = project.understanding.scenes.map(scene => scene.name).filter(scene => !draft.sceneLooks.some(look => look.scene === scene));
  const errorId = error ? `${id}-error` : undefined;
  return <details className="my-5 rounded-2xl border border-white/15 bg-zinc-950 p-4 sm:p-5">
    <summary className="min-h-11 cursor-pointer rounded-lg py-2 text-sm font-medium text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">制作资料 · 素材职责与场景光色{dirty && <span className="ml-2 text-xs text-amber-200">有未保存修改</span>}</summary>
    <p className="mt-2 text-sm leading-7 text-zinc-400">按每镜需要分配身份、空间、道具、动作与光色。这里只保存文件名、链接和职责文字，不上传文件、不生成视频。</p>
    {disabled && <p className="mt-2 text-xs leading-6 text-zinc-400">请先完成或取消其他编辑；制作结束且原文对应这份草案时，可编辑制作资料。</p>}
    {conflict && <p role="alert" className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-sm leading-7 text-amber-100">当前已保存资料或原文已变化，本地修改仍然保留。请核对内容；为避免覆盖新版本，此时不能保存旧草稿。可取消本地修改后重新编辑。</p>}
    {error && <p id={errorId} role="alert" className="mt-3 rounded-xl border border-red-300/30 p-3 text-sm leading-7 text-red-200">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm leading-7 text-zinc-300">{notice}</p>}
    <fieldset disabled={disabled} aria-describedby={errorId} aria-invalid={error ? true : undefined} className="mt-5 min-w-0 space-y-4">
      <legend className="text-sm font-medium text-zinc-200">素材职责</legend>
      {!draft.assets.length && <p className="text-sm leading-7 text-zinc-400">尚未添加制作素材。可按已有参考计划预填，再确认实际素材与适用镜头。</p>}
      {draft.assets.map((asset, index) => <details key={asset.id} open className="rounded-xl border border-white/10 p-3 sm:p-4">
        <summary className="min-h-11 cursor-pointer rounded-lg py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">素材 {index + 1} · {asset.assetName || '待命名'}<span className="ml-2 text-xs text-zinc-400">{DIRECTOR_REFERENCE_LABELS[asset.role]}</span></summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Text label="素材名称" value={asset.assetName} onChange={assetName => editAsset(asset.id, { assetName })} disabled={disabled} required errorId={errorId} />
          <label className="block space-y-2"><span className="block text-sm text-zinc-300">采用职责</span><select value={asset.role} onChange={event => editAsset(asset.id, { role: event.target.value as DirectorReferenceRole, identityGroup: '' })} className={control}>{DIRECTOR_REFERENCE_ROLES.map(role => <option key={role} value={role}>{DIRECTOR_REFERENCE_LABELS[role]}</option>)}</select></label>
          {['character', 'voice', 'scene'].includes(asset.role) ? <label className="block space-y-2"><span className="block text-sm text-zinc-300">{asset.role === 'scene' ? '地点原名' : '同一人物身份组'} · 必填</span><select value={asset.identityGroup} required onChange={event => editAsset(asset.id, { identityGroup: event.target.value })} className={control} aria-describedby={errorId}><option value="">请选择原名</option>{(asset.role === 'scene' ? project.understanding.scenes : project.understanding.characters).map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select><span className="block text-xs leading-6 text-zinc-400">同一人物的正面、侧面与背面图使用同一个身份组，不增加人物数量。</span></label> : <Text label="主体归属或用途组（可选）" value={asset.identityGroup} onChange={identityGroup => editAsset(asset.id, { identityGroup })} disabled={disabled} errorId={errorId} />}
          <div className="space-y-3"><Text label="文件名或标签（可选）" value={asset.sourceLabel} onChange={sourceLabel => editAsset(asset.id, { sourceLabel, binding: { ...asset.binding, confirmed: false } })} disabled={disabled} errorId={errorId} /><label className="block space-y-2"><span className="block text-xs text-zinc-400">选择文件只填写名称，文件内容不会读取或上传</span><input type="file" aria-label={`为素材 ${index + 1} 选择文件名，不上传`} className={control + ' file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-zinc-100'} onChange={event => { const name = event.target.files?.[0]?.name; if (name) editAsset(asset.id, { sourceLabel: name, binding: { ...asset.binding, confirmed: false } }); event.target.value = ''; }} /></label></div>
          <div className="sm:col-span-2"><Text label="HTTPS 素材链接（可选）" value={asset.sourceUrl} onChange={sourceUrl => editAsset(asset.id, { sourceUrl, binding: { ...asset.binding, confirmed: false } })} disabled={disabled} maxLength={2048} placeholder="https://…；不填写账号密码" errorId={errorId} /></div>
          <Text label="只采用什么" value={asset.instruction} onChange={instruction => editAsset(asset.id, { instruction })} disabled={disabled} required multiline errorId={errorId} placeholder="例如只定义五官、发型与服装" />
          <Text label="不带入什么（可选）" value={asset.exclusions} onChange={exclusions => editAsset(asset.id, { exclusions })} disabled={disabled} multiline errorId={errorId} placeholder="例如不采用背景、静态姿势与画中文字" />
          <fieldset className="min-w-0 rounded-xl border border-white/10 p-3 sm:col-span-2"><legend className="px-1 text-sm text-zinc-300">适用镜头 · 至少选择一镜</legend><div className="max-h-56 space-y-1 overflow-y-auto">{project.shots.map(shot => <label key={shot.id} className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5 text-sm text-zinc-300"><input type="checkbox" checked={asset.shotIds.includes(shot.id)} onChange={event => editAsset(asset.id, { shotIds: event.target.checked ? [...asset.shotIds, shot.id] : asset.shotIds.filter(id => id !== shot.id) })} className="mt-1 size-4 shrink-0 accent-amber-200" /><span>{shot.shotNumber} · {shot.scene}<span className="ml-2 text-zinc-400">{shot.charactersInvolved.join('、') || '空镜'}</span></span></label>)}</div></fieldset>
          <fieldset className="min-w-0 rounded-xl border border-white/10 p-3 sm:col-span-2"><legend className="px-1 text-sm text-zinc-300">平台引用 · 手动确认</legend><div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-2"><span className="block text-xs text-zinc-400">已上传的入口</span><select className={control} value={asset.binding.platform} onChange={event => editBinding(asset, { platform: event.target.value as 'jimeng' | 'xiaoyunque', confirmed: false })}><option value="jimeng">即梦</option><option value="xiaoyunque">小云雀</option></select></label>
            <label className="block space-y-2"><span className="block text-xs text-zinc-400">引用素材类型</span><select className={control} value={asset.binding.mediaType} onChange={event => editBinding(asset, { mediaType: event.target.value as 'image' | 'video' | 'audio', confirmed: false })}><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option></select></label>
            <label className="block space-y-2"><span className="block text-xs text-zinc-400">当前平台实际序号</span><input type="number" min={1} max={99} step={1} className={control} value={asset.binding.slot} onChange={event => editBinding(asset, { slot: event.target.value, confirmed: false })} aria-describedby={`${id}-binding-help`} /></label>
          </div><label className="mt-3 flex min-h-11 items-start gap-3 text-sm leading-7 text-zinc-300"><input type="checkbox" className="mt-1.5 size-4 shrink-0 accent-amber-200" checked={asset.binding.confirmed} onChange={event => editBinding(asset, { confirmed: event.target.checked })} /><span>我已在所选平台实际上传或关联这个素材，并核对该引用类型与序号。</span></label></fieldset>
          <div className="sm:col-span-2"><button type="button" className={button} onClick={() => change({ ...draft, assets: draft.assets.filter(item => item.id !== asset.id) })}>移除素材 {index + 1}</button></div>
        </div>
      </details>)}
      <p id={`${id}-binding-help`} className="text-xs leading-6 text-zinc-400">未勾选确认时只保存待准备职责，不生成引用编号。勾选后仅在对应平台复制时输出实际引用；数量、格式与功能以你当前平台界面为准。</p>
      <div className="flex flex-wrap items-end gap-3"><button type="button" className={button} disabled={disabled || draft.assets.length >= 128} onClick={() => addAsset()}>添加制作素材</button>{candidates.length > 0 && <><label className="block min-w-0 flex-1 basis-56 space-y-2"><span className="block text-xs text-zinc-400">从待准备参考计划预填</span><select className={control} value={template} onChange={event => setTemplate(event.target.value)}><option value="">请选择一项已有参考计划</option>{candidates.map(item => <option key={item.value} value={item.value}>{item.shotNumber} · {item.assetName} · {DIRECTOR_REFERENCE_LABELS[item.role]}</option>)}</select></label><button type="button" className={button} disabled={disabled || !template || draft.assets.length >= 128} onClick={() => { const item = candidates.find(item => item.value === template); if (item) addAsset(item); }}>按计划添加</button></>}</div>
    </fieldset>
    <fieldset disabled={disabled} aria-describedby={errorId} className="mt-6 min-w-0 space-y-4"><legend className="text-sm font-medium text-zinc-200">场景光色卡</legend><p className="text-xs leading-6 text-zinc-400">每个地点一张，至少填写一项；其余可留空。继承剧本与用户风格，不强制固定配色比例。</p>
      {draft.sceneLooks.map((look, index) => <details key={index} open className="rounded-xl border border-white/10 p-3 sm:p-4"><summary className="min-h-11 cursor-pointer rounded-lg py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">{look.scene} · 光色设定</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="block space-y-2 sm:col-span-2"><span className="block text-sm text-zinc-300">地点原名</span><select className={control} value={look.scene} onChange={event => change({ ...draft, sceneLooks: draft.sceneLooks.map((item, current) => current === index ? { ...item, scene: event.target.value } : item) })}>{project.understanding.scenes.map(scene => <option key={scene.name} value={scene.name} disabled={draft.sceneLooks.some((item, current) => current !== index && item.scene === scene.name)}>{scene.name}</option>)}</select></label>{lookFields.map(field => <Text key={field.key} label={field.label} value={look[field.key]} onChange={value => change({ ...draft, sceneLooks: draft.sceneLooks.map((item, current) => current === index ? { ...item, [field.key]: value } : item) })} disabled={disabled} multiline placeholder={field.placeholder} errorId={errorId} />)}<div className="sm:col-span-2"><button type="button" className={button} onClick={() => change({ ...draft, sceneLooks: draft.sceneLooks.filter((_, current) => current !== index) })}>移除 {look.scene} 光色卡</button></div></div></details>)}
      <button type="button" className={button} disabled={disabled || !availableScenes.length || draft.sceneLooks.length >= 128} onClick={() => { if (!availableScenes[0]) return; change({ ...draft, sceneLooks: [...draft.sceneLooks, { scene: availableScenes[0], mainLight: '', quality: '', environmentColor: '', subjectColor: '', accentColor: '', contrast: '', allowedChanges: '' }] }); }}>添加场景光色卡</button>
    </fieldset>
    <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-4"><button type="button" disabled={disabled || !dirty || conflict} onClick={save} className={button + ' border-amber-200/40 text-amber-100'}>保存制作资料</button><button type="button" disabled={disabled || !dirty} onClick={cancel} className={button}>取消本地修改</button></div>
  </details>;
}
