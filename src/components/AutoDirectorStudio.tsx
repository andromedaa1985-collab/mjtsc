import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, ArrowRight, BookOpen, Check, Clapperboard, Copy, Download, FileText, Pause, RotateCcw, Settings2, Upload, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { readScriptFile } from '../lib/scriptFiles';
import {
  runAutoDirector, regenerateDirectorShot, validateDirectorProject, validateDirectorCheckpoint, validateDirectorSettings, exportDirectorMarkdown,
  type DirectorProject, type DirectorCheckpoint, type DirectorSettings, type DirectorProgress, type DirectorShot,
} from '../lib/autoDirector';

const MAX_SCRIPT_LENGTH = 30_000;
const controlClass = 'min-h-11 rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:opacity-50';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:cursor-not-allowed disabled:opacity-50';

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function CopyText({ text, label, disabled = false, onStatus }: { text: string; label: string; disabled?: boolean; onStatus: (message: string) => void }) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copied = copiedText === text;
  return (
    <button type="button" disabled={disabled || !text.trim()} className={secondaryButtonClass} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedText(text);
        onStatus(label + '已复制。');
      } catch {
        onStatus('浏览器未允许复制，请选中文字后手动复制。');
      }
    }}>
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {copied ? '已复制' : label}
    </button>
  );
}

function TextField({ label, value, onChange, disabled, rows = 3, hint }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; rows?: number; hint?: string }) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-zinc-300">{label}</span>
      <textarea aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} rows={rows} className={cn(controlClass, 'w-full resize-y leading-7')} />
      {hint && <span className="block text-pretty text-xs leading-5 text-zinc-500">{hint}</span>}
    </label>
  );
}

function ScriptPanel({ script, onScriptChange, busy, reading, onFile, children }: {
  script: string; onScriptChange: (script: string) => void; busy: boolean; reading: boolean;
  onFile: (file: File) => void; children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <section className="min-w-0" aria-labelledby="director-script-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="director-script-title" className="flex items-center gap-2 text-base font-semibold"><FileText className="size-4 text-zinc-400" aria-hidden="true" />你的故事</h2>
        <span className={cn('text-xs tabular-nums', script.length > MAX_SCRIPT_LENGTH ? 'text-red-300' : 'text-zinc-500')}>{script.length.toLocaleString()} / 30,000 字</span>
      </div>
      <div className={cn('overflow-hidden rounded-2xl border bg-zinc-950', dragging ? 'border-amber-300/60 bg-amber-300/5' : 'border-white/15')}
        onDragOver={event => {
          if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); if (!busy) setDragging(true); }
        }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          if (!busy && event.dataTransfer.files?.[0]) onFile(event.dataTransfer.files[0]);
        }}>
        <label htmlFor="director-script" className="sr-only">粘贴剧本或故事</label>
        <textarea id="director-script" value={script} onChange={event => onScriptChange(event.target.value)} disabled={busy}
          placeholder="粘贴你的剧本、小说片段或故事大纲。&#10;&#10;人物、动作、对白越清楚，分镜越容易贴近你的想法。"
          className="min-h-80 w-full resize-y bg-transparent px-5 py-5 text-sm leading-8 text-zinc-200 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300/50 disabled:opacity-60"
          aria-describedby="director-script-help" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <input ref={fileInput} type="file" accept=".txt,.md,.docx" disabled={busy} className="hidden" aria-label="选择剧本文件"
            onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className={secondaryButtonClass}>
            <Upload className="size-4" aria-hidden="true" />{reading ? '正在读取文件…' : '导入剧本'}
          </button>
          <p id="director-script-help" className="text-xs leading-5 text-zinc-500">{dragging ? '松开文件，导入剧本' : 'TXT / MD / DOCX · 最大 5 MB'}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function AssetNotes({ title, items }: { title: string; items: Array<{ name: string; description: string; prompt?: string }>; }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold text-zinc-300">{title}<span className="ml-2 text-xs font-normal tabular-nums text-zinc-500">{items.length}</span></h3>
      <div className="divide-y divide-white/10">
        {items.map((item, index) => (
          <details key={item.name + '-' + index} className="py-3">
            <summary className="cursor-pointer rounded-lg text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50">
              <span className="ml-1">{item.name}</span>
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-pretty text-sm leading-7 text-zinc-400">{item.description}</p>
            {item.prompt && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-900 p-3 text-sm leading-7 text-zinc-300">{item.prompt}</p>}
          </details>
        ))}
        {!items.length && <p className="py-3 text-sm text-zinc-500">剧本未提供明确的{title}。</p>}
      </div>
    </section>
  );
}

type Generate = (prompt: string, isJson: boolean, signal?: AbortSignal) => Promise<string>;

export interface AutoDirectorStudioProps {
  script: string;
  onScriptChange: (script: string) => void;
  project: DirectorProject | null;
  onProjectChange: (project: DirectorProject | null) => void;
  checkpoint: DirectorCheckpoint | null;
  onCheckpointChange: (checkpoint: DirectorCheckpoint | null) => void;
  settings: DirectorSettings;
  onSettingsChange: (settings: DirectorSettings) => void;
  generate: Generate;
}

type DirectorSnapshot = Pick<AutoDirectorStudioProps, 'script' | 'settings' | 'project' | 'checkpoint'>;
function validateSavedSnapshot(value: unknown): DirectorSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('这份文件不是可恢复的创作项目。');
  const data = value as Record<string, unknown>;
  if (data.format !== 'cineprompt-auto-director') {
    const project = validateDirectorProject(value);
    return { script: project.sourceScript, settings: project.settings, project, checkpoint: null };
  }
  if (data.version !== 1 || typeof data.script !== 'string' || data.script.length > MAX_SCRIPT_LENGTH) throw new Error('保存的剧本格式或版本不正确。');
  return {
    script: data.script, settings: validateDirectorSettings(data.settings),
    project: data.project === null ? null : validateDirectorProject(data.project),
    checkpoint: data.checkpoint === null ? null : validateDirectorCheckpoint(data.checkpoint),
  };
}

const steps = [
  { id: 'analysis', label: '阅读原文' },
  { id: 'understanding', label: '整理故事与设定' },
  { id: 'storyboard', label: '编排分镜' },
  { id: 'prompts', label: '编写逐镜提示词' },
];

type ShotDraft = { action: string; camera: string; continuity: string; durationSeconds: string };
const shotDraft = (shot: DirectorShot): ShotDraft => ({ action: shot.action, camera: shot.camera, continuity: shot.continuity, durationSeconds: String(shot.durationSeconds) });
const shotFingerprint = (shot: DirectorShot) => JSON.stringify([shot.sourceExcerpt, shot.action, shot.camera, shot.continuity, shot.durationSeconds]);
const isDirty = (draft: ShotDraft, shot: DirectorShot) => draft.action !== shot.action || draft.camera !== shot.camera || draft.continuity !== shot.continuity || draft.durationSeconds !== String(shot.durationSeconds);

function sameSettings(first: DirectorSettings, second: DirectorSettings) {
  return (['platform', 'visualStyle', 'aspectRatio', 'rhythm', 'lighting', 'sound'] as const)
    .every(key => first[key] === second[key]);
}

function SettingsForm({ settings, onChange, disabled }: { settings: DirectorSettings; onChange: (settings: DirectorSettings) => void; disabled: boolean }) {
  const update = <K extends keyof DirectorSettings>(key: K, value: DirectorSettings[K]) => onChange({ ...settings, [key]: value });
  return (
    <details className="mt-5 border-y border-white/10 py-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50">
        <Settings2 className="size-4 text-zinc-500" aria-hidden="true" />创作设置
        <span className="ml-auto text-xs text-zinc-500">{settings.platform === 'jimeng' ? '即梦' : '小云雀'} · {settings.aspectRatio}</span>
      </summary>
      <div className="grid gap-4 py-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm text-zinc-400">
          <span className="block">目标工具</span>
          <select value={settings.platform} onChange={event => update('platform', event.target.value as DirectorSettings['platform'])} disabled={disabled} className={cn(controlClass, 'w-full')}>
            <option value="jimeng">即梦</option><option value="xiaoyunque">小云雀</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-zinc-400">
          <span className="block">画幅</span>
          <select value={settings.aspectRatio} onChange={event => update('aspectRatio', event.target.value as DirectorSettings['aspectRatio'])} disabled={disabled} className={cn(controlClass, 'w-full')}>
            <option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏</option><option value="1:1">1:1 方形</option><option value="4:3">4:3</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-zinc-400 sm:col-span-2">
          <span className="block">视觉风格</span>
          <input value={settings.visualStyle} onChange={event => update('visualStyle', event.target.value)} disabled={disabled} className={cn(controlClass, 'w-full')} placeholder="例如：写实古装，粗布与木构材质清楚" />
        </label>
        <label className="space-y-2 text-sm text-zinc-400">
          <span className="block">叙事节奏</span>
          <select value={settings.rhythm} onChange={event => update('rhythm', event.target.value as DirectorSettings['rhythm'])} disabled={disabled} className={cn(controlClass, 'w-full')}>
            <option value="balanced">兼顾对白与动作</option><option value="dialogue">人物与对白优先</option><option value="action">动作推进优先</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-zinc-400">
          <span className="block">光色方向</span>
          <input value={settings.lighting} onChange={event => update('lighting', event.target.value)} disabled={disabled} className={cn(controlClass, 'w-full')} placeholder="沿用故事中的时间与光源" />
        </label>
        <label className="space-y-2 text-sm text-zinc-400 sm:col-span-2">
          <span className="block">声音方向</span>
          <input value={settings.sound} onChange={event => update('sound', event.target.value)} disabled={disabled} className={cn(controlClass, 'w-full')} placeholder="原对白、动作音与环境音" />
        </label>
      </div>
      <p className="mb-2 text-pretty text-xs leading-6 text-zinc-500">这里生成可复制的创作提示词。将提示词带到所选工具后，再设置时长、上传参考素材并生成视频。</p>
    </details>
  );
}

function ShotRow({ shot, draft, initialOpen, disabled, working, stopping, dirty, canRegenerate, canCancel, error, onStop, onEdit, onSave, onCancel, onRegenerate, onStatus }: {
  shot: DirectorShot; initialOpen: boolean; disabled: boolean; working: boolean;
  draft: ShotDraft; dirty: boolean; canRegenerate: boolean; canCancel: boolean;
  stopping: boolean; error?: string; onStop: () => void;
  onEdit: (shotId: string, field: keyof ShotDraft, value: string) => void;
  onSave: (shotId: string) => void; onCancel: (shotId: string) => void;
  onRegenerate: (shotId: string) => void;
  onStatus: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(initialOpen);
  return (
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="border-b border-white/10 py-4">
      <summary className="cursor-pointer rounded-lg text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">
        <span className="ml-1 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 align-middle">
          <span className="font-mono text-sm tabular-nums text-zinc-500">{String(shot.shotNumber).padStart(2, '0')}</span>
          <span className="font-medium">{shot.scene}</span>
          <span className="text-xs tabular-nums text-zinc-500">{shot.durationSeconds} 秒</span>
          <span className={cn('text-xs', shot.masterPrompt && !dirty ? 'text-zinc-400' : 'text-amber-200')}>{dirty ? '修改未保存' : shot.masterPrompt ? '提示词就绪' : '待生成提示词'}</span>
        </span>
      </summary>
      {!expanded && <p className="mt-2 line-clamp-2 pl-5 text-sm leading-7 text-zinc-500">{shot.action}</p>}
      <div className="space-y-5 pt-5">
        <p className="text-xs leading-6 text-zinc-500">出场人物：{shot.charactersInvolved.join('、') || '无人出场'}</p>
        <div className="grid gap-5 xl:grid-cols-2">
          <TextField label="画面动作" value={draft.action} onChange={value => onEdit(shot.id, 'action', value)} disabled={disabled} rows={4} />
          <TextField label="镜头观察与运镜" value={draft.camera} onChange={value => onEdit(shot.id, 'camera', value)} disabled={disabled} rows={4} />
          <TextField label="承接与结束状态" value={draft.continuity} onChange={value => onEdit(shot.id, 'continuity', value)} disabled={disabled} rows={3} />
          <div className="space-y-4">
            <label className="block space-y-2 text-sm text-zinc-300">
              <span className="block">片段时长</span>
              <span className="flex items-center gap-2"><input aria-label={'第 ' + shot.shotNumber + ' 镜时长'} type="number" min={4} max={30} step={1} value={draft.durationSeconds} disabled={disabled} onChange={event => onEdit(shot.id, 'durationSeconds', event.target.value)} className={cn(controlClass, 'w-24 tabular-nums')} /><span className="text-zinc-500">秒</span></span>
            </label>
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-300">原文对白</p>
              <p className="whitespace-pre-wrap border-l-2 border-white/15 pl-3 text-sm leading-7 text-zinc-400">{shot.dialogue || '这一镜没有原文对白。'}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">对白来自原文。需要改台词时，先修改剧本再重新制作。</p>
            </div>
          </div>
        </div>
        {dirty && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
          <p className="flex-1 text-pretty text-xs leading-6 text-amber-100">修改尚未保存。保存后，本镜与必要的相邻镜承接提示词会标记为待更新。</p>
          <button type="button" disabled={disabled} className={secondaryButtonClass} onClick={() => onSave(shot.id)}><Check className="size-4" aria-hidden="true" />保存修改</button>
          <button type="button" disabled={!canCancel} className={secondaryButtonClass} onClick={() => onCancel(shot.id)}>取消修改</button>
        </div>}
        {error && <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/5 p-3 text-pretty text-sm leading-7 text-red-200">{error}</p>}
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">对照原文</summary>
          <p className="whitespace-pre-wrap border-l-2 border-white/10 pl-3 text-sm leading-7 text-zinc-400">{shot.sourceExcerpt}</p>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <h3 className="text-sm font-semibold">这一镜的提示词</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} disabled={!canRegenerate} onClick={() => onRegenerate(shot.id)}>
              <RotateCcw className="size-4" aria-hidden="true" />{working ? '正在重做这一镜…' : shot.masterPrompt ? '重做本镜提示词' : '生成这一镜提示词'}
            </button>
            {working && <button type="button" className={secondaryButtonClass} disabled={stopping} onClick={onStop}><Pause className="size-4" aria-hidden="true" />{stopping ? '正在停止…' : '停止'}</button>}
            <CopyText text={shot.masterPrompt} label="复制提示词" disabled={dirty} onStatus={onStatus} />
          </div>
        </div>
        {shot.masterPrompt ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-zinc-950 px-4 py-4 font-sans text-sm leading-8 text-zinc-300">{shot.masterPrompt}</pre>
        ) : (
          <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-7 text-amber-100">分镜修改后，旧提示词已停用。点击「生成这一镜提示词」即可按最新内容重做。</p>
        )}
        {!!shot.referencePlan.length && (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">参考素材（待准备）</summary>
            <p className="mt-1 text-xs leading-6 text-zinc-500">下面是素材使用建议，尚未上传到视频工具。</p>
            <ul className="space-y-3 pl-4 pt-2">
              {shot.referencePlan.map((reference, index) => <li key={reference.assetName + index} className="text-sm leading-7 text-zinc-400"><strong className="font-medium text-zinc-200">{reference.assetName}</strong><span className="ml-2 text-xs text-zinc-500">{({ character: '人物', scene: '场景', action: '动作', voice: '音色' })[reference.role]}</span>：{reference.instruction}{reference.exclusions && <span className="block text-zinc-500">不使用：{reference.exclusions}</span>}</li>)}
            </ul>
          </details>
        )}
        {!!shot.postProductionNotes.length && <div className="text-sm"><h4 className="mb-2 font-medium text-zinc-400">制作后检查</h4><ul className="list-disc space-y-1 pl-5 text-pretty leading-7 text-zinc-500">{shot.postProductionNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
        {!!shot.qaWarnings.length && <ul className="space-y-2 text-pretty text-xs leading-6 text-amber-100/80">{shot.qaWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      </div>
    </details>
  );
}

export default function AutoDirectorStudio(props: AutoDirectorStudioProps) {
  const { script, onScriptChange, project, onProjectChange, checkpoint, onCheckpointChange, settings, onSettingsChange, generate } = props;
  const [pending, setPending] = useState<{ kind: 'project' | 'shot'; shotId?: string } | null>(null);
  const [progress, setProgress] = useState<DirectorProgress | null>(null);
  const [reading, setReading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shotError, setShotError] = useState<{ shotId: string; message: string } | null>(null);
  const [shotDrafts, setShotDrafts] = useState<Record<string, { source: string; values: ShotDraft }>>({});
  const [importedSnapshot, setImportedSnapshot] = useState<DirectorSnapshot | null>(null);
  const [restoreSnapshot, setRestoreSnapshot] = useState<DirectorSnapshot | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const readingRef = useRef(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const latest = useRef(props);
  latest.current = props;
  const busy = pending !== null || reading;
  const canResume = !!checkpoint && checkpoint.sourceScript === script && sameSettings(checkpoint.settings, settings);
  const sourceChanged = !!project && (project.sourceScript !== script || !sameSettings(project.settings, settings));
  const displayProject = project || (checkpoint?.understanding ? { version: 1 as const, sourceScript: checkpoint.sourceScript, settings: checkpoint.settings, understanding: checkpoint.understanding, shots: checkpoint.shots } : null);
  const readyPrompts = displayProject?.shots.filter(shot => !!shot.masterPrompt.trim()).length || 0;
  const canEdit = !!project && !busy && !sourceChanged;
  const getShotDraft = (shot: DirectorShot): ShotDraft => shotDrafts[shot.id]?.source === shotFingerprint(shot) ? shotDrafts[shot.id].values : shotDraft(shot);
  const hasUnsavedChanges = !!project?.shots.some(shot => isDirty(getShotDraft(shot), shot));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; operation.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  const importScript = async (file: File) => {
    if (operation.current || readingRef.current || hasUnsavedChanges) return;
    readingRef.current = true;
    setReading(true); setError(''); setNotice('');
    try {
      const content = await readScriptFile(file);
      if (mounted.current) { latest.current.onScriptChange(content); setNotice('剧本已导入。点击主按钮开始制作。'); }
    } catch (error) { if (mounted.current) setError(messageFrom(error, '剧本读取失败，请检查文件。')); }
    finally { readingRef.current = false; if (mounted.current) setReading(false); }
  };

  const run = async (resume: boolean) => {
    if (operation.current || readingRef.current) return;
    if (hasUnsavedChanges) { setError('请先保存或取消分镜修改，再开始制作。'); return; }
    if (!script.trim()) { setError('先粘贴或导入一份剧本。'); return; }
    if (script.length > MAX_SCRIPT_LENGTH) { setError('剧本超过 30,000 字，请按章节拆分后制作。'); return; }
    const controller = new AbortController();
    const runNumber = ++sequence.current;
    operation.current = controller;
    setPending({ kind: 'project' }); setProgress(null); setStopping(false); setError(''); setNotice(''); setShotError(null);
    try {
      const result = await runAutoDirector({
        script, settings, generate, signal: controller.signal,
        ...(resume && checkpoint ? { checkpoint } : {}),
        onProgress: value => { if (mounted.current && sequence.current === runNumber) setProgress(value); },
        onCheckpoint: value => { if (mounted.current && sequence.current === runNumber) latest.current.onCheckpointChange(value); },
      });
      if (controller.signal.aborted) throw new DOMException('生成已停止', 'AbortError');
      if (!mounted.current || sequence.current !== runNumber) return;
      if (latest.current.script !== script || !sameSettings(latest.current.settings, settings)) throw new Error('原文或创作设置已经改变，本次结果没有替换当前项目。');
      latest.current.onProjectChange(result);
      latest.current.onCheckpointChange(null);
      setNotice('创作草案已完成。可以修改分镜、复制提示词，或导出整份项目。');
    } catch (error) {
      if (mounted.current && sequence.current === runNumber) {
        if (controller.signal.aborted) setNotice('已停止，完成的步骤已保留。可从中断处继续。');
        else setError(messageFrom(error, '本次制作没有完成，已保留进度和原有结果。请重试。'));
      }
    } finally {
      if (sequence.current === runNumber) { operation.current = null; if (mounted.current) { setPending(null); setStopping(false); } }
    }
  };

  const editShot = (shotId: string, field: keyof ShotDraft, value: string) => {
    if (!project || operation.current || readingRef.current || sourceChanged) return;
    const shot = project.shots.find(item => item.id === shotId);
    if (!shot) return;
    setShotDrafts(current => ({ ...current, [shotId]: { source: shotFingerprint(shot), values: { ...getShotDraft(shot), [field]: value } } }));
    if (shotError?.shotId === shotId) setShotError(null);
  };

  const cancelShotEdit = (shotId: string) => {
    if (operation.current || readingRef.current) return;
    setShotDrafts(current => { const next = { ...current }; delete next[shotId]; return next; });
    if (shotError?.shotId === shotId) setShotError(null);
  };

  const saveShotEdit = (shotId: string) => {
    if (!project || operation.current || readingRef.current || sourceChanged) return;
    const index = project.shots.findIndex(shot => shot.id === shotId);
    const original = project.shots[index];
    if (!original) return;
    const draft = getShotDraft(original);
    try {
      const values = { action: draft.action.trim(), camera: draft.camera.trim(), continuity: draft.continuity.trim(), durationSeconds: Number(draft.durationSeconds) };
      const affectsNeighbors = values.action !== original.action || values.camera !== original.camera || values.continuity !== original.continuity;
      const candidate = { ...project, shots: project.shots.map((shot, shotIndex) => {
        if (shotIndex !== index && (!affectsNeighbors || Math.abs(shotIndex - index) !== 1)) return shot;
        return { ...shot, ...(shotIndex === index ? values : {}), masterPrompt: '', postProductionNotes: [], referencePlan: [],
          qaWarnings: [shotIndex === index ? '分镜已修改，提示词待重新生成。' : '相邻镜的承接内容已调整，提示词待重新生成。'] };
      }) };
      const validated = validateDirectorProject(candidate);
      onProjectChange(validated);
      cancelShotEdit(shotId);
      setNotice(affectsNeighbors ? '分镜修改已保存。本镜及相邻镜的承接提示词需要更新。' : '时长修改已保存，请重新生成这一镜的提示词。');
    } catch (error) { setShotError({ shotId, message: messageFrom(error, '修改未保存，请检查动作、运镜、承接和时长。') }); }
  };

  const regenerate = async (shotId: string) => {
    if (!project || operation.current || readingRef.current) return;
    if (hasUnsavedChanges || sourceChanged) { setShotError({ shotId, message: '请先保存分镜修改，并确认上方原文与设置对应当前项目。' }); return; }
    const source = project;
    const controller = new AbortController();
    const runNumber = ++sequence.current;
    operation.current = controller;
    setPending({ kind: 'shot', shotId }); setStopping(false); setError(''); setNotice(''); setShotError(null);
    try {
      const result = await regenerateDirectorShot(source, shotId, generate, controller.signal);
      if (controller.signal.aborted) throw new DOMException('生成已停止', 'AbortError');
      if (!mounted.current || sequence.current !== runNumber) return;
      if (latest.current.project !== source) throw new Error('分镜已经更新，这次结果没有覆盖当前内容，请重试。');
      latest.current.onProjectChange(result);
      setNotice('这一镜的提示词已更新。相邻镜如标记待更新，可继续逐镜重做。');
    } catch (error) {
      if (mounted.current && sequence.current === runNumber) {
        if (controller.signal.aborted) setNotice('已停止重做，原有结果仍保留。');
        else setShotError({ shotId, message: messageFrom(error, '这一镜暂时没有完成，原有结果仍保留。') });
      }
    } finally {
      if (sequence.current === runNumber) { operation.current = null; if (mounted.current) { setPending(null); setStopping(false); } }
    }
  };

  const restoreFromFile = async (file: File) => {
    if (operation.current || readingRef.current || hasUnsavedChanges) return;
    readingRef.current = true; setReading(true); setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('项目文件超过 5 MB，请检查文件是否正确。');
      const restored = validateSavedSnapshot(JSON.parse(await file.text()));
      if (mounted.current) setImportedSnapshot(restored);
    } catch (error) { if (mounted.current) setError(messageFrom(error, '这份文件不是可恢复的创作项目。')); }
    finally { readingRef.current = false; if (mounted.current) setReading(false); }
  };

  const applyRestore = () => {
    if (!importedSnapshot || busy) return;
    setRestoreSnapshot({ script, settings, project, checkpoint });
    onScriptChange(importedSnapshot.script); onSettingsChange(importedSnapshot.settings);
    onProjectChange(importedSnapshot.project); onCheckpointChange(importedSnapshot.checkpoint);
    setImportedSnapshot(null); setProgress(null); setError(''); setShotError(null); setShotDrafts({});
    setNotice('项目已恢复。需要时可撤销本次导入。');
  };

  const currentStep = progress?.stage === 'complete' ? steps.length : steps.findIndex(step => step.id === progress?.stage);
  const exportProject = (format: 'json' | 'md') => {
    try {
      if (hasUnsavedChanges) throw new Error('请先保存或取消分镜修改，再导出项目。');
      if (format === 'md' && !project) throw new Error('请继续完成这份草案后导出 Markdown。当前进度可以用「保存项目」备份。');
      const snapshot = { format: 'cineprompt-auto-director', version: 1, script, settings, project, checkpoint };
      const content = format === 'json' ? JSON.stringify({ ...snapshot, ...validateSavedSnapshot(snapshot) }, null, 2) : exportDirectorMarkdown(project!);
      downloadFile(content, 'CinePrompt-创作项目.' + format, format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8');
      setNotice(format === 'json' ? '项目已导出，之后可通过「恢复项目」打开。' : '整份创作草案已导出为 Markdown。');
    } catch (error) { setError(messageFrom(error, '项目暂时无法导出，请重试。')); }
  };

  return (
    <div className="mx-auto w-full max-w-6xl pb-12 text-zinc-100">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-6">
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-amber-200"><Clapperboard className="size-4" aria-hidden="true" />CinePrompt · 自动导演</p>
          <h1 className="text-balance text-3xl font-semibold sm:text-4xl">从一份剧本，到可用的分镜草案。</h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-7 text-zinc-400">贴入故事，一次整理故事理解、人物场景、分镜与逐镜提示词。你可以继续修改每一镜。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={restoreInput} type="file" accept=".json,application/json" className="hidden" disabled={busy} aria-label="选择已导出的创作项目" onChange={event => {
            const file = event.target.files?.[0]; if (file) void restoreFromFile(file); event.target.value = '';
          }} />
          <button type="button" disabled={busy || hasUnsavedChanges} onClick={() => restoreInput.current?.click()} className={secondaryButtonClass}><Upload className="size-4" aria-hidden="true" />恢复项目</button>
          {(script.trim() || displayProject || checkpoint) && <button type="button" disabled={busy || hasUnsavedChanges} onClick={() => exportProject('json')} className={secondaryButtonClass}><Download className="size-4" aria-hidden="true" />保存项目</button>}
        </div>
      </header>

      {(error || notice) && <div className="mb-6" aria-live="polite" aria-atomic="true">
        {error ? <p role="alert" className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-pretty text-sm leading-7 text-red-200"><AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></p>
          : <p role="status" className="text-pretty text-sm leading-7 text-zinc-300">{notice}</p>}
      </div>}
      {restoreSnapshot && !busy && <button type="button" disabled={hasUnsavedChanges} className={cn(secondaryButtonClass, 'mb-6')} onClick={() => {
        onScriptChange(restoreSnapshot.script); onSettingsChange(restoreSnapshot.settings); onProjectChange(restoreSnapshot.project); onCheckpointChange(restoreSnapshot.checkpoint);
        setRestoreSnapshot(null); setNotice('已恢复到导入前的内容。'); setError(''); setProgress(null); setShotDrafts({});
      }}><RotateCcw className="size-4" aria-hidden="true" />撤销项目导入</button>}

      <div className="grid items-start gap-8 xl:grid-cols-3 xl:gap-10">
        <div className={cn(displayProject ? 'xl:col-span-1' : 'xl:col-span-2')}>
          <ScriptPanel script={script} onScriptChange={onScriptChange} busy={busy || hasUnsavedChanges} reading={reading} onFile={file => { void importScript(file); }}>
            <SettingsForm settings={settings} onChange={onSettingsChange} disabled={busy || hasUnsavedChanges} />
            <div className="mt-5 space-y-3">
              <button type="button" disabled={busy || hasUnsavedChanges || !script.trim() || script.length > MAX_SCRIPT_LENGTH} onClick={() => { void run(false); }} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-amber-200 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50">
                <Clapperboard className="size-4" aria-hidden="true" />{pending?.kind === 'project' ? '正在制作创作草案…' : '自动生成分镜与提示词'}{!busy && <ArrowRight className="size-4" aria-hidden="true" />}
              </button>
              {checkpoint && !busy && <button type="button" disabled={!canResume || hasUnsavedChanges} onClick={() => { void run(true); }} className={cn(secondaryButtonClass, 'w-full')}><RotateCcw className="size-4" aria-hidden="true" />从中断处继续</button>}
              {hasUnsavedChanges && <p className="text-pretty text-xs leading-6 text-amber-100">有分镜修改尚未保存。请先在对应镜头保存或取消修改。</p>}
              {checkpoint && !canResume && !busy && <p className="text-pretty text-xs leading-6 text-zinc-500">原文或设置与上次不同。请开始新一轮，现有结果会保留。</p>}
              <p className="text-pretty text-xs leading-6 text-zinc-500">长剧本会分段处理。停止或遇到错误时，已完成的步骤会保留，可稍后继续。</p>
            </div>
          </ScriptPanel>
        </div>

        <div className={cn('min-w-0', displayProject ? 'xl:col-span-2' : 'xl:col-span-1')}>
          {(progress || pending || checkpoint) && <section className="mb-8 border-b border-white/10 pb-6" aria-label="制作进度">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{pending?.kind === 'shot' ? '正在更新单镜提示词' : pending ? '故事正在成为镜头' : checkpoint ? '已保留制作进度' : '创作草案已完成'}</h2>
              {pending && <button type="button" disabled={stopping} className={secondaryButtonClass} onClick={() => { operation.current?.abort(); setStopping(true); setNotice('正在停止，保留已完成的步骤…'); }}><Pause className="size-4" aria-hidden="true" />{stopping ? '正在停止…' : '停止生成'}</button>}
            </div>
            {pending?.kind !== 'shot' && <ol className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
              {steps.map((step, index) => <li key={step.id} aria-current={pending && index === currentStep ? 'step' : undefined} className={cn('flex items-center gap-2 leading-6', index === currentStep ? 'text-amber-200' : index < currentStep ? 'text-zinc-200' : 'text-zinc-500')}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current font-mono text-xs tabular-nums">{index < currentStep ? <Check className="size-3" aria-hidden="true" /> : index + 1}</span>{step.label}
              </li>)}
            </ol>}
            <p role="status" aria-live="polite" className="mt-4 text-pretty text-sm leading-7 text-zinc-400">{pending?.kind === 'shot' ? '按这一镜的新内容重新编写，其他镜头保持原样。' : progress?.message || '已经完成的步骤会从这里继续。'}{pending?.kind === 'project' && progress && progress.total > 0 && <span className="ml-2 font-mono text-xs tabular-nums text-zinc-500">{progress.completed} / {progress.total}</span>}</p>
            {checkpoint && !pending && <p className="mt-2 text-xs tabular-nums text-zinc-500">已保留 {checkpoint.shots.length} 镜，{checkpoint.completedPromptShotIds.length} 镜提示词。</p>}
          </section>}

          {!displayProject ? <section className="pt-2" aria-label="创作流程介绍">
            <h2 className="text-balance text-xl font-medium">先把故事讲清楚，<br className="hidden xl:block" />再让镜头各司其职。</h2>
            <ol className="mt-6 space-y-6 border-l border-white/10 pl-5">
              <li><h3 className="text-sm font-medium text-zinc-300">读懂故事</h3><p className="mt-1 text-pretty text-sm leading-7 text-zinc-500">保留原文剧情与对白，找出人物、场景和关键转折。</p></li>
              <li><h3 className="text-sm font-medium text-zinc-300">编排镜头</h3><p className="mt-1 text-pretty text-sm leading-7 text-zinc-500">按动作和对白分段，让位置、道具与前后状态衔接。</p></li>
              <li><h3 className="text-sm font-medium text-zinc-300">交给你继续创作</h3><p className="mt-1 text-pretty text-sm leading-7 text-zinc-500">每一镜都有可编辑的说明与提示词，可单独重做。</p></li>
            </ol>
          </section> : <div>
            {(sourceChanged || pending?.kind === 'project' || !!checkpoint || !project) && <p className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 text-pretty text-sm leading-7 text-zinc-400">{sourceChanged ? '下方保留上一份项目，与你刚调整的剧本或设置不同。重新生成后才会替换。' : project ? '下方是上一份完整草案，继续制作会使用已保留的进度，完成后再替换。' : '这是已保留的部分草案。继续制作后，即可编辑和逐镜重做。'}</p>}
            <section className="border-b border-white/10 pb-6" aria-labelledby="director-understanding-title">
              <h2 id="director-understanding-title" className="mb-4 flex items-center gap-2 text-lg font-semibold"><BookOpen className="size-4 text-zinc-400" aria-hidden="true" />故事理解</h2>
              <p className="whitespace-pre-wrap text-pretty text-sm leading-8 text-zinc-300">{displayProject.understanding.summary}</p>
              <p className="mt-4 whitespace-pre-wrap text-pretty text-sm leading-8 text-zinc-400">{displayProject.understanding.storyArc}</p>
              {!!displayProject.understanding.uncertainties.length && <details className="mt-4"><summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-sm text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">需要你确认的内容</summary><ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-zinc-400">{displayProject.understanding.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
              {!!displayProject.understanding.continuityRules.length && <details className="mt-2"><summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-sm text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">全片承接要点</summary><ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-zinc-400">{displayProject.understanding.continuityRules.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
            </section>
            <div className="grid gap-6 border-b border-white/10 py-6 sm:grid-cols-2">
              <AssetNotes title="人物" items={displayProject.understanding.characters} />
              <AssetNotes title="场景" items={displayProject.understanding.scenes} />
            </div>
            <section className="pt-7" aria-labelledby="director-shots-title">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div><h2 id="director-shots-title" className="text-lg font-semibold">分镜与提示词</h2><p className="mt-1 text-xs leading-6 tabular-nums text-zinc-500">{displayProject.shots.length} 镜 · {readyPrompts} 镜提示词就绪</p></div>
                <div className="flex flex-wrap gap-2">
                  <CopyText text={displayProject.shots.filter(shot => !!shot.masterPrompt.trim()).map(shot => '第 ' + shot.shotNumber + ' 镜 · ' + shot.scene + '\n' + shot.masterPrompt).join('\n\n')} label="复制全部提示词" disabled={hasUnsavedChanges} onStatus={setNotice} />
                  <button type="button" className={secondaryButtonClass} disabled={busy || hasUnsavedChanges || !project} onClick={() => exportProject('md')}><Download className="size-4" aria-hidden="true" />导出整份草案</button>
                </div>
              </div>
              <p className="mb-3 text-pretty text-xs leading-6 text-zinc-500">展开一镜修改并保存，再重做提示词。动作、运镜或承接变化时，相邻镜的提示词也需更新。</p>
              {displayProject.shots.map((shot, index) => <ShotRow key={shot.id} shot={shot} draft={getShotDraft(shot)} dirty={isDirty(getShotDraft(shot), shot)} initialOpen={index === 0} disabled={!canEdit} canRegenerate={canEdit && !hasUnsavedChanges} canCancel={!busy} working={pending?.shotId === shot.id} stopping={stopping} error={shotError?.shotId === shot.id ? shotError.message : undefined} onStop={() => { operation.current?.abort(); setStopping(true); }} onEdit={editShot} onSave={saveShotEdit} onCancel={cancelShotEdit} onRegenerate={shotId => { void regenerate(shotId); }} onStatus={setNotice} />)}
              {!displayProject.shots.length && <p className="py-6 text-sm text-zinc-500">分镜尚未完成，可从中断处继续制作。</p>}
            </section>
          </div>}
        </div>
      </div>

      <Dialog.Root open={!!importedSnapshot} onOpenChange={open => { if (!open) setImportedSnapshot(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75" />
          <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-6 text-zinc-100 shadow-2xl focus:outline-none sm:p-8" style={{ maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))' }}>
            <div className="flex items-start justify-between gap-4"><Dialog.Title className="text-balance text-xl font-semibold">恢复这份项目</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="关闭项目恢复窗口" className={cn(secondaryButtonClass, 'size-11 shrink-0 p-0')}><X className="size-4" aria-hidden="true" /></button></Dialog.Close></div>
            <Dialog.Description className="mt-3 text-pretty text-sm leading-7 text-zinc-400">将保存的剧本、创作设置、分镜和中断进度带回工作台。当前内容会暂时保留，导入后可撤销本次操作。</Dialog.Description>
            {importedSnapshot && <div className="my-5 border-y border-white/10 py-4"><p className="line-clamp-4 text-pretty text-sm leading-7 text-zinc-300">{importedSnapshot.project?.understanding.summary || importedSnapshot.checkpoint?.understanding?.summary || '这份项目保存了剧本与创作设置，可继续开始制作。'}</p><p className="mt-3 text-xs tabular-nums text-zinc-500">{(importedSnapshot.project?.shots || importedSnapshot.checkpoint?.shots || []).length} 镜 · {importedSnapshot.script.length.toLocaleString()} 字原文</p></div>}
            <button type="button" disabled={busy} onClick={applyRestore} className="mt-2 min-h-11 w-full rounded-xl bg-amber-200 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50">使用这份项目</button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
