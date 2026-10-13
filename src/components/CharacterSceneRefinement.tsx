import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Users, Map, Send, Loader2, CheckCircle2, ImagePlus, X, Copy, Check } from 'lucide-react';
import { SCRIPT_ANALYSIS_GUIDANCE, STORYBOARD_GUIDANCE } from '../lib/creativePrompts';
import { generateGeminiContent } from '../lib/gemini';
import { errorMessage, parseCharactersAndScenes, parseStoryboards, readImageFile } from '../lib/workflowValidation';
import { generateDeepSeekContent } from '../lib/deepseek';

interface CharacterSceneRefinementProps {
  scriptData: string;
  charactersAndScenes: any;
  setCharactersAndScenes: (data: any) => void;
  onNext: () => void;
  setStoryboards: React.Dispatch<React.SetStateAction<any[] | null>>;
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
  const busyRef = useRef(false);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [error, setError] = useState('');
  const chunkCacheRef = useRef<{ key: string; chunks: any[][] }>({ key: '', chunks: [] });
  const latestSourceRef = useRef({ scriptData, charactersAndScenes });
  latestSourceRef.current = { scriptData, charactersAndScenes };
  const isBusy = isRefining || isGeneratingStoryboards || isReadingImage;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(text);
      setTimeout(() => setCopiedPrompt(null), 2000);
    } catch {
      setError('复制失败，请选中提示词手动复制。');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setIsReadingImage(true);
    setError('');
    try {
      const url = await readImageFile(file);
      setReferenceImage({ url, data: url.split(',')[1], mimeType: file.type });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      busyRef.current = false;
      setIsReadingImage(false);
      e.target.value = '';
    }
  };

  const handleRefine = async () => {
    if (busyRef.current || (!feedback.trim() && !referenceImage)) return;
    busyRef.current = true;
    setError('');

    setIsRefining(true);
    try {
      const promptText = `你是顶级影视视效总监和专业的 Nano Banana Pro 提示词工程师。
      ${SCRIPT_ANALYSIS_GUIDANCE}
      当前的人物和场景：
      ${JSON.stringify(charactersAndScenes, null, 2)}

      用户反馈：
      ${feedback || "请参考提供的图片，提取其视觉特征（如人物长相、服装风格、场景氛围等），并更新当前的人物和场景设定。"}

      只修改用户反馈指定的人物或场景，其余设定与原名保持一致。如果提供参考图，按用户指定的职责提取视觉特征，不混入参考排版。
      同时更新相关imagenPrompt，写清具体材质、造型、空间和主光，不堆砌画质词。人物参考图与无人物场景图保持用途清楚。
      请用中文输出基础信息，但 imagenPrompt 的值必须使用英文，且必须是包含 [VARIABLES] 和 [EXECUTION] 的单行或多行字符串。
      格式为JSON，结构如下：
      {
        "characters": [{ "name": "...", "description": "...", "keywords": ["..."], "imagenPrompt": "[VARIABLES]\\nSUBJECT = \\"...\\"\\nLOCATION = \\"...\\"\\nLIGHTING = \\"...\\"\\nCAM_SETTINGS = \\"...\\"\\n[EXECUTION]\\n..." }],
        "scenes": [{ "name": "...", "description": "...", "keywords": ["..."], "imagenPrompt": "[VARIABLES]\\nSUBJECT = \\"...\\"\\nLOCATION = \\"...\\"\\nLIGHTING = \\"...\\"\\nCAM_SETTINGS = \\"...\\"\\n[EXECUTION]\\n..." }]
      }`;

      const responseText = await generateGeminiContent(promptText, referenceImage?.data, referenceImage?.mimeType);
      const refined = parseCharactersAndScenes(responseText);
      if (latestSourceRef.current.charactersAndScenes !== charactersAndScenes || latestSourceRef.current.scriptData !== scriptData) throw new Error('剧本或设定已更新，本次微调未覆盖当前内容。请重新提交。');
      setCharactersAndScenes(refined);
      setFeedback('');
      setReferenceImage(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      busyRef.current = false;
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
    if (busyRef.current) return;
    if (!scriptData.trim()) { setError('请先添加剧本，再生成分镜。'); return; }
    busyRef.current = true;
    setError('');
    setIsGeneratingStoryboards(true);
    try {
      // Split script into smaller chunks (e.g., 800 chars) to ensure DeepSeek has enough output tokens for dense shot breakdown
      const chunks = chunkText(scriptData, 800);
      const cacheKey = JSON.stringify({ scriptData, charactersAndScenes });
      if (chunkCacheRef.current.key !== cacheKey) chunkCacheRef.current = { key: cacheKey, chunks: [] };
      setGenerationProgress({ current: 1, total: chunks.length });

      let allStoryboards: any[] = [];
      let currentShotNumber = 1;

      for (let i = 0; i < chunks.length; i++) {
        setGenerationProgress({ current: i + 1, total: chunks.length });
        const cached = chunkCacheRef.current.chunks[i];
        if (cached) {
          allStoryboards.push(...cached.map((shot, offset) => ({ ...shot, shotNumber: currentShotNumber + offset })));
          currentShotNumber = allStoryboards.length + 1;
          continue;
        }

        const prompt = `你是专业的影视导演。这是剧本的第 ${i + 1}/${chunks.length} 部分。
          ${STORYBOARD_GUIDANCE}
          已确认的人物与场景：${JSON.stringify(charactersAndScenes)}
          前一段结尾分镜：${JSON.stringify(allStoryboards.slice(-2))}
          将这部分剧本拆分为可独立生成的视频片段，每段以一个剧情变化为中心，按事件需要安排5—15秒的内容。
          不为固定时长增加动作，也不为固定镜头数改变节奏。保留原文动作、反应和逐字对白，较长对白自然分到相邻片段。
          请从片段编号 ${currentShotNumber} 开始连续编号，保持前一段的动作落点和人物状态。

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
                "scene": "...",
                "dialogue": "原文对白（无对白则为空字符串）",
                "continuity": "承接前后镜头的动作、道具和人物状态",
                "sourceExcerpt": "对应的原文片段"
              }
            ]
          }`;

        try {
          const responseText = await generateDeepSeekContent(prompt, true);
          const shots = parseStoryboards(responseText, currentShotNumber);
          chunkCacheRef.current.chunks[i] = shots;
          allStoryboards.push(...shots);
          currentShotNumber = allStoryboards.length + 1;
        } catch (chunkError) {
          throw new Error(`第 ${i + 1}/${chunks.length} 段生成失败：${errorMessage(chunkError)} 已完成的段落已暂存，再次点击会从失败段继续。`);
        }
      }
      if (latestSourceRef.current.scriptData !== scriptData || latestSourceRef.current.charactersAndScenes !== charactersAndScenes) throw new Error('剧本或设定已更新，本次生成未覆盖当前分镜。请按当前设定重新生成。');
      setStoryboards(allStoryboards);
      chunkCacheRef.current = { key: '', chunks: [] };
      onNext();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      busyRef.current = false;
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
            {copiedPrompt === jsonString ? '已复制' : '复制提示词'}
          </button>
        </div>
        <pre className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-xs text-white/80 leading-relaxed whitespace-pre-wrap break-words">
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
      <div className="mb-6 flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-2">元素微调</h2>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">在生成分镜前，检查并微调提取出的人物和场景设定。支持上传垫图进行多模态参考。</p>
        </div>
        <button
          onClick={handleGenerateStoryboards}
          disabled={isBusy}
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

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-0">
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
                <img src={referenceImage.url} alt="微调人物与场景的参考图" className="w-full h-full object-cover" />
                <button
                  onClick={() => setReferenceImage(null)}
                  disabled={isBusy}
                  aria-label="移除参考图片"
                  className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/80 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
            <div className="relative flex items-center gap-2">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isBusy}
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
                ref={fileInputRef}
              />
              <button type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                aria-label="上传参考图"
                className="cursor-pointer p-3 rounded-xl bg-transparent hover:bg-white/5 border border-white/10 text-white/40 hover:text-white transition-colors"
                title="上传参考图 (垫图)"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
              <input
                type="text"
                aria-label="人物与场景调整意见"
                disabled={isBusy}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleRefine()}
                placeholder="告诉 AI 如何调整，或直接发送图片..."
                className="flex-1 bg-transparent border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={handleRefine}
                disabled={(!feedback.trim() && !referenceImage) || isBusy}
                aria-label="提交人物与场景微调"
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

