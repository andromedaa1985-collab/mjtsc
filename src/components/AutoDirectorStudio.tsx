import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Clapperboard, Copy, Download, FileText, Pause, RotateCcw, Search, Settings2, Upload, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { readScriptFileWithInfo } from '../lib/scriptFiles';
import { commitDirectorShotEdit, createDirectorShotEdit, readDirectorShotEdit, rebaseDirectorShotEdit, type DirectorShotDraft, type DirectorShotEdit } from '../lib/directorEditing';
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
  onActivityChange?: (state: { busy: boolean; hasUnsavedChanges: boolean }) => void;
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

const SHOTS_PER_PAGE = 12;

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

function ShotRow({ shot, draft, initialOpen, focusToken, disabled, working, stopping, dirty, conflict, originChanged, canRegenerate, canCancel, error, onStop, onEdit, onSave, onCancel, onRebase, onRegenerate, onStatus }: {
  shot: DirectorShot; initialOpen: boolean; disabled: boolean; working: boolean;
  draft: DirectorShotDraft; dirty: boolean; conflict: boolean; originChanged: boolean; canRegenerate: boolean; canCancel: boolean; focusToken: number;
  stopping: boolean; error?: string; onStop: () => void;
  onEdit: (shotId: string, field: keyof DirectorShotDraft, value: string) => void;
  onSave: (shotId: string) => void; onCancel: (shotId: string) => void;
  onRebase: (shotId: string) => void;
  onRegenerate: (shotId: string) => void;
  onStatus: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(initialOpen);
  useEffect(() => { if (focusToken) setExpanded(true); }, [focusToken]);
  return (
    <details id={'director-shot-' + shot.id} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="scroll-mt-5 border-b border-white/10 py-4">
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
          <p className="flex-1 text-pretty text-xs leading-6 text-amber-100">{conflict ? originChanged ? '这镜对应的原文已变化。本地修改仍保留，请复制需要的文字后取消修改，重新核对原文。' : '已保存的分镜发生变化。本地修改仍保留；核对后可基于最新内容保留你改过的字段，或取消修改。' : '修改尚未保存。保存后，本镜与必要的相邻镜承接提示词会标记为待更新。'}</p>
          {conflict && !originChanged ? <button type="button" disabled={disabled} className={secondaryButtonClass} onClick={() => onRebase(shot.id)}>保留我改过的字段</button> : <button type="button" disabled={disabled || conflict} className={secondaryButtonClass} onClick={() => onSave(shot.id)}><Check className="size-4" aria-hidden="true" />保存修改</button>}
          <button type="button" disabled={!canCancel} className={secondaryButtonClass} onClick={() => onCancel(shot.id)}>取消修改</button>
        </div>}
        {conflict && <details><summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-sm text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">核对当前已保存的分镜</summary><dl className="grid gap-3 border-l border-white/15 pl-3 text-sm leading-7"><div><dt className="text-zinc-500">画面动作</dt><dd className="whitespace-pre-wrap text-zinc-300">{shot.action}</dd></div><div><dt className="text-zinc-500">镜头观察与运镜</dt><dd className="whitespace-pre-wrap text-zinc-300">{shot.camera}</dd></div><div><dt className="text-zinc-500">承接与结束状态</dt><dd className="whitespace-pre-wrap text-zinc-300">{shot.continuity}</dd></div><div><dt className="text-zinc-500">片段时长</dt><dd className="tabular-nums text-zinc-300">{shot.durationSeconds} 秒</dd></div></dl></details>}
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
          <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-7 text-amber-100">{canRegenerate ? '这一镜的提示词需要更新。点击「生成这一镜提示词」，按最新分镜重新编写。' : '这一镜的提示词尚未就绪。请先保存修改或继续完成制作；旧项目需先恢复对应的原文与设置。'}</p>
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

function ShotPagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return <nav aria-label="分镜翻页" className="flex flex-wrap items-center justify-between gap-3 py-4">
    <p className="text-xs tabular-nums text-zinc-500">第 {page} / {pages} 页 · 每页 {SHOTS_PER_PAGE} 镜</p>
    <div className="flex gap-2">
      <button type="button" className={secondaryButtonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="size-4" aria-hidden="true" />上一页</button>
      <button type="button" className={secondaryButtonClass} disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页<ChevronRight className="size-4" aria-hidden="true" /></button>
    </div>
  </nav>;
}

export default function AutoDirectorStudio(props: AutoDirectorStudioProps) {
  const { script, onScriptChange, project, onProjectChange, checkpoint, onCheckpointChange, settings, onSettingsChange, generate } = props;
  const [pending, setPending] = useState<{ kind: 'project' | 'shot'; shotId?: string } | null>(null);
  const [progress, setProgress] = useState<DirectorProgress | null>(null);
  const [reading, setReading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scriptWarning, setScriptWarning] = useState('');
  const [shotError, setShotError] = useState<{ shotId: string; message: string } | null>(null);
  const [shotDrafts, setShotDrafts] = useState<Record<string, DirectorShotEdit>>({});
  const [shotQuery, setShotQuery] = useState('');
  const [shotFilter, setShotFilter] = useState<'all' | 'pending' | 'edited'>('all');
  const [shotPage, setShotPage] = useState(1);
  const [focusRequest, setFocusRequest] = useState<{ id: string; token: number } | null>(null);
  const [inputRestoreSnapshot, setInputRestoreSnapshot] = useState<Pick<DirectorSnapshot, 'script' | 'settings'> | null>(null);
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
  const getShotEdit = (shot: DirectorShot) => readDirectorShotEdit(shot, shotDrafts[shot.id]);
  const detachedEdits = Object.entries(shotDrafts).filter(([id, edit]) => !displayProject?.shots.some(shot => shot.id === id) && (['action', 'camera', 'continuity', 'durationSeconds'] as const).some(key => edit.values[key] !== edit.base[key]));
  const hasUnsavedChanges = !!displayProject?.shots.some(shot => getShotEdit(shot).dirty) || detachedEdits.length > 0;
  const shotsToUpdate = displayProject?.shots.filter(shot => !shot.masterPrompt.trim() || getShotEdit(shot).dirty).length || 0;
  const search = shotQuery.trim().toLocaleLowerCase();
  const filteredShots = (displayProject?.shots || []).filter(shot => {
    const local = getShotEdit(shot);
    if (shotFilter === 'pending' && shot.masterPrompt.trim() && !local.dirty) return false;
    if (shotFilter === 'edited' && !local.dirty) return false;
    return !search || [String(shot.shotNumber), shot.scene, ...shot.charactersInvolved, local.values.action, shot.dialogue, shot.sourceExcerpt].some(value => value.toLocaleLowerCase().includes(search));
  });
  const pageCount = Math.max(1, Math.ceil(filteredShots.length / SHOTS_PER_PAGE));
  const currentPage = Math.min(shotPage, pageCount);
  const visibleShots = filteredShots.slice((currentPage - 1) * SHOTS_PER_PAGE, currentPage * SHOTS_PER_PAGE);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; operation.current?.abort(); latest.current.onActivityChange?.({ busy: false, hasUnsavedChanges: false }); };
  }, []);

  useEffect(() => { props.onActivityChange?.({ busy, hasUnsavedChanges }); }, [busy, hasUnsavedChanges, props.onActivityChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => {
      const shot = document.getElementById('director-shot-' + focusRequest.id);
      shot?.querySelector('summary')?.focus({ preventScroll: true });
      shot?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  const importScript = async (file: File) => {
    if (operation.current || readingRef.current || hasUnsavedChanges) return;
    readingRef.current = true;
    setReading(true); setError(''); setNotice('');
    try {
      const imported = await readScriptFileWithInfo(file);
      if (mounted.current) { latest.current.onScriptChange(imported.text); setScriptWarning(imported.warning || ''); setNotice(imported.warning ? '剧本已导入，请先核对原文中的中文、标点与对白。' : '剧本已导入。点击主按钮开始制作。'); }
    } catch (error) { if (mounted.current) setError(messageFrom(error, '剧本读取失败，请检查文件。')); }
    finally { readingRef.current = false; if (mounted.current) setReading(false); }
  };

  const run = async (resume: boolean) => {
    if (operation.current || readingRef.current) return;
    if (hasUnsavedChanges) { setError('请先保存或取消分镜修改，再开始制作。'); return; }
    if (resume && !canResume) { setError('这份中断进度与当前原文或设置不同，未继续制作。'); return; }
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
      setShotDrafts({}); setShotQuery(''); setShotFilter('all'); setShotPage(1); setFocusRequest(null);
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

  const editShot = (shotId: string, field: keyof DirectorShotDraft, value: string) => {
    if (!project || operation.current || readingRef.current || sourceChanged) return;
    const shot = project.shots.find(item => item.id === shotId);
    if (!shot) return;
    setShotDrafts(current => {
      const edit = current[shotId] || createDirectorShotEdit(shot);
      const next = { ...edit, values: { ...edit.values, [field]: value } };
      const drafts = { ...current };
      if (!readDirectorShotEdit(shot, next).dirty) delete drafts[shotId];
      else drafts[shotId] = next;
      return drafts;
    });
    if (shotError?.shotId === shotId) setShotError(null);
  };

  const cancelShotEdit = (shotId: string) => {
    if (operation.current || readingRef.current) return;
    setShotDrafts(current => { const next = { ...current }; delete next[shotId]; return next; });
    if (shotError?.shotId === shotId) setShotError(null);
  };

  const saveShotEdit = (shotId: string) => {
    if (!project || operation.current || readingRef.current || sourceChanged) return;
    const edit = shotDrafts[shotId];
    if (!edit) return;
    try {
      const result = commitDirectorShotEdit(project, shotId, edit);
      onProjectChange(result.project);
      if (result.clearCheckpoint) { onCheckpointChange(null); setProgress(null); }
      cancelShotEdit(shotId);
      setNotice(!result.invalidatedShotIds.length ? '分镜已保存，内容未变化，提示词仍可使用。' : result.affectsNeighbors ? '分镜修改已保存。本镜及相邻镜的承接提示词需要更新；旧制作进度已移除，避免覆盖修改。' : '时长修改已保存，请重新生成这一镜的提示词。旧制作进度已移除。');
    } catch (error) { setShotError({ shotId, message: messageFrom(error, '修改未保存，请检查动作、运镜、承接和时长。') }); }
  };

  const rebaseShotEdit = (shotId: string) => {
    if (!project || busy || sourceChanged) return;
    const shot = project.shots.find(item => item.id === shotId);
    const edit = shotDrafts[shotId];
    if (!shot || !edit) return;
    try {
      const rebased = rebaseDirectorShotEdit(shot, edit);
      setShotDrafts(current => ({ ...current, [shotId]: rebased }));
      setShotError(null); setNotice('已基于最新分镜保留你改过的字段，请再次核对并保存修改。');
    } catch (error) { setShotError({ shotId, message: messageFrom(error, '本地修改仍保留，请核对分镜。') }); }
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
      latest.current.onCheckpointChange(null);
      setProgress(null);
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
    if (!importedSnapshot || busy || hasUnsavedChanges) return;
    setRestoreSnapshot({ script, settings, project, checkpoint });
    onScriptChange(importedSnapshot.script); onSettingsChange(importedSnapshot.settings);
    onProjectChange(importedSnapshot.project); onCheckpointChange(importedSnapshot.checkpoint);
    setImportedSnapshot(null); setProgress(null); setError(''); setShotError(null); setShotDrafts({}); setInputRestoreSnapshot(null); setScriptWarning('');
    setShotQuery(''); setShotFilter('all'); setShotPage(1); setFocusRequest(null);
    setNotice('项目已恢复。需要时可撤销本次导入。');
  };

  const locateShot = (shotId: string) => {
    const index = displayProject?.shots.findIndex(shot => shot.id === shotId) ?? -1;
    if (index < 0) return;
    setShotQuery(''); setShotFilter('all'); setShotPage(Math.floor(index / SHOTS_PER_PAGE) + 1);
    setFocusRequest(previous => ({ id: shotId, token: (previous?.token || 0) + 1 }));
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
        setRestoreSnapshot(null); setNotice('已恢复到导入前的内容。'); setError(''); setProgress(null); setShotDrafts({}); setInputRestoreSnapshot(null); setScriptWarning('');
        setShotQuery(''); setShotFilter('all'); setShotPage(1); setFocusRequest(null);
      }}><RotateCcw className="size-4" aria-hidden="true" />撤销项目导入</button>}
      {inputRestoreSnapshot && <button type="button" disabled={busy || hasUnsavedChanges} className={cn(secondaryButtonClass, 'mb-6')} onClick={() => {
        onScriptChange(inputRestoreSnapshot.script); onSettingsChange(inputRestoreSnapshot.settings); setInputRestoreSnapshot(null);
        setError(''); setNotice('已恢复到刚才上方的原文与设置。'); setScriptWarning('');
      }}><RotateCcw className="size-4" aria-hidden="true" />撤销原文与设置恢复</button>}
      {!!detachedEdits.length && <section aria-label="保留的本地修改" className="mb-6 rounded-xl border border-amber-300/25 p-4">
        <p className="text-pretty text-sm leading-7 text-amber-100">当前项目不再包含下面的镜头。本地修改仍保留，可复制需要的内容后取消修改。</p>
        {detachedEdits.map(([id, edit]) => <details key={id} className="mt-3 border-t border-white/10 pt-3"><summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">{id} 的未保存修改</summary><pre className="whitespace-pre-wrap break-words py-3 font-sans text-sm leading-7 text-zinc-400">{[edit.values.action, edit.values.camera, edit.values.continuity, edit.values.durationSeconds + ' 秒'].join('\n\n')}</pre><div className="flex flex-wrap gap-2"><CopyText text={[edit.values.action, edit.values.camera, edit.values.continuity, edit.values.durationSeconds + ' 秒'].join('\n\n')} label="复制本地修改" onStatus={setNotice} /><button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => cancelShotEdit(id)}>取消这份修改</button></div></details>)}
      </section>}

      <div className="grid items-start gap-8 xl:grid-cols-3 xl:gap-10">
        <div className={cn(displayProject ? 'xl:col-span-1' : 'xl:col-span-2')}>
          <ScriptPanel script={script} onScriptChange={value => { setScriptWarning(''); onScriptChange(value); }} busy={busy || hasUnsavedChanges} reading={reading} onFile={file => { void importScript(file); }}>
            {scriptWarning && <p role="status" className="mt-3 text-pretty text-xs leading-6 text-amber-100">{scriptWarning}</p>}
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
            {(sourceChanged || pending?.kind === 'project' || !!checkpoint || !project) && <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-pretty text-sm leading-7 text-zinc-400">{sourceChanged ? '下方是上一份项目，与上方当前原文或设置不同，现在只供查看和导出。新一轮完成后才会替换；恢复这份项目对应的原文与设置，可继续编辑。' : project ? '下方是上一份完整草案。中断进度属于另一轮制作，完成后才会替换；若修改当前草案，将移除那轮旧进度，避免覆盖修改。' : '这是已保留的部分草案。继续制作后，即可编辑和逐镜重做。'}</p>
              {sourceChanged && project && <button type="button" disabled={busy || hasUnsavedChanges} className={cn(secondaryButtonClass, 'mt-3')} onClick={() => {
                setInputRestoreSnapshot({ script, settings }); onScriptChange(project.sourceScript); onSettingsChange(project.settings);
                setError(''); setNotice('已恢复这份草案的原文与设置，可以继续编辑。上方刚才的输入仍可撤销恢复。'); setScriptWarning('');
              }}><RotateCcw className="size-4" aria-hidden="true" />恢复草案对应的原文与设置</button>}
              <p className="mt-3 text-xs leading-6 text-zinc-500">当前显示草案：{displayProject.settings.platform === 'jimeng' ? '即梦' : '小云雀'} · {displayProject.settings.aspectRatio} · {displayProject.sourceScript.length.toLocaleString()} 字原文</p>
              {sourceChanged && <details className="mt-2"><summary className="min-h-11 cursor-pointer rounded-lg py-2.5 text-xs text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">查看草案对应的原文</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-l border-white/10 pl-3 font-sans text-sm leading-7 text-zinc-400">{displayProject.sourceScript}</pre></details>}
            </div>}
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
                  <CopyText text={displayProject.shots.filter(shot => !!shot.masterPrompt.trim()).map(shot => '第 ' + shot.shotNumber + ' 镜 · ' + shot.scene + '\n' + shot.masterPrompt).join('\n\n')} label={sourceChanged ? '复制旧草案提示词' : '复制全部就绪提示词'} disabled={hasUnsavedChanges} onStatus={setNotice} />
                  <button type="button" className={secondaryButtonClass} disabled={busy || hasUnsavedChanges || !project} onClick={() => exportProject('md')}><Download className="size-4" aria-hidden="true" />导出整份草案</button>
                </div>
              </div>
              <p className="mb-3 text-pretty text-xs leading-6 text-zinc-500">展开一镜修改并保存，再重做提示词。动作、运镜或承接变化时，相邻镜的提示词也需更新。</p>
              {!!displayProject.shots.length && <div className="border-y border-white/10 py-4">
                <div className="flex flex-wrap gap-3">
                  <label className="relative min-w-0 flex-1 basis-48"><span className="sr-only">搜索分镜</span><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-500" aria-hidden="true" /><input type="search" value={shotQuery} onChange={event => { setShotQuery(event.target.value); setShotPage(1); }} placeholder="搜索场景、人物、动作或对白" className={cn(controlClass, 'w-full pl-9')} /></label>
                  <label className="min-w-0 flex-1 basis-40"><span className="sr-only">筛选分镜状态</span><select value={shotFilter} onChange={event => { setShotFilter(event.target.value as typeof shotFilter); setShotPage(1); }} className={cn(controlClass, 'w-full')}><option value="all">全部分镜 · {displayProject.shots.length}</option><option value="pending">待更新 · {shotsToUpdate}</option><option value="edited">修改未保存</option></select></label>
                  <label className="min-w-0 flex-1 basis-40"><span className="sr-only">快速定位镜头</span><select value="" onChange={event => locateShot(event.target.value)} className={cn(controlClass, 'w-full')}><option value="" disabled>快速定位镜头…</option>{displayProject.shots.map(shot => <option key={shot.id} value={shot.id}>第 {shot.shotNumber} 镜 · {shot.scene}</option>)}</select></label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-xs leading-6 tabular-nums text-zinc-500">找到 {filteredShots.length} 镜{filteredShots.length > SHOTS_PER_PAGE ? '，当前显示 ' + ((currentPage - 1) * SHOTS_PER_PAGE + 1) + '—' + Math.min(currentPage * SHOTS_PER_PAGE, filteredShots.length) + ' 镜' : ''}。翻页和筛选会保留本地修改。</p>{(shotQuery || shotFilter !== 'all') && <button type="button" className={secondaryButtonClass} onClick={() => { setShotQuery(''); setShotFilter('all'); setShotPage(1); }}><X className="size-4" aria-hidden="true" />清除筛选</button>}</div>
              </div>}
              <ShotPagination page={currentPage} pages={pageCount} onChange={setShotPage} />
              {visibleShots.map((shot, index) => {
                const edit = getShotEdit(shot);
                return <ShotRow key={shot.id} shot={shot} draft={edit.values} dirty={edit.dirty} conflict={edit.conflict} originChanged={edit.originChanged} focusToken={focusRequest?.id === shot.id ? focusRequest.token : 0} initialOpen={index === 0} disabled={!canEdit} canRegenerate={canEdit && !hasUnsavedChanges} canCancel={!busy} working={pending?.shotId === shot.id} stopping={stopping} error={shotError?.shotId === shot.id ? shotError.message : undefined} onStop={() => { operation.current?.abort(); setStopping(true); }} onEdit={editShot} onSave={saveShotEdit} onCancel={cancelShotEdit} onRebase={rebaseShotEdit} onRegenerate={shotId => { void regenerate(shotId); }} onStatus={setNotice} />;
              })}
              {!!displayProject.shots.length && !filteredShots.length && <p className="py-6 text-pretty text-sm leading-7 text-zinc-400">{shotFilter === 'pending' && !search ? '当前没有待更新的镜头。' : shotFilter === 'edited' && !search ? '当前没有未保存的分镜修改。' : '没有找到匹配的镜头，请调整关键词或清除筛选。'}</p>}
              <ShotPagination page={currentPage} pages={pageCount} onChange={setShotPage} />
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
