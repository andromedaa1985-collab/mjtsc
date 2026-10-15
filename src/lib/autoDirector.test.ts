import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDirectorScript, defaultDirectorSettings, exportDirectorMarkdown, regenerateDirectorShot,
  runAutoDirector, validateDirectorCheckpoint, validateDirectorProject, validateDirectorSettings,
  type DirectorCheckpoint, type DirectorGenerate, type DirectorProject, type DirectorShotCraft,
} from './autoDirector.ts';
import { buildDirectorMethodGuidance, getDirectorMethod } from './directorMethods.ts';
import { buildDirectorCopyPrompt, type DirectorProduction, type DirectorShotBoundary } from './directorProduction';
import { buildDirectorSourceUnits } from './directorSource';

const script = '室内，傍晚。\n李明：“你……真的回来了吗？”\n他握紧钥匙，在门边停住。';
const settings = { ...defaultDirectorSettings, creativeMethod: 'standard' as const };
const asset = (source: string) => ({ name: '室内', description: '剧本中的室内，设计补充：简洁木门', sourceExcerpt: source.includes('室内') ? '室内' : source.slice(0, 3) });
function fakeAI(options: { splitLines?: boolean; craft?: DirectorShotCraft; fail?: (prompt: string, call: number) => boolean } = {}) {
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
        durationSeconds: 12, continuity: '承接前镜站位，停在原文指定位置', ...(options.craft ? { craft: options.craft } : {}) })) });
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
function rawProject(source: string, dialogue: string, prompt = '', names = ['李明', '阿兰']): DirectorProject {
  return { version: 1, sourceScript: source, settings, understanding: {
    summary: '源剧本', storyArc: '按原文推进', characters: names.filter(name => source.includes(name)).map(name => ({ name, description: '原文角色', sourceExcerpt: name })),
    scenes: [{ name: '室内', description: '原文空间', sourceExcerpt: '室内' }], continuityRules: [], uncertainties: [],
  }, shots: [{ id: 'shot-1', shotNumber: 1, scene: '室内', charactersInvolved: names.filter(name => source.includes(name)),
    sourceExcerpt: source, sourceStart: 0, sourceEnd: source.length, sourceChunkId: 'chunk-1', action: '按源剧本推进', camera: '固定中景',
    dialogue, durationSeconds: 30, continuity: '同一空间', referencePlan: [], masterPrompt: prompt, postProductionNotes: [], qaWarnings: [] }] };
}

const researchedCraft: DirectorShotCraft = {
  emotionStart: '门边的手指绷紧，等待回应', emotionalTrigger: '原文问话后对方没有立刻回应', emotionEnd: '呼吸变浅，停在门边',
  spatialAnchor: '同一扇室内木门与右手钥匙', cameraPurpose: '让观众看见问话后的停顿', lightSoundCue: '沿用户所选光色，钥匙轻响后留环境声',
};

test('explicit unquoted actor, narration and dialogue labels reject newly invented speech', () => {
  const source = '室内。林澈把钥匙放到桌角。';
  const captions = [
    '林澈：这句是原文没有的新增对白。', '旁白：他终于明白了人生的意义。',
    '画外音：你已经没有退路。', '对白：这句是新添的。', '台词：我替你决定。',
    '林澈：\n这句是跨行新增的。', '对白：\n这句是跨行新增的。',
  ];
  for (const caption of captions) assert.throws(() => validateDirectorProject(rawProject(source, '', `0—30秒：林澈把钥匙放到桌角。\n${caption}`, ['林澈'])), /原文没有|新增台词/, caption);
  assert.throws(() => validateDirectorProject(rawProject(source, '', '0—30秒：林澈：这句在时间轴内新添。', ['林澈'])), /原文没有|新增台词/);
  const unnamedShot = rawProject(source, '', '0—30秒：林澈把钥匙放到桌角。\n林澈：这句新增了。', ['林澈']);
  unnamedShot.shots[0].charactersInvolved = [];
  assert.throws(() => validateDirectorProject(unnamedShot), /原文没有|新增台词/);
});

test('valid original speech cannot conceal a second unquoted sentence or a new speaker label', () => {
  const source = '室内。\n林澈：“别走。”';
  const good = '0—30秒：林澈：“别走。”';
  for (const extra of ['\n林澈：我从来没有说过这句话。', '\n旁白：他已经放弃了。', '\n台词：原文里没有这一句。']) {
    assert.throws(() => validateDirectorProject(rawProject(source, '林澈：别走。', good + extra, ['林澈'])), /原文没有|新增台词/);
  }
  assert.throws(() => validateDirectorProject(rawProject(source, '林澈：别走。', '0—30秒：林澈：别走。我替你决定。', ['林澈'])), /原文没有|新增台词/);
  assert.throws(() => validateDirectorProject(rawProject(source, '林澈：别走。', '0—30秒：对白：林澈：别走。\n林澈：\n这句也是新增的。', ['林澈'])), /原文没有|新增台词/);
});

test('unquoted exact original lines remain usable inside a timeline and across a labelled block', () => {
  const source = '室内。\n林澈：“别走。”\n林澈：“我还在等你。”';
  const dialogue = '林澈：别走。\n林澈：我还在等你。';
  assert.doesNotThrow(() => validateDirectorProject(rawProject(source, dialogue, '0—15秒：林澈：别走。\n15—30秒：林澈：我还在等你。', ['林澈'])));
  assert.doesNotThrow(() => validateDirectorProject(rawProject(source, dialogue, '0—30秒：原文表演。\n林澈：\n别走。\n我还在等你。\n声音：环境声。', ['林澈'])));
  assert.doesNotThrow(() => validateDirectorProject(rawProject(source, dialogue, '0—30秒：原文表演。\n对白：\n林澈：别走。\n林澈：我还在等你。', ['林澈'])));
});

test('visual reference and performance-state labels plus no-dialogue policies are not spoken lines', () => {
  const source = '室内。林澈把钥匙放到桌角。';
  const captions = [
    '参考职责：林澈：定妆图只负责身份，不带入白底。',
    '参考职责：林澈：“定妆图只负责身份，不带入白底。”',
    '参考职责：\n林澈：定妆图只负责身份，不带入白底。\n声音：无对白。',
    '参考职责：\n林澈：“定妆图只负责身份，不带入白底。”\n声音：无对白。',
    '表演说明：林澈：目光停在钥匙上，肩部放松。',
    '表演说明：\n林澈：目光停在钥匙上，肩部放松。',
    '情绪起点：林澈：手指绷紧，呼吸浅。',
    '视觉设计：冷灰木门和自然肤色。',
    '起始表演状态：{"林澈":"右手握钥匙","emotionStart":"迟疑"}',
    '对白：无。', '台词：无新增对白。', '旁白：无，保留钥匙声。',
    '对白：仅保留原文，不增删。', '台词：不新增。', '无新增对白，无旁白。',
  ];
  for (const caption of captions) assert.doesNotThrow(() => validateDirectorProject(rawProject(source, '', `0—30秒：林澈把钥匙放到桌角。\n${caption}`, ['林澈'])), caption);
  assert.doesNotThrow(() => validateDirectorProject(rawProject(source, '', '参考职责：\n林澈：定妆图只负责身份，不带入白底。\n声音：无对白。\n0—30秒：林澈把钥匙放到桌角。', ['林澈'])));
  assert.throws(() => validateDirectorProject(rawProject(source, '', '参考职责：\n林澈：定妆图只负责身份。\n0—30秒：林澈：这句在新时间轴里添了。', ['林澈'])), /原文没有|新增台词/);
  assert.throws(() => validateDirectorProject(rawProject(source, '', '0—30秒：林澈把钥匙放到桌角。\n表演说明：\n林澈：目光放低。\n对白：\n林澈：这句在对白标题里添了。', ['林澈'])), /原文没有|新增台词/);
});

test('new projects default to the research method while old v1 settings normalise to standard', () => {
  assert.equal(defaultDirectorSettings.creativeMethod, 'sijia-film');
  const { creativeMethod: _ignored, ...oldSettings } = settings;
  assert.equal(validateDirectorSettings(oldSettings).creativeMethod, 'standard');
  for (const value of ['unknown-method', '', null, 1]) assert.throws(() => validateDirectorSettings({ ...settings, creativeMethod: value }), /创作方法无效/);
  const old = rawProject('室内。李明关门。', '');
  const restored = validateDirectorProject({ ...old, settings: oldSettings });
  assert.equal(restored.settings.creativeMethod, 'standard');
  assert.equal(restored.shots[0].craft, undefined);
  const legacyCheckpoint = { version: 1, sourceScript: old.sourceScript, settings: oldSettings,
    chunks: chunkDirectorScript(old.sourceScript), analyses: [], shots: [], completedPromptShotIds: [] };
  assert.equal(validateDirectorCheckpoint(legacyCheckpoint).settings.creativeMethod, 'standard');
});

test('optional craft preserves old projects and validates every field without inventing defaults', () => {
  const old = rawProject('室内。李明关门。', '');
  assert.equal(validateDirectorProject({ ...old, settings: { ...settings, creativeMethod: 'sijia-film' } }).shots[0].craft, undefined);
  const attach = (craft: unknown) => ({ ...old, shots: [{ ...old.shots[0], craft }] });
  const empty = Object.fromEntries(Object.keys(researchedCraft).map(key => [key, ''])) as unknown as DirectorShotCraft;
  assert.deepEqual(validateDirectorProject(attach(empty)).shots[0].craft, empty);
  assert.deepEqual(validateDirectorProject(attach(researchedCraft)).shots[0].craft, researchedCraft);
  const { cameraPurpose: _camera, ...missing } = researchedCraft;
  assert.throws(() => validateDirectorProject(attach(missing)), /摄影目的/);
  assert.throws(() => validateDirectorProject(attach({ ...researchedCraft, emotionalTrigger: 2 })), /情绪触发/);
  assert.throws(() => validateDirectorProject(attach({ ...researchedCraft, lightSoundCue: '光'.repeat(1501) })), /1,500/);
  assert.throws(() => validateDirectorProject(attach(null)), /导演工艺意图/);
  assert.equal(validateDirectorProject(attach({ ...researchedCraft, lightSoundCue: '光'.repeat(1500) })).shots[0].craft!.lightSoundCue.length, 1500);
});

test('research generation receives all four stage guides and preserves exact source dialogue plus craft', async () => {
  const ai = fakeAI({ craft: researchedCraft });
  const project = await runAutoDirector({ script, settings: { ...settings, creativeMethod: 'sijia-film' }, generate: ai.generate });
  const stages = ['analysis', 'understanding', 'storyboard', 'prompts'] as const;
  assert.equal(ai.calls.length, stages.length);
  stages.forEach((stage, index) => assert.ok(ai.calls[index].includes(buildDirectorMethodGuidance('sijia-film', stage))));
  for (const prompt of ai.calls) {
    assert.ok(prompt.includes('剧本是唯一剧情依据'));
    assert.ok(prompt.includes('待分析数据'));
    assert.ok(prompt.includes('不因方法强制主观变形、怪物、温暖、美化或特定画风'));
  }
  assert.deepEqual(project.shots[0].craft, researchedCraft);
  assert.equal(project.shots[0].dialogue, '李明：你……真的回来了吗？');
  assert.equal(project.shots[0].sourceExcerpt, script);
  assert.ok(ai.calls[2].includes('每镜必须返回craft'));
  assert.ok(ai.calls[3].includes(JSON.stringify(researchedCraft)));
  assert.ok(ai.calls[3].includes('"previous":null'));
  assert.ok(ai.calls[3].includes('"next":null'));
});

test('new research storyboard rejects missing craft after one repair and keeps completed understanding', async () => {
  const ai = fakeAI();
  let checkpoint: DirectorCheckpoint | undefined;
  await assert.rejects(runAutoDirector({ script, settings: { ...settings, creativeMethod: 'sijia-film' }, generate: ai.generate,
    onCheckpoint: value => { checkpoint = value; } }), /缺少craft/);
  assert.equal(ai.calls.filter(prompt => prompt.includes('[DIRECTOR_STORYBOARD]')).length, 2);
  assert.ok(checkpoint!.understanding);
  assert.deepEqual(checkpoint!.shots, []);
  const repaired = fakeAI({ craft: researchedCraft });
  const project = await runAutoDirector({ script, settings: { ...settings, creativeMethod: 'sijia-film' }, generate: repaired.generate, checkpoint });
  assert.equal(repaired.calls.length, 2);
  assert.ok(repaired.calls[0].includes('[DIRECTOR_STORYBOARD]'));
  assert.deepEqual(project.shots[0].craft, researchedCraft);
});

test('method changes cannot reuse a checkpoint and matching research resume skips successful stages', async () => {
  const enhancedSettings = { ...settings, creativeMethod: 'sijia-film' as const };
  const ai = fakeAI({ craft: researchedCraft, fail: prompt => prompt.includes('[DIRECTOR_PROMPTS]') });
  let checkpoint: DirectorCheckpoint | undefined;
  await assert.rejects(runAutoDirector({ script, settings: enhancedSettings, generate: ai.generate, onCheckpoint: value => { checkpoint = value; } }), /模拟网络中断/);
  const rejectProvider: DirectorGenerate = async () => assert.fail('method mismatch must be rejected before calling AI');
  await assert.rejects(runAutoDirector({ script, settings, generate: rejectProvider, checkpoint }), /不一致/);
  const resumed = fakeAI();
  const project = await runAutoDirector({ script, settings: enhancedSettings, generate: resumed.generate, checkpoint });
  assert.equal(resumed.calls.length, 1);
  assert.ok(resumed.calls[0].includes(buildDirectorMethodGuidance('sijia-film', 'prompts')));
  assert.deepEqual(project.shots[0].craft, researchedCraft);
  const { creativeMethod: _method, ...oldSettings } = settings;
  const oldCheckpoint = { ...checkpoint!, settings: oldSettings };
  await assert.rejects(runAutoDirector({ script, settings: enhancedSettings, generate: rejectProvider,
    checkpoint: oldCheckpoint as unknown as DirectorCheckpoint }), /不一致/);
});

test('single shot regeneration receives current and both neighbor crafts and only rewrites the selected prompt', async () => {
  const project = await projectFixture(true);
  project.settings.creativeMethod = 'sijia-film';
  project.shots.forEach((shot, index) => { shot.craft = { ...researchedCraft, cameraPurpose: `CRAFT_SHOT_${index + 1}` }; });
  const ai = fakeAI();
  const regenerated = await regenerateDirectorShot(project, project.shots[1].id, ai.generate);
  assert.equal(ai.calls.length, 1);
  assert.ok(ai.calls[0].includes(buildDirectorMethodGuidance('sijia-film', 'prompts')));
  const context = JSON.parse(ai.calls[0].match(/导演工艺上下文[^\n]*：([^\n]+)/)![1]);
  assert.equal(context.current.cameraPurpose, 'CRAFT_SHOT_2');
  assert.equal(context.previous.cameraPurpose, 'CRAFT_SHOT_1');
  assert.equal(context.next.cameraPurpose, 'CRAFT_SHOT_3');
  assert.deepEqual(regenerated.shots[0], project.shots[0]);
  assert.deepEqual(regenerated.shots[2], project.shots[2]);
  assert.deepEqual(regenerated.shots[1].craft, project.shots[1].craft);
});

test('markdown names the selected method and shows only nonempty craft fields outside copyable prompts', async () => {
  const project = await projectFixture();
  project.settings.creativeMethod = 'sijia-film';
  project.shots[0].craft = { ...researchedCraft, emotionStart: '', emotionalTrigger: '', lightSoundCue: '   ' };
  const markdown = exportDirectorMarkdown(project);
  assert.ok(markdown.includes(`创作方法：${getDirectorMethod('sijia-film').title}`));
  assert.ok(markdown.includes(`- 摄影目的：${researchedCraft.cameraPurpose}`));
  assert.ok(markdown.includes(`- 空间锚点：${researchedCraft.spatialAnchor}`));
  assert.ok(!markdown.includes('- 情绪起点：'));
  assert.ok(!markdown.includes('- 情绪触发：'));
  assert.ok(!markdown.includes('- 光声线索：'));
  const body = markdown.match(/### 可复制提示词\n(`{3,})text\n([\s\S]*?)\n\1/)![2];
  assert.equal(body, project.shots[0].masterPrompt);
});

test('six legal large crafts shrink actual prompt batches while preserving all sources and dialogue', async () => {
  const source = Array.from({ length: 6 }, (_, index) => `${index ? '' : '室内。'}李明：“第${index + 1}句不能改。”`).join('\n');
  const longCraft = Object.fromEntries(Object.keys(researchedCraft).map((field, index) => [field, `意图${index}`.repeat(500)])) as unknown as DirectorShotCraft;
  const ai = fakeAI({ splitLines: true, craft: longCraft });
  const project = await runAutoDirector({ script: source, settings: { ...settings, creativeMethod: 'sijia-film' }, generate: ai.generate });
  assert.equal(project.shots.length, 6);
  assert.equal(project.shots.map(shot => shot.sourceExcerpt).join(''), source);
  project.shots.forEach((shot, index) => {
    assert.equal(shot.dialogue, `李明：第${index + 1}句不能改。`);
    assert.deepEqual(shot.craft, longCraft);
    assert.ok(shot.masterPrompt.includes(`第${index + 1}句不能改。`));
  });
  assert.ok(ai.calls.every(prompt => prompt.length <= 85_000));
  const promptCalls = ai.calls.filter(prompt => prompt.includes('[DIRECTOR_PROMPTS]'));
  assert.ok(promptCalls.length >= 2);
  assert.ok(promptCalls.every(prompt => prompt.split('镜头ID：').length - 1 < 4));
  const ids = promptCalls.flatMap(prompt => [...prompt.matchAll(/镜头ID：(shot-\d+)/g)].map(match => match[1]));
  assert.deepEqual(ids, project.shots.map(shot => shot.id));
  for (const prompt of promptCalls) assert.ok(prompt.includes(JSON.stringify(longCraft)));
});

test('budgeted repair preserves the original long craft context instead of overflowing with invalid output', async () => {
  const source = Array.from({ length: 6 }, (_, index) => `${index ? '' : '室内。'}李明：“第${index + 1}句不能改。”`).join('\n');
  const longCraft = Object.fromEntries(Object.keys(researchedCraft).map((field, index) => [field, `意图${index}`.repeat(500)])) as unknown as DirectorShotCraft;
  const ai = fakeAI({ splitLines: true, craft: longCraft });
  const calls: string[] = [];
  let returnedInvalid = false;
  const generate: DirectorGenerate = async (prompt, json, signal) => {
    calls.push(prompt);
    if (prompt.includes('[DIRECTOR_PROMPTS]') && !returnedInvalid) { returnedInvalid = true; return 'INVALID_RESPONSE'.repeat(5000); }
    return ai.generate(prompt, json, signal);
  };
  const project = await runAutoDirector({ script: source, settings: { ...settings, creativeMethod: 'sijia-film' }, generate });
  assert.equal(project.shots.length, 6);
  assert.ok(calls.every(prompt => prompt.length <= (prompt.includes('唯一一次结构修复') ? 100_000 : 85_000)));
  const repair = calls.find(prompt => prompt.includes('唯一一次结构修复'))!;
  assert.ok(repair.includes('上一份异常响应因修复上下文预算不附带'));
  assert.ok(repair.includes(JSON.stringify(longCraft)));
  const original = calls[calls.indexOf(repair) - 1];
  assert.ok(repair.startsWith(original));
  assert.equal(project.shots.map(shot => shot.sourceExcerpt).join(''), source);
  assert.ok(project.shots.every(shot => JSON.stringify(shot.craft) === JSON.stringify(longCraft)));
});

test('a single oversized context is rejected before calling the provider without truncating saved data', async () => {
  const project = rawProject('室内。李明关门。', '');
  project.understanding.scenes[0].description = '材质'.repeat(50_000);
  project.shots[0].craft = { ...researchedCraft };
  const original = structuredClone(project);
  const fail: DirectorGenerate = async () => assert.fail('oversized single prompt must not reach the provider');
  await assert.rejects(regenerateDirectorShot(project, 'shot-1', fail), /单镜上下文超过85,000/);
  assert.deepEqual(project, original);
});

test('common spaced stage headers and indented multiline dialogue preserve words without stage actions', () => {
  const source = '室内。\n李明 （低声）：\n  别走。\n  我还在等你。\n（李明握紧钥匙）\n门口安静。';
  const result = validateDirectorProject(rawProject(source, '李明：别走。\n李明：我还在等你。'));
  assert.equal(result.shots[0].dialogue, '李明：别走。\n李明：我还在等你。');
  const nested = '室内。\n李明 (低声):“别叫我“小明”。\n我还有话。”';
  assert.equal(validateDirectorProject(rawProject(nested, '李明：别叫我“小明”。\n李明：我还有话。')).shots[0].dialogue, '李明：别叫我“小明”。\n李明：我还有话。');
  const inline = '室内。李明（低声）：“别走。”';
  assert.equal(validateDirectorProject(rawProject(inline, '李明：别走。')).shots[0].dialogue, '李明：别走。');
});

test('prose speaker comes from the speaking clause, not all characters in an earlier sentence', () => {
  const source = '室内。阿兰关门，李明看着她。李明低声说：“别走。”';
  assert.equal(validateDirectorProject(rawProject(source, '李明：别走。')).shots[0].dialogue, '李明：别走。');
});

test('prompt validation counts repeated utterances and excludes spoken numeric ranges from the shot timeline', () => {
  const repeated = '室内。\n李明：“回来。”\n李明：“回来。”';
  assert.throws(() => validateDirectorProject(rawProject(repeated, '李明：回来。\n李明：回来。', '0—30秒：李明说：“回来。”')), /对白.*次数|对白.*遗漏/);
  const source = '室内。\n李明：“我说0—4秒，4—8秒。”';
  assert.doesNotThrow(() => validateDirectorProject(rawProject(source, '李明：我说0—4秒，4—8秒。', '0—30秒：李明说：“我说0—4秒，4—8秒。”')));
});

test('visual style quotes are not speech while invented English double-quoted dialogue is rejected', () => {
  const source = '室内。李明关门。';
  assert.doesNotThrow(() => validateDirectorProject(rawProject(source, '', '风格：呈现“克制的压迫感”。\n0—30秒：李明关门。')));
  assert.throws(() => validateDirectorProject(rawProject(source, '', '0—30秒：李明说："我会回来。"')), /新增台词|原文没有/);
});

test('English speaker names, fullwidth spacing, voiceover and structural stage notes keep speech intact', () => {
  const english = '室内。\nJohn Smith (quietly): "Come back."';
  assert.equal(validateDirectorProject(rawProject(english, 'John Smith：Come back.', '', ['John Smith'])).shots[0].dialogue, 'John Smith：Come back.');
  const fullwidth = '室内。\n李明　（低声）：别走。';
  assert.equal(validateDirectorProject(rawProject(fullwidth, '李明：别走。')).shots[0].dialogue, '李明：别走。');
  const narration = '室内。\n旁白（画外音）：夜深了。（镜头转向窗外）\n李明：别走。';
  assert.equal(validateDirectorProject(rawProject(narration, '旁白：夜深了。\n李明：别走。')).shots[0].dialogue, '旁白：夜深了。\n李明：别走。');
  const ambiguous = '室内。阿兰看着李明说：“别走。”';
  assert.equal(validateDirectorProject(rawProject(ambiguous, '别走。')).shots[0].dialogue, '别走。');
});

test('a short utterance cannot be counted inside another line or inside a timestamp', () => {
  const source = '室内。\n李明：“你回来。”\n李明：“回来。”';
  assert.throws(() => validateDirectorProject(rawProject(source, '李明：你回来。\n李明：回来。', '0—30秒：李明说：“你回来。”')), /遗漏.*对白/);
  const digit = '室内。\n李明：“0”';
  assert.throws(() => validateDirectorProject(rawProject(digit, '李明：0', '0—30秒：李明停住。')), /遗漏.*对白/);
  assert.doesNotThrow(() => validateDirectorProject(rawProject(digit, '李明：0', '0—30秒：李明说：“0”')));
});

test('old v1 JSON migrates only the previous exact extraction and invalidates affected prompts', async () => {
  const source = '室内。\n李明 （低声）：\n  别走。\n  我还在等你。';
  const old = rawProject(source, '', '0—30秒：李明站在门边。');
  old.shots[0].postProductionNotes = ['旧提示词的后期建议'];
  const migrated = validateDirectorProject(old);
  assert.equal(migrated.shots[0].dialogue, '李明：别走。\n李明：我还在等你。');
  assert.equal(migrated.shots[0].masterPrompt, '');
  assert.deepEqual(migrated.shots[0].postProductionNotes, []);
  assert.ok(migrated.shots[0].qaWarnings.some(warning => warning.includes('规则已更新')));
  assert.equal(old.shots[0].masterPrompt, '0—30秒：李明站在门边。');
  assert.deepEqual(validateDirectorProject(migrated), migrated);
  const checkpoint: DirectorCheckpoint = { version: 1, sourceScript: source, settings, chunks: chunkDirectorScript(source),
    analyses: [{ chunkId: 'chunk-1', summary: '原文事件', beats: ['原文推进'], characters: old.understanding.characters, scenes: old.understanding.scenes, continuityRules: [], uncertainties: [] }],
    understanding: old.understanding, shots: old.shots, completedPromptShotIds: ['shot-1'] };
  const restored = validateDirectorCheckpoint(checkpoint);
  assert.deepEqual(restored.completedPromptShotIds, []);
  assert.equal(restored.shots[0].dialogue, migrated.shots[0].dialogue);
  const ai = fakeAI();
  const completed = await runAutoDirector({ script: source, settings, checkpoint, generate: ai.generate });
  assert.equal(ai.calls.length, 1);
  assert.ok(ai.calls[0].includes('[DIRECTOR_PROMPTS]'));
  assert.ok(completed.shots[0].masterPrompt.includes('我还在等你。'));
  const tampered = structuredClone(old); tampered.shots[0].dialogue = '李明：我替你决定。';
  assert.throws(() => validateDirectorProject(tampered), /对白与原文/);
});

test('migration preserves overloaded source dialogue as pending review and blocks generation before provider calls', async () => {
  const source = `室内。\n李明 （低声）：\n  ${'请逐字保留。'.repeat(25)}`;
  const migrated = validateDirectorProject(rawProject(source, '', '0—30秒：李明停住。'));
  assert.ok(migrated.shots[0].dialogue.includes('请逐字保留。'.repeat(25)));
  assert.equal(migrated.shots[0].masterPrompt, '');
  assert.ok(migrated.shots[0].qaWarnings.some(warning => warning.includes('需要拆镜')));
  assert.deepEqual(validateDirectorProject(migrated), migrated);
  const fail: DirectorGenerate = async () => assert.fail('overloaded restored dialogue must not call provider');
  await assert.rejects(regenerateDirectorShot(migrated, 'shot-1', fail), /需要拆镜/);
});

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
  await assert.rejects(runAutoDirector({ script, settings, generate: omitted }), /尾部原文|遗漏、改写或重复/);
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

function productionFixture(project: DirectorProject): DirectorProduction {
  return { assets: [{ id: 'look-1', assetName: '室内光色参考', role: 'look', identityGroup: '', sourceLabel: '光色参考.png', sourceUrl: 'https://private.example.test/color.png',
    instruction: '只参考冷暖关系和材质，不改变人物', exclusions: '不采用人物、构图和字幕', shotIds: project.shots.map(shot => shot.id),
    binding: { platform: 'jimeng', mediaType: 'image', slot: 4, confirmed: true } }],
    sceneLooks: [{ scene: '室内', mainLight: '左侧窗光', quality: '柔和漫射', environmentColor: '低饱和冷灰', subjectColor: '', accentColor: '', contrast: '暗部可辨', allowedChanges: '没有原文触发时保持光源稳定' }] };
}
function checkpointFromProject(project: DirectorProject): DirectorCheckpoint {
  return { version: 1, sourceScript: project.sourceScript, settings: project.settings, chunks: chunkDirectorScript(project.sourceScript),
    analyses: [{ chunkId: 'chunk-1', summary: '按原文分析', beats: ['依次发生原文事件'], characters: project.understanding.characters, scenes: project.understanding.scenes, continuityRules: [], uncertainties: [] }],
    understanding: project.understanding, shots: project.shots, completedPromptShotIds: project.shots.filter(shot => shot.masterPrompt).map(shot => shot.id),
    ...(project.production ? { production: project.production } : {}) };
}
const designBoundary = (value = '半开'): DirectorShotBoundary => ({ start: [{ subject: '门', field: 'objectState', value, provenance: 'design', sourceExcerpt: '' }], end: [] });

test('a paraphrased asset excerpt gets one targeted repair with the asset name and a real contiguous source example', async () => {
  const ai = fakeAI(); const requests: string[] = []; let attempts = 0;
  const generate: DirectorGenerate = async (prompt, json, signal) => {
    requests.push(prompt);
    const response = await ai.generate(prompt, json, signal);
    if (prompt.includes('[DIRECTOR_ANALYSIS]') && ++attempts === 1) {
      const data = JSON.parse(response); data.characters[0].sourceExcerpt = '李明在傍晚与归来者谈话'; return JSON.stringify(data);
    }
    return response;
  };
  const project = await runAutoDirector({ script, settings, generate });
  assert.equal(attempts, 2);
  const repair = requests.filter(prompt => prompt.includes('[DIRECTOR_ANALYSIS]'))[1];
  assert.match(repair, /唯一一次结构修复/); assert.match(repair, /角色 "李明"/);
  assert.match(repair, /李明在傍晚与归来者谈话/); assert.match(repair, /短连续摘录/);
  assert.ok(repair.includes(JSON.stringify(script)), 'repair includes a real source slice instead of silently substituting the name');
  assert.equal(project.understanding.characters[0].sourceExcerpt, '李明');
});

test('two invalid merged excerpts fail without inventing evidence and preserve the successful analysis checkpoint', async () => {
  const ai = fakeAI(); let attempts = 0; let checkpoint: DirectorCheckpoint | undefined;
  const generate: DirectorGenerate = async (prompt, json, signal) => {
    const response = await ai.generate(prompt, json, signal);
    if (prompt.includes('[DIRECTOR_UNDERSTANDING]')) {
      attempts++; const data = JSON.parse(response); data.characters[0].sourceExcerpt = '李明没有出现在这段概括的原文里'; return JSON.stringify(data);
    }
    return response;
  };
  await assert.rejects(runAutoDirector({ script, settings, generate, onCheckpoint: value => { checkpoint = value; } }), /AI数据校验失败.*角色 "李明"/);
  assert.equal(attempts, 2); assert.equal(checkpoint!.analyses.length, 1); assert.equal(checkpoint!.understanding, undefined); assert.equal(checkpoint!.shots.length, 0);
  assert.equal(checkpoint!.analyses[0].characters[0].sourceExcerpt, '李明');
  const resumed = fakeAI(); await runAutoDirector({ script, settings, generate: resumed.generate, checkpoint });
  assert.ok(resumed.calls.every(prompt => !prompt.includes('[DIRECTOR_ANALYSIS]')));
});

test('production metadata, extended reference roles and boundary provenance survive project and checkpoint JSON round trips', async () => {
  const old = await projectFixture(true);
  assert.equal('production' in validateDirectorProject(JSON.parse(JSON.stringify(old))), false);
  assert.equal('boundary' in validateDirectorProject(JSON.parse(JSON.stringify(old))).shots[0], false);
  const project = structuredClone(old); project.production = productionFixture(project);
  project.shots[0].boundary = designBoundary();
  project.shots[1].boundary = { start: [{ subject: '门', field: 'objectState', value: '半开', provenance: 'confirmed', sourceExcerpt: '' }], end: [] };
  project.shots[2].boundary = { start: [], end: [{ subject: '钥匙', field: 'objectState', value: '被握紧', provenance: 'source', sourceExcerpt: '握紧钥匙' }] };
  project.shots[0].referencePlan = ['prop', 'look', 'composition', 'previs'].map(role => ({ assetName: '按需要准备的素材', role: role as 'prop' | 'look' | 'composition' | 'previs', instruction: '只承担本项职责', exclusions: '无关身份和背景' }));
  const imported = validateDirectorProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(imported, project);
  const checkpoint = validateDirectorCheckpoint(JSON.parse(JSON.stringify(checkpointFromProject(project))));
  assert.deepEqual(checkpoint.production, project.production);
  assert.deepEqual(checkpoint.shots.map(shot => shot.boundary), project.shots.map(shot => shot.boundary));
  const complete = await runAutoDirector({ script, settings, checkpoint, generate: async () => assert.fail('a complete restored project must not call a provider') });
  assert.deepEqual(complete.production, project.production);
  assert.deepEqual(complete.shots.map(shot => shot.boundary), project.shots.map(shot => shot.boundary));
});

test('AI cannot claim human-confirmed boundary states and failed repairs leave storyboard checkpoint intact', async () => {
  const ai = fakeAI(); let attempts = 0; let checkpoint: DirectorCheckpoint | undefined;
  const generate: DirectorGenerate = async (prompt, json, signal) => {
    const response = await ai.generate(prompt, json, signal);
    if (prompt.includes('[DIRECTOR_STORYBOARD]')) {
      attempts++; const data = JSON.parse(response); data.shots[0].boundary = { start: [{ subject: '门', field: 'objectState', value: '半开', provenance: 'confirmed', sourceExcerpt: '' }], end: [] }; return JSON.stringify(data);
    }
    return response;
  };
  await assert.rejects(runAutoDirector({ script, settings, generate, onCheckpoint: value => { checkpoint = value; } }), /AI不得.*人工已确认/);
  assert.equal(attempts, 2); assert.ok(checkpoint!.understanding); assert.deepEqual(checkpoint!.shots, []);
  const fixed: DirectorGenerate = async (prompt, json, signal) => {
    const response = await ai.generate(prompt, json, signal);
    if (prompt.includes('[DIRECTOR_STORYBOARD]')) { const data = JSON.parse(response); data.shots[0].boundary = designBoundary(); return JSON.stringify(data); }
    return response;
  };
  const resumed = await runAutoDirector({ script, settings, checkpoint, generate: fixed });
  assert.equal(resumed.shots[0].boundary!.start[0].provenance, 'design');
});

test('regeneration inherits the location look and neighboring boundaries without sending source URLs or real binding tokens to AI', async () => {
  const project = await projectFixture(true); project.production = productionFixture(project);
  project.shots[0].boundary = { start: [], end: designBoundary('关闭').start };
  project.shots[1].boundary = designBoundary('半开'); project.shots[2].boundary = designBoundary('打开');
  const ai = fakeAI(); const result = await regenerateDirectorShot(project, project.shots[1].id, ai.generate);
  assert.equal(ai.calls.length, 1); assert.match(ai.calls[0], /左侧窗光|柔和漫射/);
  assert.match(ai.calls[0], /只参考冷暖关系/); assert.match(ai.calls[0], /相邻结构化交接/);
  assert.match(ai.calls[0], /关闭/); assert.match(ai.calls[0], /打开/); assert.match(ai.calls[0], /半开/);
  assert.doesNotMatch(ai.calls[0], /private\.example\.test|@图片4|"slot"|"binding"|光色参考\.png/);
  assert.deepEqual(result.production, project.production); assert.deepEqual(result.shots[1].boundary, project.shots[1].boundary);
  assert.deepEqual(result.shots[0], project.shots[0]); assert.deepEqual(result.shots[2], project.shots[2]);
  assert.match(buildDirectorCopyPrompt(result, result.shots[1]), /@图片4/);
});

test('resuming pending prompts preserves production and exports human bindings plus boundary review separately from AI prose', async () => {
  const project = await projectFixture(true); project.production = productionFixture(project);
  project.shots[0].boundary = { start: [], end: designBoundary('关闭').start };
  project.shots[1].boundary = designBoundary('半开');
  const pending = structuredClone(project); pending.shots.forEach(shot => { shot.masterPrompt = ''; shot.referencePlan = []; shot.postProductionNotes = []; });
  const ai = fakeAI(); const resumed = await runAutoDirector({ script, settings, checkpoint: checkpointFromProject(pending), generate: ai.generate });
  assert.deepEqual(resumed.production, project.production);
  assert.ok(ai.calls.every(prompt => prompt.includes('[DIRECTOR_PROMPTS]')));
  const markdown = exportDirectorMarkdown(resumed);
  assert.match(markdown, /制作资料（文件名、链接与职责文字/); assert.match(markdown, /场景光色卡/); assert.match(markdown, /起止状态/);
  assert.match(markdown, /文字不同只提醒核对，不自动认定冲突/);
  const copyBlock = markdown.match(/### 可复制提示词\n(`{3,})text\n([\s\S]*?)\n\1/)![2];
  assert.equal(copyBlock, buildDirectorCopyPrompt(resumed, resumed.shots[0]));
  assert.match(copyBlock, /@图片4/); assert.doesNotMatch(resumed.shots[0].masterPrompt, /@图片4/);
});

test('unique asset evidence with CRLF, wrapping or Unicode whitespace differences stores the actual original contiguous slice', () => {
  const source = '室内。\r\n李明，停在门边。\r\n右手握着钥匙。';
  for (const excerpt of ['李明，停在门边。右手握着钥匙。', '李明， 停在门边。\n右手\u3000握着钥匙。', '李明，\u00a0停在门边。\u2009右手握着钥匙。']) {
    const project = rawProject(source, '', '', ['李明']);
    project.understanding.characters[0].sourceExcerpt = excerpt;
    const restored = validateDirectorProject(project);
    assert.equal(restored.understanding.characters[0].sourceExcerpt, '李明，停在门边。\r\n右手握着钥匙。');
    assert.equal(restored.sourceScript, source);
    assert.equal(restored.shots[0].sourceExcerpt, source);
    assert.equal(project.understanding.characters[0].sourceExcerpt, excerpt, 'recovery does not mutate the caller backup');
  }
});

test('whitespace recovery never repairs punctuation, spelling, missing characters or Unicode compatibility differences', () => {
  const source = '室内。李明，停在门边。\r\n右手握着Ａ型钥匙。';
  for (const excerpt of [
    '李明,停在门边。右手握着Ａ型钥匙。', '李明，站在门边。右手握着Ａ型钥匙。',
    '李明，停在门边。右手握Ａ型钥匙。', '李明，停在门边。右手握着A型钥匙。',
  ]) {
    const project = rawProject(source, '', '', ['李明']); project.understanding.characters[0].sourceExcerpt = excerpt;
    assert.throws(() => validateDirectorProject(project), /原文依据不在剧本中/);
  }
});

test('ambiguous whitespace-only recovery is rejected, while an exact excerpt keeps its original spelling', () => {
  const source = '室内。李明 停住。随后李明\n停住。';
  const project = rawProject(source, '', '', ['李明']); project.understanding.characters[0].sourceExcerpt = '李明\t停住。';
  assert.throws(() => validateDirectorProject(project), /多个匹配位置，不能自动选择/);
  project.understanding.characters[0].sourceExcerpt = '李明 停住。';
  assert.equal(validateDirectorProject(project).understanding.characters[0].sourceExcerpt, '李明 停住。');
});

test('asset formatting recovery does not loosen source coverage or boundary evidence validation', () => {
  const source = '室内。李明，停在门边。\r\n右手握着钥匙。';
  const changedCoverage = rawProject(source, '', '', ['李明']); changedCoverage.shots[0].sourceExcerpt = source.replace('\r\n', '\n');
  assert.throws(() => validateDirectorProject(changedCoverage), /来源位置不一致/);
  const changedBoundary = rawProject(source, '', '', ['李明']); changedBoundary.shots[0].boundary = {
    start: [{ subject: '李明', field: 'rightHand', value: '钥匙', provenance: 'source', sourceExcerpt: '停在门边。右手握着钥匙。' }], end: [],
  };
  assert.throws(() => validateDirectorProject(changedBoundary), /状态原文依据必须逐字/);
});

function indexedStoryboardAI(change?: (shots: Record<string, unknown>[], prompt: string) => void) {
  const ai = fakeAI();
  const calls: string[] = [];
  const generate: DirectorGenerate = async (prompt, json, signal) => {
    calls.push(prompt);
    if (!prompt.includes('[DIRECTOR_STORYBOARD]')) return ai.generate(prompt, json, signal);
    const source = prompt.match(/<source-script>\n([\s\S]*?)\n<\/source-script>/)![1];
    const units = prompt.split('\n').filter(line => line.startsWith('{\"id\":\"u')).map(line => JSON.parse(line));
    const shots: Record<string, unknown>[] = units.map(unit => ({
      scene: '室内', charactersInvolved: source.includes('李明') ? ['李明'] : [],
      sourceStartUnit: unit.id, sourceEndUnit: unit.id,
      action: '按本镜编号对应的原文事件推进', camera: '中景观察动作与反应',
      durationSeconds: 30, continuity: '承接前镜并停在当前事件落点',
    }));
    change?.(shots, prompt);
    return JSON.stringify({ shots });
  };
  return { generate, calls };
}

test('indexed storyboard preserves a 3192-character two-chunk script and original dialogue without copied excerpts', async () => {
  const paragraph = '室内，雨夜。\r\n李明：“你在我身后的时候，我该回头看一眼的。”\r\n他把钥匙放在桌角，停下脚步。\r\n';
  const source = paragraph.repeat(Math.floor(3192 / paragraph.length)) + '原文继续'.repeat(40).slice(0, 3192 % paragraph.length);
  assert.equal(source.length, 3192);
  const ai = indexedStoryboardAI();
  const result = await runAutoDirector({ script: source, settings, generate: ai.generate });
  assert.equal(chunkDirectorScript(source).length, 2);
  assert.equal(result.shots.map(shot => shot.sourceExcerpt).join(''), source);
  for (const shot of result.shots) assert.equal(shot.sourceExcerpt, source.slice(shot.sourceStart, shot.sourceEnd));
  const spoken = result.shots.map(shot => shot.dialogue.replace(/^李明：/gm, '')).filter(Boolean).join('');
  assert.equal(spoken, '你在我身后的时候，我该回头看一眼的。'.repeat(Math.floor(3192 / paragraph.length)));
  const storyboards = ai.calls.filter(call => call.includes('[DIRECTOR_STORYBOARD]'));
  assert.equal(storyboards.length, 2);
  assert.ok(storyboards.every(prompt => prompt.includes('"sourceStartUnit":"u1"') && prompt.includes('dialogueCharacters') && prompt.includes('不重抄或概括原文')));
  assert.equal(validateDirectorProject(JSON.parse(JSON.stringify(result))).shots.length, result.shots.length);
});

test('indexed ranges can merge adjacent source units into one intentional shot', async () => {
  const ai = indexedStoryboardAI(shots => {
    const first = shots[0]; first.sourceEndUnit = shots.at(-1)!.sourceEndUnit;
    shots.splice(1);
  });
  const result = await runAutoDirector({ script, settings, generate: ai.generate });
  assert.equal(result.shots.length, 1);
  assert.equal(result.shots[0].sourceExcerpt, script);
  assert.equal(result.shots[0].dialogue, '李明：你……真的回来了吗？');
});

test('indexed references work with the default research method and its required camera and performance intentions', async () => {
  const ai = indexedStoryboardAI(shots => { for (const shot of shots) shot.craft = researchedCraft; });
  const result = await runAutoDirector({ script, settings: defaultDirectorSettings, generate: ai.generate });
  assert.equal(result.shots.map(shot => shot.sourceExcerpt).join(''), script);
  assert.ok(result.shots.every(shot => shot.craft?.cameraPurpose === researchedCraft.cameraPurpose));
  assert.ok(result.shots.every(shot => shot.masterPrompt));
});

test('indexed storyboard rejects invalid ranges while retaining only validated continuous prefixes', async () => {
  const source = '室内。李明停住。门关上。';
  const changes = [
    (shots: Record<string, unknown>[]) => { shots.splice(1, 1); },
    (shots: Record<string, unknown>[]) => { shots[1].sourceStartUnit = 'u1'; },
    (shots: Record<string, unknown>[]) => { shots[0].sourceStartUnit = 'u2'; shots[0].sourceEndUnit = 'u1'; },
    (shots: Record<string, unknown>[]) => { shots[0].sourceEndUnit = 'u999'; },
    (shots: Record<string, unknown>[]) => { delete shots[0].sourceEndUnit; shots[0].sourceExcerpt = source; },
  ];
  for (const change of changes) {
    let checkpoint: DirectorCheckpoint | undefined;
    const ai = indexedStoryboardAI(change);
    await assert.rejects(runAutoDirector({ script: source, settings, generate: ai.generate, onCheckpoint: value => { checkpoint = value; } }), /AI数据校验失败/);
    assert.equal(ai.calls.filter(call => call.includes('[DIRECTOR_STORYBOARD]')).length, 2);
    assert.ok(checkpoint!.shots.length < buildDirectorSourceUnits(chunkDirectorScript(source)[0]).length);
    assert.equal(checkpoint!.shots.map(shot => shot.sourceExcerpt).join(''), source.slice(0, checkpoint!.shots.at(-1)?.sourceEnd || 0));
    assert.deepEqual(validateDirectorCheckpoint(JSON.parse(JSON.stringify(checkpoint))), checkpoint);
    assert.ok(checkpoint!.understanding);
  }
});

test('indexed storyboard requires the final source unit and rejects a conflicting extra excerpt', async () => {
  for (const change of [
    (shots: Record<string, unknown>[]) => { shots.pop(); },
    (shots: Record<string, unknown>[]) => { shots[0].sourceExcerpt = '室外，下雪。'; },
  ]) {
    const ai = indexedStoryboardAI(change);
    await assert.rejects(runAutoDirector({ script, settings, generate: ai.generate }), /尾部原文|没有分镜|摘录与原文编号范围不一致/);
  }
});

test('legacy storyboard recovers only changed whitespace and stores the exact original source and dialogue', async () => {
  const source = '室内。\r\n李明：“你……\u3000真的回来了吗？”\r\n他握紧钥匙。';
  const ai = fakeAI({ splitLines: true });
  const generate: DirectorGenerate = async (prompt, json, signal) => {
    const response = await ai.generate(prompt, json, signal);
    if (!prompt.includes('[DIRECTOR_STORYBOARD]')) return response;
    const data = JSON.parse(response);
    for (const shot of data.shots) shot.sourceExcerpt = shot.sourceExcerpt.replace(/\p{White_Space}/gu, '');
    return JSON.stringify(data);
  };
  const result = await runAutoDirector({ script: source, settings, generate });
  assert.equal(result.shots.map(shot => shot.sourceExcerpt).join(''), source);
  assert.equal(result.shots[1].dialogue, '李明：你……\u3000真的回来了吗？');
  assert.equal(ai.calls.filter(call => call.includes('[DIRECTOR_STORYBOARD]')).length, 1);
});

test('legacy excerpt recovery never fills gaps, changes punctuation or drops a repeated source event', async () => {
  const source = '室内。李明停住。门关上。门关上。';
  const bad = ['室内。门关上。门关上。', '室内。李明站住。门关上。门关上。', '室内,李明停住。门关上。门关上。', '室内。李明停住。门关上。'];
  for (const sourceExcerpt of bad) {
    const base = fakeAI();
    const generate: DirectorGenerate = async (prompt, json, signal) => prompt.includes('[DIRECTOR_STORYBOARD]')
      ? JSON.stringify({ shots: [{ scene: '室内', charactersInvolved: ['李明'], sourceExcerpt, action: '按原文推进', camera: '中景', durationSeconds: 30, continuity: '同一位置' }] })
      : base.generate(prompt, json, signal);
    await assert.rejects(runAutoDirector({ script: source, settings, generate }), /遗漏|改写|尾部原文/);
  }
});

test('failed later indexed chunk preserves earlier storyboard and resumes without replaying analysis or successful shots', async () => {
  const source = '室内。' + '李明走向门边，停下脚步。\r\n'.repeat(250);
  let checkpoint: DirectorCheckpoint | undefined;
  const broken = indexedStoryboardAI((shots, prompt) => { if (!prompt.includes('当前块原文范围[0,')) shots[0].sourceStartUnit = 'u999'; });
  await assert.rejects(runAutoDirector({ script: source, settings, generate: broken.generate, onCheckpoint: value => { checkpoint = value; } }), /原文编号范围/);
  assert.equal(checkpoint!.shots.at(-1)!.sourceEnd, checkpoint!.chunks[0].end);
  const preserved = JSON.stringify(checkpoint!.shots);
  const resumed = indexedStoryboardAI();
  const result = await runAutoDirector({ script: source, settings, generate: resumed.generate, checkpoint });
  assert.ok(resumed.calls.every(prompt => !prompt.includes('[DIRECTOR_ANALYSIS]') && !prompt.includes('[DIRECTOR_UNDERSTANDING]')));
  assert.ok(!resumed.calls.some(prompt => prompt.includes('[DIRECTOR_STORYBOARD]') && prompt.includes('当前块原文范围[0,')));
  const generatedFields = ({ masterPrompt, postProductionNotes, qaWarnings, ...shot }: DirectorProject['shots'][number]) => shot;
  assert.deepEqual(result.shots.slice(0, checkpoint!.shots.length).map(generatedFields), checkpoint!.shots.map(generatedFields));
  assert.equal(JSON.stringify(checkpoint!.shots), preserved, 'resuming does not mutate the caller checkpoint');
  assert.equal(result.shots.map(shot => shot.sourceExcerpt).join(''), source);
});
