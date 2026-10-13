import React, { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { AlertCircle, ArrowRight, CheckCircle2, Film, Lock, Mail } from 'lucide-react';
import { auth, signInWithGoogle } from '../lib/firebase';
import { cn } from '../lib/utils';

function authErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'auth/email-already-in-use': return '该邮箱已注册，请切换到登录。';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return '邮箱或密码不正确，请检查后重试。';
    case 'auth/invalid-email': return '请输入有效的邮箱地址。';
    case 'auth/weak-password': return '密码至少需要 6 位，请使用更长的密码。';
    case 'auth/too-many-requests': return '操作过于频繁，请稍后再试。';
    case 'auth/network-request-failed': return '网络连接失败，请检查网络后重试。';
    case 'auth/popup-closed-by-user': return '登录窗口已关闭，你可以重新打开或使用邮箱登录。';
    case 'auth/popup-blocked': return '浏览器拦截了登录窗口，请允许弹出窗口后重试。';
    default: return '暂时无法完成登录，请稍后重试。';
  }
}

export default function Login() {
  const [pendingAuth, setPendingAuth] = useState<'email' | 'google' | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const isLoading = pendingAuth !== null;

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setError('');
    setSuccessMsg('');
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError('请填写邮箱和密码。');
      return;
    }
    if (isSignUp && password.length < 6) {
      setError('注册密码至少需要 6 位。');
      return;
    }
    setPendingAuth('email');
    try {
      if (isSignUp) {
        const { user } = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await sendEmailVerification(user);
        await signOut(auth);
        setSuccessMsg('注册成功，验证邮件已发送。请点击邮件中的链接后登录；未收到时可检查垃圾邮件。');
        setIsSignUp(false);
        setPassword('');
      } else {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
      }
    } catch (error: unknown) {
      console.error('Email authentication failed:', error);
      setError(authErrorMessage(error));
    } finally {
      setPendingAuth(null);
    }
  };

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    setPendingAuth('google');
    setError('');
    setSuccessMsg('');
    try {
      await signInWithGoogle();
    } catch (error: unknown) {
      console.error('Google authentication failed:', error);
      setError(authErrorMessage(error));
    } finally {
      setPendingAuth(null);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 py-8 text-white sm:px-8 sm:py-12">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 lg:grid-cols-2">
        <section className="flex flex-col justify-between border-b border-white/10 bg-zinc-900/50 p-6 sm:p-10 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white text-zinc-950"><Film className="size-5" aria-hidden="true" /></span>
            <span className="text-lg font-semibold">CinePrompt</span>
          </div>
          <div className="mt-10 lg:my-16">
            <p className="mb-4 text-sm font-medium text-zinc-400">漫剧创作工作台</p>
            <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-4xl">让故事里的每一幕，<br className="hidden sm:block" />都有清晰的镜头语言。</h1>
            <p className="mt-5 max-w-sm text-pretty text-sm leading-7 text-zinc-300">从剧本解析、人物与场景设定，到分镜设计与视频提示词，把创作思路连成一条完整流程。</p>
          </div>
          <div className="mt-8 hidden items-center gap-3 text-xs text-zinc-400 sm:flex"><span className="h-px w-8 bg-zinc-600" aria-hidden="true" />为你的下一个故事做好准备</div>
        </section>

        <section className="p-6 sm:p-10" aria-labelledby="login-heading">
          <h2 id="login-heading" className="text-balance text-2xl font-semibold">{isSignUp ? '创建创作账号' : '欢迎回来'}</h2>
          <p className="mt-2 text-pretty text-sm leading-6 text-zinc-400">{isSignUp ? '注册后验证邮箱，即可进入工作台。' : '登录账号，继续你的漫剧创作。'}</p>
          <div className="mt-6 space-y-3" aria-live="polite" aria-atomic="true">
            {successMsg && <p className="flex items-start gap-2 rounded-xl border border-white/15 bg-white/5 p-3 text-pretty text-sm leading-6 text-zinc-200" role="status"><CheckCircle2 className="mt-1 size-4 shrink-0" aria-hidden="true" /><span>{successMsg}</span></p>}
            {error && <p id="auth-error" className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/5 p-3 text-pretty text-sm leading-6 text-red-300" role="alert"><AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></p>}
          </div>
          <form onSubmit={handleEmailAuth} className={cn('mt-6 space-y-5', isLoading && 'cursor-wait')} aria-busy={pendingAuth === 'email'}>
            <div>
              <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-zinc-200">邮箱</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-zinc-500" aria-hidden="true" />
                <input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 pl-10 text-sm text-white placeholder:text-zinc-500 focus-visible:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-60" required disabled={isLoading} aria-describedby={error ? 'auth-error' : undefined} />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-zinc-200">密码</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-zinc-500" aria-hidden="true" />
                <input id="login-password" name="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignUp ? '至少 6 位字符' : '输入你的密码'} minLength={isSignUp ? 6 : undefined} className="min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 pl-10 text-sm text-white placeholder:text-zinc-500 focus-visible:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-60" required disabled={isLoading} aria-describedby={[isSignUp && 'password-hint', error && 'auth-error'].filter(Boolean).join(' ') || undefined} />
              </div>
              {isSignUp && <p id="password-hint" className="mt-2 text-xs leading-5 text-zinc-400">建议使用较长的密码，避免与其他网站相同。</p>}
            </div>
            <button type="submit" disabled={isLoading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-wait disabled:opacity-60">
              {pendingAuth === 'email' ? (isSignUp ? '正在创建账号…' : '正在登录…') : (isSignUp ? '注册账号' : '登录工作台')}
              {!isLoading && <ArrowRight className="size-4" aria-hidden="true" />}
            </button>
          </form>
          <div className="my-6 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-white/10" /><span className="text-xs text-zinc-500">或</span><span className="h-px flex-1 bg-white/10" /></div>
          <button type="button" onClick={handleGoogleLogin} disabled={isLoading} aria-busy={pendingAuth === 'google'} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-white hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-wait disabled:opacity-60">
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23zM5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            {pendingAuth === 'google' ? '正在连接 Google…' : '使用 Google 登录'}
          </button>
          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-1 text-sm text-zinc-400">
            {isSignUp ? '已有账号？' : '还没有账号？'}
            <button type="button" disabled={isLoading} onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccessMsg(''); }} className="min-h-11 rounded-lg px-2 font-medium text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-60">{isSignUp ? '直接登录' : '创建账号'}</button>
          </p>
        </section>
      </div>
    </main>
  );
}
