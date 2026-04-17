import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Users, 
  LayoutTemplate, 
  Video, 
  Settings,
  ChevronRight,
  Sparkles,
  LogOut,
  Mail,
  Coins,
  Wand2
} from 'lucide-react';
import { auth, logOut, db } from './lib/firebase';
import { onAuthStateChanged, User, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import ScriptInput from './components/ScriptInput';
import CharacterSceneRefinement from './components/CharacterSceneRefinement';
import StoryboardGeneration from './components/StoryboardGeneration';
import VideoPromptGeneration from './components/VideoPromptGeneration';
import SinglePromptGenerator from './components/SinglePromptGenerator';
import RechargeModal from './components/RechargeModal';

export type Stage = 'script' | 'characters' | 'storyboard' | 'video' | 'single-prompt';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);

  // Initialize state from localStorage if available
  const [showLanding, setShowLanding] = useState(() => {
    const saved = localStorage.getItem('cp_showLanding');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [currentStage, setCurrentStage] = useState<Stage>(() => {
    return (localStorage.getItem('cp_currentStage') as Stage) || 'script';
  });
  const [scriptData, setScriptData] = useState(() => {
    return localStorage.getItem('cp_scriptData') || '';
  });
  const [charactersAndScenes, setCharactersAndScenes] = useState<any>(() => {
    const saved = localStorage.getItem('cp_charactersAndScenes');
    return saved ? JSON.parse(saved) : null;
  });
  const [storyboards, setStoryboards] = useState<any>(() => {
    const saved = localStorage.getItem('cp_storyboards');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser && currentUser.emailVerified) {
        try {
          // Check and create user document
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              createdAt: serverTimestamp(),
              role: 'user',
              credits: 100000 // Initial free credits
            });
          }
        } catch (error) {
          console.error("Failed to initialize user data in Firestore:", error);
          // We don't throw here so the app can still load, even if DB is temporarily unreachable
        }
      }
      
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Listen to credits
  useEffect(() => {
    if (user && user.emailVerified) {
      const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          setCredits(doc.data().credits);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cp_showLanding', JSON.stringify(showLanding));
  }, [showLanding]);

  useEffect(() => {
    localStorage.setItem('cp_currentStage', currentStage);
  }, [currentStage]);

  useEffect(() => {
    localStorage.setItem('cp_scriptData', scriptData);
  }, [scriptData]);

  useEffect(() => {
    if (charactersAndScenes) {
      localStorage.setItem('cp_charactersAndScenes', JSON.stringify(charactersAndScenes));
    } else {
      localStorage.removeItem('cp_charactersAndScenes');
    }
  }, [charactersAndScenes]);

  useEffect(() => {
    if (storyboards) {
      localStorage.setItem('cp_storyboards', JSON.stringify(storyboards));
    } else {
      localStorage.removeItem('cp_storyboards');
    }
  }, [storyboards]);

  const stages = [
    { id: 'single-prompt', label: '单镜头/人物提示词', icon: Wand2 },
    { id: 'script', label: '剧本解析', icon: BookOpen },
    { id: 'characters', label: '人物与场景', icon: Users },
    { id: 'storyboard', label: '分镜设计', icon: LayoutTemplate },
    { id: 'video', label: '视频提示词', icon: Video },
  ];

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center p-4">
        <div className="bg-[#0A0A0F]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center max-w-md w-full">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">请验证您的邮箱</h2>
          <p className="text-white/60 mb-8 text-sm leading-relaxed">
            为了保证账号安全，我们需要验证您的邮箱地址。<br/>
            我们已经向 <strong>{user.email}</strong> 发送了一封验证邮件。
          </p>
          <div className="space-y-3">
            <button
              onClick={async () => {
                try {
                  await user.reload();
                  if (auth.currentUser?.emailVerified) {
                    window.location.reload();
                  } else {
                    alert('还未检测到验证，请确认已点击邮件中的链接。\n如果刚点完，请稍等几秒再试。');
                  }
                } catch (e) {
                  console.error(e);
                  window.location.reload();
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl transition-all"
            >
              我已验证，进入系统
            </button>
            <button
              onClick={async () => {
                try {
                  await sendEmailVerification(user);
                  alert('验证邮件已重新发送，请前往邮箱查收！\n（注意检查垃圾邮件箱）');
                } catch (e: any) {
                  if (e.code === 'auth/too-many-requests') {
                    alert('发送太频繁了，请稍等一会再试。');
                  } else {
                    alert('发送失败：' + e.message);
                  }
                }
              }}
              className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3 px-4 rounded-xl transition-all"
            >
              重新发送验证邮件
            </button>
            <button
              onClick={logOut}
              className="w-full text-white/40 hover:text-white/60 text-sm py-2 transition-all"
            >
              退出登录 / 换个账号
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden flex font-sans selection:bg-white/20">
      {/* Grok-style Cosmic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-black">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-500/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-white/5 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] bg-indigo-500/5 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      {/* Sidebar */}
      <aside className="w-64 z-10 flex flex-col p-6 border-r border-white/10 bg-black/50 backdrop-blur-xl relative">
        <div className="flex items-center gap-3 mb-12 cursor-pointer" onClick={() => setShowLanding(true)}>
          <div className="w-8 h-8 rounded bg-white flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white">CinePrompt</h1>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="text-[10px] font-mono text-white/40 tracking-widest uppercase mb-4 px-2">[ 核心功能 ]</div>
          {stages.map((stage) => {
            const Icon = stage.icon;
            const isActive = currentStage === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setCurrentStage(stage.id as Stage)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 ${
                  isActive 
                    ? 'text-white bg-white/5' 
                    : 'text-white/50 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : ''}`} />
                <span className="font-medium text-sm">{stage.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.02] transition-colors">
            <Settings className="w-4 h-4" />
            <span className="font-medium text-sm">设置</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative z-10 flex flex-col h-screen overflow-hidden">
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/10 bg-black/50 backdrop-blur-xl relative">
          <div className="flex items-center gap-2 text-sm font-medium text-white/70">
            {stages.find(s => s.id === currentStage)?.label}
          </div>
          <div className="flex items-center gap-4">
            {credits !== null && (
              <button 
                onClick={() => setShowRechargeModal(true)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 hover:bg-white/10 transition-colors cursor-pointer" 
                title="点击充值积分"
              >
                <span className="text-[10px] font-mono tracking-widest uppercase text-white/50">积分</span>
                <span className="text-xs font-mono text-white">{credits.toLocaleString()}</span>
              </button>
            )}
            <button 
              onClick={logOut}
              className="px-4 py-1.5 rounded-full border border-white/20 hover:bg-white/10 transition-colors text-[10px] font-mono tracking-widest uppercase text-white"
            >
              退出登录
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
          <div className="max-w-5xl mx-auto h-full">
            <AnimatePresence mode="wait">
              {currentStage === 'single-prompt' && (
                <SinglePromptGenerator key="single-prompt" />
              )}
              {currentStage === 'script' && (
                <ScriptInput 
                  key="script"
                  scriptData={scriptData}
                  setScriptData={setScriptData}
                  onNext={() => setCurrentStage('characters')}
                  setCharactersAndScenes={setCharactersAndScenes}
                />
              )}
              {currentStage === 'characters' && (
                <CharacterSceneRefinement 
                  key="characters"
                  scriptData={scriptData}
                  charactersAndScenes={charactersAndScenes}
                  setCharactersAndScenes={setCharactersAndScenes}
                  onNext={() => setCurrentStage('storyboard')}
                  setStoryboards={setStoryboards}
                />
              )}
              {currentStage === 'storyboard' && (
                <StoryboardGeneration 
                  key="storyboard"
                  charactersAndScenes={charactersAndScenes}
                  storyboards={storyboards}
                  setStoryboards={setStoryboards}
                  onNext={() => setCurrentStage('video')}
                />
              )}
              {currentStage === 'video' && (
                <VideoPromptGeneration 
                  key="video"
                  storyboards={storyboards}
                  setStoryboards={setStoryboards}
                  charactersAndScenes={charactersAndScenes}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <RechargeModal 
        isOpen={showRechargeModal} 
        onClose={() => setShowRechargeModal(false)} 
      />
    </div>
  );
}

