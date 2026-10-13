import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDirectorScript, defaultDirectorSettings, exportDirectorMarkdown, regenerateDirectorShot,
  runAutoDirector, validateDirectorCheckpoint, validateDirectorProject, validateDirectorSettings,
  type DirectorCheckpoint, type DirectorGenerate, type DirectorProject,
} from './autoDirector.ts';

const script = '室内，傍晚。\n李明：“你……真的回来了吗？”\n他握紧钥匙，在门边停住。';
const settings = { ...defaultDirectorSettings };
const asset = (source: string) => ({ name: '室内', description: '剧本中的室内，设计补充：简洁木门', sourceExcerpt: source.includes('室内') ? '室内' : source.slice(0, 3) });
function fakeAI(options: { splitLines?: boolean; fail?: (prompt: string, call: number) => boolean } = {}) {
  const calls: string[] = [];
  const generate: DirectorGenerate = async prompt => {
    calls.push(prompt);
    if (options.fail?.(prompt, calls.length)) throw new Error('模拟网络中断');
    if (prompt.includes('[DIRECTOR_ANALYSIS]')) {
      const source = prompt.match(/<source-script>\n([\s\S]*?)\n<\/source-script>/)![1];
      return JSON.stringify({ chunkId: prompt.match(/来源块(chunk-\d+)/)![1], summary: '按原文顺序保留本块事件', beats: ['按原文推进'],
        characters: source.includes('李明') ? [{ name: '李明', description: '原文中的李明', sourceExcerpt: '李明' }] : [],
        scenes: [asset(source)], continuityRules: [], uncertainties: ['没有给出室内详细布置'] });
    }
    if (prompt.includes('[DIRECTOR_UNDERSTANDING]')) return JSON.stringify({ summary: '李明等到了归来的人', storyArc: '先问话，再握紧钥匙停住',
      characters: prompt.includes('李明') ? [{ name: '李明', description: '原文中的李明', sourceExcerpt: '李明' }] : [],
      scenes: [{ name: '室内', description: '同一室内空间', sourceExcerpt: '室内' }], continuityRules: ['钥匙在李明手里'], uncertainties: [] });
    if (prompt.includes('[DIRECTOR_STORYBOARD]')) {
      const source = prompt.match(/<source-script>\n([\s\S]*?)\n<\/source-script>/)![1];
      const pieces = options.splitLines ? source.match(/[^\n]*\n|[^\n]+$/g)!.filter(Boolean) : [source];
      return JSON.stringify({ shots: pieces.map(sourceExcerpt => ({ scene: '室内', charactersInvolved: sourceExcerpt.includes('李明') ? ['李明'] : [],
        sourceExcerpt, action: '按原文动作推进并停在明确落点', camera: '中景，平稳推进观察反应', dialogue: 'AI试图改写这句，但不应被采用',
        durationSeconds: 12, continuity: '承接前镜站位，停在原文指定位置' })) });
    }
    if (prompt.includes('[DIRECTOR_PROMPTS]')) {
      const parts = prompt.split('镜头ID：').slice(1);
      return JSON.stringify({ prompts: parts.map(part => {
        const shotId = part.split('\n')[0];
        const shot = JSON.parse(part.match(/当前分镜：([^\n]+)/)![1]);
        const params = JSON.parse(part.match(/用户参数：([^\n]+)/)![1]);
        return { shotId, masterPrompt: `参考：按角色和场景名称准备。\n0—${parseInt(params.duration)}秒：${shot.action}，${shot.camera}。${shot.dialogue ? `对白：${shot.dialogue}` : '无对白。'}\n声音：环境声。`,
          postProductionNotes: ['检查镜间曝光和声音接缝'], referencePlan: [], qaWarnings: [] };
      }) });
    }
    throw new Error('未知测试任务');
  };
  return { generate, calls };
}
async function projectFixture(splitLines = false) {
  const ai = fakeAI({ splitLines });
  return runAutoDirector({ script, settings, generate: ai.generate });
}

test('pipeline uses real injected generation, full source coverage and source-extracted exact dialogue', async () => {
  const ai = fakeAI();
  const checkpoints: DirectorCheckpoint[] = [];
  const stages: string[] = [];
  const project = await runAutoDirector({ script, settings, generate: ai.generate, onCheckpoint: value => checkpoints.push(value), onProgress: value => stages.push(value.stage) });
  assert.equal(ai.calls.length, 4);
  assert.deepEqual(stages, ['analysis', 'understanding', 'storyboard', 'prompts', 'complete']);
  assert.equal(project.shots[0].sourceStart, 0);
  assert.equal(project.shots[0].sourceEnd, script.length);
  assert.equal(project.shots[0].sourceExcerpt, script);
  assert.equal(project.shots[0].dialogue, '李明：你……真的回来了吗？');
  assert.ok(project.shots[0].masterPrompt.includes('你……真的回来了吗？'));
  assert.ok(!project.shots[0].dialogue.includes('AI试图'));
  assert.equal(checkpoints.at(-1)!.completedPromptShotIds.length, 1);
  assert.deepEqual(validateDirectorCheckpoint(checkpoints.at(-1)), checkpoints.at(-1));
  assert.ok(ai.calls[3].includes('后一片段'));
  assert.ok(ai.calls[3].includes('小云雀4K为超分'));
});

test('visual quoted text is not invented dialogue and nickname quotes preserve the whole utterance', async () => {
  const signScript = '室内。墙上写着“平安”二字，李明推门。';
  const sign = await runAutoDirector({ script: signScript, settings, generate: fakeAI().generate });
  assert.equal(sign.shots[0].dialogue, '');
  assert.ok(sign.shots[0].qaWarnings.some(warning => warning.includes('未确认为对白')));
  const forged = structuredClone(sign); forged.shots[0].dialogue = '平安';
  assert.throws(() => validateDirectorProject(forged), /对白与原文/);
  const nicknameScript = '室内。\n李明：别叫我“小明”。';
  const nickname = await runAutoDirector({ script: nicknameScript, settings, generate: fakeAI().generate });
  assert.equal(nickname.shots[0].dialogue, '李明：别叫我“小明”。');
  assert.ok(nickname.shots[0].masterPrompt.includes('别叫我“小明”。'));
  const shortened = structuredClone(nickname); shortened.shots[0].dialogue = '李明：小明';
  assert.throws(() => validateDirectorProject(shortened), /对白与原文/);
  const spokenScript = '室内。李明抬头问道：“你回来了？”';
  const spoken = await runAutoDirector({ script: spokenScript, settings, generate: fakeAI().generate });
  assert.equal(spoken.shots[0].dialogue, '李明：你回来了？');
});

test('a genuine source dialogue about upload status is preserved without claiming platform upload', async () => {
  const source = '室内。\n李明：“文件已上传，请你看一眼。”';
  const project = await runAutoDirector({ script: source, settings, generate: fakeAI().generate });
  assert.equal(project.shots[0].dialogue, '李明：文件已上传，请你看一眼。');
  assert.ok(project.shots[0].masterPrompt.includes('文件已上传，请你看一眼。'));
});

test('lossless chunking covers long scripts, punctuation and surrogate pairs', async () => {
  const long = '室内。' + '行走😀'.repeat(5_600);
  const chunks = chunkDirectorScript(long);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map(chunk => chunk.text).join(''), long);
  for (let index = 0; index < chunks.length; index++) {
    assert.equal(chunks[index].start, index ? chunks[index - 1].end : 0);
    assert.equal(chunks[index].text, long.slice(chunks[index].start, chunks[index].end));
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunks[index].text));
  }
  const ai = fakeAI();
  const project = await runAutoDirector({ script: long, settings, generate: ai.generate });
  assert.equal(project.shots.length, chunks.length);
  assert.equal(project.shots.map(shot => shot.sourceExcerpt).join(''), long);
  assert.equal(ai.calls.filter(call => call.includes('[DIRECTOR_ANALYSIS]')).length, chunks.length);
  assert.equal(ai.calls.filter(call => call.includes('[DIRECTOR_STORYBOARD]')).length, chunks.length);
});

test('pre-cancelled run calls no provider and cancelled ignored-signal provider commits no response', async () => {
  const stopped = new AbortController(); stopped.abort();
  const ai = fakeAI();
  await assert.rejects(runAutoDirector({ script, settings, generate: ai.generate, signal: stopped.signal }), { name: 'AbortError' });
  assert.equal(ai.calls.length, 0);
  const controller = new AbortController();
  let resolve!: (value: string) => void;
  let checkpoints = 0;
  const pending = runAutoDirector({ script, settings, signal: controller.signal,
    generate: () => new Promise<string>(done => { resolve = done; }), onCheckpoint: () => checkpoints++ });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  resolve('{}');
  await Promise.resolve();
  assert.equal(checkpoints, 1);
});

test('resume skips all successful analysis/understanding/storyboards and completed prompt batches', async () => {
  const many = Array.from({ length: 9 }, (_, index) => `室内。第${index + 1}步落在地面。`).join('\n');
  let checkpoint: DirectorCheckpoint | undefined;
  let promptCalls = 0;
  const broken = fakeAI({ splitLines: true, fail: prompt => prompt.includes('[DIRECTOR_PROMPTS]') && ++promptCalls === 2 });
  await assert.rejects(runAutoDirector({ script: many, settings, generate: broken.generate, onCheckpoint: value => { checkpoint = value; } }), /模拟网络中断/);
  assert.equal(checkpoint!.shots.length, 9);
  assert.equal(checkpoint!.completedPromptShotIds.length, 4);
  const before = JSON.stringify(checkpoint!.shots.slice(0, 4));
  const resumed = fakeAI();
  const project = await runAutoDirector({ script: many, settings, generate: resumed.generate, checkpoint });
  assert.equal(resumed.calls.length, 2);
  assert.ok(resumed.calls.every(call => call.includes('[DIRECTOR_PROMPTS]')));
  assert.equal(JSON.stringify(project.shots.slice(0, 4)), before);
  assert.equal(project.shots.filter(shot => shot.masterPrompt).length, 9);
});

test('resume binds exact script/settings and cannot mix manipulated source chunks', async () => {
  let checkpoint: DirectorCheckpoint | undefined;
  const ai = fakeAI({ fail: prompt => prompt.includes('[DIRECTOR_UNDERSTANDING]') });
  await assert.rejects(runAutoDirector({ script, settings, generate: ai.generate, onCheckpoint: value => { checkpoint = value; } }));
  const rejectProvider: DirectorGenerate = async () => assert.fail('must reject before provider call');
  await assert.rejects(runAutoDirector({ script: script + '。', settings, checkpoint, generate: rejectProvider }), /不一致/);
  await assert.rejects(runAutoDirector({ script, settings: { ...settings, rhythm: 'action' }, checkpoint, generate: rejectProvider }), /不一致/);
  const changed = structuredClone(checkpoint!); changed.chunks[0].text = '捏造原文';
  assert.throws(() => validateDirectorCheckpoint(changed), /来源/);
});

test('invalid structure gets exactly one repair and leaves successful checkpoint unchanged', async () => {
  let checkpoint: DirectorCheckpoint | undefined;
  const ai = fakeAI();
  let invalidCalls = 0;
  const generate: DirectorGenerate = async (prompt, json, signal) => {
    if (prompt.includes('[DIRECTOR_STORYBOARD]')) { invalidCalls++; return '{"shots":[{"sourceExcerpt":"漏掉整个原文"}]}'; }
    return ai.generate(prompt, json, signal);
  };
  await assert.rejects(runAutoDirector({ script, settings, generate, onCheckpoint: value => { checkpoint = value; } }), /AI数据校验失败/);
  assert.equal(invalidCalls, 2);
  assert.ok(checkpoint!.understanding);
  assert.equal(checkpoint!.shots.length, 0);
  const resumed = fakeAI();
  await runAutoDirector({ script, settings, generate: resumed.generate, checkpoint });
  assert.equal(resumed.calls.length, 2);
});

test('storyboard omissions and overloaded dialogue are rejected rather than replaced by fake defaults', async () => {
  const ai = fakeAI();
  const omitted: DirectorGenerate = async (prompt, json, signal) => {
    if (prompt.includes('[DIRECTOR_STORYBOARD]')) return JSON.stringify({ shots: [{ scene: '室内', charactersInvolved: ['李明'],
      sourceExcerpt: '室内，傍晚。', action: '停住', camera: '中景', durationSeconds: 12, continuity: '门前停住' }] });
    return ai.generate(prompt, json, signal);
  };
  await assert.rejects(runAutoDirector({ script, settings, generate: omitted }), /尾部原文/);
  const tooLong = `室内。\n李明：“${'请逐字保留'.repeat(40)}”`;
  await assert.rejects(runAutoDirector({ script: tooLong, settings, generate: fakeAI().generate }), /对白.*过密/);
});

test('untrusted imported projects reject forged source, invented dialogue and malformed fields', async () => {
  const project = await projectFixture();
  const alter = (change: (value: DirectorProject) => void) => { const copy = structuredClone(project); change(copy); return copy; };
  assert.throws(() => validateDirectorProject(alter(value => { value.shots[0].sourceExcerpt = '这不是剧本'; })), /来源位置/);
  assert.throws(() => validateDirectorProject(alter(value => { value.shots[0].dialogue = '我替你决定'; })), /对白与原文/);
  assert.throws(() => validateDirectorProject(alter(value => { value.shots[0].scene = '从未出现的月球'; })), /未定义/);
  assert.throws(() => validateDirectorProject(alter(value => { value.shots[0].durationSeconds = 31; })), /4到30/);
  assert.throws(() => validateDirectorProject(alter(value => { value.shots[0].masterPrompt = '0—12秒：对白：“我替你决定。”'; })), /原文对白|原文没有/);
  assert.throws(() => validateDirectorProject(alter(value => { value.shots[0].masterPrompt = '0—12秒：请使用@图片1。'; })), /编号/);
  assert.throws(() => validateDirectorProject(alter(value => { value.shots[0].referencePlan = [{ assetName: '李明', role: 'character', instruction: '已上传', exclusions: '背景' }]; })), /上传/);
  assert.throws(() => validateDirectorSettings({ ...settings, platform: 'unknown' }), /请选择/);
});

test('shot regeneration only changes selected prompt and receives neighbors plus current edited action', async () => {
  const project = await projectFixture(true);
  const index = 1;
  const edited = structuredClone(project);
  edited.shots[index].action = '她在门边收回指尖，慢慢停稳';
  edited.shots[index].masterPrompt = '';
  edited.shots[index].postProductionNotes = [];
  assert.equal(validateDirectorProject(edited).shots[index].masterPrompt, '');
  const ai = fakeAI();
  const regenerated = await regenerateDirectorShot(edited, edited.shots[index].id, ai.generate);
  assert.equal(ai.calls.length, 1);
  assert.ok(ai.calls[0].includes('她在门边收回指尖'));
  assert.ok(ai.calls[0].includes(project.shots[0].action));
  assert.ok(ai.calls[0].includes(project.shots[2].action));
  assert.deepEqual(regenerated.shots[0], edited.shots[0]);
  assert.deepEqual(regenerated.shots[2], edited.shots[2]);
  assert.ok(regenerated.shots[index].masterPrompt.includes('她在门边收回指尖'));
  assert.equal(project.shots[index].action, '按原文动作推进并停在明确落点');
});

test('markdown separates copyable text from postproduction and keeps authoritative full script', async () => {
  const project = await projectFixture();
  const markdown = exportDirectorMarkdown(project);
  const copyBlock = markdown.match(/### 可复制提示词\n(`{3,})text\n([\s\S]*?)\n\1/)![2];
  assert.equal(copyBlock, project.shots[0].masterPrompt);
  assert.ok(!copyBlock.includes('检查镜间曝光'));
  assert.ok(markdown.includes('后期建议（不属于提示词正文）'));
  assert.ok(markdown.includes(script));
});
