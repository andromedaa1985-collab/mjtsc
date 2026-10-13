import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { LayoutTemplate, Camera, Clapperboard, Loader2, CheckCircle2, Send, ArrowRight } from 'lucide-react';
import { generateDeepSeekContent } from '../lib/deepseek';
import { errorMessage, parseStoryboards } from '../lib/workflowValidation';
import { STORYBOARD_GUIDANCE } from '../lib/creativePrompts';

interface StoryboardGenerationProps {
  charactersAndScenes: any;
  storyboards: any[];
  setStoryboards: React.Dispatch<React.SetStateAction<any[] | null>>;
  onNext: () => void;
}

export default function StoryboardGeneration({ 
  charactersAndScenes, 
  storyboards, 
  setStoryboards,
  onNext 
}: StoryboardGenerationProps) {
  const [feedback, setFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const latestStoryboardsRef = useRef(storyboards);
  latestStoryboardsRef.current = storyboards;

  const handleRefine = async () => {
    if (busyRef.current || !feedback.trim() || !storyboards?.length) return;
    busyRef.current = true;
    setError('');
    
    setIsRefining(true);
    try {
      const prompt = `你是一位专业的导演和分镜师。
        ${STORYBOARD_GUIDANCE}
        已确认的人物与场景：${JSON.stringify(charactersAndScenes)}
        保留未被反馈要求修改的原文对白与剧情。
        当前分镜：
        ${JSON.stringify(storyboards, null, 2)}
        
        用户反馈：
        ${feedback}
        
        根据用户的反馈更新分镜。保持相同的 JSON 结构，请用中文输出：
        {
          "storyboards": [
            {
              "shotNumber": 1,
              "action": "...",
              "camera": "...",
              "charactersInvolved": ["..."],
              "scene": "...",
              "dialogue": "原文对白；无对白为空字符串",
              "continuity": "人物、动作和道具连续性",
              "sourceExcerpt": "对应原文片段"
            }
          ]
        }`;

      const responseText = await generateDeepSeekContent(prompt, true);

      const parsed = parseStoryboards(responseText);
      if (latestStoryboardsRef.current !== storyboards) throw new Error('分镜已在其他步骤更新，本次结果未覆盖当前内容。请重新提交调整。');
      setStoryboards(current => current === storyboards ? parsed.map(shot => {
        const original = current?.find(item => item.shotNumber === shot.shotNumber);
        const unchanged = original && ['action', 'camera', 'scene', 'dialogue', 'continuity', 'sourceExcerpt'].every(key => (original[key] || '') === (shot[key] || '')) && JSON.stringify(original.charactersInvolved) === JSON.stringify(shot.charactersInvolved);
        return unchanged ? { ...original, ...shot } : shot;
      }) : current);
      setFeedback('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      busyRef.current = false;
      setIsRefining(false);
    }
  };

  const handleShotEdit = (shot: any, field: string, value: string) => {
    if (busyRef.current) return;
    setStoryboards(current => current?.map(item => item === shot ? {
      ...item, [field]: field === 'charactersInvolved' ? value.split(/[,，、]/).map(name => name.trim()).filter(Boolean) : value,
      videoPromptData: undefined,
    } : item) || current);
  };

  if (!storyboards?.length) {
    return <div className="h-full flex items-center justify-center text-white/50">暂无分镜，请返回人物与场景步骤生成分镜。</div>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col"
    >
      <div className="mb-6 flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-2">分镜序列</h2>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">检查拆分的分镜。您可以进行微调，确认无误后生成 Seedance 2.0 视频提示词。</p>
        </div>
        <button
          onClick={onNext}
          disabled={isRefining}
          className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black font-bold hover:bg-white/90 transition-all text-xs tracking-widest uppercase"
        >
          前往生成视频提示词
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 min-h-0">
        <div className="xl:col-span-2 overflow-y-auto scrollbar-hide space-y-6 pb-10 pr-2">
          {storyboards.map((shot, index) => (
            <div key={index} className="p-6 rounded-xl border border-white/10 bg-transparent flex flex-col gap-4 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-4 relative z-10">
                <div className="flex flex-col items-center justify-center w-24 h-24 rounded-lg bg-white/5 border border-white/10 shrink-0">
                  <Clapperboard className="w-6 h-6 text-white/40 mb-2" />
                  <span className="font-mono text-[10px] tracking-widest uppercase text-white/40">镜头 {shot.shotNumber}</span>
                </div>
                
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 text-white/80 text-[10px] font-mono tracking-widest uppercase border border-white/10">
                      <Camera className="w-3 h-3" />
                      {shot.camera}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono uppercase tracking-widest">
                      场景: {shot.scene}
                    </div>
                  </div>
                  
                  <p className="text-white/80 leading-relaxed mb-4 text-sm">
                    {shot.action}
                  </p>
                  
                  {shot.dialogue && <p className="mb-3 rounded-lg border-l-2 border-white/30 bg-white/5 px-3 py-2 text-sm text-white/80 whitespace-pre-wrap">对白：{shot.dialogue}</p>}
                  {shot.continuity && <p className="mb-3 text-xs text-white/50 leading-relaxed">连续性：{shot.continuity}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono tracking-widest uppercase text-white/40">人物:</span>
                    {shot.charactersInvolved?.map((char: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase bg-white/5 text-white/60 border border-white/10">
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {shot.sourceExcerpt && <details className="rounded-lg border border-white/10 p-3 text-sm text-white/60"><summary className="cursor-pointer">对应原文</summary><p className="mt-3 whitespace-pre-wrap leading-relaxed">{shot.sourceExcerpt}</p></details>}
              <details className="rounded-lg border border-white/10 p-3 text-sm text-white/70">
                <summary className="cursor-pointer">手动编辑镜头</summary>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[['action', '画面动作'], ['camera', '镜头观察与运镜'], ['scene', '场景'], ['charactersInvolved', '出场人物（用逗号分隔）'], ['dialogue', '原文对白'], ['continuity', '连续性']].map(([field, label]) => <label key={field} className="space-y-2 text-xs text-white/60">
                    <span>{label}</span>
                    <textarea aria-label={`镜头 ${shot.shotNumber} ${label}`} disabled={isRefining} rows={field === 'action' || field === 'dialogue' ? 3 : 2} value={field === 'charactersInvolved' ? (shot[field] || []).join('，') : shot[field] || ''} onChange={event => handleShotEdit(shot, field, event.target.value)} className="w-full rounded-lg border border-white/15 bg-transparent p-3 text-sm text-white/90 focus:outline-none focus:border-white/40 resize-y" />
                  </label>)}
                </div>
                <p className="mt-3 text-xs text-white/40">修改镜头会清除该镜头的旧提示词，便于按新内容重新生成。</p>
              </details>
            </div>
          ))}
        </div>

        {/* Refinement Chat */}
        <div className="flex flex-col rounded-2xl border border-white/10 bg-transparent overflow-hidden h-full relative">
          <div className="p-4 border-b border-white/10 bg-transparent">
            <h3 className="text-[10px] font-mono tracking-widest uppercase text-white/40">[ 导演助手 ]</h3>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto flex flex-col justify-end">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 w-5/6 mb-4">
              <p className="text-sm text-white/80 leading-relaxed">
                这是为您生成的分镜。需要修改运镜角度或增加镜头吗？请告诉我！
              </p>
            </div>
          </div>

          <div className="p-4 border-t border-white/10 bg-transparent">
            <div className="relative">
              <input
                type="text"
                aria-label="分镜调整意见"
                disabled={isRefining}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleRefine()}
                placeholder="例如：把镜头2改成特写..."
                className="w-full bg-transparent border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={handleRefine}
                aria-label="提交分镜微调"
                disabled={!feedback.trim() || isRefining}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-50 transition-colors"
              >
                {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
