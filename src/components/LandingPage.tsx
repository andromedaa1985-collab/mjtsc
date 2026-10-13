import { ArrowRight, FileText, Film, Image as ImageIcon, LayoutTemplate, Video } from 'lucide-react';

const workflow = [
  { icon: FileText, title: '解析剧本', description: '导入故事，梳理人物关系与关键场景。' },
  { icon: ImageIcon, title: '确定视觉', description: '细化角色外貌与场景，建立统一设定。' },
  { icon: LayoutTemplate, title: '设计分镜', description: '安排景别、构图与动作，组织镜头节奏。' },
  { icon: Video, title: '生成提示词', description: '将镜头设计整理成可编辑的视频提示词。' },
];

export default function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col bg-zinc-950 px-5 py-6 text-white sm:px-8 sm:py-8">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-white text-zinc-950"><Film className="size-5" aria-hidden="true" /></span><span className="text-lg font-semibold">CinePrompt</span></div>
        <span className="hidden text-sm text-zinc-400 sm:block">漫剧创作工作台</span>
      </header>
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center py-12 sm:py-16" aria-labelledby="landing-heading">
        <div className="max-w-3xl">
          <p className="mb-5 flex items-center gap-3 text-sm font-medium text-zinc-400"><span className="h-px w-8 bg-zinc-500" aria-hidden="true" />从故事开始，让镜头成形</p>
          <h1 id="landing-heading" className="text-balance text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">把你的剧本，<br />变成有章法的镜头。</h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-8 text-zinc-300">放入剧本，自动梳理故事与人物场景，按剧情拆分镜头，并为每镜生成适合即梦 / 小云雀 Seedance 2.5 的提示词。完成后逐镜修改、复制或导出。</p>
          <button type="button" onClick={onEnter} className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-zinc-950">放入剧本，开始自动创作<ArrowRight className="size-4" aria-hidden="true" /></button>
          <p className="mt-3 text-sm text-zinc-500">也可以从单镜头或人物提示词开始。</p>
        </div>
        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {workflow.map(({ icon: Icon, title, description }, index) => (
            <li key={title} className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
              <div className="mb-6 flex items-center justify-between"><Icon className="size-5 text-zinc-300" aria-hidden="true" /><span className="font-mono text-xs tabular-nums text-zinc-500">0{index + 1}</span></div>
              <h2 className="text-balance text-base font-semibold">{title}</h2>
              <p className="mt-3 text-pretty text-sm leading-6 text-zinc-400">{description}</p>
            </li>
          ))}
        </ol>
      </section>
      <footer className="mx-auto w-full max-w-6xl border-t border-white/10 pt-5 text-xs leading-6 text-zinc-500">CinePrompt · 让创作意图在每一步都清晰可见</footer>
    </main>
  );
}
