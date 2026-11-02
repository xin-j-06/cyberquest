export const LEARNING_SKILL_IDS = ['auto', 'socratic', 'concept', 'code-reading', 'debugging', 'study-plan'] as const;
export type LearningSkillId = typeof LEARNING_SKILL_IDS[number];

type LearningSkill = {
  id: LearningSkillId;
  name: string;
  description: string;
  instruction: string;
};

const LEARNING_SKILLS: LearningSkill[] = [
  {
    id: 'auto',
    name: '自动选择',
    description: '根据问题自动采用最合适的辅导方式',
    instruction: '先判断学员需要的是概念解释、故障诊断、代码阅读、学习规划还是启发式辅导，再采用对应结构。专业准确性优先，不要向用户汇报分类过程，也不要添加与问题无关的情绪化开场。',
  },
  {
    id: 'socratic',
    name: '启发式辅导',
    description: '通过提示和追问帮助学员自己得出结论',
    instruction: '先给出理解当前问题所必需的基础事实，再提供一个有明确目标的提示和一个可回答的检查问题。不要故意隐藏关键概念，也不要用连续反问代替讲解。',
  },
  {
    id: 'concept',
    name: '概念讲解',
    description: '用准确定义、机制和示例讲清知识点',
    instruction: '先给准确且简洁的定义，再解释工作机制，随后提供一个最小示例和必要的常见误区。术语首次出现时用一句白话解释；只有确实有帮助时才使用类比，不强制追问。',
  },
  {
    id: 'code-reading',
    name: '代码阅读',
    description: '解释代码的数据流、关键逻辑与潜在问题',
    instruction: '围绕输入、关键处理、输出和异常路径解释代码，指出重要变量、分支、前置条件与潜在风险。引用具体代码片段作为依据，并给出防御性改进；不生成攻击载荷、利用脚本或绕过步骤。',
  },
  {
    id: 'debugging',
    name: '故障诊断',
    description: '根据现象和报错逐步定位问题',
    instruction: '先区分已知事实、缺失信息和待验证假设，再按概率与成本排列原因。每个检查动作都要说明检查目的、预期现象以及不同结果分别意味着什么；信息不足时只询问会影响判断的关键环境或完整错误信息。',
  },
  {
    id: 'study-plan',
    name: '学习规划',
    description: '按目标、基础和时间制定可执行计划',
    instruction: '先确认目标、当前基础和可投入时间；信息不足但仍可规划时明确合理假设。计划要包含阶段目标、核心知识、练习产出、复盘节点、验收标准和预计投入，避免只罗列课程名称。',
  },
];

export function learningSkillCatalog() {
  return LEARNING_SKILLS.map(({ id, name, description }) => ({ id, name, description }));
}

export function learningSkillInstruction(id: string | undefined) {
  return LEARNING_SKILLS.find((skill) => skill.id === id)?.instruction ?? LEARNING_SKILLS[0].instruction;
}

export function resolveLearningSkill(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], requested?: LearningSkillId): LearningSkillId {
  if (requested && requested !== 'auto') return requested;
  const text = `${history.filter((item) => item.role === 'user').slice(-2).map((item) => item.content).join(' ')} ${message}`.trim();
  if (/提示|引导|别直接说答案|不要直接.*答案|启发|一步步问我/i.test(text)) return 'socratic';
  if (/报错|错误|失败|异常|无法|打不开|连接不上|不生效|崩溃|卡住|排查|debug/i.test(text)) return 'debugging';
  if (/学习路线|学习计划|规划|怎么入门|从哪里开始|每天|每周|备考|目标/i.test(text)) return 'study-plan';
  if (/```|代码|函数|变量|源码|逐行|这段.*(?:什么意思|做什么)|typescript|javascript|python|java|golang|vue|react/i.test(text)) return 'code-reading';
  if (/是什么|为什么|原理|区别|概念|如何理解|怎么理解|解释|含义/i.test(text)) return 'concept';
  return 'concept';
}
