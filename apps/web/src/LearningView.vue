<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

type KnowledgeModule = {
  title: string;
  summary: string;
  topics: string[];
  level: '基础' | '进阶';
  duration: string;
};

type KnowledgeDomain = {
  id: string;
  code: string;
  icon: string;
  name: string;
  description: string;
  modules: KnowledgeModule[];
};

const domains: KnowledgeDomain[] = [
  {
    id: 'web', code: 'WEB', icon: '网', name: 'Web 安全',
    description: '从 HTTP 与浏览器安全模型出发，理解输入、身份、文件和服务端组件中的常见安全边界。',
    modules: [
      { title: '信息搜集', summary: '识别应用暴露面与公开线索，建立后续分析所需的目标画像。', topics: ['域名与子域', '技术栈识别', '目录与路由', '公开信息'], level: '基础', duration: '25 分钟' },
      { title: 'HTTP 请求', summary: '读懂请求与响应，区分用户可控数据和服务端生成数据。', topics: ['请求方法', '状态码', '请求头', '参数与正文', '代理分析'], level: '基础', duration: '35 分钟' },
      { title: '身份与会话', summary: '理解登录状态、Cookie 属性、Token 与访问控制之间的关系。', topics: ['Cookie', 'Session', 'JWT', '认证绕过', '权限校验'], level: '基础', duration: '40 分钟' },
      { title: '注入漏洞', summary: '理解不可信输入进入解释器后产生的语义变化。', topics: ['SQL 注入', '命令注入', 'NoSQL 注入', 'SSTI', '安全参数化'], level: '进阶', duration: '55 分钟' },
      { title: '文件安全', summary: '围绕上传、下载、路径和包含机制检查文件处理边界。', topics: ['文件上传', '路径穿越', '文件包含', '任意读取', '扩展名校验'], level: '进阶', duration: '45 分钟' },
      { title: '服务端漏洞', summary: '分析服务端主动访问、解析或反序列化外部数据的风险。', topics: ['SSRF', 'XXE', '反序列化', '业务逻辑', '信息泄露'], level: '进阶', duration: '60 分钟' },
      { title: '前端安全', summary: '从浏览器执行上下文理解脚本、来源与跨域策略。', topics: ['XSS', 'CSRF', 'CORS', 'DOM 安全', '原型链污染'], level: '进阶', duration: '50 分钟' },
      { title: 'API 安全', summary: '检查对象级授权、接口契约、速率限制和数据暴露。', topics: ['REST', 'GraphQL', '越权访问', '批量赋值', '接口枚举'], level: '进阶', duration: '45 分钟' },
      { title: '代码审计', summary: '沿数据流追踪输入、敏感操作和防护条件，形成可复核结论。', topics: ['入口与危险函数', '数据流', '框架特性', '依赖风险', '修复验证'], level: '进阶', duration: '70 分钟' },
    ],
  },
  {
    id: 'crypto', code: 'CRYPTO', icon: '密', name: '密码学',
    description: '掌握编码、古典密码和现代密码系统的基本性质，关注实现与使用方式而不只是算法名称。',
    modules: [
      { title: '编码与数制', summary: '识别常见表示形式，建立字节、文本和进制之间的转换意识。', topics: ['Base64', '十六进制', 'URL 编码', '字节序', '字符集'], level: '基础', duration: '25 分钟' },
      { title: '古典密码', summary: '通过频率、置换和替换关系理解基础密码分析。', topics: ['凯撒密码', '维吉尼亚', '仿射密码', '栅栏密码'], level: '基础', duration: '35 分钟' },
      { title: '对称密码', summary: '理解分组模式、初始向量、填充和密钥管理。', topics: ['AES', 'DES', 'ECB 与 CBC', 'CTR', 'Padding'], level: '进阶', duration: '50 分钟' },
      { title: '非对称密码', summary: '从数学关系理解公私钥、签名以及常见实现错误。', topics: ['RSA', 'ECC', '数字签名', '低指数', '共模攻击'], level: '进阶', duration: '65 分钟' },
      { title: '哈希与认证', summary: '区分哈希、消息认证码和口令存储的安全目标。', topics: ['Hash', 'HMAC', '碰撞', '盐值', '口令派生'], level: '基础', duration: '40 分钟' },
      { title: '数学基础', summary: '补齐模运算、素数、逆元等 CTF 密码题常用基础。', topics: ['模运算', '扩展欧几里得', '中国剩余定理', '有限域'], level: '进阶', duration: '60 分钟' },
    ],
  },
  {
    id: 'forensics', code: 'FORENSICS', icon: '证', name: '流量与取证',
    description: '围绕文件、网络、日志和内存中的可观察证据，建立时间线并验证事件假设。',
    modules: [
      { title: '网络协议', summary: '理解分层、寻址、连接和常见应用协议的基本行为。', topics: ['TCP/IP', 'DNS', 'HTTP', 'TLS', '端口与服务'], level: '基础', duration: '40 分钟' },
      { title: '流量分析', summary: '通过过滤、会话重组和时间顺序定位异常通信。', topics: ['PCAP', '显示过滤器', '追踪流', '时间线', '异常请求'], level: '基础', duration: '45 分钟' },
      { title: '文件取证', summary: '检查文件结构、签名、元数据和残留内容。', topics: ['文件头', '元数据', '文件恢复', '压缩包', '嵌套格式'], level: '基础', duration: '40 分钟' },
      { title: '隐写分析', summary: '从视觉、统计和文件结构异常中发现隐藏信息。', topics: ['图像通道', 'LSB', '音频频谱', '附加数据', '二维码'], level: '进阶', duration: '45 分钟' },
      { title: '内存取证', summary: '从内存镜像重建进程、模块、连接和可疑活动。', topics: ['进程树', '模块', '网络连接', '命令历史', '恶意注入'], level: '进阶', duration: '60 分钟' },
      { title: '日志与时间线', summary: '统一时间基准，关联多来源日志并解释事件先后。', topics: ['时间戳', 'Web 日志', '系统日志', '事件关联', 'IOC'], level: '进阶', duration: '50 分钟' },
    ],
  },
  {
    id: 'reverse', code: 'REVERSE', icon: '逆', name: '逆向工程',
    description: '结合静态信息和运行时行为理解程序逻辑，逐步验证而不是直接猜测功能。',
    modules: [
      { title: '程序与文件格式', summary: '认识可执行文件的段、节、导入和入口结构。', topics: ['PE', 'ELF', 'Mach-O', '段与节', '符号表'], level: '基础', duration: '45 分钟' },
      { title: '静态分析', summary: '从字符串、调用关系和反编译结果建立程序功能假设。', topics: ['Strings', '交叉引用', '控制流', '伪代码', '函数识别'], level: '基础', duration: '50 分钟' },
      { title: '动态调试', summary: '使用断点、寄存器和内存观察验证静态判断。', topics: ['断点', '单步执行', '寄存器', '调用栈', '内存映射'], level: '进阶', duration: '60 分钟' },
      { title: '汇编基础', summary: '理解数据移动、分支、调用约定和栈帧。', topics: ['x86/x64', 'ARM', '调用约定', '栈帧', '条件跳转'], level: '基础', duration: '55 分钟' },
      { title: '移动端逆向', summary: '分析 Android 包结构、DEX 字节码和本地库。', topics: ['APK', 'DEX', 'Smali', 'JNI', '签名校验'], level: '进阶', duration: '65 分钟' },
      { title: '保护与对抗', summary: '识别混淆、壳、反调试和完整性检查。', topics: ['加壳', '代码混淆', '反调试', '自修改', '去混淆'], level: '进阶', duration: '70 分钟' },
    ],
  },
  {
    id: 'pwn', code: 'PWN', icon: '二', name: '二进制安全',
    description: '从进程内存、程序装载和防护机制出发，理解漏洞成因以及安全修复原则。',
    modules: [
      { title: '体系结构基础', summary: '理解寄存器、内存、指令执行和系统调用。', topics: ['寄存器', '内存布局', '系统调用', '大小端', 'ABI'], level: '基础', duration: '55 分钟' },
      { title: '栈与边界', summary: '理解栈帧和长度校验缺失带来的内存破坏。', topics: ['栈帧', '缓冲区溢出', '返回地址', '边界检查'], level: '基础', duration: '50 分钟' },
      { title: '程序防护', summary: '识别现代二进制防护机制及其安全价值。', topics: ['NX', 'ASLR', 'PIE', 'Canary', 'RELRO'], level: '基础', duration: '40 分钟' },
      { title: 'ROP 与代码复用', summary: '理解受限环境下的控制流组合与调用链。', topics: ['Gadget', 'ROP', 'ret2libc', '栈迁移'], level: '进阶', duration: '70 分钟' },
      { title: '堆内存', summary: '理解动态内存分配器、对象生命周期和常见错误。', topics: ['Chunk', 'UAF', 'Double Free', '堆溢出', '分配器'], level: '进阶', duration: '75 分钟' },
      { title: '格式化字符串', summary: '理解格式串解释、信息泄露和非预期写入。', topics: ['格式占位符', '栈参数', '信息泄露', '任意写'], level: '进阶', duration: '50 分钟' },
    ],
  },
  {
    id: 'general', code: 'GENERAL', icon: '基', name: '通用能力',
    description: '补齐命令行、编程、数据处理和解题方法，让跨知识域分析更顺畅。',
    modules: [
      { title: 'Linux 与 Shell', summary: '熟悉文件、权限、管道、进程和常用命令。', topics: ['文件系统', '权限', '管道', '进程', 'SSH'], level: '基础', duration: '45 分钟' },
      { title: 'Python 脚本', summary: '用短脚本完成数据转换、协议交互和重复任务。', topics: ['字节处理', '正则表达式', '网络请求', '文件解析'], level: '基础', duration: '50 分钟' },
      { title: '数据表示', summary: '理解二进制、编码、序列化和常见文件数据结构。', topics: ['位与字节', '进制', '字符编码', '序列化', '结构化数据'], level: '基础', duration: '35 分钟' },
      { title: '解题方法', summary: '用观察、假设、验证和复盘代替无依据的尝试。', topics: ['任务边界', '最小假设', '证据记录', '失败分析', 'Writeup'], level: '基础', duration: '30 分钟' },
      { title: '开源情报', summary: '从公开且合法的信息源中定位线索并交叉验证。', topics: ['搜索语法', '域名信息', '历史页面', '图片溯源', '信息核验'], level: '进阶', duration: '45 分钟' },
      { title: '协作与复现', summary: '让命令、环境、版本和结论可被队友可靠复现。', topics: ['Git', '环境记录', '脚本化', '证据截图', '报告结构'], level: '基础', duration: '35 分钟' },
    ],
  },
];

type DomainGuide = {
  codeLanguage: string;
  code: string;
  flow: { title: string; detail: string }[];
  tools: { name: string; usage: string; command: string }[];
};

const domainGuides: Record<string, DomainGuide> = {
  web: {
    codeLanguage: 'HTTP / curl',
    code: "curl -i -s https://example.test/profile \\\n+  -H 'Cookie: session=YOUR_SESSION'\n\n# 只保留响应头，观察状态码与安全属性\ncurl -sI https://example.test/",
    flow: [
      { title: '建立请求基线', detail: '先完整记录一次正常请求，包括方法、路径、参数、请求头、正文与响应。' },
      { title: '标记信任边界', detail: '区分浏览器可控内容、服务端生成内容、身份凭据和外部依赖数据。' },
      { title: '单变量对比', detail: '每次只修改一个字段，对比状态码、长度、跳转和业务结果。' },
      { title: '整理证据', detail: '保存原始请求、响应差异与结论，避免把偶发现象当成漏洞。' },
    ],
    tools: [
      { name: '浏览器开发者工具', usage: '查看网络请求、存储、DOM 与前端脚本。', command: 'F12 → Network / Application / Sources' },
      { name: 'Burp Suite', usage: '在授权环境中拦截、重放和对比 HTTP 请求。', command: 'Proxy → HTTP history → Send to Repeater' },
      { name: 'curl', usage: '构造最小请求并保留可复现命令。', command: 'curl -i -X GET https://example.test/' },
    ],
  },
  crypto: {
    codeLanguage: 'Python',
    code: "import base64\n\nraw = bytes.fromhex('534743')\nprint(raw)\nprint(base64.b64decode(b'U2VjdXJpdHk=').decode())\n\n# 始终明确：输入编码 → 字节 → 输出编码",
    flow: [
      { title: '识别表示形式', detail: '先判断输入是文本、十六进制、Base64、整数还是原始字节。' },
      { title: '确认算法条件', detail: '记录密钥、随机数、模式、填充和消息长度等已知条件。' },
      { title: '构造最小样例', detail: '用短输入验证每一步转换，避免在长密文中叠加错误。' },
      { title: '验证完整性', detail: '通过重新编码、解密后结构或校验值确认结果，而不是只看可读性。' },
    ],
    tools: [
      { name: 'CyberChef', usage: '快速组合编码、解码与字节转换流程。', command: 'Input → Recipe → Output' },
      { name: 'Python', usage: '精确控制整数、字节和编码转换。', command: 'python -c "import base64; print(base64.b64decode(...))"' },
      { name: 'OpenSSL', usage: '检查证书、摘要和标准密码算法参数。', command: 'openssl dgst -sha256 sample.bin' },
    ],
  },
  forensics: {
    codeLanguage: 'tshark / shell',
    code: "# 查看协议层级\ntshark -r capture.pcap -q -z io,phs\n\n# 提取 DNS 查询时间线\ntshark -r capture.pcap -Y 'dns.flags.response == 0' \\\n+  -T fields -e frame.time -e ip.src -e dns.qry.name",
    flow: [
      { title: '保护原始证据', detail: '记录来源、大小与哈希，只在副本上进行解析。' },
      { title: '识别文件与时间', detail: '确认真实格式、时区、时间戳精度和采集范围。' },
      { title: '建立事件时间线', detail: '将网络、文件、日志或内存中的事件按统一时间基准排列。' },
      { title: '交叉验证', detail: '至少使用两个独立证据支持关键判断，并记录无法解释的空白。' },
    ],
    tools: [
      { name: 'Wireshark', usage: '过滤协议、重组会话并检查字段细节。', command: 'Statistics → Protocol Hierarchy / Conversations' },
      { name: 'ExifTool', usage: '批量读取文件类型、时间和设备元数据。', command: 'exiftool -G -a -s sample.jpg' },
      { name: 'Volatility 3', usage: '从内存镜像提取进程、连接和模块信息。', command: 'python vol.py -f memory.raw windows.pslist' },
    ],
  },
  reverse: {
    codeLanguage: 'shell',
    code: "file ./sample\nsha256sum ./sample\nstrings -a -n 6 ./sample | head\nreadelf -h -S -s ./sample\n\n# 先静态观察，再决定是否进入调试器",
    flow: [
      { title: '确认样本属性', detail: '计算哈希并识别文件格式、架构、位数、端序和保护信息。' },
      { title: '静态建立假设', detail: '检查字符串、导入函数、入口点、交叉引用与控制流。' },
      { title: '动态验证路径', detail: '在隔离环境使用断点和内存观察验证关键分支。' },
      { title: '还原核心逻辑', detail: '将伪代码整理为输入、处理、输出和异常路径。' },
    ],
    tools: [
      { name: 'Ghidra', usage: '反汇编、反编译并追踪函数交叉引用。', command: 'Import → Auto Analyze → Decompiler' },
      { name: 'GDB', usage: '观察寄存器、内存、调用栈和执行分支。', command: 'gdb ./sample → start → disassemble main' },
      { name: 'JADX', usage: '浏览 Android DEX 代码、资源和调用关系。', command: 'jadx-gui sample.apk' },
    ],
  },
  pwn: {
    codeLanguage: 'Python / pwntools',
    code: "from pwn import *\n\ncontext.binary = elf = ELF('./sample', checksec=True)\nio = process(elf.path)\nio.sendlineafter(b'> ', b'test')\nprint(io.recvline())\nio.close()",
    flow: [
      { title: '识别架构与防护', detail: '确认位数、端序、链接方式以及 Canary、NX、PIE、RELRO。' },
      { title: '定位错误边界', detail: '从输入长度、对象生命周期、格式化参数和整数计算寻找根因。' },
      { title: '构造可控复现', detail: '使用最小输入稳定触发问题，记录崩溃位置和寄存器状态。' },
      { title: '解释并修复', detail: '说明数据如何影响控制流，同时给出长度、生命周期或接口层修复。' },
    ],
    tools: [
      { name: 'checksec', usage: '快速查看二进制启用的安全防护。', command: 'checksec --file=./sample' },
      { name: 'GDB + pwndbg', usage: '调试崩溃、内存布局和调用过程。', command: 'gdb ./sample' },
      { name: 'pwntools', usage: '编写可重复的进程交互与数据打包脚本。', command: 'python3 -m pip install --upgrade pwntools' },
    ],
  },
  general: {
    codeLanguage: 'Python / shell',
    code: "# 保存证据哈希\nsha256sum evidence.bin\n\n# 用 Python 同时查看字节与文本\npython - <<'PY'\ndata = open('evidence.bin', 'rb').read(32)\nprint(data.hex())\nprint(repr(data))\nPY",
    flow: [
      { title: '明确问题', detail: '写下输入、预期输出、已知条件和不可越过的任务边界。' },
      { title: '拆分最小步骤', detail: '把复杂任务拆成可单独验证的数据处理或命令步骤。' },
      { title: '脚本化重复操作', detail: '固定环境、参数和输出，使过程能够再次执行。' },
      { title: '形成复盘', detail: '记录成功证据、失败原因、版本信息和下一步假设。' },
    ],
    tools: [
      { name: 'Shell', usage: '组合文件、文本、进程和管道操作。', command: 'file sample && sha256sum sample' },
      { name: 'Python', usage: '快速编写可复现的数据处理脚本。', command: 'python3 script.py input.bin' },
      { name: 'Git', usage: '保存知识笔记、脚本版本和实验差异。', command: 'git diff -- notes/ scripts/' },
    ],
  },
};

type ModuleRecipe = Pick<DomainGuide, 'codeLanguage' | 'code' | 'tools'>;

const moduleRecipes: Record<string, ModuleRecipe> = {
  'web/信息搜集': {
    codeLanguage: 'DNS / HTTP',
    code: "dig example.test A +short\ndig example.test MX +short\ncurl -sI https://example.test/ | sed -n '1,12p'",
    tools: [
      { name: 'dig', usage: '查询题目域名的 DNS 记录并核对解析关系。', command: 'dig example.test A +noall +answer; dig example.test AAAA +noall +answer; dig example.test MX +noall +answer' },
      { name: 'WhatWeb', usage: '从响应特征识别本地靶场使用的技术栈。', command: 'whatweb --no-errors https://example.test/' },
    ],
  },
  'web/HTTP 请求': {
    codeLanguage: 'curl / jq',
    code: "curl -sS -D response.headers -o response.json \\\n  -X POST https://example.test/api/profile \\\n  -H 'Content-Type: application/json' -d '{\"name\":\"student\"}'\njq . response.json",
    tools: [
      { name: 'curl', usage: '构造最小 HTTP 请求并分别保存响应头与正文。', command: 'curl -v --request OPTIONS https://example.test/api/' },
      { name: 'HTTPie', usage: '用更易读的语法观察 JSON 接口交互。', command: 'https POST example.test/api/profile name=student' },
    ],
  },
  'web/身份与会话': {
    codeLanguage: 'curl',
    code: "curl -sS -c cookies.txt https://example.test/login -o /dev/null\ncurl -sS -b cookies.txt https://example.test/profile\nawk '/session/ {print $1, $5, $6, $7}' cookies.txt",
    tools: [
      { name: '浏览器 Application 面板', usage: '核对 Cookie 的作用域、期限及安全属性。', command: 'DevTools → Application → Cookies' },
      { name: 'jwt-cli', usage: '只解析本地题目 Token 的头部和载荷。', command: 'jwt decode "$(cat token.txt)" --json' },
    ],
  },
  'web/注入漏洞': {
    codeLanguage: 'Python / Semgrep',
    code: "import sqlite3\n\ndb = sqlite3.connect(':memory:')\nname = 'student'\nrow = db.execute('SELECT ? AS username', (name,)).fetchone()\nprint(row)",
    tools: [
      { name: 'Semgrep', usage: '扫描源码中未经参数化的解释器调用。', command: 'semgrep scan --config=p/sql-injection ./src' },
      { name: 'Bandit', usage: '检查 Python 代码中的命令执行和字符串 SQL 风险。', command: 'bandit -r ./app -f screen' },
    ],
  },
  'web/文件安全': {
    codeLanguage: 'shell / Python',
    code: "file upload.bin\nsha256sum upload.bin\npython -c \"from pathlib import Path; print(Path('uploads/a.txt').resolve())\"",
    tools: [
      { name: 'file', usage: '根据魔数识别文件真实类型，而非只看扩展名。', command: 'file --mime-type ./uploads/sample.dat' },
      { name: 'zipinfo', usage: '在解压前检查压缩包成员及潜在异常路径。', command: 'zipinfo -1 attachment.zip | sed -n 1,40p' },
    ],
  },
  'web/服务端漏洞': {
    codeLanguage: 'Python / XML',
    code: "from defusedxml.ElementTree import fromstring\n\nxml = b'<profile><name>student</name></profile>'\nroot = fromstring(xml)\nprint(root.findtext('name'))",
    tools: [
      { name: 'OWASP ZAP', usage: '对本地授权服务执行被动基线检查。', command: 'zap-baseline.py -t http://127.0.0.1:8080 -r zap-report.html' },
      { name: 'jq', usage: '检查服务端返回数据中意外暴露的字段。', command: "jq 'paths(scalars) as $p | [$p, getpath($p)]' response.json" },
    ],
  },
  'web/前端安全': {
    codeLanguage: 'JavaScript',
    code: "const output = document.querySelector('#output')\nconst value = new URL(location.href).searchParams.get('name') ?? ''\noutput.textContent = value",
    tools: [
      { name: 'ESLint', usage: '发现前端代码中的危险 DOM 写入和不安全模式。', command: 'npx eslint ./src --format stylish' },
      { name: 'npm audit', usage: '检查前端依赖的已知安全公告。', command: 'npm audit --omit=dev --audit-level=high' },
    ],
  },
  'web/API 安全': {
    codeLanguage: 'OpenAPI / curl',
    code: "curl -sS https://example.test/openapi.json -o openapi.json\njq '.paths | keys[]' openapi.json\ncurl -sS -X OPTIONS -i https://example.test/api/users",
    tools: [
      { name: 'Schemathesis', usage: '根据本地 OpenAPI 契约验证接口响应与边界。', command: 'schemathesis run http://127.0.0.1:8080/openapi.json' },
      { name: 'jq', usage: '枚举接口响应中的字段结构并定位多余数据。', command: "jq -r 'paths | map(tostring) | join(\".\")' api-response.json" },
    ],
  },
  'web/代码审计': {
    codeLanguage: 'ripgrep / Git',
    code: "rg -n 'exec\\(|eval\\(|innerHTML|deserialize' ./src\ngit log -p -- ./src/auth\ngit diff --check",
    tools: [
      { name: 'ripgrep', usage: '快速定位输入入口、危险函数和安全检查。', command: "rg -n 'request|query|execute|authorize' ./src" },
      { name: 'Semgrep', usage: '用语言规则补充人工数据流审计。', command: 'semgrep scan --config=auto --error ./src' },
    ],
  },

  'crypto/编码与数制': {
    codeLanguage: 'xxd / base64',
    code: "printf 'Security' | xxd -p\nprintf 'U2VjdXJpdHk=' | base64 -d\nprintf '%s' 'E4BDA0E5A5BD' | xxd -r -p",
    tools: [
      { name: 'xxd', usage: '在原始字节与十六进制文本之间转换。', command: 'xxd -g 1 -l 64 sample.bin' },
      { name: 'iconv', usage: '显式指定源字符集和目标字符集。', command: 'iconv -f GB18030 -t UTF-8 input.txt -o output.txt' },
    ],
  },
  'crypto/古典密码': {
    codeLanguage: 'Python',
    code: "text = 'KHOOR'\nfor shift in range(26):\n    plain = ''.join(chr((ord(c)-65-shift)%26+65) for c in text)\n    print(shift, plain)",
    tools: [
      { name: 'CyberChef', usage: '组合替换、移位和频率分析配方。', command: 'Recipe: ROT13 → Frequency distribution' },
      { name: 'pycipher', usage: '在短脚本中复现经典密码变换。', command: "python -c \"from pycipher import Caesar; print(Caesar(3).decipher('KHOOR'))\"" },
    ],
  },
  'crypto/对称密码': {
    codeLanguage: 'OpenSSL',
    code: "printf 'known plaintext' > plain.txt\nopenssl enc -aes-256-cbc -salt -pbkdf2 -in plain.txt -out cipher.bin\nopenssl enc -d -aes-256-cbc -pbkdf2 -in cipher.bin -out recovered.txt",
    tools: [
      { name: 'OpenSSL enc', usage: '用明确的算法、模式、盐和 KDF 参数复现实验。', command: 'openssl enc -aes-128-ctr -pbkdf2 -P -salt' },
      { name: 'hexdump', usage: '比较不同分组或计数器模式下的字节分布。', command: 'hexdump -C cipher.bin | head -n 8' },
    ],
  },
  'crypto/非对称密码': {
    codeLanguage: 'OpenSSL / Python',
    code: "openssl pkey -pubin -in public.pem -text -noout\nopenssl dgst -sha256 -verify public.pem -signature message.sig message.txt\npython -c \"print(pow(7, 13, 33))\"",
    tools: [
      { name: 'OpenSSL pkey', usage: '检查公钥类型、位数和公开参数。', command: 'openssl pkey -pubin -in public.pem -pubcheck -noout' },
      { name: 'SageMath', usage: '验证模运算、有限域与曲线计算。', command: 'sage -c "print(inverse_mod(17, 3120))"' },
    ],
  },
  'crypto/哈希与认证': {
    codeLanguage: 'Python / hash utilities',
    code: "sha256sum message.bin\npython -c \"import hmac,hashlib; print(hmac.new(b'key',b'msg',hashlib.sha256).hexdigest())\"\nprintf 'password' | argon2 somesalt -id -t 3 -m 16",
    tools: [
      { name: 'hashdeep', usage: '生成和核验一批证据文件的摘要清单。', command: 'hashdeep -c sha256 -r ./evidence > manifest.txt' },
      { name: 'argon2', usage: '观察口令派生中的盐、时间和内存成本。', command: "echo -n 'demo-password' | argon2 unique-salt -id -e" },
    ],
  },
  'crypto/数学基础': {
    codeLanguage: 'Python',
    code: "from math import gcd\n\na, modulus = 17, 3120\nprint(gcd(a, modulus))\nprint(pow(a, -1, modulus))\nprint(pow(5, 117, 19))",
    tools: [
      { name: 'Python bigint', usage: '直接验证大整数模幂、最大公约数和逆元。', command: "python -c \"from math import gcd; print(gcd(240,46), pow(17,-1,3120))\"" },
      { name: 'PARI/GP', usage: '交叉核验数论计算和因式分解结果。', command: "gp -q <<<'factor(1234567891011)'" },
    ],
  },

  'forensics/网络协议': {
    codeLanguage: 'tshark',
    code: "tshark -G protocols | sed -n '1,20p'\ntshark -r capture.pcap -q -z io,phs\ntshark -r capture.pcap -T fields -e frame.number -e _ws.col.Protocol | head",
    tools: [
      { name: 'tshark Protocol Hierarchy', usage: '统计抓包中的协议分层及流量占比。', command: 'tshark -r capture.pcap -q -z io,phs' },
      { name: 'capinfos', usage: '查看抓包时长、封装类型、包数和时间范围。', command: 'capinfos -a -e -c -u capture.pcap' },
    ],
  },
  'forensics/流量分析': {
    codeLanguage: 'tshark',
    code: "tshark -r session.pcap -Y 'http.request' \\\n  -T fields -e frame.time_relative -e ip.src -e http.request.method -e http.request.uri\ntshark -r session.pcap -q -z conv,tcp",
    tools: [
      { name: 'Wireshark', usage: '使用显示过滤器并重组可疑会话。', command: 'Follow → TCP Stream → Show data as UTF-8' },
      { name: 'tcpflow', usage: '按连接导出 TCP 双向数据用于离线核对。', command: 'tcpflow -r session.pcap -o ./flows' },
    ],
  },
  'forensics/文件取证': {
    codeLanguage: 'shell',
    code: "sha256sum disk-image.bin\nfile --keep-going evidence.dat\nbinwalk evidence.dat\nexiftool -time:all -G -a evidence.dat",
    tools: [
      { name: 'binwalk', usage: '识别文件内部嵌套签名与数据偏移。', command: 'binwalk --signature --term evidence.dat' },
      { name: 'Foremost', usage: '在证据副本中按文件签名恢复内容。', command: 'foremost -i disk-copy.img -o recovered-files' },
    ],
  },
  'forensics/隐写分析': {
    codeLanguage: 'image / audio tools',
    code: "pngcheck -v image.png\nzsteg -a image.png\nffmpeg -i audio.wav -lavfi showspectrumpic=s=1600x900 spectrum.png",
    tools: [
      { name: 'zsteg', usage: '枚举 PNG/BMP 的位平面、通道和字节顺序。', command: 'zsteg --all --limit 64b suspect.png' },
      { name: 'Steghide', usage: '检查 JPEG 或音频容器中的嵌入信息。', command: 'steghide info carrier.jpg' },
    ],
  },
  'forensics/内存取证': {
    codeLanguage: 'Volatility 3',
    code: "python vol.py -f memory.raw windows.info\npython vol.py -f memory.raw windows.pslist\npython vol.py -f memory.raw windows.netscan",
    tools: [
      { name: 'Volatility psxview', usage: '从多个枚举视角交叉检查隐藏进程。', command: 'python vol.py -f memory.raw windows.psxview' },
      { name: 'Volatility malfind', usage: '定位进程中权限与内容异常的内存区域。', command: 'python vol.py -f memory.raw windows.malfind' },
    ],
  },
  'forensics/日志与时间线': {
    codeLanguage: 'jq / Plaso',
    code: "jq -r '[.timestamp,.source,.event] | @tsv' events.jsonl | sort\nlog2timeline.py timeline.plaso ./evidence\npsort.py -o l2tcsv timeline.plaso > timeline.csv",
    tools: [
      { name: 'Plaso', usage: '从多类文件与日志中生成统一事件时间线。', command: 'log2timeline.py --storage-file timeline.plaso evidence-copy/' },
      { name: 'Chainsaw', usage: '用 Sigma 规则筛查离线 Windows 事件日志。', command: 'chainsaw hunt ./evtx -s ./sigma --mapping mappings/sigma-event-logs-all.yml' },
    ],
  },

  'reverse/程序与文件格式': {
    codeLanguage: 'binutils',
    code: "file ./sample\nreadelf -h -S -l ./sample\nobjdump -p ./sample | sed -n '1,80p'",
    tools: [
      { name: 'readelf', usage: '查看 ELF 头、节表、程序头和动态信息。', command: 'readelf --all --wide ./sample > elf-structure.txt' },
      { name: 'PE-bear', usage: '以结构视图检查 PE 头、节和导入表。', command: 'PE-bear.exe sample.exe' },
    ],
  },
  'reverse/静态分析': {
    codeLanguage: 'strings / radare2',
    code: "strings -a -n 6 ./sample | sort -u\nr2 -A -q -c 'afl; axt @ sym.main; pdf @ sym.main' ./sample\nnm -C ./sample | head",
    tools: [
      { name: 'Ghidra', usage: '通过反编译器、调用图和交叉引用还原逻辑。', command: 'File → Import → Auto Analyze → Symbol Tree' },
      { name: 'radare2', usage: '在命令行生成函数列表并查看关键函数。', command: "r2 -A -q -c 'afl; s main; pdf' ./sample" },
    ],
  },
  'reverse/动态调试': {
    codeLanguage: 'GDB',
    code: "gdb -q ./sample\n(gdb) start\n(gdb) break *main\n(gdb) info registers\n(gdb) x/16gx $sp",
    tools: [
      { name: 'GDB', usage: '用断点、观察点和单步执行验证控制流。', command: 'gdb -q -ex start -ex "layout asm" ./sample' },
      { name: 'strace', usage: '记录 Linux 程序与内核交互的系统调用。', command: 'strace -f -o syscalls.log ./sample' },
    ],
  },
  'reverse/汇编基础': {
    codeLanguage: 'compiler / objdump',
    code: "cc -O0 -fno-omit-frame-pointer -S demo.c -o demo.s\ncc -O0 demo.c -o demo\nobjdump -d -M intel demo | sed -n '/<main>:/,/^$/p'",
    tools: [
      { name: 'Compiler Explorer', usage: '对比不同架构和优化级别生成的汇编。', command: 'godbolt.org → Source / Compiler / Output' },
      { name: 'objdump', usage: '按 Intel 或 AT&T 语法反汇编本地样例。', command: 'objdump -d -M intel --disassemble=main ./demo' },
    ],
  },
  'reverse/移动端逆向': {
    codeLanguage: 'Android tools',
    code: "apktool d sample.apk -o decoded-apk\njadx -d decompiled-src sample.apk\napksigner verify --verbose --print-certs sample.apk",
    tools: [
      { name: 'JADX', usage: '浏览 DEX 反编译代码并搜索类、常量和调用。', command: 'jadx-gui --show-bad-code sample.apk' },
      { name: 'apktool', usage: '解码资源、Manifest 和 Smali 文件。', command: 'apktool decode --force sample.apk --output apk-tree' },
    ],
  },
  'reverse/保护与对抗': {
    codeLanguage: 'protection checks',
    code: "checksec --file=./sample\nstrings -a ./sample | grep -Ei 'upx|packer|debug'\nupx -t ./sample 2>/dev/null || true",
    tools: [
      { name: 'Detect It Easy', usage: '识别编译器、链接器、壳和异常节特征。', command: 'diec --json ./sample > detection.json' },
      { name: 'UPX', usage: '验证样本是否为标准 UPX 格式而不直接执行。', command: 'upx --test ./sample' },
    ],
  },

  'pwn/体系结构基础': {
    codeLanguage: 'ELF / assembly',
    code: "readelf -h ./sample | grep -E 'Class|Data|Machine|Entry'\nobjdump -d -M intel --disassemble=main ./sample\nstrace -c ./sample",
    tools: [
      { name: 'readelf', usage: '确认位数、端序、机器类型与入口地址。', command: "readelf --file-header ./sample | sed -n '1,22p'" },
      { name: 'strace', usage: '统计样例执行期间调用的系统接口。', command: 'strace -f -yy -o trace.log ./sample' },
    ],
  },
  'pwn/栈与边界': {
    codeLanguage: 'C / sanitizers',
    code: "cc -g -O0 -fsanitize=address -fno-omit-frame-pointer demo.c -o demo-asan\nprintf 'AAAA' | ./demo-asan\ngdb -q -ex 'run < input.txt' -ex bt ./demo-asan",
    tools: [
      { name: 'AddressSanitizer', usage: '在源码可用时定位越界访问的准确位置。', command: 'clang -g -fsanitize=address,undefined demo.c -o demo-safecheck' },
      { name: 'GDB backtrace', usage: '记录崩溃时的调用栈、寄存器和栈帧。', command: 'gdb -q -ex run -ex bt -ex "info frame" ./demo' },
    ],
  },
  'pwn/程序防护': {
    codeLanguage: 'checksec / ELF',
    code: "checksec --file=./sample\nreadelf -W -l ./sample | grep GNU_STACK\nreadelf -d ./sample | grep -E 'BIND_NOW|FLAGS'",
    tools: [
      { name: 'checksec', usage: '汇总 Canary、NX、PIE、RELRO 等保护状态。', command: 'checksec --format=json --file=./sample | jq .' },
      { name: 'pax-utils', usage: '批量核对目录内 ELF 的安全属性。', command: 'scanelf -e -q -R ./binaries' },
    ],
  },
  'pwn/ROP 与代码复用': {
    codeLanguage: 'ROP inspection',
    code: "ROPgadget --binary ./sample --only 'pop|ret' | head -n 20\nreadelf -Ws ./sample | grep -E ' puts| read| write'\nobjdump -d ./sample | grep -n 'ret' | head",
    tools: [
      { name: 'ROPgadget', usage: '在本地教学二进制中枚举短指令片段。', command: "ROPgadget --binary ./sample --depth 5 --only 'pop|ret'" },
      { name: 'ropper', usage: '按指令类型和地址条件检索教学样例。', command: 'ropper --file ./sample --search "pop rdi; ret"' },
    ],
  },
  'pwn/堆内存': {
    codeLanguage: 'Valgrind / GDB',
    code: "valgrind --tool=memcheck --leak-check=full ./heap-demo\nMALLOC_PERTURB_=165 ./heap-demo\ngdb -q -ex 'break free' -ex run ./heap-demo",
    tools: [
      { name: 'Valgrind Memcheck', usage: '发现无效读写、重复释放和内存泄漏。', command: 'valgrind --track-origins=yes --show-leak-kinds=all ./heap-demo' },
      { name: 'heaptrack', usage: '记录对象分配、释放和内存占用演变。', command: 'heaptrack ./heap-demo && heaptrack_gui heaptrack.heap-demo.*.gz' },
    ],
  },
  'pwn/格式化字符串': {
    codeLanguage: 'compiler warnings',
    code: "cc -Wall -Wextra -Wformat=2 -Wformat-security demo.c -o demo\nclang-tidy demo.c --checks='cert-err33-c' --\nprintf '%s\\n' 'fixed format string'",
    tools: [
      { name: 'GCC format warnings', usage: '在编译阶段阻止非字面量格式串与参数错配。', command: 'gcc -Werror=format-security -Wformat=2 -c source.c' },
      { name: 'CodeQL', usage: '从数据流角度定位可控格式字符串。', command: 'codeql database analyze db cpp-security-and-quality.qls --format=sarif-latest' },
    ],
  },

  'general/Linux 与 Shell': {
    codeLanguage: 'shell',
    code: "find ./workspace -maxdepth 2 -type f -printf '%M %s %p\\n'\nps -eo pid,ppid,user,stat,cmd --sort=ppid\nss -lntup",
    tools: [
      { name: 'find', usage: '按类型、权限、大小和时间筛选本地文件。', command: 'find . -type f -mtime -1 -size +1k -print0 | xargs -0 file' },
      { name: 'lsof', usage: '关联进程、文件描述符和监听端口。', command: 'lsof -nP -iTCP -sTCP:LISTEN' },
    ],
  },
  'general/Python 脚本': {
    codeLanguage: 'Python',
    code: "from pathlib import Path\nimport argparse\n\nparser = argparse.ArgumentParser()\nparser.add_argument('input', type=Path)\nargs = parser.parse_args()\nprint(args.input.read_bytes()[:32].hex())",
    tools: [
      { name: 'venv', usage: '为分析脚本创建隔离且可记录的依赖环境。', command: 'python3 -m venv .venv && . .venv/bin/activate' },
      { name: 'pytest', usage: '为数据转换和解析逻辑补充最小测试。', command: 'python3 -m pytest -q tests/test_parser.py' },
    ],
  },
  'general/数据表示': {
    codeLanguage: 'xxd / jq',
    code: "xxd -g 1 -l 64 sample.bin\nprintf '01000000' | xxd -r -p | od -An -tu4\njq -S -c . record.json",
    tools: [
      { name: 'xxd', usage: '按字节偏移查看二进制结构并往返转换。', command: 'xxd -c 16 -g 1 sample.bin > sample.hex' },
      { name: 'jq', usage: '规范化 JSON 后比较字段与数据类型。', command: 'jq --sort-keys . input.json > normalized.json' },
    ],
  },
  'general/解题方法': {
    codeLanguage: 'shell / notes',
    code: "sha256sum attachment.bin | tee evidence.sha256\ndate -u +'%Y-%m-%dT%H:%M:%SZ' | tee -a investigation.log\nprintf '%s\\n' '假设：' '证据：' '结论：' >> investigation.log",
    tools: [
      { name: 'script', usage: '完整记录终端输入与输出，便于复盘。', command: 'script --timing=session.time session.typescript' },
      { name: 'diff', usage: '比较单变量实验前后的文本结果。', command: 'diff -u baseline.txt changed.txt | tee comparison.diff' },
    ],
  },
  'general/开源情报': {
    codeLanguage: 'DNS / metadata',
    code: "whois example.test | sed -n '1,40p'\ndig example.test TXT +short\ncurl -sS 'https://web.archive.org/cdx/search/cdx?url=example.test&output=json&limit=5'",
    tools: [
      { name: 'whois', usage: '查询公开注册信息并记录数据来源和时间。', command: 'whois -H example.test | grep -Ei "registrar|creation|expiry"' },
      { name: 'ExifTool', usage: '读取自有或题目图片中的时间、设备和位置元数据。', command: 'exiftool -G1 -a -time:all -gps:all clue.jpg' },
    ],
  },
  'general/协作与复现': {
    codeLanguage: 'Git / environment',
    code: "git status --short\ngit diff -- scripts/ notes/\nnode --version && python3 --version\npython3 -m pip freeze > requirements.lock",
    tools: [
      { name: 'Git', usage: '以小提交保存脚本、笔记和结论的演变。', command: 'git diff --stat && git log --oneline -5' },
      { name: 'Make', usage: '把准备、分析和验证过程固化为统一入口。', command: 'make clean analyze verify' },
    ],
  },
};

function createModuleGuide(domain: KnowledgeDomain, module: KnowledgeModule): DomainGuide {
  const recipe = moduleRecipes[`${domain.id}/${module.title}`] ?? domainGuides[domain.id];
  const topics = module.topics;
  const lastTopic = topics[topics.length - 1];
  return {
    ...recipe,
    flow: [
      { title: `界定“${topics[0]}”`, detail: `从“${module.title}”的目标出发，明确 ${topics[0]} 的输入、输出、适用范围与限制条件。` },
      { title: `检查“${topics[1] ?? topics[0]}”`, detail: `围绕 ${topics[1] ?? topics[0]} 收集原始数据，区分直接观察、工具推断和尚未验证的假设。` },
      { title: `关联“${topics[2] ?? lastTopic}”`, detail: `把 ${topics[2] ?? lastTopic} 与 ${topics.slice(0, 2).join('、')} 的结果放在同一上下文中交叉核对。` },
      { title: `验证“${lastTopic}”`, detail: `使用本专题的独立命令验证 ${lastTopic}，保存版本、参数、输出和最终结论。` },
    ],
  };
}

const route = useRoute();
const requestedDomain = String(route.query.domain ?? 'web');
const activeDomainId = ref(domains.some((domain) => domain.id === requestedDomain) ? requestedDomain : 'web');
const query = ref('');
const copied = ref(false);
const router = useRouter();

const activeDomain = computed(() => domains.find((domain) => domain.id === activeDomainId.value) ?? domains[0]);
const visibleModules = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return activeDomain.value.modules;
  return activeDomain.value.modules.filter((module) => `${module.title} ${module.summary} ${module.topics.join(' ')}`.toLowerCase().includes(keyword));
});
const articleDomain = computed(() => domains.find((domain) => domain.id === String(route.query.domain ?? '')));
const articleModule = computed(() => articleDomain.value?.modules.find((module) => module.title === String(route.query.topic ?? '')));
const articleGuide = computed(() => articleDomain.value && articleModule.value ? createModuleGuide(articleDomain.value, articleModule.value) : undefined);
const articleCode = computed(() => articleGuide.value?.code.replace(/\n\+\s*/g, '\n  ') ?? '');
const relatedModules = computed(() => articleDomain.value?.modules.filter((module) => module.title !== articleModule.value?.title).slice(0, 4) ?? []);
const learningGoals = computed(() => {
  if (!articleModule.value || !articleGuide.value) return [];
  const topics = articleModule.value.topics;
  const tools = articleGuide.value.tools.map((tool) => tool.name).join('、');
  return [
    `掌握“${articleModule.value.title}”中的 ${topics.slice(0, 2).join('、')}，能够说明其适用范围与限制。`,
    `围绕 ${topics.slice(2, 4).join('、') || topics[0]} 建立可复核的分析流程，区分事实、推断和待验证项。`,
    `能够使用 ${tools} 完成本专题的最小验证，并保存关键参数与输出。`,
  ];
});

const domainReadingFocus: Record<string, string> = {
  web: '从请求与响应的数据流出发，确认浏览器、代理和服务端之间的信任边界，并观察输入如何影响输出。',
  crypto: '先识别数据表示、算法结构与密钥材料，再判断实现是否满足算法成立所需的安全前提。',
  forensics: '优先保护证据完整性，围绕时间线、协议字段和文件结构提取可复核的异常线索。',
  reverse: '结合静态结构与运行时行为理解程序语义，持续记录关键分支、数据变换和调用关系。',
  pwn: '围绕输入边界、内存布局与防护机制建立模型，再用最小样例验证每个判断。',
  general: '明确输入、处理过程与预期输出，保留命令、环境和结果，让整个过程可以重复验证。',
};

function selectDomain(id: string) {
  activeDomainId.value = id;
  query.value = '';
}

function openModule(module: KnowledgeModule, domainId = activeDomain.value.id) {
  void router.push({ path: '/learning', query: { domain: domainId, topic: module.title } });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function topicExplanation(topic: string, index: number) {
  const focus = domainReadingFocus[articleDomain.value?.id ?? 'general'];
  const nextTopic = articleModule.value?.topics[index + 1] ?? articleModule.value?.topics[0];
  const angles = [
    `先明确它在“${articleModule.value?.title}”中的作用与边界。${focus}`,
    `重点区分可直接观察的事实和需要验证的推断，并与“${nextTopic}”建立关联。${focus}`,
    `从输入条件、关键处理和输出特征三个层面整理证据，再用最小样例复核。${focus}`,
    `记录常见误区、失败表现和判断依据，避免只凭单一工具结果得出结论。${focus}`,
    `把它作为本专题的验证环节，保留环境、参数和输出，确保结论能够复现。${focus}`,
  ];
  return `“${topic}”：${angles[index % angles.length]}`;
}

function topicChecks(topic: string, index: number) {
  const topics = articleModule.value?.topics ?? [];
  const previous = topics[index - 1] ?? topics[topics.length - 1];
  const next = topics[index + 1] ?? topics[0];
  return [
    `为“${topic}”写下可直接观察的输入、输出和边界条件。`,
    `对比“${previous}”与“${topic}”提供的证据，标记两者能够互相印证或冲突的位置。`,
    `使用“${next}”作为后续检查方向，并记录当前结论仍依赖哪些前提。`,
  ];
}

function closeArticle() {
  void router.push('/learning');
}

async function copyExample() {
  if (!articleGuide.value) return;
  try {
    await navigator.clipboard.writeText(articleCode.value);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1400);
  } catch { copied.value = false; }
}
</script>

<template>
  <main v-if="articleDomain && articleModule && articleGuide" class="knowledge-doc-page">
    <button type="button" class="doc-back" @click="closeArticle">← 返回 {{ articleDomain.name }} 知识目录</button>

    <div class="doc-layout">
      <article class="doc-content">
        <header class="doc-heading">
          <h1>{{ articleModule.title }}</h1>
          <blockquote>
            {{ articleModule.summary }}
            <small>{{ articleModule.level }} · 建议阅读 {{ articleModule.duration }}</small>
          </blockquote>
        </header>

        <section id="learning-goals" class="doc-section">
          <h2>学习目标</h2>
          <ul>
            <li v-for="goal in learningGoals" :key="goal">{{ goal }}</li>
          </ul>
        </section>

        <section id="concepts" class="doc-section">
          <h2>核心知识点</h2>
          <div v-for="(topic, index) in articleModule.topics" :id="`topic-${topic}`" :key="topic" class="doc-topic">
            <h3>{{ topic }}</h3>
            <p>{{ topicExplanation(topic, index) }}</p>
            <ul>
              <li v-for="check in topicChecks(topic, index)" :key="check">{{ check }}</li>
            </ul>
          </div>
        </section>

        <section id="workflow" class="doc-section">
          <h2>标准分析流程</h2>
          <p>按照以下顺序推进，并在每一步保留输入、操作和结果。</p>
          <ol class="doc-steps">
            <li v-for="step in articleGuide.flow" :key="step.title"><b>{{ step.title }}</b><span>{{ step.detail }}</span></li>
          </ol>
        </section>

        <section id="tool-usage" class="doc-section">
          <h2>工具速查</h2>
          <p>根据当前分析阶段选择工具。命令中的文件名、地址和参数需要替换为本地授权环境中的实际值。</p>
          <div v-for="tool in articleGuide.tools" :key="tool.name" class="doc-tool">
            <h3>{{ tool.name }}</h3>
            <p>{{ tool.usage }}</p>
            <pre><code>{{ tool.command }}</code></pre>
          </div>
        </section>

        <section id="example" class="doc-section">
          <h2>代码与命令示例</h2>
          <p>先完整阅读示例，再逐行确认数据来源、转换过程和结果验证方式。</p>
          <div class="doc-code">
            <header><span>{{ articleGuide.codeLanguage }}</span><button type="button" @click="copyExample">{{ copied ? '已复制' : '复制代码' }}</button></header>
            <pre><code>{{ articleCode }}</code></pre>
          </div>
          <blockquote class="doc-note"><b>使用边界：</b>示例只用于本地文件、题目材料或明确授权的环境，不连接未知外部目标。</blockquote>
        </section>

        <section id="related" class="doc-section doc-related">
          <h2>继续阅读</h2>
          <ul>
            <li v-for="module in relatedModules" :key="module.title">
              <button type="button" @click="openModule(module, articleDomain.id)">{{ module.title }}</button>
              <span>{{ module.summary }}</span>
            </li>
          </ul>
        </section>
      </article>

      <aside class="doc-toc" aria-label="本页目录">
        <span>ON THIS PAGE</span>
        <a href="#learning-goals">学习目标</a>
        <a href="#concepts">核心知识点</a>
        <a v-for="topic in articleModule.topics" :key="topic" class="sub" :href="`#topic-${topic}`">{{ topic }}</a>
        <a href="#workflow">标准分析流程</a>
        <a href="#tool-usage">工具速查</a>
        <a href="#example">代码与命令示例</a>
        <a href="#related">继续阅读</a>
      </aside>
    </div>
  </main>

  <main v-else class="knowledge-page">
    <section class="knowledge-search">
      <label>
        <i>⌕</i><b>检索当前知识域</b>
        <input v-model="query" type="search" placeholder="输入漏洞、协议、算法或工具关键词" />
      </label>
      <button v-if="query" type="button" @click="query = ''">清除</button>
    </section>

    <nav class="domain-tabs" aria-label="知识域">
      <button v-for="domain in domains" :key="domain.id" type="button" :class="{ active: activeDomainId === domain.id }" @click="selectDomain(domain.id)">
        <span>{{ domain.icon }}</span>
        <b>{{ domain.name }}</b>
        <small>{{ domain.modules.length }} 个专题</small>
      </button>
    </nav>

    <section class="domain-overview">
      <div><i></i><span>{{ activeDomain.code }}</span><b>{{ activeDomain.name }}</b><small>{{ activeDomain.modules.length }} 个专题</small></div>
      <p>{{ activeDomain.description }}</p>
    </section>

    <section v-if="visibleModules.length" class="knowledge-grid">
      <article v-for="module in visibleModules" :key="module.title" class="knowledge-card" role="link" tabindex="0" @click="openModule(module)" @keydown.enter.prevent="openModule(module)" @keydown.space.prevent="openModule(module)">
        <header><h2>{{ module.title }}</h2><i>→</i></header>
        <p>{{ module.summary }}</p>
        <div><span v-for="topic in module.topics" :key="topic">{{ topic }}</span></div>
        <footer><span>{{ module.level }} · 建议阅读 {{ module.duration }}</span><b>{{ module.topics.length }} 个知识点</b></footer>
      </article>
    </section>

    <section v-else class="knowledge-empty">
      <b>当前知识域没有匹配结果</b><p>尝试缩短关键词，或切换其他知识域。</p><button type="button" @click="query = ''">查看全部专题</button>
    </section>

    <section class="knowledge-method">
      <div><span>01</span><b>建立概念</b><p>先理解术语、数据结构和信任边界。</p></div>
      <div><span>02</span><b>识别证据</b><p>知道应当观察哪些字段、行为和输出。</p></div>
      <div><span>03</span><b>归纳延伸</b><p>串联相邻专题，逐步形成自己的知识脉络。</p></div>
      <aside>
        <span>扩展阅读</span>
        <a href="https://ctf-wiki.org/" target="_blank" rel="noopener noreferrer">CTF Wiki ↗</a>
        <a href="https://portswigger.net/web-security/learning-paths" target="_blank" rel="noopener noreferrer">Web Security Academy ↗</a>
        <a href="https://picoctf.org/resources.html" target="_blank" rel="noopener noreferrer">picoCTF Resources ↗</a>
      </aside>
    </section>

  </main>
</template>
