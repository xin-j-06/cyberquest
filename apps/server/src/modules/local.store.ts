import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LearningRepository } from './learning.repository';
import { createLabTarget, createSessionFlag, interactLabTarget } from './lab-target';
import { attachmentCount, challengeAttachment as resolveChallengeAttachment, challengeAttachments } from './challenge-attachments';
import { buildOfficialGuide, officialGuideAdminFields, officialGuideContent, officialGuideFor } from './official-guides';
import { answerLearningQuestion } from './ai-model-provider';
import type { LearningSkillId } from './ai-learning-skills';
import { normalizeLearningMemory, updateLearningMemory } from './ai-learning-memory';
import { conversationTitle, type AiConversationChatResult, type AiConversationDetail, type AiConversationSummary, type AiMessageFeedback, type AiMessageRecord } from './ai-conversations';
import { accountCredentialError } from './account-credentials';
import type { AdminAuditRecord, AdminChallengeInput, AdminChallengeRecord, AdminLabRecord, AdminListQuery, AdminOverviewSnapshot, AdminUserCreate, AdminUserRecord, AdminUserUpdate, Announcement, AnnouncementInput, CalendarMemo, CalendarMemoInput, ChallengeDetail, ChallengeDiagnostic, ChallengeNote, Competition, CompetitionInput, FeedbackInput, FeedbackRecord, FeedbackUpdate, ForumPostDetail, ForumPostInput, ForumPostSummary, ForumReply, ForumReplyInput, LabSession, Paginated, SkillProgress, TrainingTool, TrainingToolInput, WorkspaceOverview } from '@cyberquest/shared';
const jwt = require('jsonwebtoken') as { sign: (payload: object, secret: string, options: { expiresIn: string }) => string; verify: (token: string, secret: string) => unknown };

type RecordData = Record<string, any>;

const SKILLS = [
  ['http', 'HTTP 与信任边界', 'WEB', '理解请求、Cookie 与输入验证的基础。'],
  ['crypto-basics', '编码与密码基础', 'CRYPTO', '识别编码、哈希与基础密码学概念。'],
  ['packet-analysis', '流量分析', 'NETWORK', '从协议、时序与响应中建立证据。'],
  ['reverse-basics', '静态分析', 'REVERSE', '从可读字符串和控制流形成假设。'],
  ['memory-safety', '内存安全', 'PWN', '理解边界检查和安全编码原则。'],
] as const;

const TAGS: Record<string, string[]> = {
  WEB: ['HTTP', '参数校验', '信任边界'], CRYPTO: ['编码', '数据表示', '可验证步骤'],
  NETWORK: ['DNS', 'HTTP', '流量分析'], REVERSE: ['Strings', '静态分析', '程序意图'], PWN: ['边界检查', '内存安全', '安全编码'],
};

const DEFAULT_COMPETITIONS = [
  { title: 'CTFtime 全球赛历', category: 'INTERNATIONAL', operator: 'CTFtime', status: '持续更新', scope: '全球 · 在线 / 线下', description: '集中查看近期 CTF、比赛形式、开放范围和官方报名入口，适合按时间选择公开赛事。', tags: ['Jeopardy', 'Attack-Defence', '全球赛历'], url: 'https://ctftime.org/event/list/?format=1&online=-1&restrictions=-1&upcoming=true', featured: true },
  { title: 'XCTF 国际网络攻防联赛', category: 'DOMESTIC', operator: 'XCTF / ADWorld', status: '赛事与真题', scope: '国内 · 团队赛', description: '查看 XCTF 分站赛、赛事大厅与历届真题，适合完成本地训练后进入团队竞赛。', tags: ['Web', 'Pwn', 'Reverse'], url: 'https://adworld.xctf.org.cn/', featured: true },
  { title: '全国大学生信息安全竞赛', category: 'UNIVERSITY', operator: 'CISCN', status: '官方通知', scope: '高校 · 团队赛', description: '面向高校学生的信息安全赛事入口，集中查看创新实践能力赛相关通知与竞赛安排。', tags: ['高校', '创新实践', '综合能力'], url: 'https://www.ciscn.cn/', featured: false },
  { title: 'i春秋 CTF 大本营', category: 'DOMESTIC', operator: 'i春秋', status: '赛事聚合', scope: '国内 · 多赛制', description: '浏览国内近期网络安全竞赛、历史赛事和训练营，按主办方或比赛名称继续筛选。', tags: ['CTF', 'AWD', '竞赛训练'], url: 'https://www.ichunqiu.com/competition/all', featured: false },
] as const;

const DEFAULT_TOOLS = [
  { name: 'CyberChef', icon: 'CF', category: '密码编码', description: '在浏览器中完成 Base64、十六进制、哈希、压缩与常见数据格式转换。', platforms: ['在线使用', '离线 ZIP'], source: 'GCHQ', usagePath: '编码解码、数据转换与快速验证', officialUrl: 'https://gchq.github.io/CyberChef/', actionLabel: '打开官方工具', recommended: true },
  { name: 'Burp Suite Community', icon: 'BP', category: 'Web 安全', description: '用于授权 Web 题目的 HTTP 代理、历史记录、Repeater 与 Decoder。', platforms: ['Windows', 'macOS', 'Linux'], source: 'PortSwigger', usagePath: 'Web 题代理抓包、请求重放与参数验证', officialUrl: 'https://portswigger.net/burp/communitydownload', actionLabel: '前往官方下载', recommended: true },
  { name: 'Wireshark', icon: 'WS', category: '流量分析', description: '查看 PCAP、协议字段、会话流与过滤结果，是网络类题目的基础工具。', platforms: ['Windows', 'macOS', 'Linux'], source: 'Wireshark Foundation', usagePath: '流量题协议分析、会话追踪与证据提取', officialUrl: 'https://www.wireshark.org/download.html', actionLabel: '前往官方下载', recommended: true },
  { name: 'Nmap', icon: 'NM', category: '网络工具', description: '面向已授权目标的端口与服务识别工具；练习时务必限定题目给出的范围。', platforms: ['Windows', 'macOS', 'Linux'], source: 'Nmap Project', usagePath: '靶场资产识别、端口发现与服务确认', officialUrl: 'https://nmap.org/download.html', actionLabel: '前往官方下载' },
  { name: 'Ghidra', icon: 'GH', category: '逆向工程', description: '多平台软件逆向工程套件，适合查看函数、字符串、交叉引用与反编译结果。', platforms: ['Windows', 'macOS', 'Linux'], source: 'NSA / GitHub', usagePath: '逆向题静态分析、反编译与控制流梳理', officialUrl: 'https://github.com/NationalSecurityAgency/ghidra/releases', actionLabel: '查看官方发布', recommended: true },
  { name: 'JADX', icon: 'JX', category: '逆向工程', description: '面向 APK、DEX、AAB 的命令行与图形化反编译工具，适合移动端题目。', platforms: ['Windows', 'macOS', 'Linux'], source: 'skylot / GitHub', usagePath: 'Android 题反编译、资源检索与代码浏览', officialUrl: 'https://github.com/skylot/jadx/releases', actionLabel: '查看官方发布' },
  { name: 'pwntools', icon: 'PW', category: '二进制安全', description: '用于编写二进制题交互脚本、处理 ELF、字节序和受控进程通信。', platforms: ['Python', 'Linux 优先'], source: 'Gallopsled', usagePath: 'Pwn 题脚本编写、进程交互与载荷构造', officialUrl: 'https://docs.pwntools.com/en/dev/install.html', actionLabel: '查看安装文档', installCommand: 'python3 -m pip install --upgrade pwntools', recommended: true },
  { name: 'hashcat', icon: 'HC', category: '密码编码', description: '密码恢复与哈希验证工具；只处理题目提供或明确授权的数据。', platforms: ['Windows', 'Linux', 'macOS'], source: 'hashcat Project', usagePath: '密码题哈希识别、规则验证与授权恢复', officialUrl: 'https://hashcat.net/hashcat/', actionLabel: '前往官方网站' },
  { name: 'Volatility 3', icon: 'V3', category: '数字取证', description: '从授权的内存镜像中提取进程、模块、网络连接等数字取证信息。', platforms: ['Python', '跨平台'], source: 'Volatility Foundation', usagePath: '内存取证、进程排查与可疑活动定位', officialUrl: 'https://github.com/volatilityfoundation/volatility3/releases', actionLabel: '查看官方发布', installCommand: 'python3 -m pip install volatility3' },
  { name: 'ExifTool', icon: 'EX', category: '数字取证', description: '读取图片、文档、音视频等文件的元数据，适合隐写与取证前期检查。', platforms: ['Windows', 'macOS', 'Linux'], source: 'Phil Harvey', usagePath: '文件元数据读取、时间线梳理与取证初筛', officialUrl: 'https://exiftool.org/', actionLabel: '前往官方下载' },
] as const;

@Injectable()
export class LocalStoreService implements LearningRepository {
  private readonly dataPath = join(process.cwd(), 'data', 'cyberquest.local.json');
  private readonly seedPath = join(process.cwd(), 'data', 'cyberquest.seed.json');
  private readonly tokenSecret = process.env.JWT_ACCESS_SECRET || 'cyberquest-local-development-secret';
  private readonly labFlagSecret = process.env.LAB_FLAG_SECRET || this.tokenSecret;
  private readonly rateWindows = new Map<string, number[]>();
  private data: RecordData;

  constructor() {
    this.data = this.readData();
    const timestamp = this.now();
    let migrated = false;
    for (const user of this.data.users) {
      if (!user.createdAt) { user.createdAt = timestamp; migrated = true; }
      if (!user.updatedAt) { user.updatedAt = user.createdAt; migrated = true; }
      if (!user.status) { user.status = 'ACTIVE'; migrated = true; }
      if (user.sessionVersion === undefined) { user.sessionVersion = 0; migrated = true; }
      if (user.mustChangePassword === undefined) { user.mustChangePassword = false; migrated = true; }
      if (user.mfaEnabled === undefined) { user.mfaEnabled = false; migrated = true; }
      if (user.failedLoginAttempts === undefined) { user.failedLoginAttempts = 0; migrated = true; }
    }
    if (!this.data.forumPosts.length) {
      const author = this.data.users.find((item: RecordData) => item.role === 'ADMIN') ?? this.data.users[0];
      if (author) {
        this.data.forumPosts = [
          { id: randomUUID(), category: 'QA', title: '欢迎来到技术论坛：提问前先整理可复现信息', content: '为了让讨论更高效，请在提问时写明题目方向、已经完成的排查、实际结果与预期结果。请勿直接发布仍在进行中的比赛 Flag，也不要上传来源不明的可执行文件。', authorId: author.id, authorName: author.username, authorRole: author.role, pinned: true, views: 24, replies: [], createdAt: timestamp, updatedAt: timestamp },
          { id: randomUUID(), category: 'WRITEUP', title: '怎样写一篇可复现的 CTF 解题记录', content: '一篇高质量题解应包含环境、入口、核心原理、关键请求或代码、预期输出和失败尝试。重点说明为什么这条路径成立，而不只是罗列最终命令。', authorId: author.id, authorName: author.username, authorRole: author.role, pinned: true, views: 18, replies: [], createdAt: timestamp, updatedAt: timestamp },
          { id: randomUUID(), category: 'TOOLS', title: '工具排错讨论：先确认输入格式与版本', content: '当 Burp Suite、Wireshark、Ghidra 或脚本工具表现异常时，建议先记录版本、操作系统、输入文件哈希和完整错误信息，再讨论具体参数。', authorId: author.id, authorName: author.username, authorRole: author.role, pinned: false, views: 9, replies: [], createdAt: timestamp, updatedAt: timestamp },
        ];
        migrated = true;
      }
    }
    if (!this.data.competitions.length) {
      this.data.competitions = DEFAULT_COMPETITIONS.map((item) => ({ ...item, id: randomUUID(), published: true, createdAt: timestamp, updatedAt: timestamp }));
      migrated = true;
    }
    if (!this.data.tools.length) {
      this.data.tools = DEFAULT_TOOLS.map((item, index) => ({ ...item, id: randomUUID(), published: true, recommended: 'recommended' in item && item.recommended === true, sortOrder: index * 10, createdAt: timestamp, updatedAt: timestamp }));
      migrated = true;
    }
    if (migrated) this.persist();
    this.expireSessions();
  }

  private readData(): RecordData {
    if (!existsSync(this.dataPath) && existsSync(this.seedPath)) copyFileSync(this.seedPath, this.dataPath);
    if (!existsSync(this.dataPath)) return { users: [], challenges: [], attempts: [], labs: [], courses: [], announcements: [], competitions: [], calendarMemos: [], tools: [], feedbacks: [], forumPosts: [], aiConversations: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.dataPath, 'utf8'));
      return { users: Array.isArray(parsed.users) ? parsed.users : [], challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [], attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [], labs: Array.isArray(parsed.labs) ? parsed.labs : [], courses: Array.isArray(parsed.courses) ? parsed.courses : [], announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [], competitions: Array.isArray(parsed.competitions) ? parsed.competitions : [], calendarMemos: Array.isArray(parsed.calendarMemos) ? parsed.calendarMemos : [], tools: Array.isArray(parsed.tools) ? parsed.tools : [], feedbacks: Array.isArray(parsed.feedbacks) ? parsed.feedbacks : [], forumPosts: Array.isArray(parsed.forumPosts) ? parsed.forumPosts : [], aiConversations: Array.isArray(parsed.aiConversations) ? parsed.aiConversations : [] };
    } catch { throw new Error('本地学习数据无法读取。请修复 apps/server/data/cyberquest.local.json 后重试。'); }
  }

  private persist() {
    const temporary = `${this.dataPath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    renameSync(temporary, this.dataPath);
  }

  private now() { return new Date().toISOString(); }
  private page(query: AdminListQuery = {}) { const page = Math.max(1, Number(query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20)); return { page, pageSize, start: (page - 1) * pageSize }; }
  private paginated<T>(items: T[], query: AdminListQuery = {}): Paginated<T> { const { page, pageSize, start } = this.page(query); return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) }; }
  private sha256(value: string) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
  private publicUser(user: RecordData) { return { id: user.id, username: user.username, email: user.email, role: user.role, score: user.score ?? 0, xp: user.xp ?? 0, level: user.level ?? 1 }; }
  private adminUserView(user: RecordData): AdminUserRecord { return { ...this.publicUser(user), status: user.status ?? 'ACTIVE', mustChangePassword: user.mustChangePassword === true, mfaEnabled: user.mfaEnabled === true, failedLoginAttempts: user.failedLoginAttempts ?? 0, createdAt: user.createdAt, updatedAt: user.updatedAt ?? user.createdAt, ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}), ...(user.lockedUntil ? { lockedUntil: user.lockedUntil } : {}), ...(user.deletedAt ? { deletedAt: user.deletedAt } : {}), ...(user.deletionScheduledAt ? { deletionScheduledAt: user.deletionScheduledAt } : {}) }; }
  private requireAdmin(user: RecordData) { if (user.role !== 'ADMIN') this.fail(403, 'ADMIN_REQUIRED', '仅管理员可以管理账号。'); }
  private signUser(user: RecordData) { return jwt.sign({ sub: user.id, email: user.email, role: user.role, sv: user.sessionVersion ?? 0 }, this.tokenSecret, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '12h' }); }
  private activity(user: RecordData, type: string, message: string) { user.activities ??= []; user.activities.push({ type, message, createdAt: this.now() }); }

  private fail(status: number, code: string, message: string): never {
    const value = { code, message };
    if (status === 400) throw new BadRequestException(value);
    if (status === 401) throw new UnauthorizedException(value);
    if (status === 403) throw new ForbiddenException(value);
    if (status === 404) throw new NotFoundException(value);
    if (status === 409) throw new ConflictException(value);
    if (status === 429) throw new HttpException(value, HttpStatus.TOO_MANY_REQUESTS);
    throw new BadRequestException(value);
  }

  assertRateLimit(scope: string, identity: string, max: number, milliseconds: number) {
    const key = `${scope}:${identity}`;
    const current = Date.now();
    const entries = (this.rateWindows.get(key) ?? []).filter((time) => current - time < milliseconds);
    if (entries.length >= max) this.fail(429, 'RATE_LIMITED', '请求过于频繁，请稍后重试。');
    entries.push(current); this.rateWindows.set(key, entries);
  }

  userFromAuthorization(header?: string): RecordData | undefined {
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      const payload = jwt.verify(header.slice(7), this.tokenSecret) as { sub?: string; sv?: number };
      const user = this.data.users.find((item: RecordData) => item.id === payload.sub);
      if (!user || user.status !== 'ACTIVE') this.fail(403, 'ACCOUNT_UNAVAILABLE', '账号已被冻结、停用或进入删除保留期。');
      if ((user.sessionVersion ?? 0) !== (payload.sv ?? 0)) this.fail(401, 'AUTH_TOKEN_REVOKED', '会话已失效，请重新登录。');
      return user;
    } catch { this.fail(401, 'AUTH_TOKEN_EXPIRED', '访问令牌无效或已过期。'); }
  }

  requireUser(header?: string) {
    const user = this.userFromAuthorization(header);
    if (!user) this.fail(401, 'AUTH_FORBIDDEN', '请先登录后再执行该操作。');
    return user;
  }

  async login(email: string, password: string) {
    const user = this.data.users.find((item: RecordData) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (user && user.status !== 'ACTIVE') this.fail(403, 'ACCOUNT_UNAVAILABLE', '账号已被冻结、停用或进入删除保留期。');
    if (!user || !(await argon2.verify(user.passwordHash, password))) this.fail(401, 'AUTH_INVALID_CREDENTIALS', '邮箱或密码错误。');
    user.lastLoginAt = this.now(); this.activity(user, 'LOGIN', '登录本地学习平台'); this.persist();
    return { user: this.publicUser(user), accessToken: this.signUser(user) };
  }

  async adminLogin(password: string) {
    const email = (process.env.ADMIN_LOGIN_EMAIL || 'admin@cyberquest.local').trim().toLowerCase();
    const user = this.data.users.find((item: RecordData) => item.email.toLowerCase() === email && item.role === 'ADMIN');
    if (!user || !(await argon2.verify(user.passwordHash, password))) this.fail(401, 'AUTH_INVALID_CREDENTIALS', '管理员密码错误。');
    user.lastLoginAt = this.now(); this.activity(user, 'LOGIN', '登录管理控制台'); this.persist();
    return { user: this.publicUser(user), accessToken: this.signUser(user) };
  }

  logout(user: RecordData): { success: true } {
    user.sessionVersion = (user.sessionVersion ?? 0) + 1; this.activity(user, 'LOGOUT_ALL', '撤销账号的全部会话'); this.persist(); return { success: true };
  }

  async register(input: { username?: string; email?: string; password?: string }) {
    const username = input.username?.trim(); const email = input.email?.trim().toLowerCase();
    const validationError = accountCredentialError(username, email, input.password);
    if (validationError || !username || !email || !input.password) this.fail(400, 'VALIDATION_FAILED', validationError ?? '账号信息不完整。');
    if (this.data.users.some((item: RecordData) => item.email.toLowerCase() === email || item.username === username)) this.fail(409, 'AUTH_ACCOUNT_EXISTS', '邮箱或昵称已被使用。');
    const now = this.now();
    const user = { id: randomUUID(), username, email, passwordHash: await argon2.hash(input.password), role: 'USER', status: 'ACTIVE', sessionVersion: 0, mustChangePassword: false, mfaEnabled: false, failedLoginAttempts: 0, score: 0, xp: 0, level: 1, solved: [], skills: {}, activities: [], unlockedHints: {}, createdAt: now, updatedAt: now };
    this.data.users.push(user); this.activity(user, 'REGISTER', '创建本地学习档案'); this.persist();
    return { user: this.publicUser(user), accessToken: this.signUser(user) };
  }

  me(user: RecordData) { return this.publicUser(user); }
  async createAdminUser(input: AdminUserCreate, user: RecordData): Promise<AdminUserRecord> {
    this.requireAdmin(user);
    const username = input.username?.trim(); const email = input.email?.trim().toLowerCase();
    const validationError = accountCredentialError(username, email, input.password);
    if (validationError || !username || !email || !input.password) this.fail(400, 'VALIDATION_FAILED', validationError ?? '账号信息不完整。');
    if (this.data.users.some((item: RecordData) => item.email.toLowerCase() === email || item.username === username)) this.fail(409, 'AUTH_ACCOUNT_EXISTS', '邮箱或昵称已被使用。');
    const now = this.now();
    const account = { id: randomUUID(), username, email, passwordHash: await argon2.hash(input.password), role: input.role ?? 'USER', status: 'ACTIVE', sessionVersion: 0, mustChangePassword: true, mfaEnabled: false, failedLoginAttempts: 0, score: 0, xp: 0, level: 1, solved: [], skills: {}, activities: [], unlockedHints: {}, createdAt: now, updatedAt: now };
    this.data.users.push(account); this.activity(account, 'REGISTER', `由管理员 ${user.username} 创建账号`); this.persist();
    return this.adminUserView(account);
  }
  adminUsers(user: RecordData, query: AdminListQuery = {}): Paginated<AdminUserRecord> {
    this.requireAdmin(user);
    const keyword = query.query?.trim().toLowerCase();
    const rows = this.data.users.filter((item: RecordData) => (!keyword || `${item.username} ${item.email}`.toLowerCase().includes(keyword)) && (!query.status || query.status === 'ALL' || item.status === query.status)).map((item: RecordData) => this.adminUserView(item)).sort((left: AdminUserRecord, right: AdminUserRecord) => (query.order === 'asc' ? 1 : -1) * left.createdAt.localeCompare(right.createdAt));
    return this.paginated(rows, query);
  }
  adminUser(id: string, user: RecordData): AdminUserRecord {
    this.requireAdmin(user);
    const account = this.data.users.find((item: RecordData) => item.id === id);
    if (!account) this.fail(404, 'USER_NOT_FOUND', '账号不存在。');
    return this.adminUserView(account);
  }
  updateAdminUser(id: string, input: AdminUserUpdate, user: RecordData): AdminUserRecord {
    this.requireAdmin(user);
    const account = this.data.users.find((item: RecordData) => item.id === id);
    if (!account) this.fail(404, 'USER_NOT_FOUND', '账号不存在。');
    const username = input.username?.trim();
    const email = input.email?.trim().toLowerCase();
    if (username && this.data.users.some((item: RecordData) => item.id !== id && item.username === username)) this.fail(409, 'AUTH_ACCOUNT_EXISTS', '昵称已被使用。');
    if (email && this.data.users.some((item: RecordData) => item.id !== id && item.email.toLowerCase() === email)) this.fail(409, 'AUTH_ACCOUNT_EXISTS', '邮箱已被使用。');
    if (username) account.username = username;
    if (email) account.email = email;
    if (input.role) account.role = input.role;
    if (input.status) { account.status = input.status; if (input.status !== 'ACTIVE') account.sessionVersion = (account.sessionVersion ?? 0) + 1; }
    if (input.mustChangePassword !== undefined) account.mustChangePassword = input.mustChangePassword;
    account.updatedAt = this.now();
    this.persist();
    return this.adminUserView(account);
  }
  deleteAdminUser(id: string, user: RecordData): { success: true } {
    this.requireAdmin(user);
    if (id === user.id) this.fail(400, 'ADMIN_SELF_DELETE', 'The current administrator account cannot delete itself.');
    const target = this.data.users.find((item: RecordData) => item.id === id);
    if (!target) this.fail(404, 'USER_NOT_FOUND', 'Account was not found.');
    target.status = 'PENDING_DELETION'; target.deletedAt = this.now(); target.deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(); target.sessionVersion = (target.sessionVersion ?? 0) + 1;
    this.activity(user, 'ADMIN_USER_SOFT_DELETE', `Account ${target.username} entered a 30-day deletion retention period.`); this.persist();
    return { success: true };
    if (id === user.id) this.fail(400, 'ADMIN_SELF_DELETE', '不能删除当前登录的管理员账号。');
    const index = this.data.users.findIndex((item: RecordData) => item.id === id);
    if (index < 0) this.fail(404, 'USER_NOT_FOUND', '账号不存在。');
    this.data.users.splice(index, 1);
    this.data.attempts = this.data.attempts.filter((item: RecordData) => item.userId !== id);
    this.data.labs = this.data.labs.filter((item: RecordData) => item.userId !== id);
    this.persist();
    return { success: true };
  }
  restoreAdminUser(id: string, user: RecordData): AdminUserRecord {
    this.requireAdmin(user); const account = this.data.users.find((item: RecordData) => item.id === id); if (!account) this.fail(404, 'USER_NOT_FOUND', 'Account was not found.');
    account.status = 'ACTIVE'; delete account.deletedAt; delete account.deletionScheduledAt; account.sessionVersion = (account.sessionVersion ?? 0) + 1; account.updatedAt = this.now(); this.activity(user, 'ADMIN_USER_RESTORE', `Restored account ${account.username}.`); this.persist(); return this.adminUserView(account);
  }
  revokeAdminUserSessions(id: string, user: RecordData): { success: true } {
    this.requireAdmin(user); const account = this.data.users.find((item: RecordData) => item.id === id); if (!account) this.fail(404, 'USER_NOT_FOUND', 'Account was not found.');
    account.sessionVersion = (account.sessionVersion ?? 0) + 1; this.activity(user, 'ADMIN_SESSION_REVOKE', `Revoked all sessions for ${account.username}.`); this.persist(); return { success: true };
  }
  private announcementView(item: RecordData): Announcement {
    const author = this.data.users.find((user: RecordData) => user.id === item.authorId);
    return { id: item.id, title: item.title, content: item.content, author: author?.username ?? item.authorName ?? '平台管理员', published: item.published !== false, createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
  private enterpriseAnnouncementView(item: RecordData): Announcement { return { ...this.announcementView(item), reviewStatus: item.reviewStatus ?? (item.published === false ? 'DRAFT' : 'PUBLISHED'), priority: item.priority ?? 'NORMAL', audience: item.audience ?? 'ALL', revision: item.revision ?? 1, ...(item.scheduledAt ? { scheduledAt: item.scheduledAt } : {}), ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}) }; }
  announcements(): Announcement[] {
    const now = Date.now(); return this.data.announcements.filter((item: RecordData) => item.published !== false && !item.deletedAt && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= now) && (!item.expiresAt || new Date(item.expiresAt).getTime() > now)).map((item: RecordData) => this.enterpriseAnnouncementView(item)).sort((left: Announcement, right: Announcement) => right.createdAt.localeCompare(left.createdAt));
  }
  adminAnnouncements(user: RecordData, query: AdminListQuery = {}): Paginated<Announcement> {
    this.requireAdmin(user);
    const keyword = query.query?.trim().toLowerCase(); const rows = this.data.announcements.filter((item: RecordData) => !item.deletedAt && (!keyword || `${item.title} ${item.content}`.toLowerCase().includes(keyword)) && (!query.status || query.status === 'ALL' || (item.reviewStatus ?? (item.published === false ? 'DRAFT' : 'PUBLISHED')) === query.status)).map((item: RecordData) => this.enterpriseAnnouncementView(item)).sort((left: Announcement, right: Announcement) => right.updatedAt.localeCompare(left.updatedAt)); return this.paginated(rows, query);
  }
  createAnnouncement(input: AnnouncementInput, user: RecordData): Announcement {
    this.requireAdmin(user);
    const title = input.title?.trim(); const content = input.content?.trim();
    if (!title || !content) this.fail(400, 'ANNOUNCEMENT_INVALID', '请填写公告标题和内容。');
    const now = this.now();
    const published = input.published !== false; const item = { id: randomUUID(), title, content, published, reviewStatus: input.reviewStatus ?? (published ? 'PUBLISHED' : 'DRAFT'), priority: input.priority ?? 'NORMAL', audience: input.audience?.trim() || 'ALL', scheduledAt: input.scheduledAt || undefined, expiresAt: input.expiresAt || undefined, revision: 1, authorId: user.id, authorName: user.username, createdAt: now, updatedAt: now };
    this.data.announcements.push(item); this.persist();
    return this.announcementView(item);
  }
  updateAnnouncement(id: string, input: AnnouncementInput, user: RecordData): Announcement {
    this.requireAdmin(user);
    const item = this.data.announcements.find((entry: RecordData) => entry.id === id);
    if (!item) this.fail(404, 'ANNOUNCEMENT_NOT_FOUND', '公告不存在。');
    if (input.title !== undefined) { const title = input.title.trim(); if (!title) this.fail(400, 'ANNOUNCEMENT_INVALID', '公告标题不能为空。'); item.title = title; }
    if (input.content !== undefined) { const content = input.content.trim(); if (!content) this.fail(400, 'ANNOUNCEMENT_INVALID', '公告内容不能为空。'); item.content = content; }
    if (input.published !== undefined) item.published = input.published;
    if (input.reviewStatus) item.reviewStatus = input.reviewStatus;
    if (input.priority) item.priority = input.priority;
    if (input.audience) item.audience = input.audience.trim();
    if (input.scheduledAt !== undefined) item.scheduledAt = input.scheduledAt || undefined;
    if (input.expiresAt !== undefined) item.expiresAt = input.expiresAt || undefined;
    item.revision = (item.revision ?? 1) + 1;
    item.updatedAt = this.now(); this.persist();
    return this.announcementView(item);
  }
  deleteAnnouncement(id: string, user: RecordData): { success: true } {
    this.requireAdmin(user);
    const target = this.data.announcements.find((item: RecordData) => item.id === id); if (!target) this.fail(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement was not found.'); target.deletedAt = this.now(); target.published = false; target.reviewStatus = 'ARCHIVED'; target.revision = (target.revision ?? 1) + 1; this.activity(user, 'ADMIN_ANNOUNCEMENT_ARCHIVE', `Archived announcement ${target.title}.`); this.persist(); return { success: true };
    const index = this.data.announcements.findIndex((item: RecordData) => item.id === id);
    if (index < 0) this.fail(404, 'ANNOUNCEMENT_NOT_FOUND', '公告不存在。');
    this.data.announcements.splice(index, 1); this.persist();
    return { success: true };
  }
  private competitionView(item: RecordData): Competition {
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      operator: item.operator,
      status: item.status,
      scope: item.scope,
      description: item.description,
      tags: Array.isArray(item.tags) ? item.tags : [],
      url: item.url,
      ...(item.startAt ? { startAt: item.startAt } : {}),
      ...(item.endAt ? { endAt: item.endAt } : {}),
      ...(item.registrationDeadline ? { registrationDeadline: item.registrationDeadline } : {}),
      published: item.published !== false,
      featured: item.featured === true,
      reviewStatus: item.reviewStatus ?? (item.published === false ? 'DRAFT' : 'PUBLISHED'), timezone: item.timezone ?? 'Asia/Shanghai',
      ...(item.capacity ? { capacity: item.capacity } : {}), format: item.format ?? '', sourceVerified: item.sourceVerified === true, revision: item.revision ?? 1,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
  competitions(): Competition[] {
    return this.data.competitions
      .filter((item: RecordData) => item.published !== false && !item.deletedAt)
      .map((item: RecordData) => this.competitionView(item))
      .sort((left: Competition, right: Competition) => Number(right.featured) - Number(left.featured) || (left.startAt ?? '9999').localeCompare(right.startAt ?? '9999') || right.updatedAt.localeCompare(left.updatedAt));
  }
  adminCompetitions(user: RecordData, query: AdminListQuery = {}): Paginated<Competition> {
    this.requireAdmin(user);
    const keyword = query.query?.trim().toLowerCase(); const rows = this.data.competitions.filter((item: RecordData) => !item.deletedAt && (!keyword || `${item.title} ${item.operator} ${item.description}`.toLowerCase().includes(keyword)) && (!query.status || query.status === 'ALL' || (item.reviewStatus ?? (item.published === false ? 'DRAFT' : 'PUBLISHED')) === query.status))
      .map((item: RecordData) => this.competitionView(item))
      .sort((left: Competition, right: Competition) => right.updatedAt.localeCompare(left.updatedAt));
    return this.paginated(rows, query);
  }
  createCompetition(input: CompetitionInput, user: RecordData): Competition {
    this.requireAdmin(user);
    const title = input.title?.trim();
    const operator = input.operator?.trim();
    const status = input.status?.trim();
    const scope = input.scope?.trim();
    const description = input.description?.trim();
    const url = input.url?.trim();
    if (!title || !input.category || !operator || !status || !scope || !description || !url) this.fail(400, 'COMPETITION_INVALID', '请完整填写赛事名称、分类、主办方、状态、范围、简介和链接。');
    const now = this.now();
    const item = {
      id: randomUUID(), title, category: input.category, operator, status, scope, description,
      tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 12), url,
      startAt: input.startAt || null, endAt: input.endAt || null, registrationDeadline: input.registrationDeadline || null,
      published: input.published !== false, featured: input.featured === true,
      reviewStatus: input.reviewStatus ?? (input.published !== false ? 'PUBLISHED' : 'DRAFT'), timezone: input.timezone?.trim() || 'Asia/Shanghai', capacity: input.capacity ?? null, format: input.format?.trim() || '', sourceVerified: input.sourceVerified === true, revision: 1,
      authorId: user.id, createdAt: now, updatedAt: now,
    };
    this.data.competitions.push(item);
    this.activity(user, 'ADMIN_COMPETITION_CREATE', `创建赛事：${title}`);
    this.persist();
    return this.competitionView(item);
  }
  updateCompetition(id: string, input: CompetitionInput, user: RecordData): Competition {
    this.requireAdmin(user);
    const item = this.data.competitions.find((entry: RecordData) => entry.id === id);
    if (!item) this.fail(404, 'COMPETITION_NOT_FOUND', '赛事不存在。');
    for (const key of ['title', 'operator', 'status', 'scope', 'description', 'url'] as const) {
      if (input[key] !== undefined) {
        const value = input[key]?.trim();
        if (!value) this.fail(400, 'COMPETITION_INVALID', '赛事必填内容不能为空。');
        item[key] = value;
      }
    }
    if (input.category !== undefined) item.category = input.category;
    if (input.tags !== undefined) item.tags = input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
    if (input.startAt !== undefined) item.startAt = input.startAt || null;
    if (input.endAt !== undefined) item.endAt = input.endAt || null;
    if (input.registrationDeadline !== undefined) item.registrationDeadline = input.registrationDeadline || null;
    if (input.published !== undefined) item.published = input.published;
    if (input.featured !== undefined) item.featured = input.featured;
    if (input.reviewStatus) item.reviewStatus = input.reviewStatus;
    if (input.timezone !== undefined) item.timezone = input.timezone.trim();
    if (input.capacity !== undefined) item.capacity = input.capacity;
    if (input.format !== undefined) item.format = input.format.trim();
    if (input.sourceVerified !== undefined) item.sourceVerified = input.sourceVerified;
    item.revision = (item.revision ?? 1) + 1;
    item.updatedAt = this.now();
    this.activity(user, 'ADMIN_COMPETITION_UPDATE', `更新赛事：${item.title}`);
    this.persist();
    return this.competitionView(item);
  }
  deleteCompetition(id: string, user: RecordData): { success: true } {
    this.requireAdmin(user);
    const target = this.data.competitions.find((item: RecordData) => item.id === id); if (!target) this.fail(404, 'COMPETITION_NOT_FOUND', 'Competition was not found.'); target.deletedAt = this.now(); target.published = false; target.reviewStatus = 'ARCHIVED'; target.revision = (target.revision ?? 1) + 1; this.activity(user, 'ADMIN_COMPETITION_ARCHIVE', `Archived competition ${target.title}.`); this.persist(); return { success: true };
    const index = this.data.competitions.findIndex((item: RecordData) => item.id === id);
    if (index < 0) this.fail(404, 'COMPETITION_NOT_FOUND', '赛事不存在。');
    const [removed] = this.data.competitions.splice(index, 1);
    this.activity(user, 'ADMIN_COMPETITION_DELETE', `删除赛事：${removed.title}`);
    this.persist();
    return { success: true };
  }
  private calendarMemoView(item: RecordData): CalendarMemo {
    return { id: item.id, date: item.date, title: item.title, note: item.note ?? '', createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
  calendarMemos(user: RecordData): CalendarMemo[] {
    return this.data.calendarMemos.filter((item: RecordData) => item.userId === user.id).map((item: RecordData) => this.calendarMemoView(item)).sort((a: CalendarMemo, b: CalendarMemo) => a.date.localeCompare(b.date));
  }
  createCalendarMemo(input: CalendarMemoInput, user: RecordData): CalendarMemo {
    const date = input.date?.trim(); const title = input.title?.trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) this.fail(400, 'CALENDAR_MEMO_INVALID', '请选择日期并填写备忘标题。');
    const now = this.now();
    const item = { id: randomUUID(), userId: user.id, date, title, note: input.note?.trim() ?? '', createdAt: now, updatedAt: now };
    this.data.calendarMemos.push(item); this.persist(); return this.calendarMemoView(item);
  }
  updateCalendarMemo(id: string, input: CalendarMemoInput, user: RecordData): CalendarMemo {
    const item = this.data.calendarMemos.find((entry: RecordData) => entry.id === id && entry.userId === user.id);
    if (!item) this.fail(404, 'CALENDAR_MEMO_NOT_FOUND', '备忘录不存在。');
    if (input.date !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) this.fail(400, 'CALENDAR_MEMO_INVALID', '日期格式不正确。'); item.date = input.date; }
    if (input.title !== undefined) { const title = input.title.trim(); if (!title) this.fail(400, 'CALENDAR_MEMO_INVALID', '备忘标题不能为空。'); item.title = title; }
    if (input.note !== undefined) item.note = input.note.trim();
    item.updatedAt = this.now(); this.persist(); return this.calendarMemoView(item);
  }
  deleteCalendarMemo(id: string, user: RecordData): { success: true } {
    const index = this.data.calendarMemos.findIndex((item: RecordData) => item.id === id && item.userId === user.id);
    if (index < 0) this.fail(404, 'CALENDAR_MEMO_NOT_FOUND', '备忘录不存在。');
    this.data.calendarMemos.splice(index, 1); this.persist(); return { success: true };
  }
  private toolView(item: RecordData): TrainingTool {
    return {
      id: item.id, name: item.name, icon: item.icon, category: item.category,
      description: item.description, platforms: Array.isArray(item.platforms) ? item.platforms : [],
      source: item.source, usagePath: item.usagePath ?? '', officialUrl: item.officialUrl ?? '',
      actionLabel: item.actionLabel ?? '查看官网',
      ...(item.installCommand ? { installCommand: item.installCommand } : {}),
      published: item.published !== false, recommended: item.recommended === true,
      sortOrder: Number(item.sortOrder ?? 0), version: item.version ?? '', checksumSha256: item.checksumSha256 ?? '', license: item.license ?? '', sourceVerified: item.sourceVerified === true, deprecated: item.deprecated === true, reviewStatus: item.reviewStatus ?? (item.published === false ? 'DRAFT' : 'PUBLISHED'), revision: item.revision ?? 1, createdAt: item.createdAt, updatedAt: item.updatedAt,
    };
  }
  tools(): TrainingTool[] {
    return this.data.tools.filter((item: RecordData) => item.published !== false && !item.deprecated && !item.deletedAt)
      .map((item: RecordData) => this.toolView(item))
      .sort((left: TrainingTool, right: TrainingTool) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  }
  adminTools(user: RecordData, query: AdminListQuery = {}): Paginated<TrainingTool> {
    this.requireAdmin(user);
    const keyword = query.query?.trim().toLowerCase(); const rows = this.data.tools.filter((item: RecordData) => !item.deletedAt && (!keyword || `${item.name} ${item.category} ${item.description} ${item.source}`.toLowerCase().includes(keyword)) && (!query.status || query.status === 'ALL' || (item.reviewStatus ?? (item.published === false ? 'DRAFT' : 'PUBLISHED')) === query.status)).map((item: RecordData) => this.toolView(item))
      .sort((left: TrainingTool, right: TrainingTool) => left.sortOrder - right.sortOrder || right.updatedAt.localeCompare(left.updatedAt));
    return this.paginated(rows, query);
  }
  createTool(input: TrainingToolInput, user: RecordData): TrainingTool {
    this.requireAdmin(user);
    const name = input.name?.trim(); const category = input.category?.trim(); const description = input.description?.trim();
    const source = input.source?.trim(); const usagePath = input.usagePath?.trim() ?? ''; const officialUrl = input.officialUrl?.trim() ?? '';
    if (!name || !category || !description || !source || (!usagePath && !officialUrl)) this.fail(400, 'TOOL_INVALID', '请填写工具名称、分类、说明、来源，并至少提供使用路径或官网链接。');
    if (this.data.tools.some((item: RecordData) => item.name.toLowerCase() === name.toLowerCase())) this.fail(409, 'TOOL_EXISTS', '同名工具已经存在。');
    const now = this.now();
    const item = { id: randomUUID(), name, icon: input.icon?.trim().toUpperCase() || name.slice(0, 2).toUpperCase(), category, description, platforms: (input.platforms ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 12), source, usagePath, officialUrl, actionLabel: input.actionLabel?.trim() || '查看官网', installCommand: input.installCommand?.trim() || '', published: input.published !== false, recommended: input.recommended === true, sortOrder: input.sortOrder ?? this.data.tools.length * 10, authorId: user.id, createdAt: now, updatedAt: now };
    this.data.tools.push(item); this.activity(user, 'ADMIN_TOOL_CREATE', `创建工具：${name}`); this.persist(); return this.toolView(item);
  }
  updateTool(id: string, input: TrainingToolInput, user: RecordData): TrainingTool {
    this.requireAdmin(user);
    const item = this.data.tools.find((entry: RecordData) => entry.id === id);
    if (!item) this.fail(404, 'TOOL_NOT_FOUND', '工具不存在。');
    if (input.name !== undefined) { const value = input.name.trim(); if (!value) this.fail(400, 'TOOL_INVALID', '工具名称不能为空。'); if (this.data.tools.some((entry: RecordData) => entry.id !== id && entry.name.toLowerCase() === value.toLowerCase())) this.fail(409, 'TOOL_EXISTS', '同名工具已经存在。'); item.name = value; }
    for (const key of ['icon', 'category', 'description', 'source', 'usagePath', 'officialUrl', 'actionLabel', 'installCommand'] as const) if (input[key] !== undefined) item[key] = input[key]?.trim() ?? '';
    if (input.platforms !== undefined) item.platforms = input.platforms.map((value) => value.trim()).filter(Boolean).slice(0, 12);
    if (input.published !== undefined) item.published = input.published;
    if (input.recommended !== undefined) item.recommended = input.recommended;
    if (input.sortOrder !== undefined) item.sortOrder = input.sortOrder;
    if (input.version !== undefined) item.version = input.version.trim();
    if (input.checksumSha256 !== undefined) item.checksumSha256 = input.checksumSha256.trim().toLowerCase();
    if (input.license !== undefined) item.license = input.license.trim();
    if (input.sourceVerified !== undefined) item.sourceVerified = input.sourceVerified;
    if (input.deprecated !== undefined) item.deprecated = input.deprecated;
    if (input.reviewStatus) item.reviewStatus = input.reviewStatus;
    item.revision = (item.revision ?? 1) + 1;
    if (!item.category || !item.description || !item.source || (!item.usagePath && !item.officialUrl)) this.fail(400, 'TOOL_INVALID', '工具必填信息不完整，且使用路径和官网链接至少保留一项。');
    item.updatedAt = this.now(); this.activity(user, 'ADMIN_TOOL_UPDATE', `更新工具：${item.name}`); this.persist(); return this.toolView(item);
  }
  deleteTool(id: string, user: RecordData): { success: true } {
    this.requireAdmin(user);
    const target = this.data.tools.find((item: RecordData) => item.id === id); if (!target) this.fail(404, 'TOOL_NOT_FOUND', 'Tool was not found.'); target.deletedAt = this.now(); target.published = false; target.reviewStatus = 'ARCHIVED'; target.revision = (target.revision ?? 1) + 1; this.activity(user, 'ADMIN_TOOL_ARCHIVE', `Archived tool ${target.name}.`); this.persist(); return { success: true };
    const index = this.data.tools.findIndex((item: RecordData) => item.id === id);
    if (index < 0) this.fail(404, 'TOOL_NOT_FOUND', '工具不存在。');
    const [removed] = this.data.tools.splice(index, 1); this.activity(user, 'ADMIN_TOOL_DELETE', `删除工具：${removed.name}`); this.persist(); return { success: true };
  }
  private feedbackView(item: RecordData): Omit<FeedbackRecord, 'priority' | 'severity' | 'tags'> {
    const owner = this.data.users.find((user: RecordData) => user.id === item.userId);
    return { id: item.id, type: item.type, title: item.title, content: item.content, ...(item.pageUrl ? { pageUrl: item.pageUrl } : {}), status: item.status ?? 'NEW', ...(item.adminNote ? { adminNote: item.adminNote } : {}), userId: item.userId, username: owner?.username ?? item.username ?? '已删除账号', email: owner?.email ?? item.email ?? '—', createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
  private enterpriseFeedbackView(item: RecordData): FeedbackRecord { return { ...this.feedbackView(item), priority: item.priority ?? (item.type === 'BUG' ? 'HIGH' : 'MEDIUM'), severity: item.severity ?? (item.type === 'BUG' ? 'S2' : 'S3'), ...(item.assignee ? { assignee: item.assignee } : {}), ...(item.publicReply ? { publicReply: item.publicReply } : {}), tags: Array.isArray(item.tags) ? item.tags : [], ...(item.slaDueAt ? { slaDueAt: item.slaDueAt } : {}) }; }
  createFeedback(input: FeedbackInput, user: RecordData): FeedbackRecord {
    const title = input.title?.trim(); const content = input.content?.trim();
    if (!input.type || !title || !content) this.fail(400, 'FEEDBACK_INVALID', '请选择反馈类型并填写标题和详细说明。');
    const now = this.now();
    const item: RecordData = { id: randomUUID(), userId: user.id, username: user.username, email: user.email, type: input.type, title, content, pageUrl: input.pageUrl?.trim().slice(0, 500), status: 'NEW', createdAt: now, updatedAt: now };
    this.data.feedbacks.push(item); this.activity(user, 'FEEDBACK_CREATE', `提交意见反馈「${title}」`); this.persist();
    item.priority = input.type === 'BUG' ? 'HIGH' : 'MEDIUM'; item.severity = input.type === 'BUG' ? 'S2' : 'S3'; item.tags = []; item.slaDueAt = new Date(Date.now() + (input.type === 'BUG' ? 24 : 72) * 60 * 60_000).toISOString();
    return this.enterpriseFeedbackView(item);
  }
  adminFeedback(user: RecordData, query: AdminListQuery = {}): Paginated<FeedbackRecord> {
    this.requireAdmin(user);
    const keyword = query.query?.trim().toLowerCase(); const rows = this.data.feedbacks.filter((item: RecordData) => (!keyword || `${item.title} ${item.content} ${item.username}`.toLowerCase().includes(keyword)) && (!query.status || query.status === 'ALL' || item.status === query.status)).map((item: RecordData) => this.enterpriseFeedbackView(item)).sort((left: FeedbackRecord, right: FeedbackRecord) => right.createdAt.localeCompare(left.createdAt)); return this.paginated(rows, query);
  }
  updateFeedback(id: string, input: FeedbackUpdate, user: RecordData): FeedbackRecord {
    this.requireAdmin(user);
    const item = this.data.feedbacks.find((entry: RecordData) => entry.id === id);
    if (!item) this.fail(404, 'FEEDBACK_NOT_FOUND', '反馈记录不存在。');
    if (input.status !== undefined) item.status = input.status;
    if (input.adminNote !== undefined) item.adminNote = input.adminNote.trim();
    if (input.priority) item.priority = input.priority;
    if (input.severity) item.severity = input.severity;
    if (input.assignee !== undefined) item.assignee = input.assignee.trim();
    if (input.publicReply !== undefined) item.publicReply = input.publicReply.trim();
    if (input.tags !== undefined) item.tags = input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
    item.updatedAt = this.now(); this.activity(user, 'ADMIN_FEEDBACK_UPDATE', `处理反馈「${item.title}」`); this.persist();
    return this.enterpriseFeedbackView(item);
  }
  deleteFeedback(id: string, user: RecordData): { success: true } {
    this.requireAdmin(user);
    const index = this.data.feedbacks.findIndex((item: RecordData) => item.id === id);
    if (index < 0) this.fail(404, 'FEEDBACK_NOT_FOUND', '反馈记录不存在。');
    const [removed] = this.data.feedbacks.splice(index, 1); this.activity(user, 'ADMIN_FEEDBACK_DELETE', `删除反馈「${removed.title}」`); this.persist();
    return { success: true };
  }
  private forumAuthor(item: RecordData) {
    const author = this.data.users.find((user: RecordData) => user.id === item.authorId);
    return { authorId: item.authorId, authorName: author?.username ?? item.authorName ?? '已删除账号', authorRole: author?.role ?? item.authorRole ?? 'USER' };
  }
  private forumPostView(item: RecordData, detailed = false): ForumPostSummary | ForumPostDetail {
    const replies = Array.isArray(item.replies) ? item.replies : [];
    const summary = { id: item.id, category: item.category, title: item.title, excerpt: item.content.replace(/\s+/g, ' ').slice(0, 140), ...this.forumAuthor(item), pinned: Boolean(item.pinned), views: item.views ?? 0, replyCount: replies.length, createdAt: item.createdAt, updatedAt: item.updatedAt } as ForumPostSummary;
    if (!detailed) return summary;
    return { ...summary, content: item.content, replies: replies.map((reply: RecordData) => ({ id: reply.id, content: reply.content, ...this.forumAuthor(reply), createdAt: reply.createdAt } as ForumReply)) } as ForumPostDetail;
  }
  forumPosts(): ForumPostSummary[] {
    return [...this.data.forumPosts].sort((left: RecordData, right: RecordData) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || right.updatedAt.localeCompare(left.updatedAt)).map((item: RecordData) => this.forumPostView(item) as ForumPostSummary);
  }
  forumPost(id: string): ForumPostDetail {
    const item = this.data.forumPosts.find((entry: RecordData) => entry.id === id);
    if (!item) this.fail(404, 'FORUM_POST_NOT_FOUND', '讨论主题不存在。');
    item.views = (item.views ?? 0) + 1; this.persist();
    return this.forumPostView(item, true) as ForumPostDetail;
  }
  createForumPost(input: ForumPostInput, user: RecordData): ForumPostDetail {
    const title = input.title?.trim(); const content = input.content?.trim();
    if (!input.category || !title || !content) this.fail(400, 'FORUM_POST_INVALID', '请选择分类并填写完整的标题和正文。');
    const now = this.now(); const item = { id: randomUUID(), category: input.category, title, content, authorId: user.id, authorName: user.username, authorRole: user.role, pinned: false, views: 0, replies: [], createdAt: now, updatedAt: now };
    this.data.forumPosts.push(item); this.activity(user, 'FORUM_POST_CREATE', `发布讨论「${title}」`); this.persist();
    return this.forumPostView(item, true) as ForumPostDetail;
  }
  createForumReply(id: string, input: ForumReplyInput, user: RecordData): ForumReply {
    const item = this.data.forumPosts.find((entry: RecordData) => entry.id === id);
    if (!item) this.fail(404, 'FORUM_POST_NOT_FOUND', '讨论主题不存在。');
    const content = input.content?.trim(); if (!content) this.fail(400, 'FORUM_REPLY_INVALID', '请填写回复内容。');
    const reply = { id: randomUUID(), content, authorId: user.id, authorName: user.username, authorRole: user.role, createdAt: this.now() };
    item.replies ??= []; item.replies.push(reply); item.updatedAt = reply.createdAt; this.activity(user, 'FORUM_REPLY_CREATE', `回复讨论「${item.title}」`); this.persist();
    return { id: reply.id, content: reply.content, ...this.forumAuthor(reply), createdAt: reply.createdAt } as ForumReply;
  }
  deleteForumPost(id: string, user: RecordData): { success: true } {
    const index = this.data.forumPosts.findIndex((entry: RecordData) => entry.id === id);
    if (index < 0) this.fail(404, 'FORUM_POST_NOT_FOUND', '讨论主题不存在。');
    const post = this.data.forumPosts[index];
    if (post.authorId !== user.id && user.role !== 'ADMIN') this.fail(403, 'FORUM_POST_FORBIDDEN', '只能删除自己发布的讨论。');
    this.data.forumPosts.splice(index, 1); this.activity(user, 'FORUM_POST_DELETE', `删除讨论「${post.title}」`); this.persist();
    return { success: true };
  }
  private adminChallengeView(challenge: RecordData): AdminChallengeRecord {
    const attempts = this.data.attempts.filter((item: RecordData) => item.challengeId === challenge.id);
    const solves = Array.isArray(challenge.solves) ? challenge.solves.length : attempts.filter((item: RecordData) => item.correct).length;
    const solveDurations = attempts.filter((item: RecordData) => item.correct).flatMap((attempt: RecordData) => {
      const started = this.data.labs.filter((lab: RecordData) => lab.challengeId === challenge.id && lab.userId === attempt.userId && lab.startedAt && new Date(lab.startedAt).getTime() <= new Date(attempt.createdAt).getTime()).sort((a: RecordData, b: RecordData) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      return started ? [(new Date(attempt.createdAt).getTime() - new Date(started.startedAt).getTime()) / 60_000] : [];
    });
    const skill = challenge.skills?.[0];
    const storedGuide = challenge.hints?.[0]?.content;
    const guide = officialGuideFor(challenge.slug, storedGuide);
    const guideFields = officialGuideAdminFields(challenge.slug, storedGuide);
    return {
      id: challenge.id, slug: challenge.slug, title: challenge.title, category: challenge.category, difficulty: challenge.difficulty,
      points: challenge.points, description: challenge.description, goal: challenge.goal ?? challenge.description, tags: challenge.tags?.length ? challenge.tags : (TAGS[challenge.category] ?? ['安全训练']),
      isActive: challenge.isActive !== false, isDynamic: challenge.isDynamic !== false, flagConfigured: /^[a-f0-9]{64}$/i.test(challenge.flagHash ?? ''),
      labKind: challenge.labKind ?? (challenge.category === 'WEB' ? 'WEB_APPLICATION' : 'ARTIFACT_ANALYSIS'), labTtlMinutes: challenge.labTtlMinutes ?? 30,
      ...(skill ? { skillSlug: skill.slug, xpReward: skill.xp } : {}), solves, attempts: attempts.length, incorrectAttempts: attempts.filter((item: RecordData) => !item.correct).length,
      completionRate: attempts.length ? Math.round((solves / attempts.length) * 100) : 0, attachmentCount: challengeAttachments(challenge.slug).length,
      ...(solveDurations.length ? { averageSolveMinutes: Math.round(solveDurations.reduce((sum: number, value: number) => sum + value, 0) / solveDurations.length) } : {}),
      guideConfigured: Boolean(guide.summary && guide.principle && guide.steps?.length), ...guideFields,
      reviewStatus: challenge.reviewStatus ?? (challenge.isActive === false ? 'DRAFT' : 'PUBLISHED'), revision: challenge.revision ?? 1,
      owner: challenge.owner ?? '', ...(challenge.scheduledAt ? { scheduledAt: challenge.scheduledAt } : {}),
      maxConcurrentLabs: challenge.maxConcurrentLabs ?? 20, cpuLimit: challenge.cpuLimit ?? 1, memoryLimitMb: challenge.memoryLimitMb ?? 512,
      updatedAt: challenge.updatedAt ?? challenge.createdAt ?? this.now(),
    } as AdminChallengeRecord;
  }
  adminChallenges(user: RecordData, query: AdminListQuery = {}): Paginated<AdminChallengeRecord> {
    this.requireAdmin(user);
    const keyword = query.query?.trim().toLowerCase(); const rows = this.data.challenges.filter((item: RecordData) => !item.deletedAt && (!keyword || `${item.title} ${item.slug}`.toLowerCase().includes(keyword)) && (!query.status || query.status === 'ALL' || (item.reviewStatus ?? (item.isActive === false ? 'DRAFT' : 'PUBLISHED')) === query.status)).map((item: RecordData) => this.adminChallengeView(item)).sort((a: AdminChallengeRecord, b: AdminChallengeRecord) => a.slug.localeCompare(b.slug)); return this.paginated(rows, query);
  }
  createAdminChallenge(input: AdminChallengeInput, user: RecordData): AdminChallengeRecord {
    this.requireAdmin(user);
    const slug = input.slug?.trim().toLowerCase(); const title = input.title?.trim(); const description = input.description?.trim(); const goal = input.goal?.trim();
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || !description || !goal || !input.category || !input.difficulty || input.points === undefined || !input.flag?.trim() || !input.guideSummary?.trim() || !input.guidePrinciple?.trim() || !input.guideSteps?.trim()) this.fail(400, 'CHALLENGE_INVALID', '请完整填写题目标识、基础信息、Flag 与官方题解。');
    if (this.data.challenges.some((item: RecordData) => item.slug === slug)) this.fail(409, 'CHALLENGE_EXISTS', '题目标识已存在。');
    const now = this.now();
    const authoredGuide = buildOfficialGuide(slug, title, input);
    const challenge = { id: randomUUID(), slug, title, category: input.category, difficulty: input.difficulty, points: input.points, description, goal, tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [], flagHash: this.sha256(input.flag.trim()), isActive: input.isActive !== false, reviewStatus: input.reviewStatus ?? (input.isActive !== false ? 'PUBLISHED' : 'DRAFT'), revision: 1, owner: input.owner?.trim() || user.username, scheduledAt: input.scheduledAt || undefined, maxConcurrentLabs: input.maxConcurrentLabs ?? 20, cpuLimit: input.cpuLimit ?? 1, memoryLimitMb: input.memoryLimitMb ?? 512, isDynamic: input.isDynamic !== false, labKind: input.labKind ?? 'AUTO', labTtlMinutes: input.labTtlMinutes ?? 30, skills: input.skillSlug ? [{ slug: input.skillSlug, xp: input.xpReward ?? input.points }] : [], solves: [], hints: [{ title: authoredGuide.title, content: JSON.stringify(authoredGuide), cost: 20 }], createdAt: now, updatedAt: now };
    this.data.challenges.push(challenge); this.activity(user, 'ADMIN_CHALLENGE_CREATE', `创建题目「${title}」`); this.persist();
    return this.adminChallengeView(challenge);
  }
  updateAdminChallenge(id: string, input: AdminChallengeInput, user: RecordData): AdminChallengeRecord {
    this.requireAdmin(user);
    const challenge = this.data.challenges.find((item: RecordData) => item.id === id);
    if (!challenge) this.fail(404, 'CHALLENGE_NOT_FOUND', '题目不存在。');
    if (input.slug !== undefined) { const slug = input.slug.trim().toLowerCase(); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) this.fail(400, 'CHALLENGE_INVALID', '题目标识只能包含小写字母、数字和连字符。'); if (this.data.challenges.some((item: RecordData) => item.id !== id && item.slug === slug)) this.fail(409, 'CHALLENGE_EXISTS', '题目标识已存在。'); challenge.slug = slug; }
    for (const key of ['title', 'description', 'goal', 'labKind', 'skillSlug'] as const) if (input[key] !== undefined) { const value = input[key]?.trim(); if (!value && key !== 'skillSlug') this.fail(400, 'CHALLENGE_INVALID', '题目字段不能为空。'); if (key !== 'skillSlug') challenge[key] = value; }
    for (const key of ['category', 'difficulty', 'points', 'isActive', 'isDynamic', 'labTtlMinutes'] as const) if (input[key] !== undefined) challenge[key] = input[key];
    if (input.reviewStatus) challenge.reviewStatus = input.reviewStatus;
    if (input.owner !== undefined) challenge.owner = input.owner.trim();
    if (input.scheduledAt !== undefined) challenge.scheduledAt = input.scheduledAt || undefined;
    if (input.maxConcurrentLabs !== undefined) challenge.maxConcurrentLabs = input.maxConcurrentLabs;
    if (input.cpuLimit !== undefined) challenge.cpuLimit = input.cpuLimit;
    if (input.memoryLimitMb !== undefined) challenge.memoryLimitMb = input.memoryLimitMb;
    challenge.revision = (challenge.revision ?? 1) + 1;
    if (input.tags !== undefined) challenge.tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
    if (input.flag?.trim()) challenge.flagHash = this.sha256(input.flag.trim());
    if (input.guideSummary !== undefined || input.guidePrinciple !== undefined || input.guideSteps !== undefined) {
      const authoredGuide = buildOfficialGuide(challenge.slug, challenge.title, input, challenge.hints?.[0]?.content);
      challenge.hints = [{ ...(challenge.hints?.[0] ?? {}), title: authoredGuide.title, content: JSON.stringify(authoredGuide), cost: 20 }];
    }
    if (input.skillSlug !== undefined) challenge.skills = input.skillSlug ? [{ slug: input.skillSlug, xp: input.xpReward ?? input.points ?? challenge.points }] : [];
    else if (input.xpReward !== undefined && challenge.skills?.[0]) challenge.skills[0].xp = input.xpReward;
    challenge.updatedAt = this.now(); this.activity(user, 'ADMIN_CHALLENGE_UPDATE', `更新题目「${challenge.title}」`); this.persist();
    return this.adminChallengeView(challenge);
  }
  deleteAdminChallenge(id: string, user: RecordData): { success: true } {
    this.requireAdmin(user);
    const target = this.data.challenges.find((item: RecordData) => item.id === id); if (!target) this.fail(404, 'CHALLENGE_NOT_FOUND', 'Challenge was not found.'); target.deletedAt = this.now(); target.isActive = false; target.reviewStatus = 'ARCHIVED'; target.revision = (target.revision ?? 1) + 1; this.activity(user, 'ADMIN_CHALLENGE_ARCHIVE', `Archived challenge ${target.title}.`); this.persist(); return { success: true };
    const index = this.data.challenges.findIndex((item: RecordData) => item.id === id);
    if (index < 0) this.fail(404, 'CHALLENGE_NOT_FOUND', '题目不存在。');
    const related = this.data.attempts.some((item: RecordData) => item.challengeId === id) || this.data.labs.some((item: RecordData) => item.challengeId === id) || this.data.users.some((item: RecordData) => item.solved?.includes(id));
    if (related) this.fail(409, 'CHALLENGE_HAS_HISTORY', '该题已有答题或靶场记录，请先下架而不是删除。');
    const [removed] = this.data.challenges.splice(index, 1); this.activity(user, 'ADMIN_CHALLENGE_DELETE', `删除题目「${removed.title}」`); this.persist(); return { success: true };
  }
  diagnoseAdminChallenge(id: string, user: RecordData): ChallengeDiagnostic {
    this.requireAdmin(user);
    const challenge = this.data.challenges.find((item: RecordData) => item.id === id);
    if (!challenge) this.fail(404, 'CHALLENGE_NOT_FOUND', '题目不存在。');
    let targetReady = false; let targetDetail = '靶场生成器执行失败。';
    try { const target = createLabTarget(this.labFlagSecret, challenge, { instanceId: 'admin-diagnostic', expiresAt: new Date(Date.now() + 60000).toISOString() }); targetReady = Boolean(target.artifact && target.objective && target.steps.length); targetDetail = targetReady ? `可生成 ${target.kind} 靶场材料与任务流程。` : targetDetail; } catch {}
    const guide = officialGuideFor(challenge.slug, challenge.hints?.[0]?.content);
    const checks = [
      { name: '基础字段', ok: Boolean(challenge.slug && challenge.title && challenge.description && challenge.goal), detail: '题目标识、标题、说明和解题目标完整。' },
      { name: 'Flag 校验', ok: /^[a-f0-9]{64}$/i.test(challenge.flagHash ?? ''), detail: '只检查服务端哈希格式，不返回 Flag。' },
      { name: '靶场模板', ok: targetReady, detail: targetDetail },
      { name: '官方题解', ok: Boolean(guide.steps?.length), detail: guide.steps?.length ? `已配置 ${guide.steps.length} 个解题步骤。` : '缺少官方题解步骤。' },
    ];
    this.activity(user, 'ADMIN_CHALLENGE_DIAGNOSE', `诊断题目「${challenge.title}」`); this.persist();
    return { challengeId: id, checkedAt: this.now(), healthy: checks.every((item) => item.ok), checks };
  }
  adminLabs(user: RecordData): AdminLabRecord[] {
    this.requireAdmin(user); this.expireSessions();
    return [...this.data.labs].reverse().slice(0, 100).map((lab: RecordData) => { const challenge = this.challengeById(lab.challengeId); const owner = this.data.users.find((item: RecordData) => item.id === lab.userId); return { instanceId: lab.instanceId, challengeId: lab.challengeId, challengeSlug: challenge?.slug ?? 'unknown', challengeTitle: challenge?.title ?? '已删除题目', username: owner?.username ?? '已删除账号', status: lab.status, startedAt: lab.startedAt, expiresAt: lab.expiresAt, remainingSeconds: lab.status === 'RUNNING' ? Math.max(0, Math.ceil((new Date(lab.expiresAt).getTime() - Date.now()) / 1000)) : 0 } as AdminLabRecord; });
  }
  stopAdminLab(instanceId: string, user: RecordData): { success: true } {
    this.requireAdmin(user); const lab = this.data.labs.find((item: RecordData) => item.instanceId === instanceId);
    if (!lab) this.fail(404, 'LAB_NOT_FOUND', '靶场实例不存在。');
    if (lab.status === 'RUNNING') { lab.status = 'STOPPED'; lab.stoppedAt = this.now(); lab.remainingSeconds = 0; }
    this.activity(user, 'ADMIN_LAB_STOP', `停止靶场实例 ${instanceId}`); this.persist(); return { success: true };
  }
  adminAudit(user: RecordData, query: AdminListQuery = {}): Paginated<AdminAuditRecord> {
    this.requireAdmin(user); const keyword = query.query?.trim().toLowerCase();
    const rows = this.data.users.flatMap((actor: RecordData) => (actor.activities ?? []).map((entry: RecordData, index: number) => ({ id: `${actor.id}-${index}-${entry.createdAt}`, actorId: actor.id, actorName: actor.username, action: entry.type, summary: entry.message ?? entry.type, createdAt: entry.createdAt, metadata: entry.metadata ?? {} } as AdminAuditRecord))).filter((item: AdminAuditRecord) => (item.action.startsWith('ADMIN_') || ['LOGIN', 'LOGOUT_ALL'].includes(item.action)) && (!query.status || query.status === 'ALL' || item.action.startsWith(query.status)) && (!keyword || `${item.actorName} ${item.summary}`.toLowerCase().includes(keyword))).sort((a: AdminAuditRecord, b: AdminAuditRecord) => b.createdAt.localeCompare(a.createdAt));
    return this.paginated(rows, query);
  }
  adminOverview(user: RecordData): AdminOverviewSnapshot {
    this.requireAdmin(user); const now = new Date(); const day = 24 * 60 * 60_000; const since24 = now.getTime() - day;
    const dates = (values: string[]) => Array.from({ length: 7 }, (_, index) => { const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (6 - index)); const end = start.getTime() + day; return values.filter((value) => { const timestamp = new Date(value).getTime(); return timestamp >= start.getTime() && timestamp < end; }).length; });
    const failedLabs24h = this.data.labs.filter((item: RecordData) => item.status === 'FAILED' && new Date(item.stoppedAt ?? item.expiresAt).getTime() >= since24).length;
    const pendingFeedback = this.data.feedbacks.filter((item: RecordData) => ['NEW', 'IN_PROGRESS'].includes(item.status ?? 'NEW')).length;
    const draftAnnouncements = this.data.announcements.filter((item: RecordData) => item.published === false && !item.deletedAt).length;
    const alerts: AdminOverviewSnapshot['alerts'] = [];
    if (failedLabs24h) alerts.push({ id: 'failed-labs', severity: 'CRITICAL', title: '靶场实例存在失败', detail: `24 小时内检测到 ${failedLabs24h} 个失败实例。`, createdAt: now.toISOString() });
    if (pendingFeedback) alerts.push({ id: 'pending-feedback', severity: pendingFeedback > 10 ? 'WARNING' : 'INFO', title: '存在待处理反馈', detail: `${pendingFeedback} 条反馈尚未闭环。`, createdAt: now.toISOString() });
    return { generatedAt: now.toISOString(), environment: process.env.NODE_ENV ?? 'development', version: process.env.APP_VERSION ?? '2.0.0', health: [{ key: 'storage', label: '本地数据存储', status: 'HEALTHY', detail: 'JSON 数据文件可读写' }, { key: 'ai', label: 'AI 模型服务', status: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY ? 'HEALTHY' : 'UNKNOWN', detail: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY ? 'API 凭据已配置' : '未配置模型凭据' }, { key: 'labs', label: '靶场调度', status: failedLabs24h ? 'DEGRADED' : 'HEALTHY', detail: failedLabs24h ? `24 小时内 ${failedLabs24h} 个实例失败` : '24 小时内无失败实例' }], metrics: { registeredUsers: this.data.users.filter((item: RecordData) => item.status !== 'PENDING_DELETION').length, activeUsers24h: this.data.users.filter((item: RecordData) => item.status === 'ACTIVE' && new Date(item.lastLoginAt ?? 0).getTime() >= since24).length, publishedChallenges: this.data.challenges.filter((item: RecordData) => item.isActive !== false && !item.deletedAt).length, runningLabs: this.data.labs.filter((item: RecordData) => item.status === 'RUNNING').length, failedLabs24h, solves24h: this.data.attempts.filter((item: RecordData) => item.correct && new Date(item.createdAt).getTime() >= since24).length, aiRequests24h: (this.data.aiConversations ?? []).flatMap((item: RecordData) => item.messages ?? []).filter((item: RecordData) => item.role === 'assistant' && new Date(item.createdAt).getTime() >= since24).length, pendingFeedback, draftAnnouncements }, trends: { registrations: dates(this.data.users.map((item: RecordData) => item.createdAt)), solves: dates(this.data.attempts.filter((item: RecordData) => item.correct).map((item: RecordData) => item.createdAt)), aiRequests: dates((this.data.aiConversations ?? []).flatMap((item: RecordData) => item.messages ?? []).filter((item: RecordData) => item.role === 'assistant').map((item: RecordData) => item.createdAt)) }, alerts, recentAudit: this.adminAudit(user, { pageSize: 8 }).items };
  }
  private challengeBySlug(slug: string) {
    const challenge = this.data.challenges.find((item: RecordData) => item.slug === slug || item.id === slug);
    if (challenge?.deletedAt) this.fail(404, 'CHALLENGE_NOT_FOUND', 'Challenge was archived.');
    if (!challenge || challenge.isActive === false) this.fail(404, 'CHALLENGE_NOT_FOUND', '题目不存在或尚未发布。');
    return challenge;
  }
  private challengeById(id: string) { return this.data.challenges.find((challenge: RecordData) => challenge.id === id); }

  private labAccessUrl(_challenge: RecordData, instanceId?: string) {
    if (!instanceId) return undefined;
    return `/targets/${encodeURIComponent(instanceId)}`;
  }

  private activeLabByInstance(instanceId: string, user: RecordData) {
    this.expireSessions();
    const lab = this.data.labs.find((item: RecordData) => item.instanceId === instanceId && item.userId === user.id && item.status === 'RUNNING');
    if (!lab) this.fail(404, 'LAB_NOT_RUNNING', '靶场不存在、已结束或不属于当前账号。');
    return lab;
  }

  private sessionFor(user: RecordData | undefined, challenge: RecordData) {
    if (!user) return { status: 'STOPPED', running: false, requiresLogin: true, remainingSeconds: 0 };
    this.expireSessions();
    const lab = [...this.data.labs].reverse().find((item: RecordData) => item.userId === user.id && item.challengeId === challenge.id && item.status === 'RUNNING');
    if (!lab) return { status: 'STOPPED', running: false, requiresLogin: false, remainingSeconds: 0 };
    const remainingSeconds = Math.max(0, Math.ceil((new Date(lab.expiresAt).getTime() - Date.now()) / 1000));
    return { ...lab, accessUrl: this.labAccessUrl(challenge, lab.instanceId), running: remainingSeconds > 0, remainingSeconds };
  }

  private hintsFor(challenge: RecordData, user?: RecordData) {
    const id = `${challenge.id}:1`;
    const solved = Boolean(user?.solved?.includes(challenge.id));
    const unlocked = solved || Boolean(user?.unlockedHints?.[id]);
    return [{ id, title: officialGuideFor(challenge.slug, challenge.hints?.[0]?.content).title, cost: 20, order: 1, unlocked, ...(unlocked ? { content: officialGuideContent(challenge.slug, challenge.hints?.[0]?.content) } : {}) }];
  }

  private recentAttempts(user: RecordData | undefined, challenge: RecordData) {
    if (!user) return [];
    return this.data.attempts.filter((attempt: RecordData) => attempt.userId === user.id && attempt.challengeId === challenge.id).slice(-5).reverse().map((attempt: RecordData) => ({ id: attempt.id, correct: attempt.correct, createdAt: attempt.createdAt }));
  }

  private challengeView(challenge: RecordData, user?: RecordData, detailed = false) {
    const solved = Boolean(user?.solved?.includes(challenge.id)); const attempts = this.recentAttempts(user, challenge);
    const attachments = challengeAttachments(challenge.slug);
    const result: RecordData = { id: challenge.id, slug: challenge.slug, title: challenge.title, category: challenge.category, difficulty: challenge.difficulty, points: challenge.points, description: challenge.description, goal: challenge.goal, tags: challenge.tags?.length ? challenge.tags : (TAGS[challenge.category] ?? ['安全训练']), solves: Array.isArray(challenge.solves) ? challenge.solves.length : 0, solved, available: true, attachmentCount: attachments.length, hasConnection: Boolean(challenge.connection) };
    if (detailed) {
      result.hints = this.hintsFor(challenge, user); result.attachments = attachments; result.connection = challenge.connection;
      result.workspace = { session: this.sessionFor(user, challenge), recentSubmissions: attempts, submissionStats: { total: attempts.length, correct: attempts.filter((item: RecordData) => item.correct).length }, resourceHealth: { status: 'READY' }, nextChallenge: this.nextChallenge(user, challenge) };
      result.attempts = attempts; result.submissionStats = result.workspace.submissionStats;
    }
    return result;
  }

  listChallenges(user?: RecordData) { return this.data.challenges.filter((challenge: RecordData) => challenge.isActive !== false && !challenge.deletedAt).map((challenge: RecordData) => this.challengeView(challenge, user)); }
  challengeDetail(slug: string, user?: RecordData): ChallengeDetail { return this.challengeView(this.challengeBySlug(slug), user, true) as ChallengeDetail; }
  workspace(slug: string, user: RecordData): WorkspaceOverview {
    const challenge = this.challengeBySlug(slug); const attempts = this.recentAttempts(user, challenge);
    return { session: this.sessionFor(user, challenge), recentSubmissions: attempts, submissionStats: { total: attempts.length, correct: attempts.filter((item: RecordData) => item.correct).length }, resourceHealth: { status: 'READY' }, nextChallenge: this.nextChallenge(user, challenge) } as WorkspaceOverview;
  }
  private noteRecords(user: RecordData): RecordData[] {
    if (Array.isArray(user.challengeNotes)) return user.challengeNotes;
    const legacy = user.challengeNotes && typeof user.challengeNotes === 'object' ? user.challengeNotes : {};
    user.challengeNotes = Object.entries(legacy).flatMap(([challengeId, value]) => {
      const note = value as RecordData;
      if (!note?.content?.trim()) return [];
      return [{ id: randomUUID(), challengeId, content: note.content, createdAt: note.createdAt ?? this.now(), updatedAt: note.updatedAt ?? note.createdAt ?? this.now() }];
    });
    return user.challengeNotes;
  }
  private noteView(note: RecordData): ChallengeNote | undefined {
    const challenge = this.challengeById(note.challengeId);
    if (!challenge || !note?.content?.trim()) return undefined;
    return { id: note.id, slug: challenge.slug, challengeTitle: challenge.title, category: challenge.category, content: note.content, createdAt: note.createdAt, updatedAt: note.updatedAt } as ChallengeNote;
  }
  challengeNotes(user: RecordData): ChallengeNote[] {
    return this.noteRecords(user).flatMap((note) => this.noteView(note) ?? []).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }
  challengeNotesForChallenge(slug: string, user: RecordData): ChallengeNote[] {
    const challenge = this.challengeBySlug(slug);
    return this.noteRecords(user).filter((note) => note.challengeId === challenge.id).flatMap((note) => this.noteView(note) ?? []).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }
  createChallengeNote(slug: string, user: RecordData, content: string): ChallengeNote {
    const challenge = this.challengeBySlug(slug);
    if (!content.trim()) this.fail(400, 'NOTE_EMPTY', '请先填写笔记内容。');
    const now = this.now();
    const note = { id: randomUUID(), challengeId: challenge.id, content, createdAt: now, updatedAt: now };
    this.noteRecords(user).push(note);
    this.persist();
    return this.noteView(note)!;
  }
  deleteChallengeNote(noteId: string, user: RecordData): { success: true } {
    const notes = this.noteRecords(user);
    const index = notes.findIndex((note) => note.id === noteId);
    if (index < 0) this.fail(404, 'NOTE_NOT_FOUND', '笔记不存在或不属于当前账号。');
    notes.splice(index, 1);
    this.persist();
    return { success: true };
  }
  challengeAttachment(slug: string, fileName: string) {
    const challenge = this.challengeBySlug(slug);
    const attachment = resolveChallengeAttachment(challenge.slug, fileName);
    if (!attachment) this.fail(404, 'ATTACHMENT_NOT_FOUND', '附件不存在或不属于当前题目。');
    return attachment;
  }
  private nextChallenge(user: RecordData | undefined, current: RecordData) {
    if (!user) return undefined;
    const next = this.data.challenges.find((challenge: RecordData) => challenge.isActive !== false && challenge.id !== current.id && !user.solved?.includes(challenge.id));
    return next ? { slug: next.slug, title: next.title } : undefined;
  }

  submit(slug: string, user: RecordData, flag: string) {
    const challenge = this.challengeBySlug(slug);
    if (!flag?.trim()) this.fail(400, 'VALIDATION_FAILED', '请输入 Flag 后再提交。');
    const recentLab = [...this.data.labs].reverse().find((item: RecordData) => item.userId === user.id && item.challengeId === challenge.id && new Date(item.expiresAt).getTime() > Date.now());
    const sessionFlagHash = recentLab ? this.sha256(createSessionFlag(this.labFlagSecret, challenge.slug, recentLab.instanceId)) : '';
    const correct = this.sha256(flag.trim()) === challenge.flagHash || this.sha256(flag.trim()) === sessionFlagHash;
    this.data.attempts.push({ id: randomUUID(), userId: user.id, challengeId: challenge.id, submittedHash: this.sha256(flag.trim()), correct, createdAt: this.now() });
    if (!correct) { this.activity(user, 'FLAG_ATTEMPT', `尝试「${challenge.title}」但尚未通过验证`); this.persist(); return { success: false, message: 'Flag incorrect', attempts: this.recentAttempts(user, challenge) }; }
    if (user.solved?.includes(challenge.id)) { this.persist(); return { success: true, alreadySolved: true, message: '该题已完成，积分不会重复计算。', newScore: user.score, attempts: this.recentAttempts(user, challenge) }; }
    user.solved = [...(user.solved ?? []), challenge.id]; challenge.solves = [...(challenge.solves ?? []), user.id]; user.score = (user.score ?? 0) + challenge.points; user.xp = (user.xp ?? 0) + challenge.points; user.skills ??= {};
    const skillRewards = (challenge.skills ?? []).map((reward: RecordData) => { user.skills[reward.slug] = (user.skills[reward.slug] ?? 0) + reward.xp; return { skillSlug: reward.slug, xp: reward.xp, newLevel: this.skillLevel(user.skills[reward.slug]) }; });
    user.level = Math.max(1, Math.floor(user.xp / 250) + 1); this.activity(user, 'CHALLENGE_SOLVE', `完成「${challenge.title}」`); this.persist();
    return { success: true, points: challenge.points, newScore: user.score, isFirstBlood: challenge.solves.length === 1, skillRewards, attempts: this.recentAttempts(user, challenge) };
  }

  unlockHint(slug: string, hintId: string, user: RecordData) {
    const challenge = this.challengeBySlug(slug); const id = `${challenge.id}:1`;
    if (hintId !== id) this.fail(404, 'HINT_NOT_FOUND', '官方题解不存在。');
    if (user.solved?.includes(challenge.id)) return { content: officialGuideContent(challenge.slug, challenge.hints?.[0]?.content), cost: 0, newScore: user.score };
    user.unlockedHints ??= {};
    if (user.unlockedHints[id]) this.fail(409, 'HINT_ALREADY_UNLOCKED', '官方题解已解锁。');
    if ((user.score ?? 0) < 20) this.fail(400, 'INSUFFICIENT_POINTS', '积分不足，解锁官方题解需要 20 积分。');
    user.score -= 20; user.unlockedHints[id] = true; this.activity(user, 'HINT_UNLOCK', `解锁「${challenge.title}」官方题解`); this.persist();
    return { content: officialGuideContent(challenge.slug, challenge.hints?.[0]?.content), cost: 20, newScore: user.score };
  }

  startLab(user: RecordData, challengeId: string) {
    const challenge = this.challengeBySlug(challengeId); const existing = this.sessionFor(user, challenge);
    if (existing.running) return { ...existing, message: '当前题目的 CTF 靶场已在运行。' };
    const ttl = Number(challenge.labTtlMinutes ?? 0) > 0 ? Number(challenge.labTtlMinutes) * 60 : Number(process.env.LAB_TTL_SECONDS ?? 1800); const startedAt = this.now();
    const lab = { instanceId: randomUUID(), userId: user.id, challengeId: challenge.id, status: 'RUNNING', accessMode: 'LOCAL_GUIDED', startedAt, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), remainingSeconds: ttl, message: '本地 CTF 靶场已启动：请进入独立目标页完成利用或材料分析并找到 Flag。' };
    this.data.labs.push(lab); this.activity(user, 'LAB_START', `启动「${challenge.title}」CTF 靶场`); this.persist();
    return { ...lab, accessUrl: this.labAccessUrl(challenge, lab.instanceId), running: true };
  }

  labTarget(instanceId: string, user: RecordData) {
    const lab = this.activeLabByInstance(instanceId, user);
    const challenge = this.challengeById(lab.challengeId);
    if (!challenge) this.fail(404, 'CHALLENGE_NOT_FOUND', '当前靶场关联的题目不存在。');
    return createLabTarget(this.labFlagSecret, challenge, lab);
  }

  interactLabTarget(instanceId: string, input: string, user: RecordData) {
    const lab = this.activeLabByInstance(instanceId, user);
    const challenge = this.challengeById(lab.challengeId);
    if (!challenge) this.fail(404, 'CHALLENGE_NOT_FOUND', '当前靶场关联的题目不存在。');
    return interactLabTarget(this.labFlagSecret, challenge, lab, input);
  }

  labStatus(slug: string, user: RecordData): { session: LabSession; resourceHealth: { status: 'READY' } } { return { session: this.sessionFor(user, this.challengeBySlug(slug)), resourceHealth: { status: 'READY' } } as { session: LabSession; resourceHealth: { status: 'READY' } }; }
  refreshLab(slug: string, user: RecordData) {
    const challenge = this.challengeBySlug(slug); const lab = [...this.data.labs].reverse().find((item: RecordData) => item.userId === user.id && item.challengeId === challenge.id && item.status === 'RUNNING');
    if (!lab) this.fail(404, 'LAB_NOT_RUNNING', '当前题目没有运行中的受控会话。');
    lab.expiresAt = new Date(Date.now() + Number(process.env.LAB_TTL_SECONDS ?? 1800) * 1000).toISOString(); this.activity(user, 'LAB_REFRESH', `延长「${challenge.title}」本地会话`); this.persist(); return { session: this.sessionFor(user, challenge) };
  }
  stopLab(slug: string, user: RecordData) {
    const challenge = this.challengeBySlug(slug); const lab = [...this.data.labs].reverse().find((item: RecordData) => item.userId === user.id && item.challengeId === challenge.id && item.status === 'RUNNING');
    if (!lab) this.fail(404, 'LAB_NOT_RUNNING', '当前题目没有运行中的受控会话。');
    lab.status = 'STOPPED'; lab.stoppedAt = this.now(); lab.remainingSeconds = 0; this.activity(user, 'LAB_STOP', `结束「${challenge.title}」CTF 靶场`); this.persist(); return { session: this.sessionFor(user, challenge), message: '本地 CTF 靶场已结束。' };
  }

  rangeOverview(user?: RecordData) {
    this.expireSessions(); const sessions = user ? this.data.labs.filter((lab: RecordData) => lab.userId === user.id && lab.status === 'RUNNING').map((lab: RecordData) => { const challenge = this.challengeById(lab.challengeId); return { ...lab, slug: challenge?.slug, title: challenge?.title, category: challenge?.category, expiresInMinutes: Math.max(0, Math.ceil((new Date(lab.expiresAt).getTime() - Date.now()) / 60000)) }; }) : [];
    return { metrics: { availableTasks: this.data.challenges.filter((challenge: RecordData) => challenge.isActive !== false).length, activeSessions: sessions.length, completed: user?.solved?.length ?? 0, attachments: attachmentCount() }, sessions, tasks: this.listChallenges(user).filter((item: RecordData) => !item.solved) };
  }

  dashboardStats(user?: RecordData) {
    this.expireSessions(); return { activeUsers: this.data.users.length, registeredUsers: this.data.users.length, totalChallenges: this.data.challenges.filter((challenge: RecordData) => challenge.isActive !== false).length, totalSolves: this.data.attempts.filter((attempt: RecordData) => attempt.correct).length, runningLabs: this.data.labs.filter((lab: RecordData) => lab.status === 'RUNNING').length, onlineUsers: user ? 1 : 0, solvesToday: this.data.attempts.filter((attempt: RecordData) => attempt.correct && attempt.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length };
  }
  dashboardEvents() { return this.data.users.flatMap((user: RecordData) => (user.activities ?? []).map((activity: RecordData) => ({ username: user.username, ...activity }))).sort((a: RecordData, b: RecordData) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12); }
  leaderboard() { return this.data.users.filter((user: RecordData) => user.role === 'USER' && (user.status ?? 'ACTIVE') === 'ACTIVE').sort((a: RecordData, b: RecordData) => (b.score ?? 0) - (a.score ?? 0)).map((user: RecordData, index: number) => ({ id: user.id, rank: index + 1, username: user.username, level: user.level ?? 1, score: user.score ?? 0, solved: user.solved?.length ?? 0 })); }
  skillGraph() { return { nodes: SKILLS.map(([slug, name, category, description], index) => ({ slug, name, category, description, x: index % 3, y: Math.floor(index / 3) })), edges: [] }; }
  private skillLevel(xp: number) { return Math.max(1, Math.floor(xp / 100) + 1); }
  userSkills(user: RecordData): SkillProgress[] { return SKILLS.map(([slug, name, category, description]) => { const xp = user.skills?.[slug] ?? 0; return { skill: { slug, name, category, description }, xp, level: this.skillLevel(xp), status: xp > 0 ? 'LEARNING' : 'AVAILABLE' }; }) as SkillProgress[]; }
  learningOverview(user?: RecordData) {
    const courses = this.data.courses.map((course: RecordData) => {
      const completed = Boolean(user?.solved?.some((id: string) => this.challengeById(id)?.slug === course.challengeSlug));
      return { ...course, progress: completed ? 100 : 0, completed };
    });
    return { summary: { courseCount: courses.length, finished: courses.filter((course: RecordData) => course.completed).length, skillXp: Object.values(user?.skills ?? {}).reduce((total: number, xp: any) => total + Number(xp), 0) }, courses };
  }
  async aiChat(user: RecordData, message: string, challengeId?: string, hintLevel = 1, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], skill: LearningSkillId = 'auto') { const challenge = challengeId ? this.challengeBySlug(challengeId) : undefined; const memory = updateLearningMemory(user.aiLearningMemory, message); user.aiLearningMemory = memory; this.activity(user, 'AI_TUTOR', '使用 AI 智能体学习中心'); this.persist(); return answerLearningQuestion(message, challenge?.title, hintLevel, history, skill, memory); }
  private aiConversationRecord(id: string, user: RecordData) {
    const item = this.data.aiConversations.find((conversation: RecordData) => conversation.id === id && conversation.userId === user.id);
    if (!item) this.fail(404, 'AI_CONVERSATION_NOT_FOUND', '对话不存在或已被删除。');
    return item;
  }
  private aiConversationSummary(item: RecordData): AiConversationSummary {
    return { id: item.id, title: item.title, archived: Boolean(item.archived), messageCount: item.messages?.length ?? 0, createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
  aiConversations(user: RecordData, archived = false): AiConversationSummary[] {
    return this.data.aiConversations.filter((item: RecordData) => item.userId === user.id && Boolean(item.archived) === archived)
      .sort((left: RecordData, right: RecordData) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 100).map((item: RecordData) => this.aiConversationSummary(item));
  }
  aiConversation(id: string, user: RecordData): AiConversationDetail {
    const item = this.aiConversationRecord(id, user);
    return { ...this.aiConversationSummary(item), messages: (item.messages ?? []).map((message: RecordData) => ({ ...message, feedback: message.feedback ?? null })) };
  }
  createAiConversation(user: RecordData, title = '新的学习对话'): AiConversationSummary {
    const now = this.now();
    const item = { id: randomUUID(), userId: user.id, title: title.trim().slice(0, 80) || '新的学习对话', archived: false, messages: [], createdAt: now, updatedAt: now };
    this.data.aiConversations.push(item); this.persist(); return this.aiConversationSummary(item);
  }
  updateAiConversation(id: string, user: RecordData, input: { title?: string; archived?: boolean }): AiConversationSummary {
    const item = this.aiConversationRecord(id, user);
    if (input.title !== undefined) item.title = input.title.trim().slice(0, 80) || item.title;
    if (input.archived !== undefined) item.archived = input.archived;
    item.updatedAt = this.now(); this.persist(); return this.aiConversationSummary(item);
  }
  deleteAiConversation(id: string, user: RecordData) {
    const item = this.aiConversationRecord(id, user);
    this.data.aiConversations = this.data.aiConversations.filter((conversation: RecordData) => conversation.id !== item.id);
    this.persist(); return { success: true as const };
  }
  async chatInAiConversation(id: string, user: RecordData, message: string, hintLevel = 1): Promise<AiConversationChatResult> {
    const item = this.aiConversationRecord(id, user);
    const content = message.trim();
    if (!content) this.fail(400, 'VALIDATION_FAILED', '请输入学习问题。');
    const history = (item.messages ?? []).slice(-8).map((entry: RecordData) => ({ role: entry.role as 'user' | 'assistant', content: entry.content }));
    const memory = updateLearningMemory(user.aiLearningMemory, content);
    user.aiLearningMemory = memory;
    const userMessage: AiMessageRecord = { id: randomUUID(), role: 'user', content, feedback: null, createdAt: this.now() };
    item.messages.push(userMessage);
    if (item.messages.length === 1) item.title = conversationTitle(content);
    item.updatedAt = this.now(); this.persist();
    const answer = await answerLearningQuestion(content, undefined, hintLevel, history, 'auto', memory);
    const assistantMessage: AiMessageRecord = { id: randomUUID(), role: 'assistant', content: answer.content, provider: answer.provider, feedback: null, createdAt: this.now() };
    item.messages.push(assistantMessage); item.updatedAt = this.now(); this.activity(user, 'AI_TUTOR', '使用 AI 智能体学习中心'); this.persist();
    return { conversation: this.aiConversationSummary(item), userMessage, assistantMessage };
  }
  feedbackAiMessage(conversationId: string, messageId: string, user: RecordData, feedback: AiMessageFeedback) {
    const item = this.aiConversationRecord(conversationId, user);
    const message = item.messages.find((entry: RecordData) => entry.id === messageId && entry.role === 'assistant');
    if (!message) this.fail(404, 'AI_MESSAGE_NOT_FOUND', '回答不存在或已被删除。');
    message.feedback = feedback; item.updatedAt = this.now(); this.persist(); return { success: true as const };
  }
  async regenerateAiMessage(conversationId: string, messageId: string, user: RecordData): Promise<AiMessageRecord> {
    const item = this.aiConversationRecord(conversationId, user);
    const messageIndex = item.messages.findIndex((entry: RecordData) => entry.id === messageId && entry.role === 'assistant');
    const userMessage = messageIndex > 0 ? item.messages.slice(0, messageIndex).reverse().find((entry: RecordData) => entry.role === 'user') : undefined;
    if (messageIndex < 0 || !userMessage) this.fail(404, 'AI_MESSAGE_NOT_FOUND', '无法找到需要重新回答的问题。');
    const userIndex = item.messages.findIndex((entry: RecordData) => entry.id === userMessage.id);
    const history = item.messages.slice(Math.max(0, userIndex - 8), userIndex).map((entry: RecordData) => ({ role: entry.role as 'user' | 'assistant', content: entry.content }));
    const memory = normalizeLearningMemory(user.aiLearningMemory);
    const answer = await answerLearningQuestion(userMessage.content, undefined, 1, history, 'auto', memory);
    const updated: AiMessageRecord = { ...item.messages[messageIndex], content: answer.content, provider: answer.provider, feedback: null };
    item.messages[messageIndex] = updated; item.updatedAt = this.now(); this.activity(user, 'AI_REGENERATE', '重新生成 AI 学习回答'); this.persist();
    return updated;
  }
  aiMemory(user: RecordData) { return normalizeLearningMemory(user.aiLearningMemory); }
  clearAiMemory(user: RecordData) { delete user.aiLearningMemory; this.activity(user, 'AI_MEMORY_CLEAR', '清除 AI 学习记忆'); this.persist(); return { success: true as const }; }
  catalogSources() { return []; }
  private expireSessions() { let changed = false; for (const lab of this.data.labs ?? []) { if (lab.status === 'RUNNING' && new Date(lab.expiresAt).getTime() <= Date.now()) { lab.status = 'EXPIRED'; lab.remainingSeconds = 0; lab.expiredAt = this.now(); changed = true; } } if (changed) this.persist(); }
}
