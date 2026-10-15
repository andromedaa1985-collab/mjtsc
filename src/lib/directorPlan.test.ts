import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectorPlanPrompt, parseDirectorDurationPlan, reconcileDirectorPlanTiming, validateDirectorDurationPlan,
  type DirectorPlanContext, type DirectorSourceRow,
} from './directorPlan.ts';

function fixture() {
  const texts = ['清晨，站台空无一人。\r\n', '林澈说：“我会等你回来。”\r\n', '门关上。', '门关上。她终于转身，身后列车驶入🌌。  \r\n'];
  let cursor = 0;
  const sourceRows: DirectorSourceRow[] = texts.map((text, index) => {
    const start = cursor;
    cursor += text.length;
    return { id: index < 2 ? `c1u${index + 1}` : `c2u${index - 1}`, start, end: cursor, text,
      dialogueCharacters: index === 1 ? 7 : 0, minimumSpeechSeconds: index === 1 ? 2 : 0 };
  });
  const context: DirectorPlanContext = { sourceScript: texts.join(''), sourceRows };
  const input = { segments: [
    segment('c1u1', 'c1u2', 20, 30, 4),
    segment('c2u1', 'c2u2', 12, 24, 0),
  ] };
  return { context, input };
}

function segment(start: string, end: string, min = 20, max = 30, dialogue = 0) {
  return { sourceStartUnit: start, sourceEndUnit: end, storyPurpose: '完成原文事件并呈现人物选择',
    durationMinSeconds: min, durationMaxSeconds: max, dialogueSeconds: dialogue,
    actionNotes: '行动在对白同时发生；末尾保留两秒反应停顿', transitionNotes: '以列车声接到下一段人物转身' };
}

test('whole-story plan copies exact original source and calculates duration/count from segment estimates', () => {
  const { context, input } = fixture();
  const plan = parseDirectorDurationPlan(input, context);
  assert.equal(plan.targetSegmentSeconds, 30);
  assert.equal(plan.estimatedMinSeconds, 32);
  assert.equal(plan.estimatedMaxSeconds, 54);
  assert.deepEqual(plan.estimatedSegmentCount, { min: 2, max: 2 });
  assert.equal(plan.segments.map(item => item.sourceExcerpt).join(''), context.sourceScript);
  assert.equal(plan.segments[0].sourceStart, 0);
  assert.equal(plan.segments.at(-1)!.sourceEnd, context.sourceScript.length);
  assert.deepEqual(plan.segments.map(item => [item.id, item.number]), [['segment1', 1], ['segment2', 2]]);
});

test('planning can merge adjacent global source IDs across reading chunks', () => {
  const { context } = fixture();
  const input = { segments: [segment('c1u1', 'c2u2', 24, 30, 3)] };
  const plan = parseDirectorDurationPlan(input, context);
  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].sourceExcerpt, context.sourceScript);
  assert.deepEqual(plan.estimatedSegmentCount, { min: 1, max: 1 });
});

test('short final segment does not pad source or force the range to thirty seconds', () => {
  const { context } = fixture();
  const input = { segments: [segment('c1u1', 'c2u1', 24, 30, 3), segment('c2u2', 'c2u2', 4, 8)] };
  const plan = parseDirectorDurationPlan(input, context);
  assert.equal(plan.segments[1].durationMinSeconds, 4);
  assert.equal(plan.segments[1].durationMaxSeconds, 8);
  assert.equal(plan.estimatedMinSeconds, 28);
  assert.equal(plan.estimatedMaxSeconds, 38);
  assert.deepEqual(plan.estimatedSegmentCount, { min: 1, max: 2 });
  assert.equal(plan.segments.length, 2, 'actual planned count is distinct from duration-derived reference count');
});

test('identical repeated events are kept distinct through their authoritative source IDs', () => {
  const sourceScript = '门关上。门关上。';
  const sourceRows: DirectorSourceRow[] = [0, 4].map((start, index) => ({ id: `c1u${index + 1}`, start, end: start + 4,
    text: sourceScript.slice(start, start + 4), dialogueCharacters: 0, minimumSpeechSeconds: 0 }));
  const plan = parseDirectorDurationPlan({ segments: [segment('c1u1', 'c1u1', 4, 8), segment('c1u2', 'c1u2', 4, 8)] }, { sourceScript, sourceRows });
  assert.deepEqual(plan.segments.map(item => [item.sourceStart, item.sourceEnd]), [[0, 4], [4, 8]]);
});

test('plan rejects skipped, repeated, reversed, unknown and missing global source IDs', () => {
  const { context } = fixture();
  for (const segments of [
    [segment('c1u2', 'c2u2', 20, 30, 3)],
    [segment('c1u1', 'c1u2', 20, 30, 3), segment('c1u2', 'c2u2', 20, 30, 3)],
    [segment('c1u1', 'c1u2', 20, 30, 3), segment('c2u2', 'c2u1')],
    [segment('c1u1', 'missing')],
    [{ ...segment('c1u1', 'c2u2'), sourceStartUnit: undefined }],
  ]) assert.throws(() => parseDirectorDurationPlan({ segments }, context), /原文编号/);
});

test('plan rejects uncovered original ending instead of presenting an incomplete total', () => {
  const { context } = fixture();
  assert.throws(() => parseDirectorDurationPlan({ segments: [segment('c1u1', 'c1u2', 20, 30, 3)] }, context), /漏掉结尾原文/);
  assert.throws(() => parseDirectorDurationPlan({ segments: [] }, context), /片段列表/);
});

test('dialogue workload must fit the plan and cannot be hidden by a short duration estimate', () => {
  const { context } = fixture();
  const required = { ...context, sourceRows: context.sourceRows.map(row => ({ ...row, minimumSpeechSeconds: row.id === 'c1u2' ? 18 : 0 })) };
  for (const first of [segment('c1u1', 'c1u2', 20, 30, 1), segment('c1u1', 'c1u2', 4, 30, 20), segment('c1u1', 'c1u2', 18, 20, 24)]) {
    assert.throws(() => parseDirectorDurationPlan({ segments: [first, segment('c2u1', 'c2u2')] }, required), /对白/);
  }
});

test('no plan segment can exceed the thirty-second planning target or have an inverted range', () => {
  const { context } = fixture();
  for (const [min, max] of [[31, 35], [20, 31], [24, 20], [3, 10], [NaN, 30], [4, Infinity]]) {
    assert.throws(() => parseDirectorDurationPlan({ segments: [segment('c1u1', 'c2u2', min, max, 3)] }, context), /时长/);
  }
});

test('planning rejects a faulty authoritative source index before calling an AI', () => {
  const { context } = fixture();
  for (const sourceRows of [
    context.sourceRows.slice(0, -1),
    context.sourceRows.map((row, index) => index === 1 ? { ...row, id: 'c1u1' } : row),
    context.sourceRows.map((row, index) => index === 1 ? { ...row, start: row.start + 1 } : row),
    context.sourceRows.map((row, index) => index === 1 ? { ...row, text: '被改写的对白' } : row),
    context.sourceRows.map((row, index) => index === 1 ? { ...row, minimumSpeechSeconds: -1 } : row),
  ]) assert.throws(() => buildDirectorPlanPrompt({ ...context, sourceRows, storyContext: {} }), /原文编号/);
});

test('source plan offsets cannot divide an emoji surrogate pair', () => {
  const sourceScript = '字🌌字';
  const sourceRows = [
    { id: 'c1u1', start: 0, end: 2, text: sourceScript.slice(0, 2), dialogueCharacters: 0, minimumSpeechSeconds: 0 },
    { id: 'c1u2', start: 2, end: 4, text: sourceScript.slice(2), dialogueCharacters: 0, minimumSpeechSeconds: 0 },
  ];
  assert.throws(() => buildDirectorPlanPrompt({ sourceScript, sourceRows, storyContext: {} }), /Unicode/);
});

test('optional version-one plan backups validate and reject forged totals or source slices', () => {
  const { context, input } = fixture();
  const plan = parseDirectorDurationPlan(input, context);
  assert.deepEqual(validateDirectorDurationPlan(JSON.parse(JSON.stringify(plan)), context), plan);
  for (const changed of [
    { ...plan, estimatedMaxSeconds: 90 },
    { ...plan, targetSegmentSeconds: 15 },
    { ...plan, estimatedSegmentCount: { min: 2, max: 3 } },
    { ...plan, segments: plan.segments.map((item, index) => index === 1 ? { ...item, sourceExcerpt: '改写结尾' } : item) },
    { ...plan, segments: plan.segments.map((item, index) => index === 1 ? { ...item, number: 9 } : item) },
  ]) assert.throws(() => validateDirectorDurationPlan(changed, context));
});

test('whole-story prompt requests narrative timing, exact IDs and action/dialogue overlaps', () => {
  const { context } = fixture();
  const prompt = buildDirectorPlanPrompt({ ...context, storyContext: { summary: '等候与离别', rhythm: 'balanced' } });
  assert.ok(prompt.includes('先理解完整剧情'));
  assert.ok(prompt.includes('不能把全文字数除以语速'));
  assert.ok(prompt.includes('说明是否与对白同时发生'));
  assert.ok(prompt.includes('最后一段结束于c2u2'));
  assert.ok(prompt.includes('[id,text,dialogueCharacters,minimumSpeechSeconds]'));
  assert.ok(prompt.includes('["c1u2","林澈说：'));
  assert.ok(prompt.includes('"summary":"等候与离别"'));
});

test('timing reconciliation sums actual aligned video durations and checks estimated intervals', () => {
  const { context, input } = fixture();
  const plan = parseDirectorDurationPlan(input, context);
  const middle = context.sourceRows[0].end;
  const endFirst = plan.segments[0].sourceEnd;
  const timing = reconcileDirectorPlanTiming(plan, [
    { id: 'shot1', sourceStart: 0, sourceEnd: middle, durationSeconds: 8 },
    { id: 'shot2', sourceStart: middle, sourceEnd: endFirst, durationSeconds: 16 },
    { id: 'shot3', sourceStart: endFirst, sourceEnd: context.sourceScript.length, durationSeconds: 30 },
  ]);
  assert.equal(timing.complete, true);
  assert.equal(timing.actualTotalSeconds, 54);
  assert.deepEqual(timing.segments.map(item => [item.actualSeconds, item.withinEstimate]), [[24, true], [30, false]]);
});

test('partial timing reconciliation does not claim an unfinished segment has a final duration', () => {
  const { context, input } = fixture();
  const plan = parseDirectorDurationPlan(input, context);
  const empty = reconcileDirectorPlanTiming(plan, []);
  assert.equal(empty.complete, false);
  assert.equal(empty.actualTotalSeconds, 0);
  assert.deepEqual(empty.segments.map(item => item.actualSeconds), [null, null]);
  const partial = reconcileDirectorPlanTiming(plan, [
    { id: 'shot1', sourceStart: 0, sourceEnd: plan.segments[0].sourceEnd, durationSeconds: 24 },
    { id: 'shot2', sourceStart: plan.segments[0].sourceEnd, sourceEnd: context.sourceRows[2].end, durationSeconds: 10 },
  ]);
  assert.equal(partial.complete, false);
  assert.equal(partial.actualTotalSeconds, 34);
  assert.deepEqual(partial.segments.map(item => [item.covered, item.actualSeconds]), [[true, 24], [false, null]]);
});

test('a shot crossing a planning boundary is reported without inventing a proportional duration', () => {
  const { context, input } = fixture();
  const plan = parseDirectorDurationPlan(input, context);
  const timing = reconcileDirectorPlanTiming(plan, [{ id: 'shot1', sourceStart: 0, sourceEnd: context.sourceScript.length, durationSeconds: 30 }]);
  assert.equal(timing.complete, true);
  assert.equal(timing.actualTotalSeconds, 30);
  assert.deepEqual(timing.segments.map(item => [item.actualSeconds, item.crossingShotIds]), [[null, ['shot1']], [null, ['shot1']]]);
});

test('timing reconciliation rejects noncontiguous or oversized actual storyboard durations', () => {
  const { context, input } = fixture();
  const plan = parseDirectorDurationPlan(input, context);
  for (const shots of [
    [{ id: 'shot1', sourceStart: 1, sourceEnd: context.sourceScript.length, durationSeconds: 30 }],
    [{ id: 'shot1', sourceStart: 0, sourceEnd: context.sourceScript.length, durationSeconds: 31 }],
    [{ id: 'shot1', sourceStart: 0, sourceEnd: context.sourceScript.length + 1, durationSeconds: 30 }],
  ]) assert.throws(() => reconcileDirectorPlanTiming(plan, shots), /复核/);
});
