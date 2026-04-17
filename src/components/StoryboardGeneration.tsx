import { useState } from 'react';
import { motion } from 'motion/react';
import { LayoutTemplate, Camera, Clapperboard, Loader2, CheckCircle2, Send, ArrowRight } from 'lucide-react';
import { generateDeepSeekContent } from '../lib/deepseek';

interface StoryboardGenerationProps {
  charactersAndScenes: any;
  storyboards: any[];
  setStoryboards: (data: any) => void;
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

  const handleRefine = async () => {
    if (!feedback.trim()) return;
    
    setIsRefining(true);
    try {
      const prompt = `你是一位专业的导演和分镜师。
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
              "scene": "..."
            }
          ]
        }`;

      const responseText = await generateDeepSeekContent(prompt, true);

      if (responseText) {
        let cleanJson = responseText;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanJson = jsonMatch[0];
        }
        const parsedData = JSON.parse(cleanJson);
        setStoryboards(parsedData.storyboards);
        setFeedback('');
      }
    } catch (error) {
      console.error("Failed to refine storyboards:", error);
    } finally {
      setIsRefining(false);
    }
  };

  if (!storyboards) {
    return <div className="h-full flex items-center justify-center text-white/50">暂无分镜数据。</div>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col"
    >
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-bold tracking-tight mb-2">分镜序列</h2>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">检查拆分的分镜。您可以进行微调，确认无误后生成 Seedance 2.0 视频提示词。</p>
        </div>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black font-bold hover:bg-white/90 transition-all text-xs tracking-widest uppercase"
        >
          前往生成视频提示词
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
        <div className="col-span-2 overflow-y-auto scrollbar-hide space-y-6 pb-10 pr-2">
          {storyboards.map((shot, index) => (
            <div key={index} className="p-6 rounded-xl border border-white/10 bg-transparent flex flex-col gap-4 relative overflow-hidden">
              <div className="flex gap-6 relative z-10">
                <div className="flex flex-col items-center justify-center w-24 h-24 rounded-lg bg-white/5 border border-white/10 shrink-0">
                  <Clapperboard className="w-6 h-6 text-white/40 mb-2" />
                  <span className="font-mono text-[10px] tracking-widest uppercase text-white/40">镜头 {shot.shotNumber}</span>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3">
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
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-widest uppercase text-white/40">人物:</span>
                    {shot.charactersInvolved?.map((char: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase bg-white/5 text-white/60 border border-white/10">
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
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
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                placeholder="例如：把镜头2改成特写..."
                className="w-full bg-transparent border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={handleRefine}
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
