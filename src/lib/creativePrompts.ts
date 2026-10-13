// Evidence and sample coverage are recorded in docs/creative-reference-research.json.
// These are product authoring guidelines, not claims about a provider's official syntax.
export const SCRIPT_ANALYSIS_GUIDANCE = `忠实提取：剧本是唯一的剧情来源。保留人物原名、关系、身份、服饰与道具归属；未说明的外观只作必要且一致的设计补充，不捏造剧情、角色或场景。
同一人物的称谓或不同视角只计为一个角色。区分场景地点与时间/天气变化，保留原文提供的信息。
角色设定图和空场景图只作为参考素材，三视图排版、白底、静态姿势不能写进正片。
画面质量来自明确的材质、空间、光源和构图，避免堆砌8K、masterpiece或引擎名称。`;

export const STORYBOARD_GUIDANCE = `分镜创作约束：
1. 每个片段只承担一个清楚的剧情变化。保留原剧本中的动作、反应和台词，不能略过、改写台词或新加旁白。
2. 按剧情需要组织片段，不为凑满15秒添加动作，也不为了固定镜头数量重复远景或反复蓄力。对白较长时自然拆分；中文台词粗估每秒3—4字，停顿与动作另留时间。
3. action写主体、目标、动作过程与结果；camera写一个主要观察意图，区别人物移动与摄影机移动，避免互相冲突的运镜。
4. 使用提供的人物与场景设定，保持持物、位置、伤势、天气、光线以及前一片段的动作落点；跨场景时明确切换，不能让人物瞬移。
5. dialogue逐字摘录本段台词，没有则为空字符串。sourceExcerpt摘录覆盖的原文，便于对照；continuity简明写本段起点和结尾落点。
6. 情绪通过可见的眼神、呼吸、手部或声音变化表现，克制留白；不强制每镜填满表演栏目。
7. 返回能执行的画面描述，不写审查论文，不把平台未知限制称作官方规范。`;

export interface CreativeShot {
  shotNumber: number; action: string; camera: string; scene: string;
  charactersInvolved: string[]; dialogue?: string; continuity?: string; sourceExcerpt?: string;
}
export interface CreativeParams {
  style: string; aspectRatio: string; duration: string; lighting: string;
  vfx: string; sound: string; reference: string;
  palette?: string; cameraIntent?: string;
}
const shotSummary = (shot?: CreativeShot) => shot ? JSON.stringify({
  action: shot.action, scene: shot.scene, charactersInvolved: shot.charactersInvolved,
  dialogue: shot.dialogue || '', continuity: shot.continuity || '',
}) : '无';

export function buildContinuityContext(shot: CreativeShot, previous?: CreativeShot, next?: CreativeShot, assets?: any) {
  const characters = (assets?.characters || []).filter((character: any) => shot.charactersInvolved.includes(character.name));
  const scene = (assets?.scenes || []).find((entry: any) => entry.name === shot.scene);
  return `当前分镜：${JSON.stringify({ shotNumber: shot.shotNumber, action: shot.action,
    camera: shot.camera, scene: shot.scene, charactersInvolved: shot.charactersInvolved,
    dialogue: shot.dialogue || '', continuity: shot.continuity || '', sourceExcerpt: shot.sourceExcerpt || '' })}
前一片段（只用于承接，不重复演出）：${shotSummary(previous)}
后一片段（只用于预留落点，不提前演出）：${shotSummary(next)}
当前人物设定：${JSON.stringify(characters.map((item: any) => ({ name: item.name, description: item.description })))}
当前场景设定：${JSON.stringify(scene ? { name: scene.name, description: scene.description } : { name: shot.scene })}`;
}

const VIDEO_GUIDANCE = `视频创作约束：先设计发生什么，再决定从哪里看。
剧情：忠实呈现当前分镜，只演出本段事件；人物身份、数量、关系和台词以原文为准。没有台词则不新增对白或旁白。
参考：已提供的图片只承担用户指定职责。人物参考锁定身份与造型，场景参考锁定地点与尺度，背景和三视图排版不进入正片。未知上传顺序使用素材名，不编造@图片编号，也不声称素材已上传。
时长：时间段从0开始，连续且没有空隙或重叠，末尾恰好到指定总时长。按事件选择段数，简单或克制的表演可以是连续长镜头；不要为了凑段数重复动作。中文对白粗估每秒3—4字，给呼吸、停顿和动作留时间；超出时长不要删台词或强行加速，提示拆成相邻片段。
动作：写清谁对谁做什么、接触或闪避、可见结果与落脚点；持物变化、地面到空中必须有过程。每段一个主要运镜意图，给可见路径和落点；明确连续镜头还是剪切，不能同时要求无剪切和多次切镜。
表演：根据戏剧情境写一两处可见的眼神、嘴角、呼吸、手部或声线变化，避免只贴伤心/愤怒等标签，不擅自增加哭喊、慢动作或眼部特效。
画面：统一色调、材质和主光一次，巨物尺度用距离、遮挡与相对尺寸表达；不强制器材品牌、引擎、8K或多个同义质量词。
光色：把主光方向、明暗关系、主体与环境的颜色关系写清。局部暖色可作为冷环境中的注意力焦点；不要把怀旧硬编码成全片暖黄，也不把cyan/orange滤镜套到所有场景。沿用用户色彩选择与相邻场景；特效发光仍应保留周边空间和材质，不让画面全白失去信息。
路径：需要运动时写起点、经过的前景遮挡物、目的地与结束构图。门洞、人物肩背、道具等可以承担转场，但必须属于当前剧本空间，不额外复制参考作品的场景内容。镜头目的由当前故事决定。
音频：原台词放在发生的时间段，保留精确文字；环境音、动作音和音乐按用户选择，不新加台词。
正文通常为必要的参考绑定、一两句事件与视觉方向、分时镜头、一处音频与限制。按信息需要控制长度，没有通用60—100字限制。无额外字幕、LOGO或水印。
仅输出创作指令，不声称保证生成效果或符合未经核实的平台官方规则。`;

export function buildVideoPrompt(shot: CreativeShot, params: CreativeParams, previous?: CreativeShot, next?: CreativeShot, assets?: any) {
  return `你是影视分镜与视频提示词创作者。请将当前分镜写成中文、可直接复制的视频提示词。
${buildContinuityContext(shot, previous, next, assets)}
用户参数：${JSON.stringify(params)}
${VIDEO_GUIDANCE}
生成描述与后期操作分开：masterPrompt只包含生成时能执行的画面、动作和声音。postProductionNotes用简短中文列出需要人工复核的镜间曝光/白平衡、特效高光与暗部、有效动作区间、剪接/重定时、人物/道具瑕疵及声音衔接；按本段需要最多四项，不写未经验证的LUT数值或声称已经完成调色。
仅返回严格JSON：{"masterPrompt":"风格与事件方向\\n0-${parseInt(params.duration) || 15}秒：按事件需要拆分的动作与镜头\\n声音：...\\n限制：...","postProductionNotes":["本段需要复核的后期操作"]}。
JSON字符串中换行用\\n转义。示例中的单段只是结构占位，请按剧情决定最终时间段。`;
}

export function buildPromptReview(shot: CreativeShot, params: CreativeParams, currentPrompt: string, previous?: CreativeShot, next?: CreativeShot, assets?: any) {
  return `你是影视提示词编辑。对照原分镜和用户参数审查提示词，以忠实、连贯和可执行为目标。
${buildContinuityContext(shot, previous, next, assets)}
用户参数：${JSON.stringify(params)}
待审查正文：${currentPrompt}
${VIDEO_GUIDANCE}
保持成功的造型、剧情和镜头，不随意换风格。问题必须指出正文中的具体证据，区分剧情错误与可选建议。
不套用未经核实的所谓平台红线，不强制多镜头或禁止写实人脸。
仅返回严格JSON：{"score":0到100的整数,"critique":"有证据的具体问题；无问题则说明无需修改","improvedPrompt":"修复主要问题后的完整可复制正文"}。`;
}

export function buildSinglePrompt(description: string, platform: 'seedance' | 'banana', type: 'video' | 'character', hasReference: boolean) {
  return `你是影视提示词创作者。目标工具：${platform === 'seedance' ? 'Seedance' : 'Banana'}，类型：${type === 'video' ? '视频片段' : '人物设定图'}。
用户设想：${description || '按附图提取人物或场景特征，设计一个简单可执行的片段。'}
参考图：${hasReference ? '已随本次请求提供。按用户设想判断职责，不重新发明造型，不把参考排版与背景自动写进正片。' : '未提供，不编造素材编号或上传状态。'}
${type === 'video' ? VIDEO_GUIDANCE : `输出人物设定图提示词，明确主体、视角、背景、关键造型与主光。用户指定构图和画幅时遵从；未指定则选择适合角色展示的构图，不强制9:16或三视图。
身份、服饰、道具和气质以用户设想/参考图为准，补充只限必要视觉细节，不凭空改写人物背景。角色图没有运镜和音效，不混入视频模板。无文字、水印或多余角色。`}
用户未指定视频时长时选择适合事件的时长并在正文写明；不声称已在平台设置参数。
直接输出可复制正文，不输出问候、解释或Markdown代码围栏。`;
}

export function checkPromptTimeline(prompt: string, duration: string): string[] {
  const ranges = [...prompt.matchAll(/(\d+(?:\.\d+)?)\s*[-–—~～至]\s*(\d+(?:\.\d+)?)\s*秒/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  if (!ranges.length) return ['提示词没有可检查的分时描述，请确认动作能在所选时长内完成。'];
  const warnings: string[] = [];
  if (ranges[0][0] !== 0) warnings.push('时间轴应从0秒开始。');
  for (let index = 0; index < ranges.length; index++) {
    if (ranges[index][1] <= ranges[index][0]) warnings.push('存在倒序或零长度时间段。');
    if (index && ranges[index][0] !== ranges[index - 1][1]) warnings.push('相邻时间段有空隙或重叠。');
  }
  const expected = parseInt(duration);
  if (Number.isFinite(expected) && ranges.at(-1)![1] !== expected) warnings.push(`时间轴末尾应为${expected}秒。`);
  return [...new Set(warnings)];
}
