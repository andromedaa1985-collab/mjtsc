import * as Dialog from '@radix-ui/react-dialog';
import type { RefObject } from 'react';
import { Coins, Info, X } from 'lucide-react';

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  credits?: number | null;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

export default function RechargeModal({ isOpen, onClose, credits = null, returnFocusRef }: RechargeModalProps) {
  const formattedCredits = typeof credits === 'number' && Number.isFinite(credits)
    ? Math.max(0, credits).toLocaleString('zh-CN')
    : '暂未获取';
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/75" />
        <Dialog.Content onCloseAutoFocus={event => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }} className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-6 text-white shadow-2xl focus:outline-none sm:p-8" style={{ maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))' }}>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-balance text-xl font-semibold">账户额度</Dialog.Title>
              <Dialog.Description className="mt-2 text-pretty text-sm leading-6 text-zinc-400">查看当前试用额度与账户使用说明。</Dialog.Description>
            </div>
            <Dialog.Close asChild><button type="button" aria-label="关闭账户额度窗口" className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"><X className="size-5" aria-hidden="true" /></button></Dialog.Close>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
            <p className="flex items-center gap-2 text-sm text-zinc-400"><Coins className="size-4" aria-hidden="true" />当前可用积分</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{formattedCredits}<span className="ml-2 text-sm font-normal text-zinc-400">{typeof credits === 'number' && Number.isFinite(credits) ? '积分' : ''}</span></p>
          </div>
          <div className="mt-5 flex items-start gap-3">
            <Info className="mt-1 size-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <div>
              <h3 className="text-balance text-sm font-medium">在线充值暂未开放</h3>
              <p className="mt-2 text-pretty text-sm leading-6 text-zinc-400">当前试用额度用于记录 AI 功能的使用量。在线充值暂未开放，正式服务开放后会在此提供说明。</p>
            </div>
          </div>
          <Dialog.Close asChild><button type="button" className="mt-7 min-h-11 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">我知道了</button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
