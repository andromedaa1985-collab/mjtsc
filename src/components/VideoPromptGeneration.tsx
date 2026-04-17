import { useState } from 'react';
import { Video, Copy, Check, Sparkles, Loader2, Sliders, Camera as CameraIcon, Sun, AlignLeft, Palette, Droplets, Wand2, Clock, MonitorPlay, Film, Music, Image as ImageIcon, FileText, Activity, AlertTriangle } from 'lucide-react';
import { generateDeepSeekContent } from '../lib/deepseek';

interface VideoPromptGenerationProps {
  storyboards: any[];
  setStoryboards: (data: any) => void;
  charactersAndScenes: any;
}

interface ShotParams {
  style: string;
  aspectRatio: string;
  duration: string;
  lighting: string;
  vfx: string;
  sound: string;
  reference: string;
}

const defaultParams: ShotParams = {
  style: '电影级写实风格',
  aspectRatio: '16:9宽屏',
  duration: '15秒',
  lighting: '自然光/电影感',
  vfx: '无特殊特效',
  sound: '适合画面的环境音与配乐',
  reference: ''
};

export default function VideoPromptGeneration({ storyboards, setStoryboards, charactersAndScenes }: VideoPromptGenerationProps) {
  const [activeShotIndex, setActiveShotIndex] = useState<number>(0);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [suggestingIndex, setSuggestingIndex] = useState<number | null>(null);
  const [reviewingIndex, setReviewingIndex] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const [shotParams, setShotParams] = useState<Record<number, ShotParams>>({});

  const handleParamChange = (index: number, field: keyof ShotParams, value: any) => {
    setShotParams(prev => ({
      ...prev,
      [index]: { ...(prev[index] || defaultParams), [field]: value }
    }));
  };

  const getParams = (index: number) => shotParams[index] || defaultParams;

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAutoSuggest = async (index: number) => {
    setSuggestingIndex(index);
    try {
      const shot = storyboards[index];
      const prompt = `你是一位好莱坞顶级摄影指导 (DP)。请分析以下分镜动作，为其推荐最适合 Seedance 2.0 的拍摄参数。
      
      【当前镜头动作描述】：
      ${shot.action}
      【当前场景】：
      ${shot.scene}
      
      请特别注意：
      1. **智能判断时长 (duration)**：根据动作的复杂程度和信息量，智能判断所需的【时长】，必须严格从以下三个值中选择：
         - 如果描述中包含简单的动作或情绪（如单一表情、简单走动），推荐 "5秒"；
         - 如果涉及多组动作或转折，推荐 "10秒"；
         - 如果描述的是宏大场景、复杂叙事或情感递进，推荐 "15秒"。
      2. **光影与特效 (lighting & vfx)**：根据动作描述中的情感色彩，选择最匹配的光影（如：丁达尔体积光、赛博霓虹、自然光等）和特效（如：无特殊特效、烟雾弥漫、粒子消散等）。
      3. **音效 (sound)**：提供适合画面的配乐与音效描述。
      
      返回严格的JSON格式（不要输出任何其他文本，不要使用Markdown代码块）：
      {
        "duration": "5秒 / 10秒 / 15秒",
        "lighting": "自然光 / 逆光剪影 / 丁达尔体积光 / 赛博霓虹 / 暖色调 / 冷色调",
        "vfx": "无特殊特效 / 粒子消散 / 烟雾弥漫 / 暴雨 / 飘雪 / 火花飞溅",
        "sound": "适合画面的配乐与音效描述（如：舒缓钢琴曲+海浪声）"
      }`;

      const responseText = await generateDeepSeekContent(prompt, true);
      if (responseText) {
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
          const parsedData = JSON.parse(cleanJson);
          setShotParams(prev => ({
            ...prev,
            [index]: { ...getParams(index), ...parsedData }
          }));
        } catch (parseError) {
          console.error("Failed to parse auto-suggest JSON:", responseText, parseError);
          throw new Error("Invalid JSON from AI");
        }
      }
    } catch (error) {
      console.error("Failed to auto-suggest:", error);
      alert("AI 推演参数失败，请重试。");
    } finally {
      setSuggestingIndex(null);
    }
  };

  const generatePromptForShot = async (shot: any, index: number) => {
    const params = getParams(index);
    const prompt = `你是顶级影视视效总监和 Seedance 2.0（字节跳动旗舰级AI视频生成模型）的专业提示词工程师。
      请根据以下【当前分镜画面描述】以及用户指定的【控制参数】，严格按照【Seedance 2.0 官方提示词公式】生成最终的视频提示词。
      
      **【当前分镜画面描述】**：
      ${shot.action}
      
      **用户指定的控制参数**：
      - 风格：${params.style}
      - 画幅：${params.aspectRatio}
      - 时长：${params.duration}
      - 光影：${params.lighting}
      - 特效：${params.vfx}
      - 声音：${params.sound}
      - 参考素材：${params.reference || '无'}
      
      **【Seedance 2.0 官方提示词公式】**（必须严格遵守此结构）：
      [时长][品质锚定：渲染引擎+画质规格+VFX等级]，[核心氛围宣言：美学风格+整体感受]，[大气连贯声明：全片统一的物理/氛围效果]，
      
      （⚠️ 核心要求：绝对不能只写一段！必须根据总时长进行合理的分段叙事。例如15秒的视频，必须拆分为如 0-3秒、4-8秒、9-12秒、13-15秒 这样的3到4个阶段。每个阶段都要详细描述：[运镜变化] + [画面主体与动作发展] + [环境物理与特效交互]）
      0-X秒：[画面动作] + [运镜] + [大气在本段的具体表现]；
      X-Y秒：[画面动作] + [运镜变化] + [大气在本段的具体表现]；
      ...
      
      光影：[①光源：主光类型和角度] + [②光行为：如何影响大气/材质] + [③色调：冷暖对比]，
      [收束句：后期处理词叠加] + [张力宣言：一句话锚定全片情绪]。
      禁止：任何文字、字幕、LOGO或水印
      
      返回严格的JSON格式（不要输出任何其他文本，不要使用Markdown代码块）。
      特别注意："masterPrompt" 字段的值必须是一个单行字符串，如果需要换行，请使用 "\\n" 转义字符，绝对不能在JSON字符串内部直接换行！
      
      请输出如下JSON结构：
      {
        "masterPrompt": "[时长][品质锚定]...\\n\\n0-3秒：...\\n4-8秒：...\\n9-15秒：...\\n\\n光影：...\\n禁止：任何文字、字幕、LOGO或水印"
      }`;

    const responseText = await generateDeepSeekContent(prompt, true);
    if (responseText) {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
        
        const parsedData = JSON.parse(cleanJson);
        if (parsedData.masterPrompt) return { masterPrompt: parsedData.masterPrompt };
      } catch (parseError) {
        console.error("Failed to parse video prompt JSON:", responseText, parseError);
        const masterPromptMatch = responseText.match(/"masterPrompt"\s*:\s*"([^"]+)"/);
        if (masterPromptMatch) {
           return { masterPrompt: masterPromptMatch[1].replace(/\\n/g, '\n') };
        }
        throw new Error("Invalid JSON from AI");
      }
    }
    throw new Error("Invalid response format");
  };

  const handleReviewPrompt = async (index: number) => {
    setReviewingIndex(index);
    try {
      const currentPrompt = storyboards[index].videoPromptData?.masterPrompt;
      if (!currentPrompt) return;

      const prompt = `你是 Seedance 2.0 官方的“提示词审查专家 (Prompt Critic)”。你的任务是审查用户生成的提示词，进行对抗性测试，找出不合理之处并提供优化版本。
      
      【待审查的提示词】：
      ${currentPrompt}
      
      【审查标准（Seedance 2.0 官方红线与规范）】：
      1. 格式规范：必须严格包含【风格】、【时间轴】、【声音】三大模块。
      2. 时间轴逻辑：绝对不能只有一个时间段（如0-15秒），必须根据动作拆分为多个阶段（如0-3秒，3-7秒等），且时间必须连续。
      3. 镜头合理性：运镜是否符合物理规律？（例如不能同时“推镜头”又“拉镜头”）。
      4. 平台红线：绝对不能出现“写实真人脸部/真实人脸”的描述（平台会拦截），如果有，必须替换为“电影级质感面部”或模糊化处理。
      5. 动作与物理：动作是否连贯？是否写出了与环境的物理交互（如扬起沙尘、水花）？
      
      返回严格的JSON格式（不要输出任何其他文本，不要使用Markdown代码块）：
      {
        "score": 0到100的整数评分,
        "critique": "指出当前提示词的缺陷和不合理之处（中文，简明扼要，分点说明）",
        "improvedPrompt": "修复所有缺陷后的完美提示词（必须保持原有的多行格式，使用 \\n 换行）"
      }`;

      const responseText = await generateDeepSeekContent(prompt, true);
      if (responseText) {
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
          
          // If the AI output unescaped newlines inside strings, JSON.parse will fail.
          // We can try a simple fix for common cases, but replacing all newlines breaks the JSON structure itself.
          // Let's just rely on the AI to output valid JSON.
          const parsedData = JSON.parse(cleanJson);
          
          const updatedStoryboards = [...storyboards];
          updatedStoryboards[index].videoPromptData.review = parsedData;
          setStoryboards(updatedStoryboards);
        } catch (parseError) {
          console.error("Failed to parse review JSON:", responseText, parseError);
          throw new Error("Invalid JSON from AI Critic");
        }
      }
    } catch (error) {
      console.error("Failed to review prompt:", error);
      alert("审查失败，请重试。");
    } finally {
      setReviewingIndex(null);
    }
  };

  const applyImprovedPrompt = (index: number) => {
    const updatedStoryboards = [...storyboards];
    const review = updatedStoryboards[index].videoPromptData.review;
    if (review && review.improvedPrompt) {
      updatedStoryboards[index].videoPromptData.masterPrompt = review.improvedPrompt;
      updatedStoryboards[index].videoPromptData.review = undefined;
      setStoryboards(updatedStoryboards);
    }
  };

  const handleGenerate = async (index: number) => {
    setGeneratingIndex(index);
    try {
      const newPromptData = await generatePromptForShot(storyboards[index], index);
      const updatedStoryboards = [...storyboards];
      updatedStoryboards[index] = { ...updatedStoryboards[index], videoPromptData: newPromptData };
      setStoryboards(updatedStoryboards);
    } catch (error) {
      console.error("Failed to generate prompt:", error);
      alert("生成失败，请重试。");
    } finally {
      setGeneratingIndex(null);
    }
  };

  const handlePromptEdit = (index: number, newValue: string) => {
    const updatedStoryboards = [...storyboards];
    if (!updatedStoryboards[index].videoPromptData) {
      updatedStoryboards[index].videoPromptData = { masterPrompt: '' };
    }
    updatedStoryboards[index].videoPromptData.masterPrompt = newValue;
    setStoryboards(updatedStoryboards);
  };

  if (!storyboards || storyboards.length === 0) {
    return <div className="h-full flex items-center justify-center text-white/50">暂无分镜数据。</div>;
  }

  const activeShot = storyboards[activeShotIndex];
  const activeParams = getParams(activeShotIndex);
  const promptData = activeShot.videoPromptData;

  return (
    <div className="h-full flex gap-6">
      {/* Left Panel: Shot List (Master) */}
      <div className="w-80 flex flex-col bg-transparent border border-white/10 rounded-2xl overflow-hidden shadow-2xl shrink-0">
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
              onClick={() => setActiveShotIndex(index)}
              className={`w-full text-left p-3 rounded-xl transition-all flex items-start gap-3 ${activeShotIndex === index ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5 border border-transparent'}`}
            >
              <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono shrink-0 ${shot.videoPromptData ? 'bg-white text-black' : 'bg-white/10 text-white/40'}`}>
                {shot.shotNumber}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate ${activeShotIndex === index ? 'text-white' : 'text-white/40'}`}>{shot.action}</p>
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
        <div className="h-16 px-6 border-b border-white/10 bg-transparent flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-white/10 border border-white/20 font-mono text-[10px] text-white">
              {activeShot.shotNumber}
            </div>
            <h2 className="font-bold text-sm tracking-widest uppercase">SEEDANCE 2.0 提示词工作台</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleAutoSuggest(activeShotIndex)}
              disabled={suggestingIndex === activeShotIndex}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-transparent hover:bg-white/5 text-white border border-white/20 text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50"
            >
              {suggestingIndex === activeShotIndex ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              AI 智能推演参数
            </button>
            <button
              onClick={() => handleGenerate(activeShotIndex)}
              disabled={generatingIndex === activeShotIndex}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-white hover:bg-white/90 text-black text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50"
            >
              {generatingIndex === activeShotIndex ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {promptData ? '重新生成提示词' : '生成官方格式提示词'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Section 1: Original Reference */}
          <div className="p-5 rounded-xl bg-transparent border border-white/10">
            <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlignLeft className="w-3 h-3" /> 原始分镜动作
            </h4>
            <p className="text-sm text-white/80 leading-relaxed">{activeShot.action}</p>
          </div>

          {/* Section 2: Seedance 2.0 Parameters */}
          <div className="grid grid-cols-3 gap-4">
            {/* Group 1: Base Settings */}
            <div className="col-span-1 space-y-4 p-5 rounded-xl bg-transparent border border-white/10">
              <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest border-b border-white/10 pb-2 mb-4">[ 基础设定 (BASE) ]</h4>
              
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Palette className="w-3 h-3" /> 风格 (STYLE)</label>
                <select value={activeParams.style} onChange={(e) => handleParamChange(activeShotIndex, 'style', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
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
                <select value={activeParams.aspectRatio} onChange={(e) => handleParamChange(activeShotIndex, 'aspectRatio', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>16:9宽屏</option>
                  <option>9:16竖屏</option>
                  <option>2.35:1电影宽屏</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3" /> 时长 (DURATION)</label>
                <select value={activeParams.duration} onChange={(e) => handleParamChange(activeShotIndex, 'duration', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
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
                <select value={activeParams.lighting} onChange={(e) => handleParamChange(activeShotIndex, 'lighting', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
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
                <select value={activeParams.vfx} onChange={(e) => handleParamChange(activeShotIndex, 'vfx', e.target.value)} className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30">
                  <option>无特殊特效</option>
                  <option>粒子消散</option>
                  <option>烟雾弥漫</option>
                  <option>暴雨</option>
                  <option>飘雪</option>
                  <option>火花飞溅</option>
                </select>
              </div>
            </div>

            {/* Group 3: Audio & Reference */}
            <div className="col-span-1 space-y-4 p-5 rounded-xl bg-transparent border border-white/10">
              <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest border-b border-white/10 pb-2 mb-4">[ 声音与参考 (AUDIO & REF) ]</h4>
              
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Music className="w-3 h-3" /> 声音设计 (SOUND)</label>
                <input 
                  type="text"
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
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-[10px] font-mono tracking-widest uppercase text-white flex items-center gap-2">
                  <FileText className="w-4 h-4" /> 最终提示词 (可直接编辑)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReviewPrompt(activeShotIndex)}
                    disabled={reviewingIndex === activeShotIndex}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-transparent hover:bg-white/5 border border-white/20 text-white transition-colors text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
                  >
                    {reviewingIndex === activeShotIndex ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    AI 专家审查 (对抗测试)
                  </button>
                  <button
                    onClick={() => handleCopy(promptData.masterPrompt, 'master')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-white/90 text-black transition-colors text-[10px] font-bold tracking-widest uppercase"
                  >
                    {copiedField === 'master' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedField === 'master' ? '已复制' : '一键复制'}
                  </button>
                </div>
              </div>
              
              <textarea 
                value={promptData.masterPrompt}
                onChange={(e) => handlePromptEdit(activeShotIndex, e.target.value)}
                className="w-full flex-1 min-h-[200px] bg-transparent border border-white/20 rounded-xl p-5 text-sm text-white/90 font-mono whitespace-pre-wrap leading-relaxed focus:outline-none focus:border-white/40 transition-colors"
                placeholder="点击上方按钮生成提示词..."
              />

              {promptData.review && (
                <div className="mt-4 p-5 rounded-xl bg-transparent border border-white/20 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-mono tracking-widest uppercase text-white flex items-center gap-2">
                      <Activity className="w-4 h-4" /> 审查报告 (得分: {promptData.review.score}/100)
                    </h4>
                    <button
                      onClick={() => applyImprovedPrompt(activeShotIndex)}
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
