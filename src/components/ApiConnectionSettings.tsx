import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { clearApiConnections, emptyApiConnectionInputs, getApiConnectionInputs, getApiConnectionSummary, saveApiConnections, subscribeApiConnection,
  type ApiConnectionInput, type ApiConnectionInputs, type ApiConnectionProvider } from '../lib/apiConnection';

const control = 'min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:opacity-50';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:cursor-not-allowed disabled:opacity-50';

function ProviderFields({ provider, value, disabled, onChange }: { provider: ApiConnectionProvider; value: ApiConnectionInput; disabled: boolean; onChange: (value: ApiConnectionInput) => void }) {
  const [visible, setVisible] = useState(false);
  const title = provider === 'text' ? '文本 · DeepSeek / 兼容接口' : '附图 · Gemini';
  const prefix = provider === 'text' ? '文本' : 'Gemini';
  const update = (key: keyof ApiConnectionInput, data: string) => onChange({ ...value, [key]: data });
  return <fieldset disabled={disabled} className="min-w-0 space-y-4 border-t border-white/10 pt-5">
    <legend className="pr-3 text-sm font-semibold text-zinc-100">{title}</legend>
    <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-zinc-300">
      <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="radio" name={'api-mode-' + provider} value="platform" checked={value.mode === 'platform'} onChange={() => update('mode', 'platform')} className="size-4 accent-amber-200" />服务端默认</label>
      <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="radio" name={'api-mode-' + provider} value="user" checked={value.mode === 'user'} onChange={() => update('mode', 'user')} className="size-4 accent-amber-200" />自带密钥</label>
    </div>
    {value.mode === 'platform' ? <p className="text-pretty text-xs leading-6 text-zinc-500">使用平台部署时配置的接口与模型，按平台试用额度记录用量。服务端未配置时，请选择自带密钥。</p> : <div className="space-y-4">
      <label className="block space-y-2"><span className="block text-sm text-zinc-300">{prefix} API Key</span><span className="flex items-center gap-2"><input aria-label={prefix + ' API Key'} type={visible ? 'text' : 'password'} value={value.apiKey} onChange={event => update('apiKey', event.target.value)} autoComplete="off" spellCheck={false} maxLength={512} className={cn(control, 'min-w-0 flex-1')} /><button type="button" onClick={() => setVisible(previous => !previous)} aria-label={(visible ? '隐藏' : '显示') + prefix + ' API Key'} aria-pressed={visible} className={cn(button, 'size-11 shrink-0 p-0')}>{visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</button></span></label>
      <label className="block space-y-2"><span className="block text-sm text-zinc-300">{prefix}模型</span><input aria-label={prefix + '模型'} value={value.model} onChange={event => update('model', event.target.value)} autoComplete="off" spellCheck={false} maxLength={128} className={control} /><span className="block text-pretty text-xs leading-6 text-zinc-500">填写供应商提供的模型 ID；保存配置不会测试模型可用性。</span></label>
      {provider === 'text' ? <label className="block space-y-2"><span className="block text-sm text-zinc-300">文本 Base URL</span><input aria-label="文本 Base URL" type="url" value={value.baseUrl} onChange={event => update('baseUrl', event.target.value)} autoComplete="off" spellCheck={false} className={control} /><span className="block text-pretty text-xs leading-6 text-zinc-500">默认 https://api.deepseek.com/v1。可使用 https://api.openai.com/v1 等聊天文本兼容接口；其他地址须由服务器明确允许，并填写对应供应商的模型。</span></label> : <p className="text-pretty text-xs leading-6 text-zinc-500">Gemini 使用 Google 官方接口，默认模型 gemini-2.5-flash；这里不接受自定义代理地址。</p>}
      <p className="text-pretty text-xs leading-6 text-amber-100">供应商按自己的账户规则计费；自带密钥的请求不扣平台试用额度。</p>
    </div>}
  </fieldset>;
}

export default function ApiConnectionSettings({ uid, busy = false }: { uid: string; busy?: boolean }) {
  const summary = useSyncExternalStore(subscribeApiConnection, () => getApiConnectionSummary(uid), () => getApiConnectionSummary(null));
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState<ApiConnectionInputs>(emptyApiConnectionInputs);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const locked = busy || summary.activeRequests > 0;
  useEffect(() => {
    const clearFormOnLeave = () => { setOpen(false); setInputs(emptyApiConnectionInputs()); setError(''); setNotice(''); };
    window.addEventListener('pagehide', clearFormOnLeave);
    return () => window.removeEventListener('pagehide', clearFormOnLeave);
  }, []);
  const changeOpen = (value: boolean) => {
    setError(''); setNotice('');
    if (value) {
      try { setInputs(getApiConnectionInputs(uid)); setOpen(true); }
      catch { setError('账号状态已变化，请重新进入工作区。'); }
    } else { setOpen(false); setInputs(emptyApiConnectionInputs()); }
  };
  const save = () => {
    if (locked) return;
    try { saveApiConnections(uid, inputs); setInputs(getApiConnectionInputs(uid)); setError(''); setNotice('已保存本次会话配置。尚未测试真实连接，生成时才会发起请求。'); }
    catch (issue) { setNotice(''); setError(issue instanceof Error ? issue.message : '配置未保存，请核对输入。'); }
  };
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><button type="button" className={cn(button, 'text-xs text-zinc-100')}><KeyRound className="size-4" aria-hidden="true" />API设置</button></Dialog.Trigger>
    {!open && error && <span role="alert" className="text-xs text-red-200">{error}</span>}
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/75" />
      <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-2xl -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-5 text-zinc-100 shadow-2xl focus:outline-none sm:p-7" style={{ maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))' }}>
        <div className="flex items-start justify-between gap-4"><Dialog.Title className="text-balance text-xl font-semibold">API设置</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="关闭 API 设置" className={cn(button, 'size-11 shrink-0 p-0')}><X className="size-4" aria-hidden="true" /></button></Dialog.Close></div>
        <Dialog.Description className="mt-3 text-pretty text-sm leading-7 text-zinc-400">配置只保留在当前账号的内存会话。刷新、关闭页面、退出或切换账号后需重新填写。密钥不会写入项目、草稿、导出或浏览器持久存储。</Dialog.Description>
        <p className="mt-3 text-pretty text-xs leading-6 text-zinc-500">提交生成时，密钥经本平台服务器转发至你选择且服务器已允许的供应商。文本和附图接口分别配置。</p>
        <p className="mt-3 text-xs leading-6 text-zinc-400">当前使用：文本 {summary.textUsesUserKey ? '自带密钥' : '服务端默认'} · Gemini {summary.geminiUsesUserKey ? '自带密钥' : '服务端默认'}</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <ProviderFields key={'text-' + String(open) + '-' + inputs.text.mode} provider="text" value={inputs.text} disabled={locked} onChange={value => { setInputs(previous => ({ ...previous, text: value })); setError(''); setNotice(''); }} />
          <ProviderFields key={'gemini-' + String(open) + '-' + inputs.gemini.mode} provider="gemini" value={inputs.gemini} disabled={locked} onChange={value => { setInputs(previous => ({ ...previous, gemini: value })); setError(''); setNotice(''); }} />
        </div>
        {locked && <p role="status" className="mt-5 text-pretty text-sm leading-7 text-amber-100">正在制作或等待接口响应。请先停止或完成当前生成，再应用或清除配置。</p>}
        {error && <p role="alert" className="mt-5 text-pretty text-sm leading-7 text-red-200">{error}</p>}
        {notice && <p role="status" className="mt-5 text-pretty text-sm leading-7 text-zinc-300">{notice}</p>}
        <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-5"><button type="button" disabled={locked} onClick={save} className="min-h-11 rounded-xl bg-amber-200 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50">保存本次会话</button><button type="button" disabled={locked} className={button} onClick={() => {
          if (locked) return;
          try { clearApiConnections(uid); setInputs(emptyApiConnectionInputs()); setError(''); setNotice('本次会话配置已清除，后续请求使用服务端默认接口。'); }
          catch (issue) { setNotice(''); setError(issue instanceof Error ? issue.message : '配置暂时无法清除。'); }
        }}>清除会话配置</button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
