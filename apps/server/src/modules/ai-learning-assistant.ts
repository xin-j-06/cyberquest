type TutorTopic = {
  keywords: RegExp;
  title: string;
  explanation: string;
  steps: string[];
};

import type { LearningSkillId } from './ai-learning-skills';

const TOPICS: TutorTopic[] = [
  {
    keywords: /xss|跨站脚本/i,
    title: 'XSS 的判断思路',
    explanation: 'XSS 的核心不是“页面里出现了输入”，而是外部输入未经正确上下文编码进入了 HTML、属性、URL 或脚本执行上下文。',
    steps: ['确认输入从哪里进入页面，并记录服务端响应中的原始位置', '判断它位于 HTML 文本、属性还是脚本上下文', '在本平台靶场内使用无害标记验证是否发生了解析，不要测试外部站点', '修复时按输出上下文编码，并配合 CSP 与输入约束'],
  },
  {
    keywords: /sql|注入|数据库查询/i,
    title: 'SQL 注入的分析思路',
    explanation: 'SQL 注入通常源于把外部输入拼接进查询语句。学习时应先证明响应差异与输入有关，再讨论参数化查询。',
    steps: ['记录正常输入对应的状态码、响应长度和业务结果', '只在授权靶场中改变一个变量并比较差异', '检查错误信息或真假条件是否造成稳定差异', '代码侧使用参数化查询，不依赖字符过滤作为主要防线'],
  },
  {
    keywords: /越权|idor|权限|对象引用/i,
    title: '越权与对象引用检查',
    explanation: '越权问题发生在服务端只接受资源标识，却没有重新校验当前用户是否拥有访问该资源的权限。',
    steps: ['先区分“已登录”和“有权访问”这两个判断', '在题目提供的两个测试身份或资源之间建立对照', '只改变资源标识，观察服务端是否执行所有权校验', '修复时在每次读取和修改前执行服务端授权判断'],
  },
  {
    keywords: /cookie|session|会话|jwt|token/i,
    title: '会话与令牌分析',
    explanation: '会话安全要同时检查完整性、有效期、服务端授权以及退出后的失效处理；能解码内容不代表能够安全修改。',
    steps: ['识别令牌由哪些部分组成以及由谁签发', '检查签名、有效期和受众等约束是否被验证', '比较普通用户与管理员请求的服务端授权结果', '避免在日志、截图和笔记中保存完整令牌'],
  },
  {
    keywords: /base64|编码|十六进制|hex/i,
    title: '编码识别与还原',
    explanation: '编码用于表示数据，不等同于加密。Base64 常含 A-Z、a-z、0-9、+、/，末尾可能出现 =；十六进制只使用 0-9 和 a-f。',
    steps: ['先根据字符集、长度和填充判断候选格式', '保留原始材料，复制一份进行转换', '解码后检查可读文本、文件头或下一层编码特征', '用反向编码验证结果能否还原到原始材料'],
  },
  {
    keywords: /哈希|hash|md5|sha/i,
    title: '哈希问题的判断方法',
    explanation: '哈希是单向摘要，不是可逆加密。分析重点是识别算法、输入规范和可验证假设，而不是盲目“解密”。',
    steps: ['根据摘要长度与字符集缩小算法范围', '确认是否存在盐值、大小写和字符编码差异', '仅对题目给定的小范围候选做验证', '存储密码时应使用 Argon2id、scrypt 或 bcrypt 等专用算法'],
  },
  {
    keywords: /xor|异或/i,
    title: 'XOR 材料分析',
    explanation: 'XOR 满足同一密钥再次异或即可还原。题目中常通过已知格式、重复密钥或可打印字符范围建立约束。',
    steps: ['把材料统一为字节序列，不要把十六进制文本当作普通字符', '检查密钥是否重复以及输出长度关系', '利用已知前缀只推导必要的密钥片段', '对还原结果做格式和反向运算验证'],
  },
  {
    keywords: /wireshark|pcap|流量|抓包|http包|数据包/i,
    title: '流量分析路径',
    explanation: '流量题应从协议、端点、时间线和会话四个维度建立证据，先过滤再跟踪，不要一开始就逐包翻阅。',
    steps: ['查看协议层级和通信端点，确认主要流量类型', '用 dns、http、tcp.stream 等显示过滤器缩小范围', '跟踪可疑会话并记录请求、响应与时间顺序', '导出对象或字段后校验文件类型与内容'],
  },
  {
    keywords: /dns|域名解析/i,
    title: 'DNS 证据分析',
    explanation: 'DNS 分析要关注查询名称、记录类型、响应码、TTL 和时间密度。异常长子域或高频规律查询可能携带题目线索。',
    steps: ['按 dns 过滤并统计查询名称与响应码', '比较正常域名与异常子域的长度、字符集和频率', '按时间排序，检查分片数据能否组成稳定序列', '结合后续连接验证解析结果是否被实际使用'],
  },
  {
    keywords: /逆向|ghidra|反编译|strings|字符串/i,
    title: '静态逆向入门路径',
    explanation: '静态分析的目标是从字符串、引用和控制流推断程序意图，再用可验证的输入输出确认判断。',
    steps: ['先确认文件类型、架构和基本保护信息', '搜索关键提示、错误信息和格式字符串', '从字符串交叉引用定位校验函数', '重命名变量并画出输入到比较结果的数据流'],
  },
  {
    keywords: /pwn|栈溢出|缓冲区|内存安全|覆盖/i,
    title: '内存安全分析路径',
    explanation: '缓冲区问题来自写入长度与目标容量不一致。平台训练应聚焦内存布局、边界检查和可控影响，不延伸到外部系统。',
    steps: ['阅读源码或反编译结果，标出缓冲区大小与输入上限', '在受控模拟器中逐步增加长度并记录状态变化', '区分崩溃、相邻字段覆盖和控制流影响', '修复时使用长度受限接口并在写入前校验容量'],
  },
  {
    keywords: /burp|repeater|代理抓包/i,
    title: 'Burp Suite 学习用法',
    explanation: '在授权靶场里，Burp 的价值是把浏览器请求变成可重复、可比较的实验记录。',
    steps: ['仅为本地靶场配置代理并确认作用域', '在 HTTP history 中找到目标请求', '发送到 Repeater，每次只改变一个字段', '比较状态码、响应长度和业务数据并记录结论'],
  },
  {
    keywords: /学什么|学习路线|怎么入门|从哪里开始|规划/i,
    title: 'CTF 学习路线建议',
    explanation: '建议从 HTTP、Linux、Python 和编码基础开始，再选择一个方向形成“知识—工具—题目—复盘”的闭环。',
    steps: ['先在学习中心完成 HTTP、编码和命令行基础专题', '从简单 Web 或 Crypto 题开始，每题保留分析笔记', '把不熟悉的工具操作整理为可复用清单', '每周复盘错误假设，再进入流量、逆向或 Pwn 专项'],
  },
  {
    keywords: /打不开|启动失败|报错|错误|无法|连接不上/i,
    title: '问题排查清单',
    explanation: '排错时最重要的是把“现象”变成可复现证据：操作、期望、实际结果和环境信息缺一不可。',
    steps: ['记录发生问题的页面、操作顺序和完整错误文字', '确认登录状态、靶场剩余时间以及 API 健康状态', '刷新后只重复最小操作，观察是否稳定复现', '把浏览器控制台或网络请求中的状态码提供给助教'],
  },
];

function defaultReply(message: string) {
  return {
    title: '需要补充的关键信息',
    explanation: `仅根据“${message.slice(0, 180)}”还不能形成可靠判断。为了区分事实与猜测，需要先补齐能够影响结论的信息。`,
    steps: ['说明正在学习的知识点、课程或题目名称', '提供完整现象、错误文字或必要的工具输出，并移除令牌等敏感信息', '说明运行环境、已经尝试的方法以及实际结果', '写明期望结果，便于比较差异并确定下一步'],
  };
}

export function createLearningAssistantReply(message: string, challengeTitle?: string, hintLevel = 1, skill: LearningSkillId = 'auto') {
  const question = message.trim();
  if (/^(你好|您好|嗨|hi|hello|在吗)[!！。.\s]*$/i.test(question)) {
    return `你好。${challengeTitle ? `我已经看到你正在学习「${challengeTitle}」。` : ''}请告诉我你想了解的概念、代码或具体报错，我会先给出结论，再解释依据和验证方法。`;
  }
  if (/^(谢谢|感谢|明白了|懂了|好的)[!！。.\s]*$/i.test(question)) {
    return '不客气。如果后续验证结果与预期不一致，可以把完整现象和环境信息发给我，我会继续帮你分析。';
  }
  const topic = TOPICS.find((item) => item.keywords.test(question)) ?? defaultReply(question);
  const context = challengeTitle ? `当前上下文：${challengeTitle}\n\n` : '';
  const steps = topic.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const empathy = /焦虑|崩溃|很着急|很烦|害怕|受挫/i.test(question)
    ? '这个问题确实会影响学习进度。我们先把事实和假设分开，逐项确认。\n\n'
    : '';
  const skillLead: Partial<Record<LearningSkillId, string>> = {
    socratic: '我先不给完整答案，我们从一个关键线索开始。\n\n',
    concept: '先给出准确的定义，再说明它的工作机制和适用边界。\n\n',
    'code-reading': '下面按输入、关键处理、输出和异常路径说明这段逻辑。\n\n',
    debugging: '下面先区分已知事实和待验证假设，再按优先级排查。\n\n',
    'study-plan': '下面把目标拆成可执行、可检查的阶段。\n\n',
  };
  const followUp = skill === 'socratic'
    ? '\n\n请先确认一个关键点：上述步骤中，你目前已经获得了哪一项可验证结果？'
    : skill === 'debugging'
      ? '\n\n完成第一项检查后，请提供实际结果；这个结果将决定下一步应验证哪一个假设。'
      : hintLevel >= 3
        ? '\n\n进一步分析时，可以把输入、处理和输出分别列出，并为每一步记录可观察证据。'
        : '';
  return `${context}${empathy}${skillLead[skill] ?? ''}### ${topic.title}\n\n${topic.explanation}\n\n### 建议步骤\n\n${steps}${followUp}`;
}
