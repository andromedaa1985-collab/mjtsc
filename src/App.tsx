import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, Users, LayoutTemplate, Video, Settings, Sparkles, Mail, Wand2, Download, X, CheckCircle2 } from 'lucide-react';
import { auth, logOut, db } from './lib/firebase';
import { onAuthStateChanged, sendEmailVerification, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { cn } from './lib/utils';
import { draftKey, emptyDraft, loadDraft, loadLegacyDraft, saveDraft, type Stage, type WorkspaceDraft } from './lib/workspaceDraft';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import RechargeModal from './components/RechargeModal';

const ScriptInput = lazy(() => import('./components/ScriptInput'));
const CharacterSceneRefinement = lazy(() => import('./components/CharacterSceneRefinement'));
const StoryboardGeneration = lazy(() => import('./components/StoryboardGeneration'));
const VideoPromptGeneration = lazy(() => import('./components/VideoPromptGeneration'));
const SinglePromptGenerator = lazy(() => import('./components/SinglePromptGenerator'));
export type { Stage } from './lib/workspaceDraft';
const stages = [
  { id: 'script', label: '剧本解析', icon: BookOpen, step: '01' },
  { id: 'characters', label: '人物与场景', icon: Users, step: '02' },
  { id: 'storyboard', label: '分镜设计', icon: LayoutTemplate, step: '03' },
  { id: 'video', label: '视频提示词', icon: Video, step: '04' },
  { id: 'single-prompt', label: '单镜头 / 人物', icon: Wand2, step: '' },
] as const;

function Loading() {
  return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-white/60"><span className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />正在加载创作工作区…</div>;
}
function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function getInitialDraft(uid: string) {
  try { return loadDraft(window.localStorage, uid); }
  catch { return { draft: { ...emptyDraft }, error: '浏览器存储不可用，请在离开前导出草稿。' }; }
}

export function Workspace({ user, credits, accountError = '' }: { user: User; credits: number | null; accountError?: string }) {
  const [initial] = useState(() => getInitialDraft(user.uid));
  const [draft, setDraft] = useState<WorkspaceDraft>(initial.draft);
  const [savePaused, setSavePaused] = useState(!!initial.error);
  const [storageError, setStorageError] = useState(initial.error);
  const [isSaved, setIsSaved] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const rechargeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const settingsOpenerRef = useRef<HTMLElement | null>(null);
  const openSettings = () => {
    settingsOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSettingsOpen(true);
  };
  const draftRef = useRef(draft); draftRef.current = draft;
  const scriptOutdated = typeof draft.analyzedScript === 'string' && draft.analyzedScript !== draft.scriptData;
  const canVisit = (stage: Stage) => stage === 'script' || stage === 'single-prompt' ||
    (stage === 'characters' ? !!draft.charactersAndScenes : !!draft.storyboards?.length);
  const activeStage: Stage = canVisit(draft.currentStage) ? draft.currentStage : 'script';
  const [visited, setVisited] = useState<Stage[]>([activeStage]);
  const panels = visited.includes(activeStage) ? visited : [...visited, activeStage];
  useEffect(() => {
    setIsSaved(false);
    if (savePaused) return;
    const timer = setTimeout(() => {
      let error: string;
      try { error = saveDraft(window.localStorage, user.uid, draft); }
      catch { error = '浏览器存储不可用，请导出草稿备份。'; }
      setStorageError(error); setIsSaved(!error);
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, user.uid, savePaused]);
  useEffect(() => {
    const flush = () => {
      if (savePaused) return false;
      try { return !saveDraft(window.localStorage, user.uid, draftRef.current); } catch { return false; }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!flush() && (draftRef.current.scriptData || draftRef.current.storyboards?.length)) { event.preventDefault(); event.returnValue = ''; }
    };
    const pageHide = () => { flush(); };
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('pagehide', pageHide);
    return () => { flush(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', pageHide); };
  }, [user.uid, savePaused]);
  const update = <K extends keyof WorkspaceDraft>(key: K, value: WorkspaceDraft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const setStoryboards: Dispatch<SetStateAction<any[] | null>> = value => setDraft(previous => ({ ...previous,
    storyboards: typeof value === 'function' ? value(previous.storyboards) : value,
  }));
  const navigate = (stage: Stage) => {
    if (!canVisit(stage)) return;
    setVisited(previous => previous.includes(stage) ? previous : [...previous, stage]); update('currentStage', stage);
  };
  const advance = (from: Stage, to: Stage) => {
    setDraft(previous => ({ ...previous, currentStage: previous.currentStage === from ? to : previous.currentStage }));
    setVisited(previous => previous.includes(to) ? previous : [...previous, to]);
  };
  const exportDraft = () => downloadText(JSON.stringify(draftRef.current, null, 2), `CinePrompt-创作草稿-${new Date().toISOString().slice(0, 10)}.json`);
  const importLegacy = () => {
    try {
      const legacy = loadLegacyDraft(window.localStorage);
      if (!legacy.scriptData && !legacy.charactersAndScenes && !legacy.storyboards?.length) { setMessage('此浏览器没有可导入的旧版创作草稿。'); return; }
      setDraft(legacy); setVisited([legacy.currentStage]); setMessage('旧版草稿已导入当前账号。');
    } catch { setMessage('旧版草稿格式异常，请保留浏览器缓存以便恢复。'); }
  };
  return <>
    {draft.showLanding && <LandingPage onEnter={() => update('showLanding', false)} />}
    <div hidden={draft.showLanding} className="workspace-shell">
    <div className="flex min-h-dvh flex-col bg-[#09090b] font-sans text-white lg:h-dvh lg:flex-row">
    <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-black">跳到创作内容</a>
    <aside className="border-b border-white/10 bg-[#101014] p-4 lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0 lg:p-5">
      <div className="mb-4 flex items-center justify-between lg:mb-10">
        <button onClick={() => update('showLanding', true)} className="flex items-center gap-3 rounded-lg text-left" aria-label="返回 CinePrompt 首页">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white text-black"><Sparkles className="size-4" /></span>
          <span><span className="block text-lg font-semibold">CinePrompt</span><span className="block text-xs text-white/50">漫剧创作工作台</span></span>
        </button>
        <button onClick={openSettings} aria-label="草稿与设置" className="rounded-lg p-2 text-white/60 lg:hidden"><Settings className="size-5" /></button>
      </div>
      <p className="mb-3 hidden text-xs text-white/45 lg:block">从故事到镜头</p>
      <nav aria-label="创作步骤" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {stages.map(stage => {
          const Icon = stage.icon; const enabled = canVisit(stage.id);
          return <button key={stage.id} disabled={!enabled} aria-current={activeStage === stage.id ? 'step' : undefined}
            title={!enabled ? (stage.id === 'characters' ? '先解析剧本，提取人物与场景' : '先在人物与场景页生成分镜') : undefined}
            onClick={() => navigate(stage.id)} className={cn('flex min-h-11 shrink-0 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:text-white/25 lg:w-full',
              activeStage === stage.id ? 'border-white/10 bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white', stage.id === 'single-prompt' && 'lg:mt-5')}>
            <Icon className="size-4 shrink-0" /><span className="flex-1 whitespace-nowrap">{stage.label}</span>{stage.step && <span className="hidden font-mono text-xs tabular-nums text-white/35 lg:inline">{stage.step}</span>}
          </button>;
        })}
      </nav>
      <div className="mt-auto hidden border-t border-white/10 pt-5 lg:block"><button onClick={openSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/60 hover:bg-white/5 hover:text-white"><Settings className="size-4" />草稿与设置</button><p className="mt-3 px-3 text-xs leading-5 text-white/35">草稿保存在此浏览器。<br />重要内容建议导出备份。</p></div>
    </aside>
    <main id="workspace-content" className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6 lg:px-8">
        <div><p className="text-sm font-medium">{stages.find(stage => stage.id === activeStage)?.label}</p><p role="status" className="mt-1 flex items-center gap-1.5 text-xs text-white/45">{isSaved && <CheckCircle2 className="size-3" />}{storageError || savePaused ? '草稿保存需要处理' : isSaved ? '本机草稿已保存' : '正在保存草稿…'}</p></div>
        <div className="flex items-center gap-2"><button onClick={exportDraft} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-white/80 hover:bg-white/5"><Download className="size-4" />导出草稿</button><button ref={rechargeButtonRef} onClick={() => setRechargeOpen(true)} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-white/60 hover:bg-white/5">试用额度 <span className="font-mono tabular-nums text-white">{credits === null ? '—' : credits.toLocaleString()}</span></button><button onClick={() => { logOut().catch(() => setMessage('退出失败，请稍后重试。')); }} className="min-h-10 rounded-lg px-2 text-xs text-white/60 hover:text-white">退出</button></div>
      </header>
      {(storageError || accountError || message) && <div role="alert" className="mx-4 mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100 sm:mx-6">{storageError || accountError || message}{storageError && <button onClick={openSettings} className="ml-3 underline">处理草稿保存</button>}</div>}
      {scriptOutdated && <div role="status" className="mx-4 mt-4 rounded-xl border border-white/15 p-3 text-sm text-white/70 sm:mx-6">剧本已修改，现有设定和分镜仍来自上次解析。<button onClick={() => navigate('script')} className="ml-3 underline">重新解析最新剧本</button></div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl lg:h-full">
        {panels.map(stage => <section key={stage} hidden={activeStage !== stage} className="stage-panel h-full" aria-label={stages.find(item => item.id === stage)?.label}><Suspense fallback={<Loading />}>
          {stage === 'single-prompt' && <SinglePromptGenerator />}
          {stage === 'script' && <ScriptInput scriptData={draft.scriptData} setScriptData={value => update('scriptData', value)} setCharactersAndScenes={value => setDraft(previous => ({ ...previous, charactersAndScenes: value, storyboards: null, analyzedScript: previous.scriptData }))} onNext={() => advance('script', 'characters')} />}
          {stage === 'characters' && <CharacterSceneRefinement scriptData={draft.scriptData} charactersAndScenes={draft.charactersAndScenes} setCharactersAndScenes={value => setDraft(previous => ({ ...previous, charactersAndScenes: value, storyboards: null }))} setStoryboards={setStoryboards} onNext={() => advance('characters', 'storyboard')} />}
          {stage === 'storyboard' && <StoryboardGeneration charactersAndScenes={draft.charactersAndScenes} storyboards={draft.storyboards} setStoryboards={setStoryboards} onNext={() => advance('storyboard', 'video')} />}
          {stage === 'video' && <VideoPromptGeneration storyboards={draft.storyboards} setStoryboards={setStoryboards} charactersAndScenes={draft.charactersAndScenes} />}
        </Suspense></section>)}
      </div></div>
    </main>
    <RechargeModal isOpen={rechargeOpen} onClose={() => setRechargeOpen(false)} credits={credits} returnFocusRef={rechargeButtonRef} />
    <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/75" /><Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); settingsOpenerRef.current?.focus(); }} className="fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-[#15151b] p-6 text-white shadow-xl">
      <Dialog.Title className="text-balance text-xl font-semibold">草稿与设置</Dialog.Title><Dialog.Description className="mt-3 text-pretty text-sm leading-6 text-white/60">此账号的剧本、人物、分镜、镜头参数和视频提示词自动保存到本机浏览器。切换设备前请导出备份。</Dialog.Description>
      <div className="mt-6 space-y-3"><button onClick={exportDraft} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-black"><Download className="size-4" />导出当前创作草稿</button>
        {savePaused && <button onClick={() => { try { downloadText(window.localStorage.getItem(draftKey(user.uid)) || '{}', 'CinePrompt-原始缓存备份.json'); setSavePaused(false); setStorageError(''); } catch { setMessage('浏览器缓存不可读取，请先导出当前创作草稿。'); } }} className="min-h-11 w-full rounded-xl border border-amber-200/25 px-4 text-sm text-amber-100">备份原始缓存并启用保存</button>}
        {!draft.scriptData && !draft.charactersAndScenes && !draft.storyboards?.length && <button onClick={importLegacy} className="min-h-11 w-full rounded-xl border border-white/15 px-4 text-sm text-white/80">导入此浏览器的旧版草稿</button>}
      </div>{message && <p role="status" className="mt-4 text-sm text-white/70">{message}</p>}<Dialog.Close aria-label="关闭草稿设置" className="absolute top-4 right-4 rounded-lg p-2 text-white/60 hover:text-white"><X className="size-4" /></Dialog.Close>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div></div></>;
}

function VerifyEmail({ user }: { user: User }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (resend: boolean) => {
    if (busy) return; setBusy(true); setMessage('');
    try {
      if (resend) { await sendEmailVerification(user); setMessage('验证邮件已发送，请查收邮箱和垃圾邮件箱。'); }
      else { await user.reload(); if (auth.currentUser?.emailVerified) { await auth.currentUser.getIdToken(true); window.location.reload(); } else setMessage('尚未检测到验证，请点击邮件链接后再试。'); }
    } catch { setMessage('请求暂未成功，请稍后重试。'); } finally { setBusy(false); }
  };
  return <div className="flex min-h-dvh items-center justify-center bg-[#09090b] p-4 text-white"><div className="w-full max-w-md rounded-2xl border border-white/15 p-7 text-center"><Mail className="mx-auto mb-5 size-9 text-white/70" /><h1 className="text-balance text-2xl font-semibold">验证邮箱，开始创作</h1><p className="mt-4 break-words text-pretty text-sm leading-6 text-white/60">请查看 {user.email} 的验证邮件。完成验证后即可进入工作区。</p>{message && <p role="status" className="mt-4 rounded-lg bg-white/5 p-3 text-sm">{message}</p>}<div className="mt-6 space-y-3"><button disabled={busy} onClick={() => run(false)} className="min-h-11 w-full rounded-xl bg-white px-4 text-sm font-medium text-black disabled:opacity-50">我已验证，进入工作区</button><button disabled={busy} onClick={() => run(true)} className="min-h-11 w-full rounded-xl border border-white/15 px-4 text-sm disabled:opacity-50">重新发送验证邮件</button><button onClick={() => { logOut().catch(() => setMessage('退出失败，请稍后重试。')); }} className="min-h-11 px-4 text-sm text-white/60">退出 / 更换账号</button></div></div></div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null); const [isAuthReady, setIsAuthReady] = useState(false);
  const [credits, setCredits] = useState<number | null>(null); const [accountError, setAccountError] = useState('');
  useEffect(() => onAuthStateChanged(auth, currentUser => { setUser(currentUser); setCredits(null); setAccountError(''); setIsAuthReady(true); }), []);
  useEffect(() => {
    if (!user?.emailVerified) return;
    let active = true;
    const initialize = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        if (!(await getDoc(userRef)).exists()) await setDoc(userRef, { uid: user.uid, email: user.email, displayName: user.displayName || '', photoURL: user.photoURL || '', createdAt: serverTimestamp(), role: 'user', credits: 100000 });
      } catch { if (active) setAccountError('账户额度暂时无法同步，草稿仍可在本机编辑和导出。'); }
    };
    initialize();
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), snapshot => { const value = snapshot.data()?.credits; if (active) setCredits(typeof value === 'number' && Number.isFinite(value) ? value : null); }, () => { if (active) setAccountError('账户额度暂时无法同步，请检查网络或稍后重试。'); });
    return () => { active = false; unsubscribe(); };
  }, [user]);
  if (!isAuthReady) return <div className="flex min-h-dvh items-center justify-center bg-[#09090b]"><Loading /></div>;
  if (!user) return <Login />;
  if (!user.emailVerified) return <VerifyEmail user={user} />;
  return <Workspace key={user.uid} user={user} credits={credits} accountError={accountError} />;
}
