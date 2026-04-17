import React, { useState } from 'react';
import { signInWithGoogle, auth } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { Film, Sparkles, Loader2, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    if (password.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        // 1. 创建账号
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // 2. 发送验证邮件
        await sendEmailVerification(userCredential.user);
        // 3. 强制登出，防止自动登录
        await signOut(auth);
        
        setSuccessMsg('注册成功！验证邮件已发送，请前往邮箱查收并验证后再登录。（如未收到请检查垃圾箱）');
        setIsSignUp(false);
        setPassword('');
      } else {
        // 登录逻辑
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // 检查是否已验证邮箱
        if (!userCredential.user.emailVerified) {
          // 不再强制登出，让 App.tsx 接管并显示“请验证邮箱”界面
          return;
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('该邮箱已被注册，请直接登录');
          break;
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          setError('邮箱或密码错误');
          break;
        case 'auth/invalid-email':
          setError('邮箱格式不正确');
          break;
        default:
          setError(err.message || '认证失败，请重试');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Google login failed:", err);
      setError('Google 登录失败，请重试');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/5 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-transparent border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-6">
            <Film className="w-6 h-6 text-black" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">CINEPROMPT</h1>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mb-8">身份验证</p>

          {successMsg && (
            <div className="mb-6 p-3 bg-white/5 border border-white/10 rounded-xl flex items-start gap-2 text-white text-sm text-left animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-sm text-left animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6 text-left">
            <div>
              <label className="block text-[10px] font-mono tracking-widest uppercase text-white/40 mb-2">[ 邮箱 ]</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-white/30" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-transparent border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-all text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono tracking-widest uppercase text-white/40 mb-2">[ 密码 ]</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-white/30" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-transparent border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-all text-sm"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-white/90 text-black font-bold py-3.5 px-4 rounded-full transition-all disabled:opacity-70 text-xs tracking-widest uppercase mt-6"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{isSignUp ? '注册账号' : '登录'}</span>
            </button>
          </form>

          <div className="relative flex items-center py-4">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink-0 mx-4 text-[10px] font-mono tracking-widest uppercase text-white/20">或</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full bg-transparent border border-white/20 hover:bg-white/5 text-white font-bold py-3.5 rounded-full transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs tracking-widest uppercase mb-6"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                使用 GOOGLE 登录
              </>
            )}
          </button>

          <p className="text-white/40 text-[10px] font-mono tracking-widest uppercase">
            {isSignUp ? '已有账号？' : '没有账号？'}
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccessMsg('');
              }}
              className="text-white hover:underline ml-2"
            >
              {isSignUp ? '直接登录' : '立即注册'}
            </button>
          </p>

          <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-mono tracking-widest uppercase text-white/20">
            <Sparkles className="w-3 h-3" />
            <span>POWERED BY SEEDANCE 2.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
