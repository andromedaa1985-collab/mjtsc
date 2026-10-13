import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIRECTOR_METHODS, DIRECTOR_METHOD_TEMPLATES, getDirectorMethod, buildDirectorMethodGuidance,
  type DirectorMethodStage,
} from './directorMethods.ts';
import { checkPromptTimeline } from './creativePrompts.ts';

const stages: DirectorMethodStage[] = ['analysis', 'understanding', 'storyboard', 'prompts'];

test('method registry has stable IDs and unsupported persisted IDs safely retain standard planning', () => {
  assert.deepEqual(DIRECTOR_METHODS.map(method => method.id), ['standard', 'sijia-film']);
  for (const id of [null, undefined, '', 'obsolete-method']) {
    assert.equal(getDirectorMethod(id).id, 'standard');
    for (const stage of stages) {
      assert.equal(buildDirectorMethodGuidance(id, stage), buildDirectorMethodGuidance('standard', stage));
    }
  }
});

test('all stages preserve original dialogue and conditionally apply research rather than inventing plot', () => {
  for (const stage of stages) {
    for (const id of ['standard', 'sijia-film'] as const) {
      const guidance = buildDirectorMethodGuidance(id, stage);
      assert.match(guidance, /当前剧本是唯一剧情来源/);
      assert.match(guidance, /原文没有台词时，不新增对白或旁白/);
      assert.match(guidance, /心理解释.*不能自动转成口播台词/);
      assert.match(guidance, /沿用调用方要求的数据结构/);
      assert.match(guidance, /仅|如|只有/);
    }
    const research = buildDirectorMethodGuidance('sijia-film', stage);
    assert.match(research, /不是官方配方/);
    assert.match(research, /不代表已验证生成效果/);
    assert.match(research, /仅当原文明确/);
    assert.doesNotMatch(research, /Jimmy|吉米|小怪物|礼盒|glitch|dolly\s?zoom|暖杏桃|红黑污染/iu);
    assert.doesNotMatch(research, /林岚|许棠|沈禾|蓝色胶片罐/);
  }
});

test('reference and perception principles state their actual activation conditions and limits', () => {
  const method = getDirectorMethod('sijia-film');
  assert.equal(method.principles.length, 6);
  assert.equal(new Set(method.principles.map(item => item.id)).size, 6);
  for (const principle of method.principles) {
    assert.ok(principle.description && principle.applyWhen && principle.limit);
  }
  const references = method.principles.find(item => item.id === 'reference_roles')!;
  assert.match(references.applyWhen, /确实提供.*已经关联/);
  assert.match(references.limit, /不编编号或上传状态/);
  const perception = method.principles.find(item => item.id === 'perception_anchor')!;
  assert.match(perception.applyWhen, /仅当原剧本明确/);
  assert.match(perception.limit, /普通故事不新增/);
  assert.match(perception.limit, /不预设固定色彩/);
  assert.match(buildDirectorMethodGuidance('sijia-film', 'prompts'), /真实素材名/);
  assert.match(buildDirectorMethodGuidance('sijia-film', 'prompts'), /音乐按用户选择/);
});

test('research sources point to the verified public film and original templates remain opt-in examples', () => {
  const method = getDirectorMethod('sijia-film');
  assert.ok(method.sources.some(source => source.url === 'https://higgsfield.ai/@zsjcak/projects/the-filter'));
  assert.ok(method.sources.some(source => source.url === 'https://www.youtube.com/watch?v=jAyeHXC9yNk'));
  for (const source of method.sources) assert.equal(new URL(source.url).protocol, 'https:');
  assert.match(method.summary, /研究归纳.*官方配方.*尚未验证/);
  assert.match(buildDirectorMethodGuidance('sijia-film', 'prompts'), /独立示例.*不把示例人物/);
});

test('each original example has a continuous integer timeline, a new script and no accidental spoken thoughts', () => {
  assert.deepEqual(DIRECTOR_METHOD_TEMPLATES.map(template => template.durationSeconds), [6, 12, 10]);
  for (const template of DIRECTOR_METHOD_TEMPLATES) {
    assert.ok(template.id && template.title && template.script && template.prompt);
    assert.match(template.script, /没有对白/);
    assert.match(template.prompt, /无新增对白、无配乐/);
    assert.match(template.prompt, /素材需由用户真实上传并关联/);
    assert.deepEqual(checkPromptTimeline(template.prompt, `${template.durationSeconds}秒`), []);
    const ranges = [...template.prompt.matchAll(/(\d+)—(\d+)秒/g)];
    assert.ok(ranges.length >= 1);
    for (const range of ranges) assert.ok(Number.isInteger(Number(range[1])) && Number.isInteger(Number(range[2])));
    assert.doesNotMatch(template.prompt, /[“”「」]|旁白：|台词：|内心独白：/);
    assert.doesNotMatch(template.script + template.prompt, /The Filter|Jimmy|吉米|小怪物|礼盒/iu);
  }
});

test('runtime uses static reviewed text, while documentary scope admits unverified output and sampling limits', () => {
  const source = readFileSync(new URL('./directorMethods.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import\s/m);
  const evidence = JSON.parse(readFileSync(new URL('../../docs/sijiafilm-creative-methods.json', import.meta.url), 'utf8'));
  assert.equal(evidence.evidenceScope.recordsRead, 52);
  assert.equal(evidence.evidenceScope.allGenerationsCollected, false);
  assert.equal(evidence.evidenceScope.sampleAdoptionInFinalCutVerified, false);
  assert.equal(evidence.runtimePolicy.dynamicResearchPromptsImported, false);
  assert.equal(evidence.runtimePolicy.examplesAreOptIn, true);
  assert.equal(evidence.originalAuthorPromptBodiesIncluded, false);
  assert.deepEqual(evidence.principles.map((item: { id: string }) => item.id), getDirectorMethod('sijia-film').principles.map(item => item.id));
  assert.deepEqual(evidence.originalExamples.map((item: { id: string }) => item.id), DIRECTOR_METHOD_TEMPLATES.map(item => item.id));
  const allExportedText = JSON.stringify({ methods: DIRECTOR_METHODS, templates: DIRECTOR_METHOD_TEMPLATES, evidence });
  assert.doesNotMatch(allExportedText, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(allExportedText, /<<<\s*image_\d+\s*>>>|@(?:图片|image)\s*\d+/i);
});
