import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Users, Map, Send, Loader2, CheckCircle2, ImagePlus, X, Copy, Check } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { generateDeepSeekContent } from '../lib/deepseek';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface CharacterSceneRefinementProps {
  scriptData: string;
  charactersAndScenes: any;
  setCharactersAndScenes: (data: any) => void;
  onNext: () => void;
  setStoryboards: (data: any) => void;
}

export default function CharacterSceneRefinement({ 
  scriptData, 
  charactersAndScenes, 
  setCharactersAndScenes, 
  onNext,
  setStoryboards
}: CharacterSceneRefinementProps) {
  const [feedback, setFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingStoryboards, setIsGeneratingStoryboards] = useState(false);
  const [referenceImage, setReferenceImage] = useState<{ url: string, data: string, mimeType: string } | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(text);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setReferenceImage({
        url: URL.createObjectURL(file),
        data: base64String,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRefine = async () => {
    if (!feedback.trim() && !referenceImage) return;
    
    setIsRefining(true);
    try {
      const promptText = `你是顶级影视视效总监和专业的 Nano Banana Pro 提示词工程师。
      当前的人物和场景：
      ${JSON.stringify(charactersAndScenes, null, 2)}
      
      用户反馈：
      ${feedback || "请参考提供的图片，提取其视觉特征（如人物长相、服装风格、场景氛围等），并更新当前的人物和场景设定。"}
      
      根据用户的反馈更新人物和场景，必须符合工业级生产标准，极其准确且富有画面感。如果用户提供了参考图（垫图），请结合参考图的视觉特征进行修改。
      确保描述非常详细。同时，更新专门用于 Nano Banana Pro 的伪代码格式提示词 (imagenPrompt)，确保包含极高画质的修饰词。
      请用中文输出基础信息，但 imagenPrompt 的值必须使用英文，且必须是包含 [VARIABLES] 和 [EXECUTION] 的单行或多行字符串。
      格式为JSON，结构如下：
      {
        "characters": [{ "name": "...", "description": "...", "keywords": ["..."], "imagenPrompt": "[VARIABLES]\\nSUBJECT = \\"...\\"\\nLOCATION = \\"...\\"\\nLIGHTING = \\"...\\"\\nCAM_SETTINGS = \\"...\\"\\n[EXECUTION]\\n..." }],
        "scenes": [{ "name": "...", "description": "...", "keywords": ["..."], "imagenPrompt": "[VARIABLES]\\nSUBJECT = \\"...\\"\\nLOCATION = \\"...\\"\\nLIGHTING = \\"...\\"\\nCAM_SETTINGS = \\"...\\"\\n[EXECUTION]\\n..." }]
      }`;

      const contents: any[] = [promptText];
      if (referenceImage) {
        contents.push({
          inlineData: {
            data: referenceImage.data,
            mimeType: referenceImage.mimeType
          }
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: contents,
        config: {
          responseMimeType: "application/json",
        }
      });

      if (response.text) {
        let cleanJson = response.text;
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanJson = jsonMatch[0];
        }
        const parsedData = JSON.parse(cleanJson);
        setCharactersAndScenes(parsedData);
        setFeedback('');
        setReferenceImage(null);
      }
    } catch (error) {
      console.error("Failed to refine:", error);
    } finally {
      setIsRefining(false);
    }
  };

  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });

  const chunkText = (text: string, maxLength: number): string[] => {
    const chunks: string[] = [];
    let current = 0;
    while (current < text.length) {
      let next = current + maxLength;
      if (next < text.length) {
        // Try to find a double newline
        let breakPoint = text.lastIndexOf('\n\n', next);
        if (breakPoint <= current) {
          // Try single newline
          breakPoint = text.lastIndexOf('\n', next);
          if (breakPoint <= current) {
            // Try period
            breakPoint = text.lastIndexOf('。', next);
            if (breakPoint <= current) {
              breakPoint = next; // Hard break
            } else {
              breakPoint += 1; // Include period
            }
          }
        }
        chunks.push(text.slice(current, breakPoint).trim());
        current = breakPoint;
      } else {
        chunks.push(text.slice(current).trim());
        break;
      }
    }
    return chunks.filter(c => c.length > 0);
  };

  const handleGenerateStoryboards = async () => {
    setIsGeneratingStoryboards(true);
    try {
      // Split script into smaller chunks (e.g., 800 chars) to ensure DeepSeek has enough output tokens for dense shot breakdown
      const chunks = chunkText(scriptData, 800); 
      setGenerationProgress({ current: 1, total: chunks.length });
      
      let allStoryboards: any[] = [];
      let currentShotNumber = 1;

      for (let i = 0; i < chunks.length; i++) {
        setGenerationProgress({ current: i + 1, total: chunks.length });
        
        const prompt = `你是专业的影视导演。这是剧本的第 ${i + 1}/${chunks.length} 部分。
          请将这部分剧本拆分为多个连贯的【15秒视频片段】（Sequence）。
          **重要要求：**
          1. **以15秒为界限分割片段**：不要把镜头切得太碎！Seedance 2.0 支持单次生成 15 秒连贯视频。请将连贯的剧情、动作组合在一个 15 秒的片段中，确保视频的连贯性。
          2. 不要省略任何动作或细节，请描述在这个 15 秒内发生的一连串动作和反应。
          3. 请从片段编号 ${currentShotNumber} 开始连续编号。
          4. 为每个 15 秒片段提供动作、涉及人物、场景和整体相机运动的详细描述。
          
          当前部分剧本：
          ${chunks[i]}
          
          请用中文输出，格式必须为严格的JSON，结构如下（这是为了前端网页能够渲染卡片UI，请务必遵守）：
          {
            "storyboards": [
              {
                "shotNumber": ${currentShotNumber},
                "action": "...",
                "camera": "...",
                "charactersInvolved": ["..."],
                "scene": "..."
              }
            ]
          }`;

        try {
          const responseText = await generateDeepSeekContent(prompt, true);

          if (responseText) {
            let cleanJson = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              cleanJson = jsonMatch[0];
            }
            const parsedData = JSON.parse(cleanJson);
            if (parsedData.storyboards && parsedData.storyboards.length > 0) {
              allStoryboards = [...allStoryboards, ...parsedData.storyboards];
              currentShotNumber = allStoryboards[allStoryboards.length - 1].shotNumber + 1;
            }
          }
        } catch (chunkError) {
          console.error(`Error generating chunk ${i + 1}:`, chunkError);
          // Continue to next chunk even if this one fails
        }
      }

      if (allStoryboards.length > 0) {
        setStoryboards(allStoryboards);
        onNext();
      } else {
        alert("生成分镜失败，请重试或检查剧本内容。");
      }
    } catch (error) {
      console.error("Failed to generate storyboards:", error);
      alert("生成分镜过程中发生错误。");
    } finally {
      setIsGeneratingStoryboards(false);
      setGenerationProgress({ current: 0, total: 0 });
    }
  };

  if (!charactersAndScenes) {
    return (
      <div className="h-full flex items-center justify-center text-white/50">
        暂无数据。请先返回解析剧本。
      </div>
    );
  }

  const renderImagenPrompt = (promptObj: any) => {
    if (!promptObj) return null;
    const jsonString = typeof promptObj === 'string' ? promptObj : JSON.stringify(promptObj, null, 2);
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Nano Banana Pro Prompt</span>
          <button 
            onClick={() => handleCopy(jsonString)} 
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors bg-white/5 px-2 py-1 rounded"
          >
            {copiedPrompt === jsonString ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copiedPrompt === jsonString ? '已复制' : '复制 JSON'}
          </button>
        </div>
        <pre className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] sm:text-xs text-green-400/90 leading-relaxed overflow-x-auto scrollbar-hide">
          {jsonString}
        </pre>
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col"
    >
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-bold tracking-tight mb-2">元素微调</h2>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">在生成分镜前，检查并微调提取出的人物和场景设定。支持上传垫图进行多模态参考。</p>
        </div>
        <button
          onClick={handleGenerateStoryboards}
          disabled={isGeneratingStoryboards}
          className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black font-bold hover:bg-white/90 disabled:opacity-50 transition-all text-xs tracking-widest uppercase"
        >
          {isGeneratingStoryboards ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {generationProgress.total > 0 
                ? `生成分镜中 (${generationProgress.current}/${generationProgress.total})...` 
                : '确认并生成分镜'}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              确认并生成分镜
            </>
          )}
        </button>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
        {/* Characters & Scenes Display */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-2 scrollbar-hide">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white/40 font-medium">
              <Users className="w-4 h-4" />
              <h3 className="text-[10px] font-mono tracking-widest uppercase">[ 人物 ]</h3>
            </div>
            {charactersAndScenes.characters?.map((char: any, i: number) => (
              <div key={i} className="p-5 rounded-xl border border-white/10 bg-transparent">
                <h4 className="font-bold text-lg mb-2 text-white">{char.name}</h4>
                <p className="text-sm text-white/60 mb-3 leading-relaxed">{char.description}</p>
                <div className="flex flex-wrap gap-2">
                  {char.keywords?.map((kw: string, j: number) => (
                    <span key={j} className="px-2 py-1 text-[10px] font-mono tracking-widest uppercase rounded bg-white/5 border border-white/10 text-white/40">
                      {kw}
                    </span>
                  ))}
                </div>
                {renderImagenPrompt(char.imagenPrompt)}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white/40 font-medium">
              <Map className="w-4 h-4" />
              <h3 className="text-[10px] font-mono tracking-widest uppercase">[ 场景 ]</h3>
            </div>
            {charactersAndScenes.scenes?.map((scene: any, i: number) => (
              <div key={i} className="p-5 rounded-xl border border-white/10 bg-transparent">
                <h4 className="font-bold text-lg mb-2 text-white">{scene.name}</h4>
                <p className="text-sm text-white/60 mb-3 leading-relaxed">{scene.description}</p>
                <div className="flex flex-wrap gap-2">
                  {scene.keywords?.map((kw: string, j: number) => (
                    <span key={j} className="px-2 py-1 text-[10px] font-mono tracking-widest uppercase rounded bg-white/5 border border-white/10 text-white/40">
                      {kw}
                    </span>
                  ))}
                </div>
                {renderImagenPrompt(scene.imagenPrompt)}
              </div>
            ))}
          </div>
        </div>

        {/* Refinement Chat */}
        <div className="flex flex-col rounded-2xl border border-white/10 bg-transparent overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-transparent">
            <h3 className="text-[10px] font-mono tracking-widest uppercase text-white/40">[ AI 多模态微调助手 ]</h3>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto flex flex-col justify-end">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 w-5/6 mb-4">
              <p className="text-sm text-white/80 leading-relaxed">
                我已经提取了人物和场景。您需要做任何调整吗？您可以直接上传参考图（垫图），我会根据图片风格为您修改设定！
              </p>
            </div>
          </div>

          <div className="p-4 border-t border-white/10 bg-transparent flex flex-col gap-3">
            {referenceImage && (
              <div className="relative inline-block w-20 h-20 rounded-lg overflow-hidden border border-white/20">
                <img src={referenceImage.url} alt="Reference" className="w-full h-full object-cover" />
                <button 
                  onClick={() => setReferenceImage(null)}
                  className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/80 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
            <div className="relative flex items-center gap-2">
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload} 
                className="hidden" 
                id="image-upload" 
                ref={fileInputRef}
              />
              <label 
                htmlFor="image-upload" 
                className="cursor-pointer p-3 rounded-xl bg-transparent hover:bg-white/5 border border-white/10 text-white/40 hover:text-white transition-colors"
                title="上传参考图 (垫图)"
              >
                <ImagePlus className="w-5 h-5" />
              </label>
              <input
                type="text"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                placeholder="告诉 AI 如何调整，或直接发送图片..."
                className="flex-1 bg-transparent border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={handleRefine}
                disabled={(!feedback.trim() && !referenceImage) || isRefining}
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

