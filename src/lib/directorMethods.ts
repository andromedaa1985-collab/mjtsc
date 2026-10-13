// Research scope and provenance: docs/sijiafilm-creative-methods.json.
// These are our authoring choices, not a provider recipe or verified output claim.
// Keep runtime guidance static; research files must never inject arbitrary prompts.
export type DirectorMethodId = 'standard' | 'sijia-film';
export type DirectorMethodStage = 'analysis' | 'understanding' | 'storyboard' | 'prompts';

export interface DirectorMethodPrinciple {
  id: string;
  title: string;
  description: string;
  applyWhen: string;
  limit: string;
}

export interface DirectorMethodSource {
  id: string;
  title: string;
  url: string;
}

export interface DirectorMethod {
  id: DirectorMethodId;
  title: string;
  summary: string;
  principles: DirectorMethodPrinciple[];
  sources: DirectorMethodSource[];
}

export interface DirectorMethodTemplate {
  id: string;
  title: string;
  script: string;
  durationSeconds: number;
  prompt: string;
}

export const DIRECTOR_METHODS: DirectorMethod[] = [
  {
    id: 'standard',
    title: '基于原文',
    summary: '以原剧本和用户选择为准，清楚交代事件、连续性与台词，按当前片段需要组织镜头。',
    principles: [
      {
        id: 'source_first',
        title: '原文主导',
        description: '保留人物、事件、关系和台词；必要视觉补充不能改写剧情。',
        applyWhen: '所有策划阶段。',
        limit: '未说明的信息保留不确定性，不把心理解释改成口播台词。',
      },
      {
        id: 'continuity',
        title: '动作与空间连续',
        description: '每段写清动作起点、过程和落点，承接相邻片段的持物与位置。',
        applyWhen: '分镜拆分与提示词写作。',
        limit: '简单表演可以保留长镜头，不强制镜头数量或运镜。',
      },
    ],
    sources: [],
  },
  {
    id: 'sijia-film',
    title: '电影叙事研究方法',
    summary: '我们从 The Filter 公开工程抽样中提炼的六项策划原则，按当前剧本条件使用。属于研究归纳，不是作者或平台的官方配方，生成效果尚未验证。',
    principles: [
      {
        id: 'reference_roles',
        title: '参考图职责分工',
        description: '分别说明素材控制身份、场景布局、道具或构图，限定到相应镜头。',
        applyWhen: '用户确实提供了对应素材，且本次请求已经关联素材。',
        limit: '只用真实素材名和入口已提供的引用，不编编号或上传状态；身份图不自动锁定静态姿势。',
      },
      {
        id: 'performance_state',
        title: '情绪起止落到可见动作',
        description: '连接情绪起点、触发事件、一两处外显反应和结束状态，给停顿留时间。',
        applyWhen: '人物反应是当前片段的叙事重点。',
        limit: '心理解释用于表演，不自动成为对白；只保留原剧本明确台词，不擅加哭喊或情绪转折。',
      },
      {
        id: 'space_and_camera',
        title: '空间与运镜有目的',
        description: '先交代人物与道具的位置、运动路径和结果，再决定镜头需要揭露什么。',
        applyWhen: '追逐、接触、进出门、多主体调度或信息揭露。',
        limit: '遮挡物必须属于当前故事空间；不强制偏置构图、倾斜机位或特定运镜。',
      },
      {
        id: 'perception_anchor',
        title: '主客观变化保留锚点',
        description: '区分客观状态与人物当前感知，变化时保留可辨的地点、姿势或道具关系。',
        applyWhen: '仅当原剧本明确包含主观感知、误认或现实反转。',
        limit: '普通故事不新增感知异变，也不预设固定色彩或视觉变形；实际光源变化应有动作原因。',
      },
      {
        id: 'sound_cue',
        title: '声音有声源与触发',
        description: '写清声音来自哪里、何时出现、谁有反应，以及声音与画面的先后。',
        applyWhen: '画外声、提示声或动作声会改变人物注意与行为。',
        limit: '对白按原文，音乐按用户选择；生成声音与后期补声分开，不凭文件名推断制作工具。',
      },
      {
        id: 'iteration',
        title: '小变量迭代',
        description: '保留成功输入和镜头，仅修改本次主要失败因素，并记录版本与验收结果。',
        applyWhen: '已经有可对照的输出，需要调整构图、表演或连续性。',
        limit: '入口支持时才记录或固定随机种子；未控制输入和种子不称严格对照实验，不承诺成功率。',
      },
    ],
    sources: [
      { id: 'project', title: 'The Filter：Higgsfield 公开作品与工程', url: 'https://higgsfield.ai/@zsjcak/projects/the-filter' },
      { id: 'author', title: '郑思嘉 / SiJia Zheng：作者官网', url: 'https://www.sijiafilm.com/about' },
      { id: 'film', title: '作者官网作品列表', url: 'https://www.sijiafilm.com/films' },
      { id: 'youtube', title: 'The Filter：作者原片', url: 'https://www.youtube.com/watch?v=jAyeHXC9yNk' },
    ],
  },
];

type MethodInput = DirectorMethodId | string | null | undefined;

/** Unknown or older persisted IDs safely use the original-script method. */
export function getDirectorMethod(id: MethodInput): DirectorMethod {
  return DIRECTOR_METHODS.find(method => method.id === id) ?? DIRECTOR_METHODS[0];
}

const SCRIPT_BOUNDARY = `当前剧本是唯一剧情来源；保留人物、事件、场景、关系和原台词，风格与音乐按用户选择。原文没有台词时，不新增对白或旁白。心理解释仅用于表演说明，不能自动转成口播台词。参考素材必须来自当前请求，不编造上传状态、引用编号或新人物。沿用调用方要求的数据结构，不擅自添加输出字段。`;

const STANDARD_GUIDANCE: Record<DirectorMethodStage, string> = {
  analysis: '忠实提取剧本中的人物、场景和事件；仅在必要时补充一致的视觉细节，未提供的信息保持不确定，不改写剧情。',
  understanding: '按原文梳理事件因果、人物动机与场景关系；如存在歧义，标明依据和不确定性，不新增情节。',
  storyboard: '按剧情变化拆分分镜，写清动作起点、过程、结果和相邻承接；只有叙事需要时才切镜或运镜，原台词逐字保留。',
  prompts: '忠实呈现当前分镜；如有已关联素材，按实际职责使用。分时时间从0连续覆盖指定时长，声音按原文与用户选择，不为凑时长添加事件。',
};

const SIJIA_GUIDANCE: Record<DirectorMethodStage, string> = {
  analysis: `这是公开工程研究归纳，不是官方配方，也不代表已验证生成效果。仅在当前故事需要时采用以下分析方法：
1. 提取人物身份、实际地点、道具归属和事件因果；将原文事实与人物心理判断分开，不把参考作品的情节带入剧本。
2. 如已提供素材，分别识别身份、布局、道具、构图职责；未提供素材时只列必要需求，不能声称已关联。
3. 如人物反应重要，识别原文支持的情绪起点、触发和终点，将心理解释转成少量可见动作建议，与真正台词分开。
4. 仅当原文明确有主观感知、误认或现实反转时，区分客观状态与人物感知；否则沿用客观场景，不新增视觉异变。
5. 原文声音会触发反应时，记录声源和先后关系；未说明的声音安排不当作已确认剧情。`,
  understanding: `这是公开工程研究归纳，不是官方配方，也不代表已验证生成效果。仅在当前故事需要时采用以下理解方法：
1. 说明关键变化发生前后，人物知道什么、关注什么，以及原文事件怎样触发下一行动；不改写冲突或补造事件。
2. 如有反应戏，用眼神、停顿、呼吸或手部动作解释原文情绪起止；心理说明不转成新增对白。
3. 如空间关系影响理解，先确认主体位置、路径、遮挡与动作结果；仅使用当前场景已有物体。
4. 仅当原文明确有主客观切换时，解释变化原因，并保留可辨的地点或道具锚点；不套固定光色、异变或机位。
5. 如有声音触发，区分声源、听到的人和反应顺序；素材职责和信息缺口单独说明，不假装已完成资产绑定。`,
  storyboard: `这是公开工程研究归纳，不是官方配方，也不代表已验证生成效果。仅在当前故事需要时采用以下分镜方法：
1. 每段承担一个主要剧情变化；克制表演可保留连续长镜头，不强制分段数或特定时长。
2. 如涉及追逐、接触或进出，写清位置、起点、路径、遮挡和落点；遮挡前后保持人物、持物和方向连续。
3. 运镜只为跟随注意或揭露当前故事的新信息；明确人物运动与摄影机运动，不强制构图偏置或复杂机位。
4. 如反应是重点，写情绪起点、触发、一两处可见动作与结束状态；保留停顿，不把心理解释写入对白。
5. 仅当原文明确有主观感知或现实反转时，分别描述两种状态并保留空间锚点；实际光源变化写明触发动作和照明范围。
6. 如声音影响行动，交代声源、出现时机和谁作出反应；原台词逐字保留，音乐按用户选择。`,
  prompts: `这是公开工程研究归纳，不是官方配方，也不代表已验证生成效果。仅在当前故事需要时采用以下提示词方法：
1. 如本次已关联素材，用真实素材名和实际可用引用说明身份、布局、道具或构图职责；参考图静态姿势与排版不自动进入正片。
2. 时间段使用连续整数，从0开始且末尾等于指定时长。每段一个主要动作与观察目的，写清路径、接触、遮挡和可见结果。
3. 如有反应戏，写原文支持的情绪起止及一两处眼神、停顿、呼吸或手部变化；心理解释不是口播台词。
4. 仅当原文明确需要主客观变化时，保留可辨的空间锚点并说明触发；否则不新增感知异变或色彩转折。实际开灯写清动作、光源位置与影响范围。
5. 如安排环境声或动作声，写声源、时机和反应；原台词逐字放在对应时间段，无台词不加对白，音乐按用户选择，后期补声另列。
6. 如需返工，保留成功的输入，只改主要失败因素；入口支持时记录随机种子与改动，人工验收后再比较，不能声称已生成或保证成功。
7. 方法库原创模板仅是独立示例，不把示例人物、事件或光色设定带入当前故事；无需机械填满所有栏目。`,
};

export function buildDirectorMethodGuidance(id: MethodInput, stage: DirectorMethodStage): string {
  const method = getDirectorMethod(id);
  const stageGuidance = method.id === 'sijia-film' ? SIJIA_GUIDANCE[stage] : STANDARD_GUIDANCE[stage];
  return `${SCRIPT_BOUNDARY}\n${stageGuidance}`;
}

// Original opt-in examples. They are not extracted author prompts or tested results.
export const DIRECTOR_METHOD_TEMPLATES: DirectorMethodTemplate[] = [
  {
    id: 'micro_performance',
    title: '6秒 · 微表演',
    script: '夜班修钟师林岚听着旧怀表，指尖停在表壳上。怀表终于响起一声滴答，她看向表盘，轻轻呼气，露出很小的笑意。没有对白。',
    durationSeconds: 6,
    prompt: `6秒，16:9。参考素材：林岚正面造型图用于身份，修钟台环境图用于布局，旧怀表细节图用于道具。素材需由用户真实上传并关联。
夜班修钟师林岚坐在工作台前，沿用参考的身份、服装和画风。固定胸以上近景，怀表位于画面下方，背景工具保持原位。
0—2秒：她低头听表，眉心收紧，指尖停在表壳上。
2—4秒：怀表响起一声清楚滴答，她的视线先停住，再缓慢移向表盘，眉间逐渐松开。
4—6秒：短暂停顿后轻轻呼气，嘴角出现很小的笑意，肩膀略放松。
表演克制，脸、手指与怀表形状稳定。只保留室内底噪、衣料摩擦和滴答声，无新增对白、无配乐。`,
  },
  {
    id: 'spatial_reveal',
    title: '12秒 · 空间与遮挡揭露',
    script: '档案馆走廊里，许棠追赶向右滚动的蓝色胶片罐。罐与她先后被推车遮挡。越过推车后，她发现罐已被门边软垫挡住，停步蹲下拾起。没有对白。',
    durationSeconds: 12,
    prompt: `12秒，16:9。参考素材：许棠全身造型图用于身份，档案馆走廊全景图用于空间，蓝色胶片罐细节图用于道具。素材需由用户真实上传并关联。
走廊出口在右侧，推车固定在右前景，门边有软垫；许棠追赶沿地面从左向右滚动的胶片罐。
0—4秒：侧面全景交代人物、罐和出口，她向右追两步。
4—8秒：镜头沿走廊右移，始终留在运动轴线同一侧。罐先被推车遮挡，她随后经过推车，身体短暂被遮住。
8—12秒：镜头越过推车，揭露罐已被门边软垫挡住，她停步蹲下拾起。
推车与出口位置连续，罐不瞬移，人物不逆向穿越。只保留脚步、罐体滚动和轻碰软垫的声音，无新增对白、无配乐。`,
  },
  {
    id: 'motivated_light',
    title: '10秒 · 光色与情绪转折',
    script: '夜里的陶艺工作室，沈禾看着桌上的裂杯，肩膀绷紧。她按下台灯开关，局部暖光亮起，窗边仍留冷蓝夜光。她轻轻呼气，放松肩膀，指尖触到杯沿。没有对白。',
    durationSeconds: 10,
    prompt: `10秒，16:9。参考素材：沈禾正面造型图用于身份，陶艺工作室全景图用于布局，裂纹杯与台灯细节图用于道具。素材需由用户真实上传并关联。
陶艺师沈禾坐在桌前，裂杯在近景，台灯及开关在她右手旁，后方窗户透入冷蓝夜光。固定上半身中景。
0—3秒：她看着裂纹，手停在杯边，肩膀略绷紧。
3—6秒：视线转向开关，右手伸过去，在第4秒按下。暖光随实际亮灯照到桌面和脸，窗边仍保留冷蓝光。
6—10秒：她慢慢呼气，肩膀下落，目光重新停在裂纹处，指尖轻触杯沿。
保持人物与桌面布局稳定，暖光范围符合灯的位置，不让全屋无因变色。只保留开关声、衣料摩擦与室内底噪，无新增对白、无配乐。`,
  },
];
