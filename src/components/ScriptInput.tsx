import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Wand2, FileText, Loader2, UploadCloud, Palette } from 'lucide-react';
import * as mammoth from 'mammoth';
import { generateDeepSeekContent } from '../lib/deepseek';

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

  const styleOptions = [
    '动漫 (Anime)',
    '真人 (Live-Action)',
    '3D (Unreal Engine)',
    '皮克斯 (Pixar)'
  ];

  const processFile = async (file: File) => {
    try {
      if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setScriptData(result.value);
      } else if (file.name.endsWith('.txt')) {
        const text = await file.text();
        setScriptData(text);
      } else {
        alert('目前仅支持 .docx 和 .txt 文件解析');
      }
    } catch (error) {
      console.error("文件读取失败:", error);
      alert('文件读取失败，请检查文件格式是否正确。');
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
    if (!scriptData.trim()) return;
    
    setIsAnalyzing(true);
    try {
      const prompt = `你是一位顶级的影视美术总监与 Nano Banana Pro (2026 SOTA) 提示词专家。
        当前用户选择的视觉风格为：【${visualStyle}】。
        请分析以下剧本，**详尽无遗地**提取剧本中出现的**所有**人物（包括主角、配角、有具体动作的群演）和**所有**具体场景。绝对不要遗漏任何一个有戏份的角色或地点！
        并为 Nano Banana Pro 生成极高质量的英文生图提示词 (imagenPrompt)。

        **核心要求（必须严格遵守 Nano Banana Pro 伪代码提示法）：**
        1. **人物提示词 (Characters)**：
           - 必须是【角色三视图】（Character design sheet, three views: front, side, and back profile）。
           - 必须强调【纯净背景，无文字，无水印】（clean white background, no text, no watermark, no typography, no signature）。
           - 必须深度契合【${visualStyle}】风格。
           - **格式必须为 Nano Banana Pro 伪代码**，例如：
             [VARIABLES]
             SUBJECT = "Character design sheet, three views (front, side, back profile) of [Appearance]..."
             LOCATION = "Solid neutral grey background"
             LIGHTING = "Flat studio lighting for character design"
             CAM_SETTINGS = "85mm lens, sharp focus"
             [EXECUTION]
             Create a 360-degree character design sheet.
        2. **场景提示词 (Scenes)**：
           - 必须是【空镜头/大远景】（Establishing shot, empty scene, no humans, no characters），展现宏大的环境氛围。
           - 必须包含顶级的构图、光影和画质修饰词（如 masterpiece, breathtaking, cinematic lighting, volumetric lighting, 8k resolution, highly detailed concept art）。
           - 必须深度契合【${visualStyle}】风格。
           - **格式必须为 Nano Banana Pro 伪代码**，例如：
             [VARIABLES]
             SUBJECT = "Empty scene, no humans, no characters"
             LOCATION = "Establishing shot of [Scene Description], ${visualStyle} style"
             LIGHTING = "Cinematic lighting, volumetric lighting..."
             CAM_SETTINGS = "Wide angle lens, f/8, highly detailed"
             [EXECUTION]
             Render the establishing shot of the location.
        3. **格式要求**：
           - 请用中文输出基础信息，但 imagenPrompt 内部的值【必须全部使用英文】，且必须是包含 [VARIABLES] 和 [EXECUTION] 的单行或多行字符串。
           - 严格输出 JSON 格式，结构如下：
           {
             "characters": [{ 
               "name": "...", 
               "description": "...", 
               "keywords": ["..."], 
               "imagenPrompt": "[VARIABLES]\\nSUBJECT = \\"...\\"\\nLOCATION = \\"...\\"\\nLIGHTING = \\"...\\"\\nCAM_SETTINGS = \\"...\\"\\n[EXECUTION]\\n..."
             }],
             "scenes": [{ 
               "name": "...", 
               "description": "...", 
               "keywords": ["..."], 
               "imagenPrompt": "[VARIABLES]\\nSUBJECT = \\"...\\"\\nLOCATION = \\"...\\"\\nLIGHTING = \\"...\\"\\nCAM_SETTINGS = \\"...\\"\\n[EXECUTION]\\n..."
             }]
           }
        
        剧本：
        ${scriptData}`;

      const responseText = await generateDeepSeekContent(prompt, true);

      if (responseText) {
        let cleanJson = responseText;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanJson = jsonMatch[0];
        }
        const parsedData = JSON.parse(cleanJson);
        setCharactersAndScenes(parsedData);
        onNext();
      }
    } catch (error) {
      console.error("Failed to analyze script:", error);
      // Fallback for demo purposes if API fails
      setCharactersAndScenes({
        characters: [
          { 
            name: "主角", 
            description: "一个有着神秘过去的年轻英雄，眼神深邃。", 
            keywords: ["年轻", "英雄", "神秘"],
            imagenPrompt: `[VARIABLES]\nSUBJECT = "Character design sheet, three views (front, side, back profile) of a young hero with a mysterious past, deep eyes, wearing dark tactical gear and a worn-out cloak"\nLOCATION = "Solid neutral grey background, clean white background, no text, no watermark, no typography"\nLIGHTING = "Flat studio lighting for character design"\nCAM_SETTINGS = "85mm lens, sharp focus, ${visualStyle} style, highly detailed"\n[EXECUTION]\nCreate a 360-degree character design sheet.`
          }
        ],
        scenes: [
          { 
            name: "黑暗小巷", 
            description: "赛博朋克城市中一条灯光昏暗的小巷，霓虹灯闪烁。", 
            keywords: ["黑暗", "小巷", "赛博朋克", "霓虹"],
            imagenPrompt: `[VARIABLES]\nSUBJECT = "Empty scene, no humans, no characters"\nLOCATION = "Establishing shot of a dark, dimly lit alleyway in a cyberpunk city, ${visualStyle} style, gritty, mysterious, raining"\nLIGHTING = "Cinematic lighting, flickering neon lights, rain puddles reflecting neon, volumetric lighting"\nCAM_SETTINGS = "Wide angle lens, f/8, masterpiece, breathtaking, highly detailed concept art"\n[EXECUTION]\nRender the establishing shot of the location.`
          }
        ]
      });
      onNext();
    } finally {
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
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-bold tracking-tight mb-2">剧本解析</h2>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">粘贴剧本或拖拽文件 (.doc, .docx, .txt)。AI 将提取角色和场景。</p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2 text-white/40">
          <Palette className="w-4 h-4" />
          <span className="text-[10px] font-mono tracking-widest uppercase">[ 视觉风格 ]</span>
        </div>
        <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
          {styleOptions.map((style) => (
            <button
              key={style}
              onClick={() => setVisualStyle(style)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all uppercase tracking-wider ${
                visualStyle === style 
                  ? 'bg-white/10 text-white shadow-sm' 
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      <div 
        className={`flex-1 relative rounded-2xl overflow-hidden border ${isDragging ? 'border-white/40 bg-white/5' : 'border-white/10 bg-transparent'} flex flex-col transition-colors`}
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
          value={scriptData}
          onChange={(e) => setScriptData(e.target.value)}
          placeholder="在此输入剧本...（例如：内景。赛博朋克城市 - 夜晚。大雨倾盆，霓虹灯在水洼中闪烁...）&#10;&#10;💡 提示：您可以直接将 .doc, .docx 或 .txt 文件拖拽到此处。"
          className="flex-1 w-full bg-transparent p-6 text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:ring-0 leading-relaxed text-sm"
        />

        <div className="p-4 border-t border-white/10 bg-transparent flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={!scriptData.trim() || isAnalyzing}
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

