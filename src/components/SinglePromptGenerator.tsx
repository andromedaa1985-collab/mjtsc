import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Wand2, Loader2, Copy, Check, Sparkles, ImagePlus, X } from 'lucide-react';
import { generateGeminiContent } from '../lib/gemini';
import { buildSinglePrompt } from '../lib/creativePrompts';
import { errorMessage, readImageFile } from '../lib/workflowValidation';
import { cn } from '../lib/utils';

type Platform = 'seedance' | 'banana';
type PromptType = 'video' | 'character';

export default function SinglePromptGenerator() {
  const [inputDescription, setInputDescription] = useState('');
  const [platform, setPlatform] = useState<Platform>('seedance');
  const [promptType, setPromptType] = useState<PromptType>('video');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultPrompt, setResultPrompt] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState('');

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const isBusy = isGenerating || isReadingImage;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setIsReadingImage(true);
    setError('');
    try {
      const preview = await readImageFile(file);
      setImageFile(file);
      setImagePreview(preview);
    } catch (error) { setError(errorMessage(error)); }
    finally { busyRef.current = false; setIsReadingImage(false); e.target.value = ''; }
  };

  const removeImage = () => {
    if (busyRef.current) return;
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (busyRef.current) return;
    if (!inputDescription.trim() && !imageFile) {
      setError('请提供设想描述或上传参考垫图');
      return;
    }

    busyRef.current = true;
    setIsCopied(false);
    setIsGenerating(true);
    setError('');

    const systemPrompt = buildSinglePrompt(inputDescription, platform, promptType, !!imagePreview);

    try {
      let base64Data = undefined;
      let mimeType = undefined;

      if (imagePreview) {
        // Extract base64 data and mime type from data URL
        const matches = imagePreview.match(/^data:(.+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      const result = await generateGeminiContent(systemPrompt, base64Data, mimeType);
      if (!result?.trim()) throw new Error('AI 未返回提示词，原有结果已保留。请重试。');
      setResultPrompt(result.trim());
    } catch (err: unknown) {
      setError(errorMessage(err, '生成失败，原有结果已保留。请重试。'));
    } finally {
      busyRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!resultPrompt) return;
    try {
      await navigator.clipboard.writeText(resultPrompt);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      setError('复制失败，请选中结果手动复制。');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col"
    >
      <div className="mb-8">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2 text-balance">
          单镜头/人物提示词
        </h2>
        <p className="text-white/50 text-sm tracking-wide">
          为 Seedance 2.0 或 Banana 生成专业提示词。支持垫图。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* Left Column: Input & Controls */}
        <div className="flex flex-col gap-6">
          <div className="bg-transparent border border-white/10 rounded-2xl p-6 flex flex-col flex-1">
            <div className="flex flex-wrap gap-6 mb-6">
              {/* Platform Selection */}
              <div className="flex-1">
                <label className="block text-[10px] font-mono tracking-widest uppercase text-white/40 mb-3">[ 平台 ]</label>
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                  <button
                    onClick={() => setPlatform('seedance')}
                    disabled={isBusy}
                    aria-pressed={platform === 'seedance'}
                    className={cn('flex-1 py-2 text-xs font-medium rounded-lg transition-colors', platform === 'seedance' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80')}
                  >
                    Seedance
                  </button>
                  <button
                    onClick={() => setPlatform('banana')}
                    disabled={isBusy}
                    aria-pressed={platform === 'banana'}
                    className={cn('flex-1 py-2 text-xs font-medium rounded-lg transition-colors', platform === 'banana' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80')}
                  >
                    Banana
                  </button>
                </div>
              </div>

              {/* Type Selection */}
              <div className="flex-1">
                <label className="block text-[10px] font-mono tracking-widest uppercase text-white/40 mb-3">[ 类型 ]</label>
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                  <button
                    onClick={() => setPromptType('video')}
                    disabled={isBusy}
                    aria-pressed={promptType === 'video'}
                    className={cn('flex-1 py-2 text-xs font-medium rounded-lg transition-colors', promptType === 'video' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80')}
                  >
                    视频分镜
                  </button>
                  <button
                    onClick={() => setPromptType('character')}
                    disabled={isBusy}
                    aria-pressed={promptType === 'character'}
                    className={cn('flex-1 py-2 text-xs font-medium rounded-lg transition-colors', promptType === 'character' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80')}
                  >
                    人物设定
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-[10px] font-mono tracking-widest uppercase text-white/40 mb-3">
                [ 设想描述 ]
              </label>
              <textarea
                aria-label="设想描述"
                disabled={isBusy}
                value={inputDescription}
                onChange={(e) => setInputDescription(e.target.value)}
                placeholder="你想生成什么？（例如：一个赛博朋克风格的女孩在雨中奔跑...）"
                className="flex-1 min-h-40 w-full bg-transparent border border-white/10 rounded-xl p-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-all resize-none mb-4 text-sm"
              />

              <label className="block text-[10px] font-mono tracking-widest uppercase text-white/40 mb-3">
                [ 参考垫图 ]
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={isBusy}
                  aria-label="上传参考图"
                  onChange={handleImageUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="提示词创作参考图"
                      className="h-32 w-auto rounded-lg border border-white/10 object-cover"
                    />
                    <button
                      onClick={removeImage}
                      disabled={isBusy}
                      aria-label="移除参考图"
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className="w-full flex flex-col items-center justify-center gap-2 py-6 border border-dashed border-white/20 rounded-xl hover:border-white/40 hover:bg-white/5 transition-all text-white/40 hover:text-white/80"
                  >
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-xs font-mono">{isReadingImage ? '正在读取…' : '上传 JPG / PNG / WebP 图片（3 MB 以内）'}</span>
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div role="alert" className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isBusy || (!inputDescription.trim() && !imageFile)}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-white/90 font-bold py-3.5 px-6 rounded-full transition-all disabled:opacity-50 text-xs tracking-widest uppercase"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>生成提示词</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Result */}
        <div className="bg-transparent border border-white/10 rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-mono tracking-widest uppercase text-white/40">[ 生成结果 ]</h3>
            {resultPrompt && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-1.5 bg-transparent hover:bg-white/10 border border-white/20 rounded-full text-[10px] font-mono tracking-widest uppercase text-white transition-colors"
              >
                {isCopied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {isCopied ? '已复制' : '复制'}
              </button>
            )}
          </div>

          <div aria-live="polite" aria-busy={isGenerating} className="flex-1 min-h-60 bg-white/5 border border-white/10 rounded-xl p-6 overflow-y-auto relative group">
            {resultPrompt ? (
              <pre className="text-white/80 whitespace-pre-wrap font-sans leading-relaxed text-sm">
                {resultPrompt}
              </pre>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                <Wand2 className="w-8 h-8 mb-4 opacity-20" />
                <p className="text-xs uppercase tracking-widest font-mono">等待输入</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
