import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDirectorScript, defaultDirectorSettings, runAutoDirector, validateDirectorCheckpoint,
  type DirectorCheckpoint, type DirectorGenerate, type DirectorProject,
} from './autoDirector.ts';
import { buildDirectorSourceUnits } from './directorSource.ts';

const settings = { ...defaultDirectorSettings, creativeMethod: 'standard' as const };
const source = Array.from({ length: 64 }, (_, index) => {
  const number = index + 1;
  return number === 1 || number === 63
    ? `室内，李明：“第${number}句话必须保留。”\n`
    : `室内，李明把第${number}件木偶放到桌上。\n`;
}).join('');
const chunk = chunkDirectorScript(source)[0];
const units = buildDirectorSourceUnits(chunk);
type SourceRow = { id: string; text: string };
type BoardRequest = { call: number; prompt: string; text: string; rows: SourceRow[] };

function storyboardShot(first: string, last = first) {
  return { scene: '室内', charactersInvolved: ['李明'], sourceStartUnit: first, sourceEndUnit: last,
    action: '依照原文执行动作并停在原文落点', camera: '中景固定观察人物与桌面',
    durationSeconds: 30, continuity: '承接前镜人物站位及持物状态' };
}

function storyboardRows(prompt: string): SourceRow[] {
  return prompt.split('\n').filter(line => /^\{"id":"u\d+","text":/.test(line)).map(line => JSON.parse(line));
}

function recoveryAI(storyboard: (request: BoardRequest) => unknown = request => ({
  shots: request.rows.map(row => storyboardShot(row.id)),
})) {
  const calls: string[] = [];
  const boards: BoardRequest[] = [];
  const generate: DirectorGenerate = async prompt => {
    calls.push(prompt);
    if (prompt.includes('[DIRECTOR_ANALYSIS]')) return JSON.stringify({
      chunkId: prompt.match(/来源块(chunk-\d+)/)![1], summary: '人物按顺序摆放木偶并说原文台词', beats: ['保持全部动作与对白顺序'],
      characters: [{ name: '李明', description: '原文角色', sourceExcerpt: '李明' }],
      scenes: [{ name: '室内', description: '原文空间', sourceExcerpt: '室内' }], continuityRules: [], uncertainties: [],
    });
    if (prompt.includes('[DIRECTOR_UNDERSTANDING]')) return JSON.stringify({
      summary: '按原文的顺序保留所有事件', storyArc: '人物依次行动并说出原文台词',
      characters: [{ name: '李明', description: '原文角色', sourceExcerpt: '李明' }],
      scenes: [{ name: '室内', description: '原文空间', sourceExcerpt: '室内' }], continuityRules: [], uncertainties: [],
    });
    if (prompt.includes('[DIRECTOR_STORYBOARD]')) {
      const request = { call: boards.length + 1, prompt, text: prompt.match(/<source-script>\n([\s\S]*?)\n<\/source-script>/)![1], rows: storyboardRows(prompt) };
      boards.push(request);
      return JSON.stringify(storyboard(request));
    }
    if (prompt.includes('[DIRECTOR_PROMPTS]')) return JSON.stringify({
      prompts: prompt.split('镜头ID：').slice(1).map(part => {
        const shotId = part.split('\n')[0];
        const shot = JSON.parse(part.match(/当前分镜：([^\n]+)/)![1]);
        const params = JSON.parse(part.match(/用户参数：([^\n]+)/)![1]);
        return { shotId, masterPrompt: `0—${parseInt(params.duration)}秒：${shot.action}，${shot.camera}。\n${shot.dialogue ? `对白：\n${shot.dialogue}` : '无对白。'}\n声音：室内环境声。`,
          referencePlan: [], postProductionNotes: [], qaWarnings: [] };
      }),
    });
    throw new Error('未知测试任务');
  };
  return { generate, calls, boards };
}

/** The reported failure: 33 valid shots cover u1–u62, then shot 34 skips u63. */
function reportedGap() {
  const shots = [
    ...Array.from({ length: 29 }, (_, index) => storyboardShot(`u${index * 2 + 1}`, `u${index * 2 + 2}`)),
    ...Array.from({ length: 4 }, (_, index) => storyboardShot(`u${59 + index}`)),
    storyboardShot('u64'),
  ];
  assert.equal(shots.length, 34);
  return { shots };
}

function verifyExactCoverage(project: DirectorProject, script = source) {
  assert.equal(project.shots.map(shot => shot.sourceExcerpt).join(''), script);
  let cursor = 0;
  project.shots.forEach((shot, index) => {
    assert.equal(shot.sourceStart, cursor);
    assert.equal(shot.sourceExcerpt, script.slice(shot.sourceStart, shot.sourceEnd));
    assert.equal(shot.id, `shot-${index + 1}`);
    assert.equal(shot.shotNumber, index + 1);
    cursor = shot.sourceEnd;
  });
  assert.equal(cursor, script.length);
}

test('shot 34 skipping u63 retains its 33 validated predecessors and repairs only the original u63–u64 tail', async () => {
  assert.equal(chunkDirectorScript(source).length, 1);
  assert.equal(units.length, 64);
  const saved: DirectorCheckpoint[] = [];
  const ai = recoveryAI(request => request.call === 1 ? reportedGap() : ({ shots: request.rows.map(row => storyboardShot(row.id)) }));
  const project = await runAutoDirector({ script: source, settings, generate: ai.generate, onCheckpoint: value => saved.push(value) });
  const prefix = saved.find(value => value.shots.length === 33)!;
  assert.ok(prefix, 'validated first 33 shots must be saved before the repair');
  assert.equal(prefix.shots.at(-1)!.sourceEnd, units[61].end);
  assert.deepEqual(validateDirectorCheckpoint(JSON.parse(JSON.stringify(prefix))), prefix);
  assert.equal(ai.boards.length, 2);
  assert.equal(ai.boards[1].text, source.slice(units[62].start));
  assert.deepEqual(ai.boards[1].rows.map(row => row.id), ['u63', 'u64']);
  assert.equal(project.shots.length, 35);
  assert.deepEqual(project.shots.slice(0, 33).map(shot => shot.sourceExcerpt), prefix.shots.map(shot => shot.sourceExcerpt));
  assert.equal(project.shots.filter(shot => shot.dialogue).map(shot => shot.dialogue).join('\n'), '李明：第1句话必须保留。\n李明：第63句话必须保留。');
  verifyExactCoverage(project);
});

for (const failure of ['gap', 'network'] as const) {
  test(`a second ${failure} preserves the validated prefix through JSON roundtrip and resumes without reanalysis or repetition`, async () => {
    let checkpoint: DirectorCheckpoint | undefined;
    const ai = recoveryAI(request => {
      if (request.call === 1) return reportedGap();
      if (failure === 'network') throw new Error('模拟修复请求网络中断');
      return { shots: [storyboardShot('u64')] };
    });
    await assert.rejects(runAutoDirector({ script: source, settings, generate: ai.generate,
      onCheckpoint: value => { checkpoint = value; } }), failure === 'network' ? /网络中断/ : /u63/);
    assert.equal(ai.boards.length, 2);
    assert.equal(checkpoint!.shots.length, 33);
    assert.deepEqual(checkpoint!.completedPromptShotIds, []);
    const restored = validateDirectorCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
    const resumed = recoveryAI();
    const project = await runAutoDirector({ script: source, settings, generate: resumed.generate, checkpoint: restored });
    assert.ok(resumed.calls[0].includes('[DIRECTOR_STORYBOARD]'));
    assert.ok(!resumed.calls.some(prompt => /\[DIRECTOR_(ANALYSIS|UNDERSTANDING)\]/.test(prompt)));
    assert.equal(resumed.boards.length, 1);
    assert.equal(resumed.boards[0].text, source.slice(units[62].start));
    assert.deepEqual(resumed.boards[0].rows.map(row => row.id), ['u63', 'u64']);
    assert.deepEqual(project.shots.slice(0, 33).map(shot => shot.action), restored.shots.map(shot => shot.action));
    verifyExactCoverage(project);
  });
}

test('each partial response advancing one source unit still allows only two automatic storyboard requests', async () => {
  let checkpoint: DirectorCheckpoint | undefined;
  const ai = recoveryAI(request => ({ shots: [storyboardShot(request.rows[0].id)] }));
  await assert.rejects(runAutoDirector({ script: source, settings, generate: ai.generate,
    onCheckpoint: value => { checkpoint = value; } }), /尾部|u3|剩余|覆盖/);
  assert.equal(ai.boards.length, 2, 'partial progress must not create an unbounded paid request loop');
  assert.equal(checkpoint!.shots.length, 2);
  assert.equal(checkpoint!.shots.at(-1)!.sourceEnd, units[1].end);
  assert.deepEqual(ai.boards[1].rows.map(row => row.id), units.slice(1).map(unit => unit.id));
  const resumed = recoveryAI();
  const project = await runAutoDirector({ script: source, settings, generate: resumed.generate,
    checkpoint: validateDirectorCheckpoint(JSON.parse(JSON.stringify(checkpoint))) });
  assert.equal(resumed.boards[0].rows[0].id, 'u3');
  verifyExactCoverage(project);
});

test('cancelling after a validated prefix checkpoint prevents its repair request and any later commits', async () => {
  const controller = new AbortController();
  const snapshots: DirectorCheckpoint[] = [];
  const ai = recoveryAI(() => reportedGap());
  await assert.rejects(runAutoDirector({ script: source, settings, generate: ai.generate, signal: controller.signal,
    onCheckpoint: value => {
      snapshots.push(value);
      if (value.shots.length === 33) controller.abort();
    } }), (error: Error) => error.name === 'AbortError');
  assert.equal(ai.boards.length, 1);
  assert.equal(snapshots.at(-1)!.shots.length, 33);
  assert.deepEqual(snapshots.at(-1)!.completedPromptShotIds, []);
  assert.ok(!ai.calls.some(prompt => prompt.includes('[DIRECTOR_PROMPTS]')));
  assert.doesNotThrow(() => validateDirectorCheckpoint(snapshots.at(-1)));
});

test('a legacy excerpt ending inside a source unit resumes with that unit original ID and only its unconsumed text', async () => {
  const legacySource = '室内，李明握住钥匙缓慢走到窗边停下。\n李明：“别走。”';
  const prefix = '室内，李明握住钥匙';
  const legacyUnits = buildDirectorSourceUnits(chunkDirectorScript(legacySource)[0]);
  assert.ok(prefix.length < legacyUnits[0].end);
  let checkpoint: DirectorCheckpoint | undefined;
  const ai = recoveryAI(request => {
    if (request.call > 1) throw new Error('模拟修复请求网络中断');
    const { sourceStartUnit: _first, sourceEndUnit: _last, ...legacyShot } = storyboardShot('u1');
    return { shots: [{ ...legacyShot, sourceExcerpt: prefix }, { ...legacyShot, sourceExcerpt: '李明：“别走。”' }] };
  });
  await assert.rejects(runAutoDirector({ script: legacySource, settings, generate: ai.generate,
    onCheckpoint: value => { checkpoint = value; } }), /网络中断/);
  assert.equal(checkpoint!.shots.length, 1);
  assert.equal(checkpoint!.shots[0].sourceEnd, prefix.length);
  const restored = validateDirectorCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
  const resumed = recoveryAI();
  const project = await runAutoDirector({ script: legacySource, settings, generate: resumed.generate, checkpoint: restored });
  assert.equal(resumed.boards[0].text, legacySource.slice(prefix.length));
  assert.equal(resumed.boards[0].rows[0].id, 'u1');
  assert.equal(resumed.boards[0].rows[0].text, legacySource.slice(prefix.length, legacyUnits[0].end));
  assert.deepEqual(resumed.boards[0].rows.slice(1).map(row => row.id), legacyUnits.slice(1).map(unit => unit.id));
  assert.equal(project.shots[0].sourceExcerpt, prefix);
  assert.equal(project.shots.map(shot => shot.dialogue).filter(Boolean).join('\n'), '李明：别走。');
  verifyExactCoverage(project, legacySource);
});

test('partial checkpoint support still rejects missing source intervals and edited source excerpts before any AI request', async () => {
  let checkpoint: DirectorCheckpoint | undefined;
  const ai = recoveryAI(request => {
    if (request.call === 1) return reportedGap();
    throw new Error('模拟修复请求网络中断');
  });
  await assert.rejects(runAutoDirector({ script: source, settings, generate: ai.generate,
    onCheckpoint: value => { checkpoint = value; } }), /网络中断/);
  const gap = JSON.parse(JSON.stringify(checkpoint)) as DirectorCheckpoint;
  gap.shots.splice(1, 1);
  gap.shots.forEach((shot, index) => { shot.id = `shot-${index + 1}`; shot.shotNumber = index + 1; });
  const edited = JSON.parse(JSON.stringify(checkpoint)) as DirectorCheckpoint;
  edited.shots[1].sourceExcerpt = edited.shots[1].sourceExcerpt.replace('木偶', '石像');
  const noAI: DirectorGenerate = async () => assert.fail('corrupt checkpoint must fail before sending data to AI');
  for (const forged of [gap, edited]) {
    assert.throws(() => validateDirectorCheckpoint(forged));
    await assert.rejects(runAutoDirector({ script: source, settings, generate: noAI, checkpoint: forged }));
  }
});

test('a restored prefix with only trailing whitespace left finishes coverage locally without another storyboard call', async () => {
  const whitespaceSource = '室内，李明把木偶放在桌角。 \r\n\t';
  let checkpoint: DirectorCheckpoint | undefined;
  const initial = recoveryAI();
  await runAutoDirector({ script: whitespaceSource, settings, generate: initial.generate,
    onCheckpoint: value => { checkpoint = value; } });
  checkpoint!.completedPromptShotIds = [];
  checkpoint!.shots.forEach(shot => { shot.masterPrompt = ''; });
  const last = checkpoint!.shots.at(-1)!;
  last.sourceEnd = whitespaceSource.trimEnd().length;
  last.sourceExcerpt = whitespaceSource.slice(last.sourceStart, last.sourceEnd);
  const restored = validateDirectorCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
  const resumed = recoveryAI(() => assert.fail('whitespace-only remainder needs no paid storyboard generation'));
  const project = await runAutoDirector({ script: whitespaceSource, settings, generate: resumed.generate, checkpoint: restored });
  assert.equal(resumed.boards.length, 0);
  assert.equal(project.shots.length, 1);
  assert.ok(resumed.calls.every(prompt => prompt.includes('[DIRECTOR_PROMPTS]')));
  verifyExactCoverage(project, whitespaceSource);
});

test('a restored prefix may end before an emoji but cannot split its UTF-16 surrogate pair', async () => {
  const unicodeSource = '室内，李明拿起😀木偶。\n';
  let checkpoint: DirectorCheckpoint | undefined;
  const ai = recoveryAI();
  await runAutoDirector({ script: unicodeSource, settings, generate: ai.generate,
    onCheckpoint: value => { checkpoint = value; } });
  checkpoint!.completedPromptShotIds = [];
  checkpoint!.shots.forEach(shot => { shot.masterPrompt = ''; });
  const shot = checkpoint!.shots[0];
  shot.sourceEnd = unicodeSource.indexOf('😀');
  shot.sourceExcerpt = unicodeSource.slice(0, shot.sourceEnd);
  assert.doesNotThrow(() => validateDirectorCheckpoint(checkpoint));
  shot.sourceEnd++;
  shot.sourceExcerpt = unicodeSource.slice(0, shot.sourceEnd);
  assert.throws(() => validateDirectorCheckpoint(checkpoint), /Unicode/);
  const noAI: DirectorGenerate = async () => assert.fail('a broken Unicode boundary must fail before AI');
  await assert.rejects(runAutoDirector({ script: unicodeSource, settings, generate: noAI, checkpoint }), /Unicode/);
});
