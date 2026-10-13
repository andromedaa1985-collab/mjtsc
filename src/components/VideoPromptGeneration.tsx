import React, { useState, useRef } from 'react';
import { Video, Copy, Check, Sparkles, Loader2, Sliders, Camera as CameraIcon, Sun, AlignLeft, Palette, Droplets, Wand2, Clock, MonitorPlay, Film, Music, Image as ImageIcon, FileText, Activity, AlertTriangle } from 'lucide-react';
import { generateDeepSeekContent } from '../lib/deepseek';
import { errorMessage, parseShotSuggestions, parseVideoPrompt, parsePromptReview } from '../lib/workflowValidation';
import { buildVideoPrompt, buildPromptReview, checkPromptTimeline } from '../lib/creativePrompts';
import { cn } from '../lib/utils';

interface VideoPromptGenerationProps {
  storyboards: any[];
  setStoryboards: React.Dispatch<React.SetStateAction<any[] | null>>;
  charactersAndScenes: any;
}

interface ShotParams {
  style: string;
  aspectRatio: string;
  duration: string;
  lighting: string;
  palette: string;
  cameraIntent: string;
  vfx: string;
  sound: string;
  reference: string;
}

const defaultParams: ShotParams = {
  style: '电影级写实风格',
  aspectRatio: '16:9宽屏',
  duration: '15秒',
  lighting: '自然光/电影感',
  palette: '延续当前场景与相邻镜头的色彩关系',
  cameraIntent: '服务当前动作与剧情转折',
  vfx: '无特殊特效',
  sound: '适合画面的环境音与配乐',
  reference: ''
};

export default function VideoPromptGeneration({ storyboards, setStoryboards, charactersAndScenes }: VideoPromptGenerationProps) {
  const [activeShotNumber, setActiveShotNumber] = useState<number>(1);
  const activeShotIndex = Math.max(0, (storyboards || []).findIndex(shot => shot.shotNumber === activeShotNumber));
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [suggestingIndex, setSuggestingIndex] = useState<number | null>(null);
  const [reviewingIndex, setReviewingIndex] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const latestStoryboardsRef = useRef(storyboards);
  latestStoryboardsRef.current = storyboards;
  const isBusy = generatingIndex !== null || suggestingIndex !== null || reviewingIndex !== null;

  const getParams = (index: number): ShotParams => {
    const saved = storyboards?.[index]?.videoParams;
    return Object.fromEntries(Object.entries(defaultParams).map(([field, value]) => [field, typeof saved?.[field] === 'string' ? saved[field] : value])) as unknown as ShotParams;
  };

  const updateShot = (source: any, update: (current: any) => any) => {
    if (!latestStoryboardsRef.current?.includes(source)) throw new Error('分镜已更新，本次结果未覆盖当前内容。请按最新分镜重试。');
    setStoryboards(current => current?.map(shot => shot === source ? update(shot) : shot) || current);
  };

  const handleParamChange = (index: number, field: keyof ShotParams, value: string) => {
    if (busyRef.current) return;
    const source = storyboards[index];
    updateShot(source, shot => ({ ...shot, videoParams: { ...getParams(index), [field]: value } }));
  };

  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { setError('复制失败，请选中提示词手动复制。'); }
  };

  const handleAutoSuggest = async (index: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    setSuggestingIndex(index);
    const source = storyboards[index];
    try {
      const prompt = `你是影视摄影指导。请根据当前分镜推荐适合剧情的拍摄参数，保留原文对白，给台词、停顿和动作留下时间。
      分镜：${JSON.stringify(source)}
      不为凑时长增加动作，不把人物表演与摄影机移动混淆。
      仅返回严格JSON：
      {"duration":"从5秒、10秒、15秒选择一个", "lighting":"从自然光/电影感、逆光剪影、丁达尔体积光、赛博霓虹、暖色调、冷色调选择一个", "vfx":"从无特殊特效、粒子消散、烟雾弥漫、暴雨、飘雪、火花飞溅选择一个", "sound":"适合本段的环境音、动作音或配乐"}`;
      const suggestions = parseShotSuggestions(await generateDeepSeekContent(prompt, true));
      updateShot(source, shot => ({ ...shot, videoParams: { ...getParams(index), ...suggestions } }));
    } catch (error) { setError(errorMessage(error)); }
    finally { busyRef.current = false; setSuggestingIndex(null); }
  };

  const handleReviewPrompt = async (index: number) => {
    if (busyRef.current || !storyboards[index]?.videoPromptData?.masterPrompt?.trim()) return;
    busyRef.current = true;
    setError('');
    setReviewingIndex(index);
    const source = storyboards[index];
    try {
      const prompt = buildPromptReview(source, getParams(index), source.videoPromptData.masterPrompt, storyboards[index - 1], storyboards[index + 1], charactersAndScenes);
      const review = parsePromptReview(await generateDeepSeekContent(prompt, true));
      updateShot(source, shot => ({ ...shot, videoPromptData: { ...shot.videoPromptData, review } }));
    } catch (error) { setError(errorMessage(error)); }
    finally { busyRef.current = false; setReviewingIndex(null); }
  };

  const applyImprovedPrompt = (index: number) => {
    if (busyRef.current) return;
    const source = storyboards[index];
    const review = source.videoPromptData?.review;
    if (review?.improvedPrompt) updateShot(source, shot => ({ ...shot, videoPromptData: { masterPrompt: review.improvedPrompt } }));
  };

  const handleGenerate = async (index: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    setGeneratingIndex(index);
    const source = storyboards[index];
    try {
      const prompt = buildVideoPrompt(source, getParams(index), storyboards[index - 1], storyboards[index + 1], charactersAndScenes);
      const videoPromptData = parseVideoPrompt(await generateDeepSeekContent(prompt, true));
      updateShot(source, shot => ({ ...shot, videoPromptData }));
    } catch (error) { setError(errorMessage(error)); }
    finally { busyRef.current = false; setGeneratingIndex(null); }
  };

  const handlePromptEdit = (index: number, newValue: string) => {
    if (busyRef.current) return;
    updateShot(storyboards[index], shot => ({ ...shot, videoPromptData: { masterPrompt: newValue } }));
  };

  if (!storyboards || storyboards.length === 0) {
    return <div className="h-full flex items-center justify-center text-white/50">暂无分镜，请返回分镜步骤生成并确认分镜。</div>;
  }

  const activeShot = storyboards[activeShotIndex];
  const activeParams = getParams(activeShotIndex);
  const promptData = activeShot.videoPromptData;
  const timelineWarnings = promptData?.masterPrompt ? checkPromptTimeline(promptData.masterPrompt, activeParams.duration) : [];

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 sm:gap-6">
      {/* Left Panel: Shot List (Master) */}
      <div className="w-full lg:w-64 xl:w-80 max-h-60 lg:max-h-none flex flex-col bg-transparent border border-white/10 rounded-2xl overflow-hidden shadow-2xl shrink-0">
        <div className="p-4 border-b border-white/10 bg-transparent">
          <h3 className="font-bold text-[10px] tracking-widest uppercase flex items-center gap-2 text-white/40">
            <Video className="w-4 h-4" />
            分镜序列 ({storyboards.length})
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
          {storyboards.map((shot, index) => (
            <button
              key={index}
              onClick={() => { setActiveShotNumber(shot.shotNumber); setCopiedField(null); }}
              aria-current={activeShotIndex === index ? 'true' : undefined}
              className={cn('w-full text-left p-3 rounded-xl transition-colors flex items-start gap-3 border', activeShotIndex === index ? 'bg-white/10 border-white/20' : 'hover:bg-white/5 border-transparent')}
            >
              <div className={cn('size-6 rounded flex items-center justify-center text-xs font-mono tabular-nums shrink-0', shot.videoPromptData?.masterPrompt ? 'bg-white text-black' : 'bg-white/10 text-white/50')}>
                {shot.shotNumber}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs truncate', activeShotIndex === index ? 'text-white' : 'text-white/50')}>{shot.action}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {shot.videoPromptData ? (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-white text-black font-bold tracking-widest uppercase">已生成</span>
                  ) : (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 tracking-widest uppercase">待处理</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel: Shot Editor (Detail) */}
      <div className="flex-1 flex flex-col bg-transparent border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-0">
        {/* Editor Header */}
        <div className="p-4 sm:px-6 border-b border-white/10 bg-transparent flex flex-wrap gap-4 items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-white/10 border border-white/20 font-mono text-[10px] text-white">
              {activeShot.shotNumber}
            </div>
            <h2 className="font-bold text-sm tracking-widest uppercase">SEEDANCE 2.0 提示词工作台</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleAutoSuggest(activeShotIndex)}
              disabled={isBusy}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-transparent hover:bg-white/5 text-white border border-white/20 text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50"
            >
              {suggestingIndex === activeShotIndex ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              AI 智能推演参数
            </button>
            <button
              onClick={() => handleGenerate(activeShotIndex)}
              disabled={isBusy}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-white hover:bg-white/90 text-black text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50"
            >
              {generatingIndex === activeShotIndex ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {promptData ? '重新生成提示词' : '生成视频提示词'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          {/* Section 1: Original Reference */}
          <div className="p-5 rounded-xl bg-transparent border border-white/10">
            <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlignLeft className="w-3 h-3" /> 原始分镜动作
            </h4>
            <p className="text-sm text-white/80 leading-relaxed">{activeShot.action}</p>
            {activeShot.dialogue && <p className="mt-3 border-l-2 border-white/30 pl-3 text-sm text-white/70 whitespace-pre-wrap">原文对白：{activeShot.dialogue}</p>}
            {activeShot.continuity && <p className="mt-3 text-xs text-white/50">连续性：{activeShot.continuity}</p>}
          </div>

          {/* Section 2: Seedance 2.0 Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Group 1: Base Settings */}
            <div className="col-span-1 space-y-4 p-5 rounded-xl bg-transparent border border-white/10">
              <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest border-b border-white/10 pb-2 mb-4">[ 基础设定 (BASE) ]</h4>
              
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Palette className="w-3 h-3" /> 风格 (STYLE)</label>
                <select aria-label="视频风格" disabled={isBusy} value={activeParams.style} onChange={(e) => handleParamChange(activeShotIndex, 'style', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>电影级写实风格</option>
                  <option>3D动画风格</option>
                  <option>中国水墨风格</option>
                  <option>赛博朋克风格</option>
                  <option>高端商业广告风格</option>
                  <option>纪实感风格</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><MonitorPlay className="w-3 h-3" /> 画幅 (RATIO)</label>
                <select aria-label="视频画幅" disabled={isBusy} value={activeParams.aspectRatio} onChange={(e) => handleParamChange(activeShotIndex, 'aspectRatio', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>16:9宽屏</option>
                  <option>9:16竖屏</option>
                  <option>2.35:1电影宽屏</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3" /> 时长 (DURATION)</label>
                <select aria-label="视频时长" disabled={isBusy} value={activeParams.duration} onChange={(e) => handleParamChange(activeShotIndex, 'duration', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>5秒</option>
                  <option>10秒</option>
                  <option>15秒</option>
                </select>
              </div>
            </div>

            {/* Group 2: Camera & Visuals */}
            <div className="col-span-1 space-y-4 p-5 rounded-xl bg-transparent border border-white/10">
              <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest border-b border-white/10 pb-2 mb-4">[ 镜头视觉 (VISUALS) ]</h4>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Sun className="w-3 h-3" /> 光影 (LIGHTING)</label>
                <select aria-label="光影" disabled={isBusy} value={activeParams.lighting} onChange={(e) => handleParamChange(activeShotIndex, 'lighting', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>自然光/电影感</option>
                  <option>逆光剪影</option>
                  <option>丁达尔体积光</option>
                  <option>赛博霓虹</option>
                  <option>暖色调</option>
                  <option>冷色调</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Droplets className="w-3 h-3" /> 特效 (VFX)</label>
                <select aria-label="视觉特效" disabled={isBusy} value={activeParams.vfx} onChange={(e) => handleParamChange(activeShotIndex, 'vfx', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>无特殊特效</option>
                  <option>粒子消散</option>
                  <option>烟雾弥漫</option>
                  <option>暴雨</option>
                  <option>飘雪</option>
                  <option>火花飞溅</option>
                </select>
              </div>

              <label className="block space-y-2 text-xs text-white/60">
                <span className="flex items-center gap-1.5"><Palette className="size-3" />色彩关系</span>
                <select aria-label="色彩关系" disabled={isBusy} value={activeParams.palette} onChange={event => handleParamChange(activeShotIndex, 'palette', event.target.value)} className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>延续当前场景与相邻镜头的色彩关系</option>
                  <option>冷环境／暖主体</option>
                  <option>低饱和环境／单一强调色</option>
                  <option>自然日光／真实材质</option>
                </select>
              </label>

              <label className="block space-y-2 text-xs text-white/60">
                <span className="flex items-center gap-1.5"><CameraIcon className="size-3" />镜头目的与空间路径</span>
                <textarea aria-label="镜头目的与空间路径" rows={3} disabled={isBusy} value={activeParams.cameraIntent} onChange={event => handleParamChange(activeShotIndex, 'cameraIntent', event.target.value)} placeholder="例如：跟随人物从门外走入，停在她发现信封的反应上。" className="w-full resize-y rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs leading-relaxed text-white/90 focus:outline-none focus:border-white/30" />
              </label>
            </div>

            {/* Group 3: Audio & Reference */}
            <div className="col-span-1 space-y-4 p-5 rounded-xl bg-transparent border border-white/10">
              <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest border-b border-white/10 pb-2 mb-4">[ 声音与参考 (AUDIO & REF) ]</h4>
              
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Music className="w-3 h-3" /> 声音设计 (SOUND)</label>
                <input 
                  type="text"
                  aria-label="声音设计"
                  disabled={isBusy}
                  value={activeParams.sound}
                  onChange={(e) => handleParamChange(activeShotIndex, 'sound', e.target.value)}
                  placeholder="例如：舒缓钢琴曲+海浪声"
                  className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><ImageIcon className="w-3 h-3" /> 参考素材 (REFERENCE)</label>
                <input 
                  type="text"
                  aria-label="参考素材绑定"
                  disabled={isBusy}
                  value={activeParams.reference}
                  onChange={(e) => handleParamChange(activeShotIndex, 'reference', e.target.value)}
                  placeholder="例如：@图片1 作为首帧"
                  className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30"
                />
                <p className="text-[10px] text-white/30 mt-1">支持 @图片、@视频 语法</p>
              </div>
            </div>
          </div>

          {/* Section 3: Final Editable Prompt */}
          {promptData && (
            <div className="space-y-3 mt-4 flex-1 flex flex-col">
              <div className="flex flex-wrap gap-3 items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-[10px] font-mono tracking-widest uppercase text-white flex items-center gap-2">
                  <FileText className="w-4 h-4" /> 最终提示词 (可直接编辑)
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleReviewPrompt(activeShotIndex)}
                    aria-label="AI 剧情与连续性审查"
                    disabled={isBusy || !promptData.masterPrompt.trim()}
                    className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded bg-transparent hover:bg-white/5 border border-white/20 text-white transition-colors text-xs font-medium disabled:opacity-50"
                  >
                    {reviewingIndex === activeShotIndex ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    AI 审查
                  </button>
                  <button
                    onClick={() => handleCopy(promptData.masterPrompt, 'master')}
                    className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded bg-white hover:bg-white/90 text-black transition-colors text-xs font-medium"
                  >
                    {copiedField === 'master' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedField === 'master' ? '已复制' : '复制提示词'}
                  </button>
                </div>
              </div>
              
              <textarea 
                aria-label="最终视频提示词，可直接编辑"
                disabled={isBusy}
                value={promptData.masterPrompt}
                onChange={(e) => handlePromptEdit(activeShotIndex, e.target.value)}
                className="w-full flex-1 min-h-[200px] bg-transparent border border-white/20 rounded-xl p-5 text-sm text-white/90 font-mono whitespace-pre-wrap leading-relaxed focus:outline-none focus:border-white/40 transition-colors"
                placeholder="点击上方按钮生成提示词..."
              />

              {timelineWarnings.length > 0 && <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100"><p className="mb-1 font-medium">时间轴提示</p>{timelineWarnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
              {Array.isArray(promptData.postProductionNotes) && promptData.postProductionNotes.length > 0 && <div className="rounded-xl border border-white/10 p-4"><h4 className="mb-3 text-sm font-medium text-white/80">后期完成建议</h4><ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/60">{promptData.postProductionNotes.map((note: string, index: number) => <li key={index}>{note}</li>)}</ul></div>}
              {promptData.review && (
                <div className="mt-4 p-5 rounded-xl bg-transparent border border-white/20">
                  <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
                    <h4 className="text-[10px] font-mono tracking-widest uppercase text-white flex items-center gap-2">
                      <Activity className="w-4 h-4" /> 审查报告 (得分: {promptData.review.score}/100)
                    </h4>
                    <button
                      onClick={() => applyImprovedPrompt(activeShotIndex)}
                      disabled={isBusy}
                      className="px-4 py-2 rounded bg-white hover:bg-white/90 text-black text-[10px] font-bold tracking-widest uppercase transition-colors"
                    >
                      一键应用优化版本
                    </button>
                  </div>
                  <div className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap mb-4 bg-white/5 p-3 rounded-lg border border-white/10">
                    {promptData.review.critique}
                  </div>
                  <div className="p-4 rounded-lg bg-transparent border border-white/10">
                    <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mb-2">优化后的提示词预览：</p>
                    <p className="text-xs text-white/80 font-mono whitespace-pre-wrap leading-relaxed">{promptData.review.improvedPrompt}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
