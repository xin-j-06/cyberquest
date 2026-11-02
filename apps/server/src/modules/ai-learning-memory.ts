import { resolveLearningSkill, type LearningSkillId } from './ai-learning-skills';

export type LearningMemory = {
  version: 1;
  interests: string[];
  goals: string[];
  preferences: string[];
  difficulties: string[];
  lastSkill: LearningSkillId;
  interactionCount: number;
  updatedAt: string;
};

const TOPICS: Array<[RegExp, string]> = [
  [/web|http|xss|sql|越权|会话|前端|后端/i, 'Web 安全'],
  [/密码学|加密|哈希|hash|base64|xor|crypto/i, '密码学与编码'],
  [/流量|pcap|wireshark|tcp|udp|dns|网络/i, '网络与流量分析'],
  [/逆向|反编译|ghidra|汇编|reverse/i, '逆向分析'],
  [/内存|缓冲区|栈|pwn|二进制/i, '二进制安全'],
  [/python|javascript|typescript|java|golang|代码|编程/i, '编程与代码阅读'],
  [/linux|命令行|shell|环境变量/i, 'Linux 与开发环境'],
  [/ctf|竞赛|靶场/i, 'CTF 综合训练'],
];

const SENSITIVE = /(api[_ -]?key|token|密码|口令|secret|authorization|bearer|flag\{|sk-[a-z0-9_-]{8,})/i;

export function emptyLearningMemory(): LearningMemory {
  return { version: 1, interests: [], goals: [], preferences: [], difficulties: [], lastSkill: 'auto', interactionCount: 0, updatedAt: new Date(0).toISOString() };
}

export function normalizeLearningMemory(value: unknown): LearningMemory {
  const source = value && typeof value === 'object' ? value as Partial<LearningMemory> : {};
  const strings = (items: unknown, limit: number) => Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 120)).slice(0, limit) : [];
  return {
    version: 1,
    interests: strings(source.interests, 8),
    goals: strings(source.goals, 5),
    preferences: strings(source.preferences, 5),
    difficulties: strings(source.difficulties, 6),
    lastSkill: ['auto', 'socratic', 'concept', 'code-reading', 'debugging', 'study-plan'].includes(source.lastSkill ?? '') ? source.lastSkill as LearningSkillId : 'auto',
    interactionCount: Math.max(0, Number(source.interactionCount) || 0),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString(),
  };
}

function appendUnique(items: string[], value: string, limit: number) {
  const normalized = value.trim().slice(0, 120);
  if (!normalized) return items;
  return [normalized, ...items.filter((item) => item !== normalized)].slice(0, limit);
}

function compactStatement(message: string) {
  return message.replace(/```[\s\S]*?```/g, '[代码]').replace(/https?:\/\/\S+/g, '[链接]').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function updateLearningMemory(current: unknown, message: string): LearningMemory {
  const memory = normalizeLearningMemory(current);
  const text = message.trim();
  const skill = resolveLearningSkill(text);
  const next = { ...memory, interests: [...memory.interests], goals: [...memory.goals], preferences: [...memory.preferences], difficulties: [...memory.difficulties] };

  for (const [pattern, topic] of TOPICS) if (pattern.test(text)) next.interests = appendUnique(next.interests, topic, 8);
  if (!SENSITIVE.test(text)) {
    const statement = compactStatement(text);
    if (/我想|我的目标|计划|准备学习|希望学会|想要掌握/i.test(text)) next.goals = appendUnique(next.goals, statement, 5);
    if (/不会|不懂|困惑|卡住|报错|失败|无法|总是错/i.test(text)) next.difficulties = appendUnique(next.difficulties, statement, 6);
  }
  if (/简短|简洁|直接说重点/i.test(text)) next.preferences = appendUnique(next.preferences, '偏好简洁、直接的回答', 5);
  if (/详细|展开讲|讲细一点/i.test(text)) next.preferences = appendUnique(next.preferences, '偏好详细解释', 5);
  if (/举例|例子|类比/i.test(text)) next.preferences = appendUnique(next.preferences, '偏好通过例子和类比理解', 5);
  if (/一步一步|逐步|带着我/i.test(text)) next.preferences = appendUnique(next.preferences, '偏好分步骤辅导', 5);

  next.lastSkill = skill;
  next.interactionCount += 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function learningMemoryPrompt(memory: LearningMemory) {
  const lines = [
    memory.interests.length ? `学习兴趣：${memory.interests.join('、')}` : '',
    memory.goals.length ? `学习目标：${memory.goals.join('；')}` : '',
    memory.preferences.length ? `表达偏好：${memory.preferences.join('；')}` : '',
    memory.difficulties.length ? `近期困难：${memory.difficulties.join('；')}` : '',
  ].filter(Boolean);
  if (!lines.length) return '尚未形成长期学习记忆。';
  return `以下是该学员主动对话中形成的长期学习记忆，仅用于自然地调整解释方式，不要逐项复述，也不要声称记住了未列出的信息：\n${lines.map((line) => `- ${line}`).join('\n')}`;
}
