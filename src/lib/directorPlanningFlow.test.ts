import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDirectorSettings, estimateAutoDirector, exportDirectorMarkdown, runAutoDirector, validateDirectorCheckpoint, validateDirectorProject,
  type DirectorCheckpoint, type DirectorGenerate,
} from './autoDirector.ts';
import { commitDirectorShotEdit, createDirectorShotEdit } from './directorEditing.ts';
import { reconcileDirectorPlanTiming } from './directorPlan.ts';
import { updateDirectorProduction } from './directorProduction.ts';
import { emptyDraft, loadDraft, saveDraft, validateDraft } from './workspaceDraft.ts';

const source = '室内，傍晚。\n李明：“你回来了。”\n李明把钥匙放到桌上。';
const settings = { ...defaultDirectorSettings, creativeMethod: 'standard' as const };
const info = {
  summary: '李明见到来人，放下钥匙', storyArc: '问候之后放下钥匙',
  characters: [{ name: '李明', description: '原文人物李明', sourceExcerpt: '李明' }],
  scenes: [{ name: '室内', description: '原文的室内空间', sourceExcerpt: '室内' }],
  continuityRules: ['钥匙从手中落到桌面'], uncertainties: [],
};
const purpose = '李明确认来人后放下钥匙，结束等待';
type SourceRow = [string, string, number, number];
const marker = (prompt: string) => prompt.match(/\[DIRECTOR_(ANALYSIS|UNDERSTANDING|PLAN|STORYBOARD|PROMPTS)\]/)?.[1];
const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function validPlanResponse(prompt: string): string {
  const table = prompt.match(/<whole-script-source-table>([\s\S]*?)<\/whole-script-source-table>/);
  assert.ok(table, 'planning receives one whole-script source table');
  const rows = JSON.parse(table[1]) as SourceRow[];
  assert.equal(rows.map(row => row[1]).join(''), source);
  const speech = rows.reduce((sum, row) => sum + row[3], 0);
  return JSON.stringify({ segments: [{
    sourceStartUnit: rows[0][0], sourceEndUnit: rows.at(-1)![0], storyPurpose: purpose,
    durationMinSeconds: Math.max(20, speech), durationMaxSeconds: 30, dialogueSeconds: speech,
    actionNotes: '对白与人物观察同时进行，放下钥匙后保留反应停顿', transitionNotes: '停在钥匙落桌的动作落点',
  }] });
}

function fixtureAI(intercept?: (prompt: string) => string | undefined | Promise<string | undefined>) {
  const calls: string[] = [];
  const generate: DirectorGenerate = async prompt => {
    calls.push(prompt);
    const intercepted = await intercept?.(prompt);
    if (intercepted !== undefined) return intercepted;
    switch (marker(prompt)) {
      case 'ANALYSIS': return JSON.stringify({ ...info, chunkId: prompt.match(/来源块(chunk-\d+)/)![1], beats: ['问候后放下钥匙'] });
      case 'UNDERSTANDING': return JSON.stringify(info);
      case 'PLAN': return validPlanResponse(prompt);
      case 'STORYBOARD': {
        const rows = prompt.split('\n').filter(line => /^\{"id":"u\d+","text":/.test(line)).map(line => JSON.parse(line));
        assert.ok(rows.length);
        return JSON.stringify({ shots: [{ scene: '室内', charactersInvolved: ['李明'],
          sourceStartUnit: rows[0].id, sourceEndUnit: rows.at(-1)!.id,
          action: '李明观察来人并将手中钥匙放到桌上', camera: '固定中景观察李明与桌面',
          durationSeconds: 12, continuity: '从手握钥匙承接到钥匙留在桌面',
        }] });
      }
      case 'PROMPTS': return JSON.stringify({ prompts: prompt.split('镜头ID：').slice(1).map(part => {
        const shotId = part.split('\n')[0];
        const shot = JSON.parse(part.match(/当前分镜：([^\n]+)/)![1]);
        const params = JSON.parse(part.match(/用户参数：([^\n]+)/)![1]);
        return { shotId, masterPrompt: `0—${parseInt(params.duration)}秒：${shot.action}，${shot.camera}。\n对白：\n${shot.dialogue}\n声音：室内环境声与钥匙落桌声。`,
          referencePlan: [], postProductionNotes: [], qaWarnings: [] };
      }) });
      default: throw new Error('未知测试阶段');
    }
  };
  return { generate, calls };
}

async function completeFixture() {
  const snapshots: DirectorCheckpoint[] = [];
  const ai = fixtureAI();
  const project = await runAutoDirector({ script: source, settings, generate: ai.generate, onCheckpoint: value => snapshots.push(value) });
  return { project, checkpoint: snapshots.at(-1)!, snapshots, ai };
}

test('whole-story understanding precedes estimation and both storyboard and prompts receive the saved plan', async () => {
  const ai = fixtureAI();
  const stages: string[] = [];
  const snapshots: DirectorCheckpoint[] = [];
  const project = await runAutoDirector({ script: source, settings, generate: ai.generate,
    onProgress: progress => { if (stages.at(-1) !== progress.stage) stages.push(progress.stage); },
    onCheckpoint: value => snapshots.push(value),
  });
  assert.deepEqual(ai.calls.map(marker), ['ANALYSIS', 'UNDERSTANDING', 'PLAN', 'STORYBOARD', 'PROMPTS']);
  assert.deepEqual(stages, ['analysis', 'understanding', 'planning', 'storyboard', 'prompts', 'complete']);
  const planned = snapshots.find(snapshot => snapshot.plan);
  assert.ok(planned?.understanding);
  assert.deepEqual(planned.shots, [], 'a whole-script plan is saved before the first storyboard');
  assert.equal(project.plan!.segments[0].sourceExcerpt, source);
  assert.equal(project.plan!.segments[0].storyPurpose, purpose);
  assert.equal(project.shots[0].durationSeconds, 12, '30-second planning target does not force every internal shot to 30 seconds');
  assert.equal(project.shots[0].dialogue, '李明：你回来了。');
  for (const request of ai.calls.filter(prompt => ['STORYBOARD', 'PROMPTS'].includes(marker(prompt)!))) {
    assert.ok(request.includes(purpose), 'downstream authoring receives the actual narrative budget');
  }
});

test('estimate-only action stops with a reviewable plan and continuation reuses all three completed stages', async () => {
  const ai = fixtureAI();
  const snapshots: DirectorCheckpoint[] = [];
  const checkpoint = await estimateAutoDirector({ script: source, settings, generate: ai.generate,
    onCheckpoint: value => snapshots.push(value) });
  assert.deepEqual(ai.calls.map(marker), ['ANALYSIS', 'UNDERSTANDING', 'PLAN']);
  assert.ok(checkpoint.understanding);
  assert.ok(checkpoint.plan);
  assert.deepEqual(checkpoint.shots, []);
  assert.deepEqual(checkpoint.completedPromptShotIds, []);
  assert.deepEqual(snapshots.at(-1), checkpoint, 'reviewable estimate is persisted before the action returns');
  const saved = validateDirectorCheckpoint(jsonCopy(checkpoint));
  const original = jsonCopy(saved);
  const continued = fixtureAI();
  const project = await runAutoDirector({ script: source, settings, generate: continued.generate, checkpoint: saved });
  assert.deepEqual(continued.calls.map(marker), ['STORYBOARD', 'PROMPTS']);
  assert.deepEqual(project.plan, checkpoint.plan);
  assert.deepEqual(saved, original, 'continuation cannot mutate the independently saved estimate');
});

test('two invalid estimates preserve whole-story understanding and resume only the unfinished plan stage', async () => {
  let checkpoint: DirectorCheckpoint | undefined;
  const broken = fixtureAI(prompt => marker(prompt) === 'PLAN' ? '{"segments":[]}' : undefined);
  await assert.rejects(runAutoDirector({ script: source, settings, generate: broken.generate,
    onCheckpoint: value => { checkpoint = value; } }), /AI数据校验失败/);
  assert.equal(broken.calls.filter(prompt => marker(prompt) === 'PLAN').length, 2);
  assert.ok(checkpoint?.understanding);
  assert.equal(checkpoint.plan, undefined);
  assert.deepEqual(checkpoint.shots, []);
  const resumed = fixtureAI();
  const project = await runAutoDirector({ script: source, settings, generate: resumed.generate, checkpoint: jsonCopy(checkpoint) });
  assert.deepEqual(resumed.calls.map(marker), ['PLAN', 'STORYBOARD', 'PROMPTS']);
  assert.ok(project.plan);
});

test('a saved estimate survives a storyboard outage and JSON restore without requesting another estimate', async () => {
  let checkpoint: DirectorCheckpoint | undefined;
  const broken = fixtureAI(prompt => {
    if (marker(prompt) === 'STORYBOARD') throw new Error('模拟分镜网络中断');
    return undefined;
  });
  await assert.rejects(runAutoDirector({ script: source, settings, generate: broken.generate,
    onCheckpoint: value => { checkpoint = value; } }), /模拟分镜网络中断/);
  assert.ok(checkpoint?.plan);
  assert.deepEqual(checkpoint.shots, []);
  const savedPlan = jsonCopy(checkpoint.plan);
  const restored = validateDirectorCheckpoint(jsonCopy(checkpoint));
  const resumed = fixtureAI();
  const result = await runAutoDirector({ script: source, settings, generate: resumed.generate, checkpoint: restored });
  assert.deepEqual(resumed.calls.map(marker), ['STORYBOARD', 'PROMPTS']);
  assert.deepEqual(result.plan, savedPlan);
  assert.deepEqual(checkpoint.plan, savedPlan, 'resume does not mutate caller-owned progress');
});

test('plan survives project/checkpoint/account draft roundtrips and manual or production edits', async () => {
  const { project, checkpoint } = await completeFixture();
  const originalPlan = jsonCopy(project.plan!);
  assert.deepEqual(validateDirectorProject(jsonCopy(project)).plan, originalPlan);
  assert.deepEqual(validateDirectorCheckpoint(jsonCopy(checkpoint)).plan, originalPlan);
  const draft = validateDraft({ ...emptyDraft, scriptData: source, directorSettings: settings,
    directorProject: project, directorCheckpoint: checkpoint });
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(saveDraft(storage, 'planning-writer', draft), '');
  const restored = loadDraft(storage, 'planning-writer');
  assert.equal(restored.error, '');
  assert.deepEqual(restored.draft.directorProject?.plan, originalPlan);
  assert.deepEqual(restored.draft.directorCheckpoint?.plan, originalPlan);
  const edit = createDirectorShotEdit(project.shots[0]);
  edit.values.durationSeconds = '14';
  const edited = commitDirectorShotEdit(project, project.shots[0].id, edit);
  assert.equal(edited.clearCheckpoint, true);
  assert.deepEqual(edited.project.plan, originalPlan);
  assert.equal(reconcileDirectorPlanTiming(edited.project.plan!, edited.project.shots).actualTotalSeconds, 14);
  assert.equal(project.shots[0].durationSeconds, 12);
  const materialEdit = updateDirectorProduction(edited.project, { assets: [], sceneLooks: [{
    scene: '室内', mainLight: '设计补充：左侧窗光', quality: '', environmentColor: '', subjectColor: '',
    accentColor: '', contrast: '', allowedChanges: '',
  }] });
  assert.deepEqual(validateDirectorProject(materialEdit.project).plan, originalPlan);
  const exported = exportDirectorMarkdown(edited.project);
  assert.ok(exported.includes('前置全剧时长规划'));
  assert.ok(exported.includes(purpose));
  assert.ok(exported.includes('当前编排14秒'));
});

test('restored project and progress reject forged plan totals and source evidence', async () => {
  const { project, checkpoint } = await completeFixture();
  const corruptions = [
    (plan: NonNullable<typeof project.plan>) => { plan.estimatedMaxSeconds += 1; },
    (plan: NonNullable<typeof project.plan>) => { plan.estimatedSegmentCount.max += 1; },
    (plan: NonNullable<typeof project.plan>) => { plan.segments[0].sourceExcerpt = '替换成其他来源'; },
    (plan: NonNullable<typeof project.plan>) => { plan.segments[0].sourceStart += 1; },
  ];
  for (const corrupt of corruptions) {
    const badProject = jsonCopy(project);
    corrupt(badProject.plan!);
    assert.throws(() => validateDirectorProject(badProject), /合计|来源/);
    const badCheckpoint = jsonCopy(checkpoint);
    corrupt(badCheckpoint.plan!);
    assert.throws(() => validateDirectorCheckpoint(badCheckpoint), /合计|来源/);
  }
});

test('cancelling pending estimation never commits its late response or starts storyboarding', async () => {
  const controller = new AbortController();
  let resolvePlan: (value: string) => void = () => assert.fail('planning has not started');
  let planPrompt = '';
  let markEntered: () => void = () => {};
  const entered = new Promise<void>(resolve => { markEntered = resolve; });
  const ai = fixtureAI(prompt => {
    if (marker(prompt) !== 'PLAN') return undefined;
    planPrompt = prompt;
    markEntered();
    return new Promise<string>(resolve => { resolvePlan = resolve; });
  });
  const snapshots: DirectorCheckpoint[] = [];
  const pending = runAutoDirector({ script: source, settings, generate: ai.generate, signal: controller.signal,
    onCheckpoint: value => snapshots.push(value) });
  await entered;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  const beforeLateResponse = snapshots.length;
  resolvePlan(validPlanResponse(planPrompt));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(snapshots.length, beforeLateResponse);
  assert.ok(snapshots.at(-1)?.understanding);
  assert.equal(snapshots.at(-1)?.plan, undefined);
  assert.deepEqual(snapshots.at(-1)?.shots, []);
  assert.deepEqual(ai.calls.map(marker), ['ANALYSIS', 'UNDERSTANDING', 'PLAN']);
});

test('complete legacy progress without a plan restores without an additional provider call', async () => {
  const { checkpoint } = await completeFixture();
  const legacy = jsonCopy(checkpoint);
  delete legacy.plan;
  const restored = validateDirectorCheckpoint(legacy);
  const result = await runAutoDirector({ script: source, settings, checkpoint: restored,
    generate: async () => assert.fail('completed legacy progress must never request a retrospective estimate') });
  assert.equal(result.plan, undefined);
  assert.deepEqual(result.shots, checkpoint.shots);
  assert.ok(exportDirectorMarkdown(result).includes('旧项目没有前置估算'));
  await assert.rejects(estimateAutoDirector({ script: source, settings, checkpoint: restored,
    generate: async () => assert.fail('legacy estimation must not silently call a retrospective planner') }), /旧草案已有分镜/);
});
