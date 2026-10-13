import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Wand2, FileText, Loader2, UploadCloud, Palette } from 'lucide-react';
import { generateDeepSeekContent } from '../lib/deepseek';
import { errorMessage, parseCharactersAndScenes } from '../lib/workflowValidation';
import { SCRIPT_ANALYSIS_GUIDANCE } from '../lib/creativePrompts';
import { cn } from '../lib/utils';

interface ScriptInputProps {
  scriptData: string;
  setScriptData: (data: string) => void;
  onNext: () => void;
  setCharactersAndScenes: (data: any) => void;
}

export default function ScriptInput({ scriptData, setScriptData, onNext, setCharactersAndScenes }: ScriptInputProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [visualStyle, setVisualStyle] = useState('动漫 (Anime)');
  const [error, setError] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestScriptRef = useRef(scriptData);
  latestScriptRef.current = scriptData;

  const styleOptions = [
    '动漫 (Anime)',
    '真人 (Live-Action)',
    '3D (Unreal Engine)',
    '皮克斯 (Pixar)'
  ];

  const processFile = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsReadingFile(true);
    setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('剧本文件不能超过 5 MB，请拆分后导入。');
      const extension = file.name.split('.').pop()?.toLowerCase();
      let content: string;
      if (extension === 'docx') {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
      } else if (extension === 'txt') {
        content = await file.text();
      } else {
        throw new Error('支持 .docx 和 UTF-8 编码的 .txt 文件；旧版 .doc 请另存为 .docx 后导入。');
      }
      if (!content.trim()) throw new Error('文件没有可读取的文字，请检查文档内容。');
      if (content.length > 30000) throw new Error('剧本超过 30,000 字，请拆分为章节后导入。');
      setScriptData(content);
    } catch (error) {
      setError(errorMessage(error, '文件读取失败，请检查文件格式。'));
    } finally {
      busyRef.current = false;
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleAnalyze = async () => {
    if (busyRef.current || !scriptData.trim()) return;
    if (scriptData.length > 30000) { setError('剧本超过 30,000 字，请拆分为章节后解析。'); return; }
    busyRef.current = true;
    setError('');
    
    setIsAnalyzing(true);
    try {
      const prompt = `你是影视美术设计师，请忠实分析下面的剧本，提取有明确戏份的人物以及发生剧情的场景。
        ${SCRIPT_ANALYSIS_GUIDANCE}
        用户选择的视觉风格：【${visualStyle}】。
        人物name保留原名，description记录可核对的外貌、服饰、身份、关系和道具；剧本未说明的特征注明为设计补充。
        场景description写地点、时代、空间关系、原文天气和时间，以关键视觉特征区分地点，避免把同一地点重复计数。
        keywords只写3—6个最有识别性的视觉要素。
        imagenPrompt用英文，为人物输出清晰可复用的角色参考图（正面、侧面、背面三视图，纯净背景），为场景输出无人物的环境参考图。
        人物服饰和道具跨视图保持一致；场景写清前景、中景、远景、材质和主光，画面尺度来自空间关系。
        为便于编辑，使用[VARIABLES]和[EXECUTION]分段，SUBJECT、LOCATION、LIGHTING、DETAILS写具体视觉内容；不要求镜头器材品牌或画质口号。无文字、LOGO、水印。
        仅返回严格JSON，基础信息用中文，imagenPrompt用英文。不要额外解释或Markdown代码块。
        {"characters":[{"name":"...","description":"...","keywords":["..."],"imagenPrompt":"[VARIABLES]\\nSUBJECT = ...\\nLOCATION = ...\\nLIGHTING = ...\\nDETAILS = ...\\n[EXECUTION]\\n..."}],"scenes":[{"name":"...","description":"...","keywords":["..."],"imagenPrompt":"[VARIABLES]\\n...\\n[EXECUTION]\\n..."}]}
        剧本：
        ${scriptData}`;

      const responseText = await generateDeepSeekContent(prompt, true);

      const parsed = parseCharactersAndScenes(responseText);
      if (latestScriptRef.current !== scriptData) throw new Error('剧本已更新，本次解析未覆盖当前内容。请按最新剧本重新解析。');
      setCharactersAndScenes(parsed);
      onNext();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      busyRef.current = false;
      setIsAnalyzing(false);
    }
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
          <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-2">剧本解析</h2>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">粘贴剧本或导入 .docx / .txt 文件。支持 30,000 字以内的剧本。</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-white/40">
          <Palette className="w-4 h-4" />
          <span className="text-[10px] font-mono tracking-widest uppercase">[ 视觉风格 ]</span>
        </div>
        <div className="flex flex-wrap gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
          {styleOptions.map((style) => (
            <button
              key={style}
              onClick={() => setVisualStyle(style)}
              disabled={isAnalyzing || isReadingFile}
              aria-pressed={visualStyle === style}
              className={cn('px-4 py-2 rounded-lg text-xs font-medium transition-colors', visualStyle === style ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80')}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      <div 
        className={cn('flex-1 min-h-80 relative rounded-2xl overflow-hidden border flex flex-col transition-colors', isDragging ? 'border-white/40 bg-white/5' : 'border-white/10 bg-transparent')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-transparent">
          <FileText className="w-4 h-4 text-white/40" />
          <span className="text-[10px] font-mono tracking-widest uppercase text-white/40">原始剧本输入</span>
        </div>
        
        {isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm border-2 border-dashed border-white/40 rounded-2xl">
            <UploadCloud className="w-12 h-12 text-white mb-4 animate-bounce" />
            <p className="text-xl font-bold text-white tracking-tight">松开鼠标，上传剧本文档</p>
            <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-2">支持 .docx, .txt</p>
          </div>
        )}
        
        <textarea
          aria-label="原始剧本"
          disabled={isAnalyzing || isReadingFile}
          value={scriptData}
          onChange={(e) => setScriptData(e.target.value)}
          placeholder="在此输入剧本...（例如：内景。赛博朋克城市 - 夜晚。大雨倾盆，霓虹灯在水洼中闪烁...）&#10;&#10;💡 提示：您可以将 .docx 或 UTF-8 编码的 .txt 文件拖拽到此处。"
          className="flex-1 w-full bg-transparent p-6 text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:ring-0 leading-relaxed text-sm"
        />

        {error && <p role="alert" className="mx-4 mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        <div className="p-4 border-t border-white/10 bg-transparent flex flex-wrap items-center justify-between gap-3">
          <input ref={fileInputRef} type="file" accept=".docx,.txt" className="hidden" aria-label="导入剧本文件" onChange={event => { const file = event.target.files?.[0]; if (file) void processFile(file); }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing || isReadingFile} className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-3 text-sm text-white/70 hover:bg-white/5 disabled:opacity-50">
            <UploadCloud className="size-4" />{isReadingFile ? '正在读取…' : '导入文件'}
          </button>
          <span className="text-xs text-white/50 tabular-nums">{scriptData.length.toLocaleString()} / 30,000 字</span>
          <button
            onClick={handleAnalyze}
            disabled={!scriptData.trim() || isAnalyzing || isReadingFile}
            className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black font-bold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs tracking-widest uppercase"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在深度解析剧本...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                深度解析与提取
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

