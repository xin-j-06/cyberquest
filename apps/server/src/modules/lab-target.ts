import { createHmac } from 'node:crypto';
import type { ChallengeCategory, LabInteractionResult, LabTarget } from '@cyberquest/shared';

type ChallengeInput = { slug: string; title: string; category: string; description?: string; goal?: string };
type LabInput = { instanceId: string; expiresAt: string | Date };
type Scenario = Omit<LabTarget, 'instanceId' | 'challengeSlug' | 'title' | 'category' | 'expiresAt' | 'workspaceUrl'>;

export function createSessionFlag(secret: string, challengeSlug: string, instanceId: string) {
  const proof = createHmac('sha256', secret).update(`${challengeSlug}:${instanceId}`, 'utf8').digest('hex').slice(0, 20);
  return `flag{${challengeSlug.replace(/-/g, '_')}_${proof}}`;
}

function base64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function scenarioFor(challenge: ChallengeInput, flag: string): Scenario {
  switch (challenge.slug) {
    case 'web-101':
      return {
        kind: 'WEB_PARAMETER',
        objective: '审计成员目录的资料查询接口，找到越权读取的内部记录与 Flag。',
        brief: 'Northstar 成员目录会把浏览器提供的 account_id 直接交给资料接口。普通学员只能查看自己的编号。',
        steps: ['观察当前资料编号与接口响应', '检查页面 DOM 中遗留的迁移标记', '修改 account_id，找到不应公开的内部备忘录'],
        artifactLabel: 'Northstar / 成员资料中心',
        artifact: '当前登录：guest_student\n当前编号：U-1001\n接口：GET /api/profile?account_id=U-1001\n\n提示：测试数据集中还存在一条迁移自旧系统的内部账号记录。',
        inputLabel: 'GET /api/profile?account_id=',
        inputPlaceholder: '输入成员编号，例如 U-1001',
        actionLabel: '查询资料',
      };
    case 'web-102': {
      const token = base64(JSON.stringify({ uid: '1001', role: 'student' }));
      return {
        kind: 'WEB_TOKEN',
        objective: '检查未签名的会话令牌，构造管理员身份并访问内部控制台。',
        brief: 'Legacy Portal 将身份 JSON 直接 Base64 编码后作为会话令牌，没有签名或完整性校验。',
        steps: ['对当前令牌做 Base64 解码', '识别服务端直接信任的 role 字段', '修改 JSON 后重新编码并访问控制台'],
        artifactLabel: 'Legacy Portal / 会话检查器',
        artifact: `Set-Cookie: legacy_session=${token}; Path=/\n\n客户端状态：student\n目标端点：GET /admin/console`,
        inputLabel: 'legacy_session',
        inputPlaceholder: '粘贴修改后的 Base64 会话令牌',
        actionLabel: '携带令牌访问控制台',
      };
    }
    case 'crypto-101': {
      const hex = Buffer.from(flag, 'utf8').toString('hex');
      return {
        kind: 'ENCODED_ARTIFACT',
        objective: '判断两层编码的先后关系，还原藏在消息中的 Flag。',
        brief: '截获内容不是加密算法，而是连续使用了两种常见的数据表示方式。请保留每一步的中间结果。',
        steps: ['根据字符集和结尾填充判断外层编码', '解开外层后识别十六进制字节串', '把字节还原为 UTF-8 文本并提交 Flag'],
        artifactLabel: 'intercept.txt',
        artifact: `# relay-message / packet 07\nencoding-chain: base64 -> hex -> utf8\npayload:\n${base64(hex)}`,
        download: { name: 'intercept.txt', mediaType: 'text/plain;charset=utf-8' },
      };
    }
    case 'network-101': {
      const encodedFlag = base64(flag);
      return {
        kind: 'TRAFFIC_CAPTURE',
        objective: '在混合流量中定位异常导出请求，并从应用层载荷还原 Flag。',
        brief: '这是从本地教学流量中导出的 HTTP 会话摘要。正常静态资源与一次可疑的外传请求混在一起。',
        steps: ['按主机、状态码与耗时定位异常会话', '跟随可疑 HTTP 流并检查自定义请求头', '识别载荷编码并还原 Flag'],
        artifactLabel: 'capture-http.txt',
        artifact: `FRAME 12  10:03:01  assets.local  GET /app.css       200  12ms\nFRAME 18  10:03:04  api.local     GET /profile       200  18ms\nFRAME 23  10:03:05  sync.invalid  POST /export       500  941ms\nFRAME 27  10:03:08  assets.local  GET /logo.svg      304  7ms\n\n--- Follow TCP stream 23 ---\nPOST /export HTTP/1.1\nHost: sync.invalid\nContent-Type: application/octet-stream\nX-Transfer-Encoding: base64\nContent-Length: ${encodedFlag.length}\n\n${encodedFlag}`,
        download: { name: 'capture-http.txt', mediaType: 'text/plain;charset=utf-8' },
      };
    }
    case 'reverse-101': {
      const xorBytes = [...Buffer.from(flag, 'utf8')].map((value) => `0x${(value ^ 0x23).toString(16).padStart(2, '0')}`).join(', ');
      return {
        kind: 'REVERSE_BINARY',
        objective: '从反编译片段判断校验逻辑，恢复被逐字节变换的 Flag。',
        brief: '样本是无网络行为的教学程序。反编译结果表明输入会与内置字节表逐位比较。',
        steps: ['阅读伪代码并确定循环中的可逆运算', '对常量数组逐字节执行逆运算', '将结果按 UTF-8/ASCII 组合并验证 Flag 格式'],
        artifactLabel: 'validator.decomp.txt',
        artifact: `int verify(const unsigned char *input) {\n  for (size_t i = 0; i < ${Buffer.byteLength(flag)}; i++) {\n    if ((input[i] ^ 0x23) != expected[i]) return 0;\n  }\n  return input[${Buffer.byteLength(flag)}] == '\\0';\n}\n\nexpected[${Buffer.byteLength(flag)}] = {\n  ${xorBytes}\n};\n\nstrings:\n  "usage: validator <flag>"\n  "validation failed"\n  "access granted"`,
        download: { name: 'validator.decomp.txt', mediaType: 'text/plain;charset=utf-8' },
      };
    }
    case 'pwn-101':
      return {
        kind: 'PWN_SERVICE',
        objective: '利用相邻字段覆盖把 role 改成 admin，让服务输出 Flag。',
        brief: '该服务是安全的内存布局模拟器，不执行本机代码。输入会被复制到固定长度 name 字段，后面紧邻 role。',
        steps: ['根据结构体计算 name 到 role 的偏移', '构造能够完整覆盖 name 并写入目标角色的文本', '把载荷发送给服务并观察程序输出'],
        artifactLabel: 'profile-service.c',
        artifact: `struct profile {\n  char name[16];\n  char role[8];\n};\n\nvoid handle(const char *input) {\n  struct profile p = { .name = "guest", .role = "user" };\n  strcpy(p.name, input);               // training bug\n  if (strcmp(p.role, "admin") == 0) {\n    print_flag();\n  } else {\n    printf("hello %s (%s)\\n", p.name, p.role);\n  }\n}`,
        inputLabel: 'TCP payload',
        inputPlaceholder: '输入发送给 profile-service 的载荷',
        actionLabel: '发送载荷',
        download: { name: 'profile-service.c', mediaType: 'text/x-c;charset=utf-8' },
      };
    default:
      return {
        kind: 'ENCODED_ARTIFACT',
        objective: challenge.goal ?? challenge.description ?? '分析本地材料并找到 Flag。',
        brief: '该题使用会话专属材料，所有内容均在本地授权环境中生成。',
        steps: ['识别材料格式', '记录可复现的分析过程', '恢复 Flag 并返回工作台提交'],
        artifactLabel: 'challenge.txt',
        artifact: base64(flag),
        download: { name: 'challenge.txt', mediaType: 'text/plain;charset=utf-8' },
      };
  }
}

export function createLabTarget(secret: string, challenge: ChallengeInput, lab: LabInput): LabTarget {
  const flag = createSessionFlag(secret, challenge.slug, lab.instanceId);
  return {
    instanceId: lab.instanceId,
    challengeSlug: challenge.slug,
    title: challenge.title,
    category: challenge.category as ChallengeCategory,
    expiresAt: new Date(lab.expiresAt).toISOString(),
    workspaceUrl: `/challenges/${encodeURIComponent(challenge.slug)}`,
    ...scenarioFor(challenge, flag),
  };
}

export function interactLabTarget(secret: string, challenge: ChallengeInput, lab: LabInput, input: string): LabInteractionResult {
  const flag = createSessionFlag(secret, challenge.slug, lab.instanceId);
  const value = input.trim();

  if (challenge.slug === 'web-101') {
    if (value === 'U-7842') {
      return { success: true, message: '接口返回了一条越权可读的内部记录。', output: JSON.stringify({ account_id: 'U-7842', nickname: 'migration-admin', role: 'service', private_note: flag }, null, 2) };
    }
    return { success: true, message: '接口请求成功，但当前记录没有敏感字段。继续枚举测试数据中的成员编号。', output: JSON.stringify({ account_id: value || 'U-1001', nickname: value === 'U-1001' ? 'guest_student' : 'unknown', role: 'student', private_note: null }, null, 2) };
  }

  if (challenge.slug === 'web-102') {
    try {
      const session = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as { uid?: string; role?: string };
      if (session.uid === '1001' && session.role === 'admin') {
        return { success: true, message: '控制台接受了被篡改的未签名令牌。', output: `HTTP/1.1 200 OK\nContent-Type: application/json\n\n${JSON.stringify({ panel: 'legacy-admin', audit_flag: flag }, null, 2)}` };
      }
      return { success: false, message: '控制台拒绝当前身份。请检查解码后的 JSON 字段。', output: 'HTTP/1.1 403 Forbidden\n{"error":"admin role required"}' };
    } catch {
      return { success: false, message: '令牌无法解析。它应当是 Base64 编码的 JSON。', output: 'HTTP/1.1 400 Bad Request\n{"error":"invalid legacy_session"}' };
    }
  }

  if (challenge.slug === 'pwn-101') {
    if (/^A{16}admin$/.test(value)) {
      return { success: true, message: 'role 字段已被相邻覆盖，服务进入管理员分支。', output: `[profile-service]\nname = "AAAAAAAAAAAAAAAA"\nrole = "admin"\naccess granted\n${flag}` };
    }
    const role = value.length > 16 ? value.slice(16, 24) : 'user';
    return { success: false, message: '服务已处理载荷，但没有进入管理员分支。请重新计算字段偏移。', output: `[profile-service]\nbytes copied: ${Buffer.byteLength(value)}\nrole = "${role || 'user'}"\naccess denied` };
  }

  return { success: false, message: '本题无需向靶场发送答案。请分析材料，恢复其中的 Flag 后回工作台提交。' };
}
