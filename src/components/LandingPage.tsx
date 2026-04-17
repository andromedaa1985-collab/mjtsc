import { motion } from 'motion/react';
import { Sparkles, ArrowRight, Video, Image as ImageIcon, FileText } from 'lucide-react';

export default function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden flex flex-col items-center justify-center font-sans relative selection:bg-white/20">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-500/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-white/5 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 flex flex-col items-center max-w-4xl text-center px-6"
      >
        <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center mb-8">
          <Sparkles className="w-8 h-8 text-black" />
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-white">
          CinePrompt
        </h1>
        
        <p className="text-sm text-white/50 mb-16 leading-relaxed max-w-2xl tracking-wide uppercase font-mono">
          专业的影视级 AI 提示词引擎。<br />
          深度剧本解析，精准角色控制，一键生成 Seedance 2.0 和 Banana 提示词。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 w-full">
          {[
            { icon: FileText, title: '深度解析', desc: '自动提取核心角色和场景设定。' },
            { icon: ImageIcon, title: '精准控制', desc: '对话式微调，实现完美的视觉生成。' },
            { icon: Video, title: '动态镜头', desc: '一键输出视频运镜和提示词。' }
          ].map((feature, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
              className="p-8 rounded-2xl border border-white/10 bg-transparent flex flex-col items-center text-center hover:bg-white/5 transition-colors"
            >
              <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center mb-6">
                <feature.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-[10px] font-mono tracking-widest uppercase text-white mb-3">{feature.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onEnter}
          className="group flex items-center gap-3 px-8 py-3.5 rounded-full bg-white text-black font-bold text-xs tracking-widest uppercase transition-all hover:bg-white/90"
        >
          进入工作区
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </motion.button>
      </motion.div>
    </div>
  );
}
