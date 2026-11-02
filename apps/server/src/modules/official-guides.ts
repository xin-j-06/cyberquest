export interface OfficialGuideStep {
  title: string;
  detail: string;
  actions: string[];
  code?: string;
  expected: string;
}

export interface OfficialGuide {
  title: string;
  summary: string;
  principle: string;
  steps: OfficialGuideStep[];
}

const guides: Record<string, OfficialGuide> = {
  'web-101': {
    title: '参数迷踪：完整官方题解',
    summary: '通过页面中的迁移账号线索定位 IDOR 参数越权，修改 account_id 读取不属于当前用户的内部资料。',
    principle: '后端仅根据客户端提交的对象编号返回资料，却没有校验该对象是否属于当前登录用户，形成不安全直接对象引用（IDOR）。',
    steps: [
      { title: '确认正常请求基线', detail: '先用页面默认的成员编号请求自己的资料，明确可控参数与正常响应结构。', actions: ['启动靶场并打开成员目录', '保留默认编号 U-1001，点击“查询资料”', '记录请求参数 account_id 与返回字段'], code: 'GET /api/profile?account_id=U-1001', expected: '接口返回 guest_student 的公开资料，private_note 为空。' },
      { title: '查找隐藏账号线索', detail: '检查页面 DOM，而不是盲目枚举整个编号空间。页面保留了旧系统迁移标记。', actions: ['打开浏览器开发者工具', '在 Elements 中搜索 migration 或 account', '读取 data-migration-account 的值 U-7842'], code: '<span data-migration-account="U-7842" aria-hidden="true"></span>', expected: '得到测试数据中的内部账号编号 U-7842。' },
      { title: '验证对象级授权缺失', detail: '把同一接口的 account_id 改为内部账号，其他请求条件保持不变。', actions: ['在输入框填写 U-7842', '再次点击“查询资料”', '比较两次 JSON 响应字段差异'], code: 'GET /api/profile?account_id=U-7842', expected: '响应出现 migration-admin、service 以及 private_note；private_note 中即为当前会话 Flag。' },
    ],
  },
  'web-102': {
    title: '会话足迹：完整官方题解',
    summary: '识别 Base64 仅是编码而非签名，篡改 legacy_session 中的 role 字段以进入管理员控制台。',
    principle: '客户端令牌中的身份 JSON 没有 MAC 或数字签名，服务端直接信任可被用户修改的 role，导致身份伪造。',
    steps: [
      { title: '解码当前会话令牌', detail: '从页面复制 legacy_session，先观察解码后的数据结构。', actions: ['复制文本框中的令牌', '在浏览器控制台执行 atob', '确认 uid 与 role 字段'], code: "JSON.parse(atob('粘贴页面中的令牌'))", expected: '得到类似 {"uid":"1001","role":"student"} 的 JSON。' },
      { title: '构造管理员令牌', detail: '保留 uid，只把 role 从 student 改成 admin，再编码为 Base64。', actions: ['构造新的 JSON 对象', '使用 btoa 重新编码', '把结果粘贴回 legacy_session'], code: "btoa(JSON.stringify({ uid: '1001', role: 'admin' }))", expected: '得到一段新的 Base64 字符串；解码后 role 应严格等于 admin。' },
      { title: '访问管理控制台', detail: '携带篡改后的未签名令牌访问受限功能。', actions: ['点击“访问管理控制台”', '检查 PRIVILEGED RESPONSE', '复制 audit_flag 并回工作台提交'], code: 'GET /admin/console\nCookie: legacy_session=<修改后的 Base64>', expected: '服务器返回 200 OK，JSON 的 audit_flag 字段包含当前会话 Flag。' },
    ],
  },
  'crypto-101': {
    title: '编码接力：完整官方题解',
    summary: '根据字符集与题面标记识别 Base64 → Hex → UTF-8 的两层表示，按顺序还原明文。',
    principle: '编码是可逆的数据表示，不提供机密性。本题外层是 Base64，解码后得到只含 0-9a-f 的十六进制字节串。',
    steps: [
      { title: '提取有效载荷', detail: '打开或下载 intercept.txt，只复制 payload 后的一行，避免把说明文字一起解码。', actions: ['定位 payload: 标签', '复制下一行 Base64 文本', '观察字符集与可能的 = 填充'], expected: '得到一段符合 Base64 字符集的连续文本。' },
      { title: '解除外层 Base64', detail: '第一次解码的结果仍不是 Flag，而是十六进制字符串。', actions: ['对 payload 做 Base64 解码', '将结果按 ASCII 显示', '确认结果长度为偶数且只含十六进制字符'], code: "import base64\npayload = '粘贴 payload'\nhex_text = base64.b64decode(payload).decode('ascii')\nprint(hex_text)", expected: '输出形如 666c61677b... 的 Hex 文本。' },
      { title: '把 Hex 还原为 UTF-8', detail: '每两个十六进制字符表示一个字节，组合后按 UTF-8 解码。', actions: ['调用 bytes.fromhex', '将字节串解码为 UTF-8', '检查结果是否符合 flag{...} 格式'], code: "flag = bytes.fromhex(hex_text).decode('utf-8')\nprint(flag)", expected: '终端输出完整的当前会话 Flag。' },
    ],
  },
  'network-101': {
    title: '数据包明信片：完整官方题解',
    summary: '从 HTTP 会话摘要中筛出异常外传请求，跟随应用层流并解码自定义头标记的载荷。',
    principle: '异常主机、POST /export、500 状态和高延迟共同构成筛选证据；X-Transfer-Encoding 明确说明正文使用 Base64。',
    steps: [
      { title: '建立流量基线', detail: '比较四条会话的主机、方法、路径、状态码和耗时，先找偏离正常静态资源访问的记录。', actions: ['查看 Packet Scope 列表', '排除 assets.local 的正常资源请求', '标记 FRAME 23 的 sync.invalid POST /export'], code: 'FRAME 23  sync.invalid  POST /export  500  941ms', expected: 'FRAME 23 同时具备异常域名、写操作、错误状态和明显高延迟。' },
      { title: '跟随可疑 HTTP 流', detail: '阅读 Follow HTTP Stream 23，重点检查请求头和消息体边界。', actions: ['定位 X-Transfer-Encoding', '记录 Content-Length', '复制空行之后的正文'], code: 'X-Transfer-Encoding: base64\nContent-Length: <长度>\n\n<Base64 正文>', expected: '确认正文不是原始二进制，而是 Base64 编码数据。' },
      { title: '恢复外传内容', detail: '只解码 HTTP 正文，不要包含头部。', actions: ['把正文保存到变量', '执行严格 Base64 解码', '检查输出的 flag{...} 格式'], code: "import base64\nbody = '粘贴 HTTP 正文'\nprint(base64.b64decode(body, validate=True).decode())", expected: '解码结果即为当前会话 Flag。' },
    ],
  },
  'reverse-101': {
    title: '字符串理论：完整官方题解',
    summary: '阅读 verify 伪代码，确认 expected[i] = input[i] XOR 0x23，再对常量数组执行同一 XOR 逆运算。',
    principle: 'XOR 满足 (x XOR k) XOR k = x，因此逐字节异或 0x23 即可从 expected 恢复原输入。',
    steps: [
      { title: '定位校验核心', detail: '从 strings 引用转到 verify，忽略成功/失败文案，关注输入与 expected 的比较表达式。', actions: ['阅读 verify 循环', '记录异或常量 0x23', '确认末尾还要求 NUL 终止'], code: 'if ((input[i] ^ 0x23) != expected[i]) return 0;', expected: '得到关系 expected[i] = input[i] XOR 0x23。' },
      { title: '抄取常量字节表', detail: '完整复制 expected 数组，保留顺序，不要包含数组长度和大括号。', actions: ['从反编译文本复制 0x.. 列表', '检查字节数量与循环上限一致', '将列表放入 Python 数组'], expected: '得到与 Flag 字节数相同的整数数组。' },
      { title: '执行逆变换', detail: '对每个 expected 字节再次异或 0x23，并把结果组合为字节串。', actions: ['逐项执行 b ^ 0x23', '转换为 bytes', '按 UTF-8 解码并检查格式'], code: "expected = [0x00, 0x00]  # 替换为题面完整数组\nplain = bytes(b ^ 0x23 for b in expected)\nprint(plain.decode('utf-8'))", expected: '使用题面完整数组后输出当前会话 Flag；示例中的 0x00 必须替换。' },
    ],
  },
  'pwn-101': {
    title: '栈的故事：完整官方题解',
    summary: '根据结构体字段布局计算 name 到 role 的 16 字节偏移，用连续输入把 role 覆盖为 admin。',
    principle: 'strcpy 不检查目标缓冲区长度。name[16] 后紧邻 role[8]，第 17 个输入字节开始写入 role。',
    steps: [
      { title: '绘制内存布局', detail: '按源码声明顺序记录字段大小，题目模拟器不引入额外填充。', actions: ['name 占偏移 0–15', 'role 从偏移 16 开始', '目标是让 role 开头变为 admin'], code: 'offset 0x00: char name[16]\noffset 0x10: char role[8]', expected: '确认覆盖 role 之前需要恰好 16 字节填充。' },
      { title: '构造最小载荷', detail: '使用 16 个 A 填满 name，紧接 admin 覆盖 role。不要添加引号。', actions: ['生成 16 字节填充', '追加 ASCII 字符串 admin', '确认总长度为 21 字节'], code: "payload = 'A' * 16 + 'admin'\nprint(payload)\nprint(len(payload))  # 21", expected: '载荷为 AAAAAAAAAAAAAAAAadmin。' },
      { title: '发送并读取管理员分支', detail: '把载荷提交给 profile-service，观察模拟内存字段与程序输出。', actions: ['粘贴载荷并点击“发送”', '确认 role = "admin"', '从 access granted 后复制 Flag'], code: 'AAAAAAAAAAAAAAAAadmin', expected: '服务进入 print_flag 分支，在输出末尾显示当前会话 Flag。' },
    ],
  },
};

const fallback: OfficialGuide = {
  title: '完整官方题解',
  summary: '按题目目标建立可验证的输入、处理和输出证据链。',
  principle: '先确认数据格式和信任边界，再进行最小化验证并记录结果。',
  steps: [{ title: '复现与验证', detail: '使用题目提供的本地材料完成分析。', actions: ['读取任务目标', '检查可控输入', '验证输出并提交 Flag'], expected: '获得符合 flag{...} 格式的会话结果。' }],
};

function storedGuide(content?: string): OfficialGuide | undefined {
  if (!content) return undefined;
  try {
    const parsed = JSON.parse(content) as OfficialGuide;
    if (parsed && typeof parsed.title === 'string' && typeof parsed.summary === 'string' && typeof parsed.principle === 'string' && Array.isArray(parsed.steps) && parsed.steps.length) return parsed;
  } catch {}
  return undefined;
}

export function officialGuideFor(slug: string, content?: string) {
  return storedGuide(content) ?? guides[slug] ?? fallback;
}

export function officialGuideContent(slug: string, content?: string) {
  return JSON.stringify(officialGuideFor(slug, content));
}

export function officialGuideAdminFields(slug: string, content?: string) {
  const guide = officialGuideFor(slug, content);
  return {
    guideSummary: guide.summary,
    guidePrinciple: guide.principle,
    guideSteps: guide.steps.map((step) => `${step.title} | ${step.detail} | ${step.expected}`).join('\n'),
  };
}

export function buildOfficialGuide(slug: string, challengeTitle: string, input: { guideSummary?: string; guidePrinciple?: string; guideSteps?: string }, content?: string): OfficialGuide {
  const base = officialGuideFor(slug, content);
  const stepLines = input.guideSteps?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const steps = stepLines?.length ? stepLines.map((line, index) => {
    const [title, detail, expected] = line.split('|').map((part) => part.trim());
    const previous = base.steps[index];
    return {
      title: title || `步骤 ${index + 1}`,
      detail: detail || previous?.detail || '按照题目目标完成本步验证。',
      actions: previous?.title === title ? previous.actions : [detail || '执行并记录可复现的验证操作。'],
      ...(previous?.title === title && previous.code ? { code: previous.code } : {}),
      expected: expected || previous?.expected || '得到与题目机制一致的可验证结果。',
    };
  }) : base.steps;
  return {
    title: `${challengeTitle}：完整官方题解`,
    summary: input.guideSummary?.trim() || base.summary,
    principle: input.guidePrinciple?.trim() || base.principle,
    steps,
  };
}
