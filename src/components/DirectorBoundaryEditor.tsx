import React, { useEffect, useId, useRef, useState } from 'react';
import type { DirectorShot } from '../lib/autoDirector';
import {
  DIRECTOR_STATE_FIELDS, DIRECTOR_STATE_LABELS, compareDirectorBoundaries, validateDirectorBoundary,
  type DirectorShotBoundary, type DirectorStateItem,
} from '../lib/directorProduction';

const control = 'min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:opacity-50';
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:cursor-not-allowed disabled:opacity-50';
interface Props { shot: DirectorShot; previous?: DirectorShot; next?: DirectorShot; disabled: boolean; onSave: (boundary: DirectorShotBoundary) => void; onDirtyChange?: (dirty: boolean) => void }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const empty = (): DirectorShotBoundary => ({ start: [], end: [] });

export default function DirectorBoundaryEditor({ shot, previous, next, disabled, onSave, onDirtyChange }: Props) {
  const id = useId();
  const incomingBoundary = (shot as DirectorShot & { boundary?: DirectorShotBoundary }).boundary;
  const incomingKey = JSON.stringify({ boundary: incomingBoundary, source: shot.sourceExcerpt });
  const [baseKey, setBaseKey] = useState(incomingKey);
  const [baseDraft, setBaseDraft] = useState(() => clone(incomingBoundary || empty()));
  const [draft, setDraft] = useState(() => clone(incomingBoundary || empty()));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseDraft);
  const conflict = dirty && incomingKey !== baseKey;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const callbackRef = useRef(onDirtyChange); callbackRef.current = onDirtyChange;
  useEffect(() => { callbackRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => { if (!dirtyRef.current) callbackRef.current?.(false); }, []);
  useEffect(() => {
    if (!dirtyRef.current) { const current = clone(incomingBoundary || empty()); setDraft(current); setBaseDraft(current); setBaseKey(incomingKey); setError(''); }
  }, [incomingKey]);
  const change = (value: DirectorShotBoundary) => { setDraft(value); setError(''); setNotice(''); };
  const edit = (side: 'start' | 'end', index: number, updates: Partial<DirectorStateItem>) => change({ ...draft, [side]: draft[side].map((item, current) => current === index ? { ...item, ...updates } : item) });
  const save = () => {
    try {
      if (baseKey !== incomingKey) throw new Error('已保存状态或本镜原文发生变化，本地修改已保留。请先核对，取消后再基于当前版本编辑。');
      const value = validateDirectorBoundary(draft, shot.sourceExcerpt, shot.charactersInvolved)!;
      onSave(value); setDraft(clone(value)); setBaseDraft(clone(value)); setError(''); setNotice('起止状态已保存，当前和相邻镜头的提示词需要更新。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '起止状态无法保存，请核对填写内容。'); }
  };
  const cancel = () => { const current = clone(incomingBoundary || empty()); setDraft(current); setBaseDraft(current); setBaseKey(incomingKey); setError(''); setNotice('已取消本地修改，恢复当前已保存状态。'); };
  const current = { ...shot, boundary: draft };
  const comparisons = [
    ...compareDirectorBoundaries(previous, current).map(item => ({ ...item, side: '前镜 → 本镜' })),
    ...compareDirectorBoundaries(current, next).map(item => ({ ...item, side: '本镜 → 后镜' })),
  ];
  const errorId = error ? `${id}-error` : undefined;
  return <details className="mt-4 rounded-xl border border-white/10 p-3 sm:p-4">
    <summary className="min-h-11 cursor-pointer rounded-lg py-2 text-sm font-medium text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">起止状态与相邻承接{dirty && <span className="ml-2 text-xs text-amber-200">有未保存修改</span>}</summary>
    <p className="mt-2 text-xs leading-6 text-zinc-400">按需要记录人物站位、持物与未完成动作。原文事实填写逐字依据；补充设计与人工确认分开标记。没有记录的内容保持未知。</p>
    {disabled && <p className="mt-2 text-xs leading-6 text-zinc-400">当前镜头暂时不能编辑；完成制作或恢复对应草案后可修改。</p>}
    {conflict && <p role="alert" className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-sm leading-7 text-amber-100">本镜原文或已保存状态已变化。你的修改已保留，不能直接覆盖新版本；核对后可取消本地修改，再编辑当前版本。</p>}
    {error && <p id={errorId} role="alert" className="mt-3 rounded-xl border border-red-300/30 p-3 text-sm leading-7 text-red-200">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm leading-7 text-zinc-300">{notice}</p>}
    <details className="mt-3 border-y border-white/10 py-1"><summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-xs text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">核对本镜原文</summary><p className="whitespace-pre-wrap py-3 text-sm leading-7 text-zinc-300">{shot.sourceExcerpt}</p></details>
    <datalist id={`${id}-subjects`}>{shot.charactersInvolved.map(name => <option key={name} value={name} />)}<option value={shot.scene} /></datalist>
    {(['start', 'end'] as const).map(side => <fieldset key={side} disabled={disabled} aria-describedby={errorId} aria-invalid={error ? true : undefined} className="mt-5 min-w-0 space-y-3">
      <legend className="text-sm font-medium text-zinc-200">{side === 'start' ? '开始时' : '结束时'} · {draft[side].length} 项</legend>
      {!draft[side].length && <p className="text-xs leading-6 text-zinc-400">尚未记录，按当前镜头需要添加即可。</p>}
      {draft[side].map((item, index) => <fieldset key={index} className="min-w-0 rounded-xl border border-white/10 p-3"><legend className="px-1 text-xs text-zinc-400">状态 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-2"><span className="block text-xs text-zinc-300">主体 · 必填</span><input required list={`${id}-subjects`} className={control} value={item.subject} maxLength={1500} onChange={event => edit(side, index, { subject: event.target.value })} placeholder="角色原名、具体道具或光源" aria-describedby={errorId} /></label>
        <label className="block space-y-2"><span className="block text-xs text-zinc-300">状态类型</span><select className={control} value={item.field} onChange={event => edit(side, index, { field: event.target.value as DirectorStateItem['field'] })}>{DIRECTOR_STATE_FIELDS.map(field => <option key={field} value={field}>{DIRECTOR_STATE_LABELS[field]}</option>)}</select></label>
        <label className="block space-y-2 sm:col-span-2"><span className="block text-xs text-zinc-300">可观察到的状态 · 必填</span><textarea aria-label="可观察到的状态" required rows={2} className={control + ' resize-y leading-7'} value={item.value} maxLength={1500} onChange={event => edit(side, index, { value: event.target.value })} placeholder="例如右手握着旧钥匙，钥匙没有换手" aria-describedby={errorId} /></label>
        <label className="block space-y-2"><span className="block text-xs text-zinc-300">依据类型</span><select className={control} value={item.provenance} onChange={event => edit(side, index, { provenance: event.target.value as DirectorStateItem['provenance'] })}><option value="design">设计建议</option><option value="source">原文事实</option><option value="confirmed">人工已确认</option></select><span className="block text-xs leading-6 text-zinc-400">人工确认由你核对后选择；不会将 AI 建议自动标为事实。</span></label>
        <label className="block space-y-2"><span className="block text-xs text-zinc-300">逐字原文依据{item.provenance === 'source' ? ' · 必填' : '（可选）'}</span><textarea aria-label="逐字原文依据" rows={2} required={item.provenance === 'source'} className={control + ' resize-y leading-7'} value={item.sourceExcerpt} maxLength={1500} onChange={event => edit(side, index, { sourceExcerpt: event.target.value })} placeholder="复制本镜原文中的连续文字" aria-describedby={errorId} /></label>
        <div className="sm:col-span-2"><button type="button" className={button} onClick={() => change({ ...draft, [side]: draft[side].filter((_, current) => current !== index) })}>移除状态 {index + 1}</button></div>
      </div></fieldset>)}
      <button type="button" disabled={disabled || draft[side].length >= 32} className={button} onClick={() => change({ ...draft, [side]: [...draft[side], { subject: shot.charactersInvolved[0] || '', field: 'position', value: '', provenance: 'design', sourceExcerpt: '' }] })}>添加{side === 'start' ? '起始' : '结束'}状态</button>
    </fieldset>)}
    <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs leading-6 text-zinc-400">相邻核对只比较同一场景的记录。文字不同只是提醒，不自动认定冲突，也不将同义词擅自合并。</p>{comparisons.length ? <ul className="mt-3 space-y-3">{comparisons.map((item, index) => <li key={index} className="rounded-xl border border-amber-200/20 p-3 text-sm leading-7 text-zinc-300"><p className="text-xs text-amber-100">{item.side} · {item.subject} · {DIRECTOR_STATE_LABELS[item.field]}</p><p>{item.message}</p><dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-zinc-400">前段结束</dt><dd className="whitespace-pre-wrap text-zinc-300">{item.previousValue}</dd></div><div><dt className="text-zinc-400">后段开始</dt><dd className="whitespace-pre-wrap text-zinc-300">{item.nextValue || '未记录'}</dd></div></dl></li>)}</ul> : <p className="mt-2 text-xs leading-6 text-zinc-400">没有可提示的相邻文字差异；这不代表成片连续性已通过验收。</p>}</div>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={disabled || !dirty || conflict} className={button + ' border-amber-200/40 text-amber-100'} onClick={save}>保存起止状态</button><button type="button" disabled={disabled || !dirty} className={button} onClick={cancel}>取消本地修改</button></div>
  </details>;
}
