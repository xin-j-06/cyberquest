import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { AccountStatus, Category, ReviewStatus, Role, SkillStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHmac } from 'node:crypto';
import { LearningRecord, LearningRepository } from './learning.repository';
import { createLabTarget, createSessionFlag, interactLabTarget } from './lab-target';
import { attachmentCount, challengeAttachment as resolveChallengeAttachment, challengeAttachments } from './challenge-attachments';
import { buildOfficialGuide, officialGuideAdminFields, officialGuideContent, officialGuideFor } from './official-guides';
import { PrismaService } from './prisma.service';
import { answerLearningQuestion } from './ai-model-provider';
import type { LearningSkillId } from './ai-learning-skills';
import { normalizeLearningMemory, updateLearningMemory } from './ai-learning-memory';
import { conversationTitle, type AiConversationChatResult, type AiConversationDetail, type AiConversationSummary, type AiMessageFeedback } from './ai-conversations';
import { accountCredentialError } from './account-credentials';
import type { AdminAuditRecord, AdminChallengeInput, AdminChallengeRecord, AdminLabRecord, AdminListQuery, AdminOverviewSnapshot, AdminUserCreate, AdminUserRecord, AdminUserUpdate, Announcement, AnnouncementInput, CalendarMemo, CalendarMemoInput, ChallengeDetail, ChallengeDiagnostic, ChallengeNote, Competition, CompetitionInput, FeedbackInput, FeedbackRecord, FeedbackUpdate, ForumPostDetail, ForumPostInput, ForumPostSummary, ForumReply, ForumReplyInput, LabSession, Paginated, RangeOverview, TrainingTool, TrainingToolInput, WorkspaceOverview } from '@cyberquest/shared';

const jwt = require('jsonwebtoken') as {
  sign: (payload: object, secret: string, options: { expiresIn: string }) => string;
  verify: (token: string, secret: string) => unknown;
};

const CATEGORY_TAGS: Record<string, string[]> = {
  WEB: ['HTTP', 'input validation', 'trust boundary'],
  CRYPTO: ['encoding', 'data representation', 'verifiable steps'],
  NETWORK: ['DNS', 'HTTP', 'traffic analysis'],
  REVERSE: ['strings', 'static analysis', 'program intent'],
  PWN: ['bounds checks', 'memory safety', 'secure coding'],
  FORENSICS: ['metadata', 'timeline', 'evidence'],
  MISC: ['research', 'evidence', 'specification'],
};

@Injectable()
export class PrismaLearningRepository implements LearningRepository, OnModuleInit, OnModuleDestroy {
  private readonly tokenSecret = process.env.JWT_ACCESS_SECRET || 'cyberquest-local-development-secret';
  private readonly labFlagSecret = process.env.LAB_FLAG_SECRET || this.tokenSecret;
  private readonly rateWindows = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  private page(query: AdminListQuery = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  private async audit(adminId: string, action: string, summary: string, metadata: Record<string, unknown> = {}) {
    await this.prisma.activity.create({ data: { userId: adminId, type: action, metadata: { ...metadata, message: summary } } });
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  private fail(status: number, code: string, message: string): never {
    const value = { code, message };
    if (status === 400) throw new BadRequestException(value);
    if (status === 401) throw new UnauthorizedException(value);
    if (status === 403) throw new ForbiddenException(value);
    if (status === 404) throw new NotFoundException(value);
    if (status === 409) throw new ConflictException(value);
    if (status === 423) throw new HttpException(value, 423);
    if (status === 429) throw new HttpException(value, HttpStatus.TOO_MANY_REQUESTS);
    throw new BadRequestException(value);
  }

  assertRateLimit(scope: string, identity: string, max: number, milliseconds: number) {
    const key = `${scope}:${identity}`;
    const now = Date.now();
    const entries = (this.rateWindows.get(key) ?? []).filter((time) => now - time < milliseconds);
    if (entries.length >= max) this.fail(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.');
    entries.push(now);
    this.rateWindows.set(key, entries);
  }

  userFromAuthorization(header?: string): LearningRecord | undefined {
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      const payload = jwt.verify(header.slice(7), this.tokenSecret) as { sub?: string; email?: string; role?: string; sv?: number };
      if (!payload.sub) this.fail(401, 'AUTH_TOKEN_INVALID', 'Access token is invalid.');
      return { id: payload.sub, email: payload.email, role: payload.role, sessionVersion: payload.sv ?? 0 };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.fail(401, 'AUTH_TOKEN_EXPIRED', 'Access token is invalid or expired.');
    }
  }

  requireUser(header?: string): LearningRecord {
    const user = this.userFromAuthorization(header);
    if (!user) this.fail(401, 'AUTH_FORBIDDEN', 'Please sign in before continuing.');
    return user;
  }

  private publicUser(user: any) {
    return { id: user.id, username: user.username, email: user.email, role: user.role, score: user.score, xp: user.xp, level: user.level };
  }

  private adminUserView(user: any): AdminUserRecord {
    return {
      ...this.publicUser(user), status: user.status, mustChangePassword: user.mustChangePassword,
      mfaEnabled: user.mfaEnabled, failedLoginAttempts: user.failedLoginAttempts,
      createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(),
      ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
      ...(user.lockedUntil ? { lockedUntil: user.lockedUntil.toISOString() } : {}),
      ...(user.deletedAt ? { deletedAt: user.deletedAt.toISOString() } : {}),
      ...(user.deletionScheduledAt ? { deletionScheduledAt: user.deletionScheduledAt.toISOString() } : {}),
    };
  }

  private async databaseAdmin(user: LearningRecord) {
    const account = await this.databaseUser(user.id);
    if ((account.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) this.fail(401, 'AUTH_TOKEN_REVOKED', 'This session has been revoked.');
    if (account.role !== Role.ADMIN) this.fail(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
    return account;
  }

  private signUser(user: any) {
    return jwt.sign({ sub: user.id, email: user.email, role: user.role, sv: user.sessionVersion ?? 0 }, this.tokenSecret, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '12h' });
  }

  private attemptHash(value: string) {
    return createHmac('sha256', process.env.ATTEMPT_HASH_SECRET || this.tokenSecret).update(value, 'utf8').digest('hex');
  }

  private async databaseUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) this.fail(401, 'AUTH_FORBIDDEN', 'Your account is no longer available.');
    if (user.status !== AccountStatus.ACTIVE) this.fail(403, 'ACCOUNT_UNAVAILABLE', 'This account is frozen, disabled, or pending deletion.');
    return user;
  }

  private async challengeBySlug(slug: string, include?: any): Promise<any> {
    const challenge = await this.prisma.challenge.findFirst({
      where: { isActive: true, OR: [{ slug }, { id: slug }] },
      include,
    });
    if (!challenge) this.fail(404, 'CHALLENGE_NOT_FOUND', 'Challenge not found or not published.');
    return challenge;
  }

  private async solvedIds(user?: LearningRecord) {
    if (!user) return new Set<string>();
    const solves = await this.prisma.challengeSolve.findMany({ where: { userId: user.id }, select: { challengeId: true } });
    return new Set(solves.map((item) => item.challengeId));
  }

  private challengeSummary(challenge: any, solved: Set<string>) {
    return {
      id: challenge.id,
      slug: challenge.slug,
      title: challenge.title,
      category: challenge.category,
      difficulty: challenge.difficulty,
      points: challenge.points,
      description: challenge.description,
      tags: challenge.tags?.length ? challenge.tags : (CATEGORY_TAGS[challenge.category] ?? ['security training']),
      solves: challenge._count?.solves ?? 0,
      solved: solved.has(challenge.id),
      available: true,
      attachmentCount: challengeAttachments(challenge.slug).length,
      hasConnection: false,
    };
  }

  private async recentAttempts(userId: string, challengeId: string) {
    const attempts = await this.prisma.challengeAttempt.findMany({
      where: { userId, challengeId }, orderBy: { createdAt: 'desc' }, take: 5,
    });
    return attempts.map((attempt) => ({ id: attempt.id, correct: attempt.correct, createdAt: attempt.createdAt.toISOString() }));
  }

  private async sessionFor(userId: string | undefined, challengeId: string): Promise<LabSession> {
    if (!userId) return { status: 'STOPPED', running: false, requiresLogin: true, remainingSeconds: 0 };
    await this.prisma.labInstance.updateMany({
      where: { userId, status: 'RUNNING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED', stoppedAt: new Date() },
    });
    const lab = await this.prisma.labInstance.findFirst({
      where: { userId, challengeId, status: 'RUNNING' }, orderBy: { startedAt: 'desc' },
      include: { challenge: { select: { slug: true } } },
    });
    if (!lab) return { status: 'STOPPED', running: false, requiresLogin: false, remainingSeconds: 0 };
    const remainingSeconds = Math.max(0, Math.ceil((lab.expiresAt.getTime() - Date.now()) / 1000));
    return {
      instanceId: lab.id,
      accessUrl: `/targets/${encodeURIComponent(lab.id)}`,
      status: lab.status,
      accessMode: 'LOCAL_GUIDED',
      startedAt: lab.startedAt?.toISOString(),
      expiresAt: lab.expiresAt.toISOString(),
      remainingSeconds,
      running: remainingSeconds > 0,
    };
  }

  private async activeLabByInstance(instanceId: string, userId: string) {
    const lab = await this.prisma.labInstance.findFirst({
      where: { id: instanceId, userId, status: 'RUNNING', expiresAt: { gt: new Date() } },
      include: { challenge: true },
    });
    if (!lab) this.fail(404, 'LAB_NOT_RUNNING', 'The CTF target does not exist, has ended, or belongs to another account.');
    return lab;
  }

  private async workspaceFor(challengeId: string, userId: string): Promise<WorkspaceOverview> {
    const [session, attempts, next] = await Promise.all([
      this.sessionFor(userId, challengeId),
      this.recentAttempts(userId, challengeId),
      this.prisma.challenge.findFirst({ where: { isActive: true, id: { not: challengeId }, solves: { none: { userId } } }, orderBy: [{ category: 'asc' }, { points: 'asc' }] }),
    ]);
    const submissionStats = { total: attempts.length, correct: attempts.filter((item) => item.correct).length };
    return {
      session,
      recentSubmissions: attempts,
      submissionStats,
      resourceHealth: { status: 'READY' },
      nextChallenge: next ? { slug: next.slug, title: next.title } : undefined,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) this.fail(401, 'AUTH_INVALID_CREDENTIALS', 'Email or password is incorrect.');
    if (user.status !== AccountStatus.ACTIVE) this.fail(403, 'ACCOUNT_UNAVAILABLE', 'This account is frozen, disabled, or pending deletion.');
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) this.fail(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
    if (!(await argon2.verify(user.passwordHash, password))) {
      const failures = user.failedLoginAttempts + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: failures, ...(failures >= 5 ? { lockedUntil: new Date(Date.now() + 15 * 60_000) } : {}) } });
      this.fail(401, 'AUTH_INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActiveAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'LOGIN', metadata: { message: 'Signed in to CyberQuest.' } } }),
    ]);
    return { user: this.publicUser(user), accessToken: this.signUser(user) };
  }

  async adminLogin(password: string) {
    const email = (process.env.ADMIN_LOGIN_EMAIL || 'admin@cyberquest.local').trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== Role.ADMIN || user.status !== AccountStatus.ACTIVE || !(await argon2.verify(user.passwordHash, password))) {
      this.fail(401, 'AUTH_INVALID_CREDENTIALS', '管理员密码错误。');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActiveAt: new Date() } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'LOGIN', metadata: { message: 'Signed in to the administration console.' } } }),
    ]);
    return { user: this.publicUser(user), accessToken: this.signUser(user) };
  }

  async logout(user: LearningRecord): Promise<{ success: true }> {
    const account = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (account) await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'LOGOUT_ALL', metadata: { message: 'Revoked the current account sessions.' } } }),
    ]);
    return { success: true };
  }

  async register(input: { username?: string; email?: string; password?: string }) {
    const username = input.username?.trim();
    const email = input.email?.trim().toLowerCase();
    const validationError = accountCredentialError(username, email, input.password);
    if (validationError || !username || !email || !input.password) this.fail(400, 'VALIDATION_FAILED', validationError ?? '账号信息不完整。');
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) this.fail(409, 'AUTH_ACCOUNT_EXISTS', 'Email address or display name is already in use.');
    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({ data: { username, email, passwordHash, lastActiveAt: new Date() } });
    await this.prisma.activity.create({ data: { userId: user.id, type: 'REGISTER', metadata: { message: 'Created a learning profile.' } } });
    return { user: this.publicUser(user), accessToken: this.signUser(user) };
  }

  async me(user: LearningRecord) {
    return this.publicUser(await this.databaseUser(user.id));
  }

  async createAdminUser(input: AdminUserCreate, user: LearningRecord): Promise<AdminUserRecord> {
    const admin = await this.databaseAdmin(user);
    const username = input.username?.trim();
    const email = input.email?.trim().toLowerCase();
    const validationError = accountCredentialError(username, email, input.password);
    if (validationError || !username || !email || !input.password) this.fail(400, 'VALIDATION_FAILED', validationError ?? '账号信息不完整。');
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) this.fail(409, 'AUTH_ACCOUNT_EXISTS', 'Email address or display name is already in use.');
    const account = await this.prisma.user.create({ data: { username, email, passwordHash: await argon2.hash(input.password), role: (input.role ?? 'USER') as Role, lastActiveAt: new Date() } });
    await this.audit(admin.id, 'ADMIN_USER_CREATE', `Created account ${account.username}.`, { targetType: 'USER', targetId: account.id, role: account.role });
    return this.adminUserView(account);
  }

  async adminUsers(user: LearningRecord, query: AdminListQuery = {}): Promise<Paginated<AdminUserRecord>> {
    await this.databaseAdmin(user);
    const { page, pageSize, skip } = this.page(query);
    const keyword = query.query?.trim();
    const where: any = {
      ...(keyword ? { OR: [{ username: { contains: keyword, mode: 'insensitive' } }, { email: { contains: keyword, mode: 'insensitive' } }] } : {}),
      ...(query.status && query.status !== 'ALL' ? { status: query.status as AccountStatus } : {}),
    };
    const allowedSort = ['createdAt', 'updatedAt', 'lastLoginAt', 'username', 'email'];
    const sort = allowedSort.includes(query.sort ?? '') ? query.sort! : 'createdAt';
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { [sort]: query.order ?? 'desc' }, skip, take: pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return this.paginated(users.map((item) => this.adminUserView(item)), total, page, pageSize);
  }

  async adminUser(id: string, user: LearningRecord): Promise<AdminUserRecord> {
    await this.databaseAdmin(user);
    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) this.fail(404, 'USER_NOT_FOUND', 'User account was not found.');
    return this.adminUserView(account);
  }

  async updateAdminUser(id: string, input: AdminUserUpdate, user: LearningRecord): Promise<AdminUserRecord> {
    await this.databaseAdmin(user);
    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) this.fail(404, 'USER_NOT_FOUND', 'User account was not found.');
    const username = input.username?.trim();
    const email = input.email?.trim().toLowerCase();
    if (username || email) {
      const existing = await this.prisma.user.findFirst({ where: { id: { not: id }, OR: [...(username ? [{ username }] : []), ...(email ? [{ email }] : [])] } });
      if (existing) this.fail(409, 'AUTH_ACCOUNT_EXISTS', 'Email address or display name is already in use.');
    }
    const updated = await this.prisma.user.update({ where: { id }, data: {
      ...(username ? { username } : {}), ...(email ? { email } : {}), ...(input.role ? { role: input.role as Role } : {}),
      ...(input.status ? { status: input.status as AccountStatus, sessionVersion: { increment: input.status === 'ACTIVE' ? 0 : 1 } } : {}),
      ...(input.mustChangePassword !== undefined ? { mustChangePassword: input.mustChangePassword } : {}),
    } });
    await this.audit(user.id, 'ADMIN_USER_UPDATE', `Updated account ${updated.username}.`, { targetType: 'USER', targetId: id, fields: Object.keys(input) });
    return this.adminUserView(updated);
  }

  async deleteAdminUser(id: string, user: LearningRecord): Promise<{ success: true }> {
    await this.databaseAdmin(user);
    if (id === user.id) this.fail(400, 'ADMIN_SELF_DELETE', 'The current administrator account cannot delete itself.');
    const account = await this.prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!account) this.fail(404, 'USER_NOT_FOUND', 'User account was not found.');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: AccountStatus.PENDING_DELETION, deletedAt: now, deletionScheduledAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000), sessionVersion: { increment: 1 } } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'ADMIN_USER_SOFT_DELETE', metadata: { targetType: 'USER', targetId: id, message: `Scheduled account ${account.username} for deletion after a 30-day retention period.` } } }),
    ]);
    return { success: true };
  }

  async restoreAdminUser(id: string, user: LearningRecord): Promise<AdminUserRecord> {
    await this.databaseAdmin(user);
    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) this.fail(404, 'USER_NOT_FOUND', 'User account was not found.');
    const restored = await this.prisma.user.update({ where: { id }, data: { status: AccountStatus.ACTIVE, deletedAt: null, deletionScheduledAt: null, sessionVersion: { increment: 1 } } });
    await this.audit(user.id, 'ADMIN_USER_RESTORE', `Restored account ${restored.username}.`, { targetType: 'USER', targetId: id });
    return this.adminUserView(restored);
  }

  async revokeAdminUserSessions(id: string, user: LearningRecord): Promise<{ success: true }> {
    await this.databaseAdmin(user);
    const account = await this.prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!account) this.fail(404, 'USER_NOT_FOUND', 'User account was not found.');
    await this.prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
    await this.audit(user.id, 'ADMIN_SESSION_REVOKE', `Revoked all sessions for ${account.username}.`, { targetType: 'USER', targetId: id });
    return { success: true };
  }

  private announcementView(item: any): Announcement {
    return { id: item.id, title: item.title, content: item.content, author: item.author?.username ?? '平台管理员', published: item.published, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
  }

  private announcementEnterpriseView(item: any): Announcement {
    return {
      ...this.announcementView(item), reviewStatus: item.reviewStatus, priority: item.priority,
      audience: item.audience, revision: item.revision,
      ...(item.scheduledAt ? { scheduledAt: item.scheduledAt.toISOString() } : {}),
      ...(item.expiresAt ? { expiresAt: item.expiresAt.toISOString() } : {}),
    };
  }

  async announcements(): Promise<Announcement[]> {
    const now = new Date();
    const rows = await this.prisma.announcement.findMany({ where: { published: true, deletedAt: null, AND: [{ OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] }, include: { author: { select: { username: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map((item) => this.announcementEnterpriseView(item));
  }

  async adminAnnouncements(user: LearningRecord, query: AdminListQuery = {}): Promise<Paginated<Announcement>> {
    await this.databaseAdmin(user);
    const { page, pageSize, skip } = this.page(query); const keyword = query.query?.trim();
    const where: any = { deletedAt: null, ...(keyword ? { OR: [{ title: { contains: keyword, mode: 'insensitive' } }, { content: { contains: keyword, mode: 'insensitive' } }] } : {}), ...(query.status && query.status !== 'ALL' ? { reviewStatus: query.status as ReviewStatus } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({ where, include: { author: { select: { username: true } } }, orderBy: { updatedAt: query.order ?? 'desc' }, skip, take: pageSize }),
      this.prisma.announcement.count({ where }),
    ]);
    return this.paginated(rows.map((item) => this.announcementEnterpriseView(item)), total, page, pageSize);
  }

  async createAnnouncement(input: AnnouncementInput, user: LearningRecord): Promise<Announcement> {
    const admin = await this.databaseAdmin(user);
    const title = input.title?.trim(); const content = input.content?.trim();
    if (!title || !content) this.fail(400, 'ANNOUNCEMENT_INVALID', 'Announcement title and content are required.');
    const published = input.published !== false;
    const item = await this.prisma.announcement.create({ data: { title, content, published, reviewStatus: (input.reviewStatus ?? (published ? 'PUBLISHED' : 'DRAFT')) as ReviewStatus, priority: input.priority ?? 'NORMAL', audience: input.audience?.trim() || 'ALL', scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, authorId: admin.id }, include: { author: { select: { username: true } } } });
    await this.audit(admin.id, 'ADMIN_ANNOUNCEMENT_CREATE', `Created announcement ${title}.`, { targetType: 'ANNOUNCEMENT', targetId: item.id, published });
    return this.announcementEnterpriseView(item);
  }

  async updateAnnouncement(id: string, input: AnnouncementInput, user: LearningRecord): Promise<Announcement> {
    await this.databaseAdmin(user);
    const existing = await this.prisma.announcement.findUnique({ where: { id }, select: { id: true } });
    if (!existing) this.fail(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement was not found.');
    const title = input.title?.trim(); const content = input.content?.trim();
    if (input.title !== undefined && !title) this.fail(400, 'ANNOUNCEMENT_INVALID', 'Announcement title cannot be empty.');
    if (input.content !== undefined && !content) this.fail(400, 'ANNOUNCEMENT_INVALID', 'Announcement content cannot be empty.');
    const item = await this.prisma.announcement.update({ where: { id }, data: { ...(title ? { title } : {}), ...(content ? { content } : {}), ...(input.published !== undefined ? { published: input.published, reviewStatus: input.published ? ReviewStatus.PUBLISHED : ReviewStatus.DRAFT } : {}), ...(input.reviewStatus ? { reviewStatus: input.reviewStatus as ReviewStatus } : {}), ...(input.priority ? { priority: input.priority } : {}), ...(input.audience ? { audience: input.audience.trim() } : {}), ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null } : {}), ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}), revision: { increment: 1 } }, include: { author: { select: { username: true } } } });
    await this.audit(user.id, 'ADMIN_ANNOUNCEMENT_UPDATE', `Updated announcement ${item.title}.`, { targetType: 'ANNOUNCEMENT', targetId: id, revision: item.revision });
    return this.announcementEnterpriseView(item);
  }

  async deleteAnnouncement(id: string, user: LearningRecord): Promise<{ success: true }> {
    await this.databaseAdmin(user);
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) this.fail(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement was not found.');
    await this.prisma.announcement.update({ where: { id }, data: { deletedAt: new Date(), published: false, reviewStatus: ReviewStatus.ARCHIVED, revision: { increment: 1 } } });
    await this.audit(user.id, 'ADMIN_ANNOUNCEMENT_ARCHIVE', `Archived announcement ${existing.title}.`, { targetType: 'ANNOUNCEMENT', targetId: id });
    return { success: true };
  }

  private competitionView(item: any): Competition {
    return {
      id: item.id, title: item.title, category: item.category, operator: item.operator,
      status: item.status, scope: item.scope, description: item.description,
      tags: Array.isArray(item.tags) ? item.tags : [], url: item.url,
      ...(item.startAt ? { startAt: item.startAt.toISOString() } : {}),
      ...(item.endAt ? { endAt: item.endAt.toISOString() } : {}),
      ...(item.registrationDeadline ? { registrationDeadline: item.registrationDeadline.toISOString() } : {}),
      published: item.published, featured: item.featured, reviewStatus: item.reviewStatus,
      timezone: item.timezone, ...(item.capacity ? { capacity: item.capacity } : {}), format: item.format,
      sourceVerified: item.sourceVerified, revision: item.revision,
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    } as Competition;
  }

  async competitions(): Promise<Competition[]> {
    const rows = await this.prisma.competition.findMany({ where: { published: true, deletedAt: null }, orderBy: [{ featured: 'desc' }, { startAt: 'asc' }, { updatedAt: 'desc' }] });
    return rows.map((item) => this.competitionView(item));
  }

  async adminCompetitions(user: LearningRecord, query: AdminListQuery = {}): Promise<Paginated<Competition>> {
    await this.databaseAdmin(user);
    const { page, pageSize, skip } = this.page(query); const keyword = query.query?.trim();
    const where: any = { deletedAt: null, ...(keyword ? { OR: [{ title: { contains: keyword, mode: 'insensitive' } }, { operator: { contains: keyword, mode: 'insensitive' } }, { description: { contains: keyword, mode: 'insensitive' } }] } : {}), ...(query.status && query.status !== 'ALL' ? { reviewStatus: query.status as ReviewStatus } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.competition.findMany({ where, orderBy: { updatedAt: query.order ?? 'desc' }, skip, take: pageSize }),
      this.prisma.competition.count({ where }),
    ]);
    return this.paginated(rows.map((item) => this.competitionView(item)), total, page, pageSize);
  }

  async createCompetition(input: CompetitionInput, user: LearningRecord): Promise<Competition> {
    const admin = await this.databaseAdmin(user);
    const title = input.title?.trim(); const operator = input.operator?.trim(); const status = input.status?.trim();
    const scope = input.scope?.trim(); const description = input.description?.trim(); const url = input.url?.trim();
    if (!title || !input.category || !operator || !status || !scope || !description || !url) this.fail(400, 'COMPETITION_INVALID', 'Complete all required competition fields.');
    const item = await this.prisma.competition.create({ data: {
      title, category: input.category, operator, status, scope, description, url,
      tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      registrationDeadline: input.registrationDeadline ? new Date(input.registrationDeadline) : null,
      published: input.published !== false, featured: input.featured === true, authorId: admin.id,
      reviewStatus: (input.reviewStatus ?? (input.published !== false ? 'PUBLISHED' : 'DRAFT')) as ReviewStatus,
      timezone: input.timezone?.trim() || 'Asia/Shanghai', capacity: input.capacity ?? null,
      format: input.format?.trim() || '', sourceVerified: input.sourceVerified === true,
    } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_COMPETITION_CREATE', metadata: { competitionId: item.id, message: `Created competition ${title}.` } } });
    return this.competitionView(item);
  }

  async updateCompetition(id: string, input: CompetitionInput, user: LearningRecord): Promise<Competition> {
    const admin = await this.databaseAdmin(user);
    const existing = await this.prisma.competition.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!existing) this.fail(404, 'COMPETITION_NOT_FOUND', 'Competition was not found.');
    const required = ['title', 'operator', 'status', 'scope', 'description', 'url'] as const;
    for (const key of required) if (input[key] !== undefined && !input[key]?.trim()) this.fail(400, 'COMPETITION_INVALID', 'Required competition fields cannot be empty.');
    const item = await this.prisma.competition.update({ where: { id }, data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.operator !== undefined ? { operator: input.operator.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status.trim() } : {}),
      ...(input.scope !== undefined ? { scope: input.scope.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.tags !== undefined ? { tags: input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12) } : {}),
      ...(input.url !== undefined ? { url: input.url.trim() } : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt ? new Date(input.startAt) : null } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
      ...(input.registrationDeadline !== undefined ? { registrationDeadline: input.registrationDeadline ? new Date(input.registrationDeadline) : null } : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
      ...(input.featured !== undefined ? { featured: input.featured } : {}),
      ...(input.reviewStatus ? { reviewStatus: input.reviewStatus as ReviewStatus } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.format !== undefined ? { format: input.format.trim() } : {}),
      ...(input.sourceVerified !== undefined ? { sourceVerified: input.sourceVerified } : {}),
      revision: { increment: 1 },
    } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_COMPETITION_UPDATE', metadata: { competitionId: id, message: `Updated competition ${item.title}.` } } });
    return this.competitionView(item);
  }

  async deleteCompetition(id: string, user: LearningRecord): Promise<{ success: true }> {
    const admin = await this.databaseAdmin(user);
    const existing = await this.prisma.competition.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!existing) this.fail(404, 'COMPETITION_NOT_FOUND', 'Competition was not found.');
    await this.prisma.$transaction([
      this.prisma.competition.update({ where: { id }, data: { deletedAt: new Date(), published: false, reviewStatus: ReviewStatus.ARCHIVED, revision: { increment: 1 } } }),
      this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_COMPETITION_ARCHIVE', metadata: { competitionId: id, message: `Archived competition ${existing.title}.` } } }),
    ]);
    return { success: true };
  }

  private calendarMemoView(item: any): CalendarMemo {
    return { id: item.id, date: item.date, title: item.title, note: item.note, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
  }
  async calendarMemos(user: LearningRecord): Promise<CalendarMemo[]> {
    const account = await this.databaseUser(user.id);
    const rows = await this.prisma.calendarMemo.findMany({ where: { userId: account.id }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((item) => this.calendarMemoView(item));
  }
  async createCalendarMemo(input: CalendarMemoInput, user: LearningRecord): Promise<CalendarMemo> {
    const account = await this.databaseUser(user.id); const date = input.date?.trim(); const title = input.title?.trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) this.fail(400, 'CALENDAR_MEMO_INVALID', 'Choose a date and provide a memo title.');
    return this.calendarMemoView(await this.prisma.calendarMemo.create({ data: { userId: account.id, date, title, note: input.note?.trim() ?? '' } }));
  }
  async updateCalendarMemo(id: string, input: CalendarMemoInput, user: LearningRecord): Promise<CalendarMemo> {
    const account = await this.databaseUser(user.id);
    const existing = await this.prisma.calendarMemo.findFirst({ where: { id, userId: account.id }, select: { id: true } });
    if (!existing) this.fail(404, 'CALENDAR_MEMO_NOT_FOUND', 'Calendar memo was not found.');
    if (input.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) this.fail(400, 'CALENDAR_MEMO_INVALID', 'Calendar date is invalid.');
    if (input.title !== undefined && !input.title.trim()) this.fail(400, 'CALENDAR_MEMO_INVALID', 'Memo title cannot be empty.');
    const item = await this.prisma.calendarMemo.update({ where: { id }, data: { ...(input.date !== undefined ? { date: input.date } : {}), ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.note !== undefined ? { note: input.note.trim() } : {}) } });
    return this.calendarMemoView(item);
  }
  async deleteCalendarMemo(id: string, user: LearningRecord): Promise<{ success: true }> {
    const account = await this.databaseUser(user.id);
    const deleted = await this.prisma.calendarMemo.deleteMany({ where: { id, userId: account.id } });
    if (!deleted.count) this.fail(404, 'CALENDAR_MEMO_NOT_FOUND', 'Calendar memo was not found.');
    return { success: true };
  }

  private toolView(item: any): TrainingTool {
    return {
      id: item.id, name: item.name, icon: item.icon, category: item.category,
      description: item.description, platforms: Array.isArray(item.platforms) ? item.platforms : [],
      source: item.source, usagePath: item.usagePath, officialUrl: item.officialUrl,
      actionLabel: item.actionLabel,
      ...(item.installCommand ? { installCommand: item.installCommand } : {}),
      published: item.published, recommended: item.recommended, sortOrder: item.sortOrder,
      version: item.version, checksumSha256: item.checksumSha256, license: item.license,
      sourceVerified: item.sourceVerified, deprecated: item.deprecated,
      reviewStatus: item.reviewStatus, revision: item.revision,
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    } as TrainingTool;
  }
  async tools(): Promise<TrainingTool[]> {
    const rows = await this.prisma.trainingTool.findMany({ where: { published: true, deprecated: false, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((item) => this.toolView(item));
  }
  async adminTools(user: LearningRecord, query: AdminListQuery = {}): Promise<Paginated<TrainingTool>> {
    await this.databaseAdmin(user);
    const { page, pageSize, skip } = this.page(query); const keyword = query.query?.trim();
    const where: any = { deletedAt: null, ...(keyword ? { OR: [{ name: { contains: keyword, mode: 'insensitive' } }, { category: { contains: keyword, mode: 'insensitive' } }, { description: { contains: keyword, mode: 'insensitive' } }, { source: { contains: keyword, mode: 'insensitive' } }] } : {}), ...(query.status && query.status !== 'ALL' ? { reviewStatus: query.status as ReviewStatus } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trainingTool.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }], skip, take: pageSize }),
      this.prisma.trainingTool.count({ where }),
    ]);
    return this.paginated(rows.map((item) => this.toolView(item)), total, page, pageSize);
  }
  async createTool(input: TrainingToolInput, user: LearningRecord): Promise<TrainingTool> {
    const admin = await this.databaseAdmin(user);
    const name = input.name?.trim(); const category = input.category?.trim(); const description = input.description?.trim();
    const source = input.source?.trim(); const usagePath = input.usagePath?.trim() ?? ''; const officialUrl = input.officialUrl?.trim() ?? '';
    if (!name || !category || !description || !source || (!usagePath && !officialUrl)) this.fail(400, 'TOOL_INVALID', 'Complete the tool name, category, description and source, then provide a usage path or official URL.');
    const duplicate = await this.prisma.trainingTool.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) this.fail(409, 'TOOL_EXISTS', 'A tool with this name already exists.');
    const item = await this.prisma.trainingTool.create({ data: {
      name, icon: input.icon?.trim().toUpperCase() || name.slice(0, 2).toUpperCase(), category, description,
      platforms: (input.platforms ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 12), source, usagePath, officialUrl,
      actionLabel: input.actionLabel?.trim() || '查看官网', installCommand: input.installCommand?.trim() || null,
      published: input.published !== false, recommended: input.recommended === true, sortOrder: input.sortOrder ?? 0, authorId: admin.id,
      version: input.version?.trim() || '', checksumSha256: input.checksumSha256?.trim().toLowerCase() || '', license: input.license?.trim() || '',
      sourceVerified: input.sourceVerified === true, deprecated: input.deprecated === true,
      reviewStatus: (input.reviewStatus ?? (input.published !== false ? 'PUBLISHED' : 'DRAFT')) as ReviewStatus,
    } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_TOOL_CREATE', metadata: { toolId: item.id, message: `Created tool ${name}.` } } });
    return this.toolView(item);
  }
  async updateTool(id: string, input: TrainingToolInput, user: LearningRecord): Promise<TrainingTool> {
    const admin = await this.databaseAdmin(user);
    const existing = await this.prisma.trainingTool.findUnique({ where: { id } });
    if (!existing) this.fail(404, 'TOOL_NOT_FOUND', 'Tool was not found.');
    const nextName = input.name?.trim();
    if (input.name !== undefined && !nextName) this.fail(400, 'TOOL_INVALID', 'Tool name cannot be empty.');
    if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await this.prisma.trainingTool.findFirst({ where: { id: { not: id }, name: { equals: nextName, mode: 'insensitive' } }, select: { id: true } });
      if (duplicate) this.fail(409, 'TOOL_EXISTS', 'A tool with this name already exists.');
    }
    const nextUsagePath = input.usagePath !== undefined ? input.usagePath.trim() : existing.usagePath;
    const nextOfficialUrl = input.officialUrl !== undefined ? input.officialUrl.trim() : existing.officialUrl;
    if (!nextUsagePath && !nextOfficialUrl) this.fail(400, 'TOOL_INVALID', 'Keep at least one usage path or official URL.');
    const required = ['category', 'description', 'source'] as const;
    for (const key of required) if (input[key] !== undefined && !input[key]?.trim()) this.fail(400, 'TOOL_INVALID', 'Required tool fields cannot be empty.');
    const item = await this.prisma.trainingTool.update({ where: { id }, data: {
      ...(nextName ? { name: nextName } : {}), ...(input.icon !== undefined ? { icon: input.icon.trim().toUpperCase() } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() } : {}), ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.platforms !== undefined ? { platforms: input.platforms.map((value) => value.trim()).filter(Boolean).slice(0, 12) } : {}),
      ...(input.source !== undefined ? { source: input.source.trim() } : {}), ...(input.usagePath !== undefined ? { usagePath: nextUsagePath } : {}),
      ...(input.officialUrl !== undefined ? { officialUrl: nextOfficialUrl } : {}), ...(input.actionLabel !== undefined ? { actionLabel: input.actionLabel.trim() || '查看官网' } : {}),
      ...(input.installCommand !== undefined ? { installCommand: input.installCommand.trim() || null } : {}),
      ...(input.published !== undefined ? { published: input.published } : {}), ...(input.recommended !== undefined ? { recommended: input.recommended } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.version !== undefined ? { version: input.version.trim() } : {}),
      ...(input.checksumSha256 !== undefined ? { checksumSha256: input.checksumSha256.trim().toLowerCase() } : {}),
      ...(input.license !== undefined ? { license: input.license.trim() } : {}),
      ...(input.sourceVerified !== undefined ? { sourceVerified: input.sourceVerified } : {}),
      ...(input.deprecated !== undefined ? { deprecated: input.deprecated } : {}),
      ...(input.reviewStatus ? { reviewStatus: input.reviewStatus as ReviewStatus } : {}),
      revision: { increment: 1 },
    } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_TOOL_UPDATE', metadata: { toolId: id, message: `Updated tool ${item.name}.` } } });
    return this.toolView(item);
  }
  async deleteTool(id: string, user: LearningRecord): Promise<{ success: true }> {
    const admin = await this.databaseAdmin(user);
    const existing = await this.prisma.trainingTool.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) this.fail(404, 'TOOL_NOT_FOUND', 'Tool was not found.');
    await this.prisma.$transaction([
      this.prisma.trainingTool.update({ where: { id }, data: { deletedAt: new Date(), published: false, reviewStatus: ReviewStatus.ARCHIVED, revision: { increment: 1 } } }),
      this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_TOOL_ARCHIVE', metadata: { toolId: id, message: `Archived tool ${existing.name}.` } } }),
    ]);
    return { success: true };
  }

  private feedbackView(item: any): FeedbackRecord {
    return { id: item.id, type: item.type, title: item.title, content: item.content, ...(item.pageUrl ? { pageUrl: item.pageUrl } : {}), status: item.status, ...(item.adminNote ? { adminNote: item.adminNote } : {}), priority: item.priority, severity: item.severity, ...(item.assignee ? { assignee: item.assignee } : {}), ...(item.publicReply ? { publicReply: item.publicReply } : {}), tags: Array.isArray(item.tags) ? item.tags : [], ...(item.slaDueAt ? { slaDueAt: item.slaDueAt.toISOString() } : {}), userId: item.userId ?? '', username: item.user?.username ?? item.username, email: item.user?.email ?? item.email, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() } as FeedbackRecord;
  }

  async createFeedback(input: FeedbackInput, user: LearningRecord): Promise<FeedbackRecord> {
    const databaseUser = await this.databaseUser(user.id);
    const title = input.title?.trim(); const content = input.content?.trim();
    if (!input.type || !title || !content) this.fail(400, 'FEEDBACK_INVALID', 'Select a feedback type and provide a title and detailed description.');
    const item = await this.prisma.feedback.create({ data: { userId: databaseUser.id, username: databaseUser.username, email: databaseUser.email, type: input.type, title, content, pageUrl: input.pageUrl?.trim().slice(0, 500), priority: input.type === 'BUG' ? 'HIGH' : 'MEDIUM', severity: input.type === 'BUG' ? 'S2' : 'S3', slaDueAt: new Date(Date.now() + (input.type === 'BUG' ? 24 : 72) * 60 * 60_000) }, include: { user: { select: { username: true, email: true } } } });
    await this.prisma.activity.create({ data: { userId: databaseUser.id, type: 'FEEDBACK_CREATE', metadata: { feedbackId: item.id, message: `Submitted feedback ${title}.` } } });
    return this.feedbackView(item);
  }

  async adminFeedback(user: LearningRecord, query: AdminListQuery = {}): Promise<Paginated<FeedbackRecord>> {
    await this.databaseAdmin(user);
    const { page, pageSize, skip } = this.page(query); const keyword = query.query?.trim();
    const where: any = { ...(keyword ? { OR: [{ title: { contains: keyword, mode: 'insensitive' } }, { content: { contains: keyword, mode: 'insensitive' } }, { username: { contains: keyword, mode: 'insensitive' } }] } : {}), ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({ where, include: { user: { select: { username: true, email: true } } }, orderBy: { createdAt: query.order ?? 'desc' }, skip, take: pageSize }),
      this.prisma.feedback.count({ where }),
    ]);
    return this.paginated(rows.map((item) => this.feedbackView(item)), total, page, pageSize);
  }

  async updateFeedback(id: string, input: FeedbackUpdate, user: LearningRecord): Promise<FeedbackRecord> {
    const admin = await this.databaseAdmin(user);
    const existing = await this.prisma.feedback.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!existing) this.fail(404, 'FEEDBACK_NOT_FOUND', 'Feedback was not found.');
    const item = await this.prisma.feedback.update({ where: { id }, data: { ...(input.status !== undefined ? { status: input.status } : {}), ...(input.adminNote !== undefined ? { adminNote: input.adminNote.trim() || null } : {}), ...(input.priority ? { priority: input.priority } : {}), ...(input.severity ? { severity: input.severity } : {}), ...(input.assignee !== undefined ? { assignee: input.assignee.trim() || null } : {}), ...(input.publicReply !== undefined ? { publicReply: input.publicReply.trim() || null } : {}), ...(input.tags !== undefined ? { tags: input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12) } : {}) }, include: { user: { select: { username: true, email: true } } } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_FEEDBACK_UPDATE', metadata: { feedbackId: id, message: `Updated feedback ${existing.title}.` } } });
    return this.feedbackView(item);
  }

  async deleteFeedback(id: string, user: LearningRecord): Promise<{ success: true }> {
    const admin = await this.databaseAdmin(user);
    const existing = await this.prisma.feedback.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!existing) this.fail(404, 'FEEDBACK_NOT_FOUND', 'Feedback was not found.');
    await this.prisma.$transaction([this.prisma.feedback.delete({ where: { id } }), this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_FEEDBACK_DELETE', metadata: { feedbackId: id, message: `Deleted feedback ${existing.title}.` } } })]);
    return { success: true };
  }

  private forumPostView(item: any, detailed = false): ForumPostSummary | ForumPostDetail {
    const authorName = item.author?.username ?? item.authorName;
    const authorRole = item.author?.role ?? item.authorRole;
    const summary = { id: item.id, category: item.category, title: item.title, excerpt: item.content.replace(/\s+/g, ' ').slice(0, 140), authorId: item.authorId ?? '', authorName, authorRole, pinned: item.pinned, views: item.views, replyCount: item._count?.replies ?? item.replies?.length ?? 0, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() } as ForumPostSummary;
    if (!detailed) return summary;
    return { ...summary, content: item.content, replies: (item.replies ?? []).map((reply: any) => ({ id: reply.id, content: reply.content, authorId: reply.authorId ?? '', authorName: reply.author?.username ?? reply.authorName, authorRole: reply.author?.role ?? reply.authorRole, createdAt: reply.createdAt.toISOString() } as ForumReply)) } as ForumPostDetail;
  }

  async forumPosts(): Promise<ForumPostSummary[]> {
    const rows = await this.prisma.forumPost.findMany({ include: { author: { select: { username: true, role: true } }, _count: { select: { replies: true } } }, orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] });
    return rows.map((item) => this.forumPostView(item) as ForumPostSummary);
  }

  async forumPost(id: string): Promise<ForumPostDetail> {
    const exists = await this.prisma.forumPost.findUnique({ where: { id }, select: { id: true } });
    if (!exists) this.fail(404, 'FORUM_POST_NOT_FOUND', 'Forum topic was not found.');
    const item = await this.prisma.forumPost.update({ where: { id }, data: { views: { increment: 1 } }, include: { author: { select: { username: true, role: true } }, replies: { include: { author: { select: { username: true, role: true } } }, orderBy: { createdAt: 'asc' } }, _count: { select: { replies: true } } } });
    return this.forumPostView(item, true) as ForumPostDetail;
  }

  async createForumPost(input: ForumPostInput, user: LearningRecord): Promise<ForumPostDetail> {
    const author = await this.databaseUser(user.id); const title = input.title?.trim(); const content = input.content?.trim();
    if (!input.category || !title || !content) this.fail(400, 'FORUM_POST_INVALID', 'Select a category and provide a complete title and body.');
    const item = await this.prisma.forumPost.create({ data: { category: input.category, title, content, authorId: author.id, authorName: author.username, authorRole: author.role }, include: { author: { select: { username: true, role: true } }, replies: true, _count: { select: { replies: true } } } });
    await this.prisma.activity.create({ data: { userId: author.id, type: 'FORUM_POST_CREATE', metadata: { postId: item.id, message: `Created forum topic ${title}.` } } });
    return this.forumPostView(item, true) as ForumPostDetail;
  }

  async createForumReply(id: string, input: ForumReplyInput, user: LearningRecord): Promise<ForumReply> {
    const author = await this.databaseUser(user.id); const content = input.content?.trim();
    if (!content) this.fail(400, 'FORUM_REPLY_INVALID', 'Reply content is required.');
    const post = await this.prisma.forumPost.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!post) this.fail(404, 'FORUM_POST_NOT_FOUND', 'Forum topic was not found.');
    const reply = await this.prisma.forumReply.create({ data: { postId: id, authorId: author.id, authorName: author.username, authorRole: author.role, content }, include: { author: { select: { username: true, role: true } } } });
    await this.prisma.$transaction([this.prisma.forumPost.update({ where: { id }, data: { updatedAt: new Date() } }), this.prisma.activity.create({ data: { userId: author.id, type: 'FORUM_REPLY_CREATE', metadata: { postId: id, replyId: reply.id, message: `Replied to forum topic ${post.title}.` } } })]);
    return { id: reply.id, content: reply.content, authorId: reply.authorId ?? '', authorName: reply.author?.username ?? reply.authorName, authorRole: (reply.author?.role ?? reply.authorRole) as 'USER' | 'ADMIN', createdAt: reply.createdAt.toISOString() };
  }

  async deleteForumPost(id: string, user: LearningRecord): Promise<{ success: true }> {
    const actor = await this.databaseUser(user.id);
    const post = await this.prisma.forumPost.findUnique({ where: { id }, select: { id: true, authorId: true, title: true } });
    if (!post) this.fail(404, 'FORUM_POST_NOT_FOUND', 'Forum topic was not found.');
    if (post.authorId !== actor.id && actor.role !== 'ADMIN') this.fail(403, 'FORUM_POST_FORBIDDEN', 'You can only delete your own discussion.');
    await this.prisma.$transaction([this.prisma.forumPost.delete({ where: { id } }), this.prisma.activity.create({ data: { userId: actor.id, type: 'FORUM_POST_DELETE', metadata: { postId: id, message: `Deleted forum topic ${post.title}.` } } })]);
    return { success: true };
  }

  private adminChallengeView(challenge: any): AdminChallengeRecord {
    const attempts = challenge._count?.attempts ?? 0;
    const solves = challenge._count?.solves ?? 0;
    const skill = challenge.skills?.[0];
    const storedGuide = challenge.hints?.[0]?.content;
    const guide = officialGuideFor(challenge.slug, storedGuide);
    const guideFields = officialGuideAdminFields(challenge.slug, storedGuide);
    const solveDurations = (challenge.solves ?? []).flatMap((solve: any) => {
      const started = (challenge.labs ?? []).filter((lab: any) => lab.userId === solve.userId && lab.startedAt && lab.startedAt <= solve.solvedAt).sort((a: any, b: any) => b.startedAt.getTime() - a.startedAt.getTime())[0];
      return started ? [(solve.solvedAt.getTime() - started.startedAt.getTime()) / 60_000] : [];
    });
    return {
      id: challenge.id, slug: challenge.slug, title: challenge.title, category: challenge.category, difficulty: challenge.difficulty,
      points: challenge.points, description: challenge.description, goal: challenge.goal || challenge.description, tags: challenge.tags?.length ? challenge.tags : (CATEGORY_TAGS[challenge.category] ?? ['security training']),
      isActive: challenge.isActive, isDynamic: challenge.isDynamic, flagConfigured: Boolean(challenge.flagHash),
      labKind: challenge.labKind || (challenge.category === 'WEB' ? 'WEB_APPLICATION' : 'ARTIFACT_ANALYSIS'), labTtlMinutes: challenge.labTtlMinutes || Math.max(5, Math.round(Number(process.env.LAB_TTL_SECONDS ?? 1800) / 60)),
      ...(skill ? { skillSlug: skill.skill.slug, xpReward: skill.xpReward } : {}), solves, attempts, incorrectAttempts: (challenge.attempts ?? []).filter((item: any) => !item.correct).length,
      completionRate: attempts ? Math.round((solves / attempts) * 100) : 0, attachmentCount: challengeAttachments(challenge.slug).length,
      ...(solveDurations.length ? { averageSolveMinutes: Math.round(solveDurations.reduce((sum: number, value: number) => sum + value, 0) / solveDurations.length) } : {}),
      guideConfigured: Boolean(guide.summary && guide.principle && guide.steps?.length), ...guideFields,
      reviewStatus: challenge.reviewStatus, revision: challenge.revision, owner: challenge.owner,
      ...(challenge.scheduledAt ? { scheduledAt: challenge.scheduledAt.toISOString() } : {}),
      maxConcurrentLabs: challenge.maxConcurrentLabs, cpuLimit: challenge.cpuLimit, memoryLimitMb: challenge.memoryLimitMb,
      updatedAt: (challenge.updatedAt ?? challenge.createdAt).toISOString(),
    } as AdminChallengeRecord;
  }

  async adminChallenges(user: LearningRecord, query: AdminListQuery = {}): Promise<Paginated<AdminChallengeRecord>> {
    await this.databaseAdmin(user);
    const { page, pageSize, skip } = this.page(query); const keyword = query.query?.trim();
    const where: any = { deletedAt: null, ...(keyword ? { OR: [{ title: { contains: keyword, mode: 'insensitive' } }, { slug: { contains: keyword, mode: 'insensitive' } }] } : {}), ...(query.status && query.status !== 'ALL' ? { reviewStatus: query.status as ReviewStatus } : {}) };
    const include: any = { _count: { select: { solves: true, attempts: true } }, skills: { include: { skill: true }, take: 1 }, hints: { orderBy: { order: 'asc' }, take: 1 }, attempts: { select: { correct: true } }, solves: { select: { userId: true, solvedAt: true } }, labs: { select: { userId: true, startedAt: true } } };
    const [rows, total] = await this.prisma.$transaction([this.prisma.challenge.findMany({ where, include, orderBy: { slug: 'asc' }, skip, take: pageSize }), this.prisma.challenge.count({ where })]);
    return this.paginated(rows.map((item) => this.adminChallengeView(item)), total, page, pageSize);
  }

  async createAdminChallenge(input: AdminChallengeInput, user: LearningRecord): Promise<AdminChallengeRecord> {
    const admin = await this.databaseAdmin(user);
    const slug = input.slug?.trim().toLowerCase(); const title = input.title?.trim(); const description = input.description?.trim();
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || !description || !input.category || !input.difficulty || input.points === undefined || !input.flag?.trim() || !input.guideSummary?.trim() || !input.guidePrinciple?.trim() || !input.guideSteps?.trim()) this.fail(400, 'CHALLENGE_INVALID', 'Complete challenge metadata, a verification flag and the official guide are required.');
    if (await this.prisma.challenge.findUnique({ where: { slug }, select: { id: true } })) this.fail(409, 'CHALLENGE_EXISTS', 'Challenge slug already exists.');
    const skill = input.skillSlug ? await this.prisma.skill.findUnique({ where: { slug: input.skillSlug } }) : null;
    const authoredGuide = buildOfficialGuide(slug, title, input);
    const challenge = await this.prisma.challenge.create({ data: { slug, title, description, goal: input.goal?.trim() || description, tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [], category: input.category as Category, difficulty: input.difficulty, points: input.points, flagHash: await argon2.hash(input.flag.trim()), isActive: input.isActive !== false, reviewStatus: (input.reviewStatus ?? (input.isActive !== false ? 'PUBLISHED' : 'DRAFT')) as ReviewStatus, owner: input.owner?.trim() || admin.username, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null, maxConcurrentLabs: input.maxConcurrentLabs ?? 20, cpuLimit: input.cpuLimit ?? 1, memoryLimitMb: input.memoryLimitMb ?? 512, isDynamic: input.isDynamic !== false, labKind: input.labKind ?? 'AUTO', labTtlMinutes: input.labTtlMinutes ?? 30, author: admin.username, hints: { create: { title: authoredGuide.title, content: JSON.stringify(authoredGuide), cost: 20, order: 1 } }, ...(skill ? { skills: { create: { skillId: skill.id, xpReward: input.xpReward ?? input.points } } } : {}) }, include: { _count: { select: { solves: true, attempts: true } }, skills: { include: { skill: true }, take: 1 }, hints: { orderBy: { order: 'asc' }, take: 1 }, attempts: { select: { correct: true } }, solves: { select: { userId: true, solvedAt: true } }, labs: { select: { userId: true, startedAt: true } } } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_CHALLENGE_CREATE', metadata: { challengeId: challenge.id, message: `Created challenge ${title}.` } } });
    return this.adminChallengeView(challenge);
  }

  async updateAdminChallenge(id: string, input: AdminChallengeInput, user: LearningRecord): Promise<AdminChallengeRecord> {
    const admin = await this.databaseAdmin(user);
    const current = await this.prisma.challenge.findUnique({ where: { id }, include: { hints: { orderBy: { order: 'asc' }, take: 1 } } });
    if (!current) this.fail(404, 'CHALLENGE_NOT_FOUND', 'Challenge was not found.');
    const slug = input.slug?.trim().toLowerCase();
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) this.fail(400, 'CHALLENGE_INVALID', 'Challenge slug is invalid.');
    if (slug && slug !== current.slug && await this.prisma.challenge.findUnique({ where: { slug }, select: { id: true } })) this.fail(409, 'CHALLENGE_EXISTS', 'Challenge slug already exists.');
    const data: any = {};
    if (slug) data.slug = slug;
    if (input.title?.trim()) data.title = input.title.trim();
    if (input.description?.trim()) data.description = input.description.trim();
    if (input.goal?.trim()) data.goal = input.goal.trim();
    if (input.tags !== undefined) data.tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
    if (input.category) data.category = input.category as Category;
    if (input.difficulty) data.difficulty = input.difficulty;
    if (input.points !== undefined) data.points = input.points;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.isDynamic !== undefined) data.isDynamic = input.isDynamic;
    if (input.labKind !== undefined) data.labKind = input.labKind;
    if (input.labTtlMinutes !== undefined) data.labTtlMinutes = input.labTtlMinutes;
    if (input.reviewStatus) data.reviewStatus = input.reviewStatus as ReviewStatus;
    if (input.owner !== undefined) data.owner = input.owner.trim();
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.maxConcurrentLabs !== undefined) data.maxConcurrentLabs = input.maxConcurrentLabs;
    if (input.cpuLimit !== undefined) data.cpuLimit = input.cpuLimit;
    if (input.memoryLimitMb !== undefined) data.memoryLimitMb = input.memoryLimitMb;
    data.revision = { increment: 1 };
    if (input.flag?.trim()) data.flagHash = await argon2.hash(input.flag.trim());
    await this.prisma.challenge.update({ where: { id }, data });
    if (input.guideSummary !== undefined || input.guidePrinciple !== undefined || input.guideSteps !== undefined) {
      const authoredGuide = buildOfficialGuide(slug || current.slug, input.title?.trim() || current.title, input, current.hints[0]?.content);
      await this.prisma.challengeHint.upsert({ where: { challengeId_order: { challengeId: id, order: 1 } }, update: { title: authoredGuide.title, content: JSON.stringify(authoredGuide), cost: 20 }, create: { challengeId: id, title: authoredGuide.title, content: JSON.stringify(authoredGuide), cost: 20, order: 1 } });
    }
    if (input.skillSlug !== undefined) {
      await this.prisma.challengeSkill.deleteMany({ where: { challengeId: id } });
      if (input.skillSlug) { const skill = await this.prisma.skill.findUnique({ where: { slug: input.skillSlug } }); if (skill) await this.prisma.challengeSkill.create({ data: { challengeId: id, skillId: skill.id, xpReward: input.xpReward ?? input.points ?? current.points } }); }
    } else if (input.xpReward !== undefined) await this.prisma.challengeSkill.updateMany({ where: { challengeId: id }, data: { xpReward: input.xpReward } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_CHALLENGE_UPDATE', metadata: { challengeId: id, message: `Updated challenge ${current.title}.` } } });
    const updated = await this.prisma.challenge.findUniqueOrThrow({ where: { id }, include: { _count: { select: { solves: true, attempts: true } }, skills: { include: { skill: true }, take: 1 }, hints: { orderBy: { order: 'asc' }, take: 1 }, attempts: { select: { correct: true } }, solves: { select: { userId: true, solvedAt: true } }, labs: { select: { userId: true, startedAt: true } } } });
    return this.adminChallengeView(updated);
  }

  async deleteAdminChallenge(id: string, user: LearningRecord): Promise<{ success: true }> {
    const admin = await this.databaseAdmin(user);
    const current = await this.prisma.challenge.findUnique({ where: { id }, include: { _count: { select: { solves: true, attempts: true, labs: true, notes: true } } } });
    if (!current) this.fail(404, 'CHALLENGE_NOT_FOUND', 'Challenge was not found.');
    await this.prisma.$transaction([this.prisma.challenge.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, reviewStatus: ReviewStatus.ARCHIVED, revision: { increment: 1 } } }), this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_CHALLENGE_ARCHIVE', metadata: { challengeId: id, message: `Archived challenge ${current.title}.` } } })]);
    return { success: true };
  }

  async diagnoseAdminChallenge(id: string, user: LearningRecord): Promise<ChallengeDiagnostic> {
    await this.databaseAdmin(user);
    const challenge = await this.prisma.challenge.findUnique({ where: { id }, include: { hints: true } });
    if (!challenge) this.fail(404, 'CHALLENGE_NOT_FOUND', 'Challenge was not found.');
    let targetReady = false;
    try { const target = createLabTarget(this.labFlagSecret, challenge, { instanceId: 'admin-diagnostic', expiresAt: new Date(Date.now() + 60000) }); targetReady = Boolean(target.artifact && target.objective && target.steps.length); } catch {}
    const guide = officialGuideFor(challenge.slug, challenge.hints[0]?.content);
    const checks = [{ name: '基础字段', ok: Boolean(challenge.slug && challenge.title && challenge.description), detail: '题目标识、标题和说明完整。' }, { name: 'Flag 校验', ok: Boolean(challenge.flagHash), detail: '服务端验证哈希已配置，未读取明文。' }, { name: '靶场模板', ok: targetReady, detail: targetReady ? '靶场目标与材料可正常生成。' : '靶场生成器执行失败。' }, { name: '官方题解', ok: Boolean(guide.steps?.length && challenge.hints.length), detail: guide.steps?.length ? `已检测到 ${guide.steps.length} 个题解步骤。` : '缺少题解步骤。' }];
    return { challengeId: id, checkedAt: new Date().toISOString(), healthy: checks.every((item) => item.ok), checks };
  }

  async adminLabs(user: LearningRecord): Promise<AdminLabRecord[]> {
    await this.databaseAdmin(user);
    await this.prisma.labInstance.updateMany({ where: { status: 'RUNNING', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED', stoppedAt: new Date() } });
    const labs = await this.prisma.labInstance.findMany({ include: { user: { select: { username: true } }, challenge: { select: { id: true, slug: true, title: true } } }, orderBy: { expiresAt: 'desc' }, take: 100 });
    return labs.map((lab) => ({ instanceId: lab.id, challengeId: lab.challenge.id, challengeSlug: lab.challenge.slug, challengeTitle: lab.challenge.title, username: lab.user.username, status: lab.status, startedAt: lab.startedAt?.toISOString(), expiresAt: lab.expiresAt.toISOString(), remainingSeconds: lab.status === 'RUNNING' ? Math.max(0, Math.ceil((lab.expiresAt.getTime() - Date.now()) / 1000)) : 0 }));
  }

  async stopAdminLab(instanceId: string, user: LearningRecord): Promise<{ success: true }> {
    const admin = await this.databaseAdmin(user);
    const lab = await this.prisma.labInstance.findUnique({ where: { id: instanceId } });
    if (!lab) this.fail(404, 'LAB_NOT_FOUND', 'Lab instance was not found.');
    if (lab.status === 'RUNNING') await this.prisma.labInstance.update({ where: { id: instanceId }, data: { status: 'STOPPED', stoppedAt: new Date() } });
    await this.prisma.activity.create({ data: { userId: admin.id, type: 'ADMIN_LAB_STOP', metadata: { instanceId, message: 'Stopped a lab instance from operations.' } } });
    return { success: true };
  }

  private auditView(item: any): AdminAuditRecord {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
    return { id: item.id, actorId: item.userId, actorName: item.user?.username ?? 'System', action: item.type, summary: String(metadata.message ?? item.type), ...(metadata.targetType ? { targetType: String(metadata.targetType) } : {}), ...(metadata.targetId ? { targetId: String(metadata.targetId) } : {}), createdAt: item.createdAt.toISOString(), metadata };
  }

  async adminAudit(user: LearningRecord, query: AdminListQuery = {}): Promise<Paginated<AdminAuditRecord>> {
    await this.databaseAdmin(user);
    const { page, pageSize, skip } = this.page(query); const keyword = query.query?.trim();
    const where: any = { ...(query.status && query.status !== 'ALL' ? { type: { startsWith: query.status } } : { OR: [{ type: { startsWith: 'ADMIN_' } }, { type: { in: ['LOGIN', 'LOGOUT_ALL'] } }] }), ...(keyword ? { user: { username: { contains: keyword, mode: 'insensitive' } } } : {}) };
    const [rows, total] = await this.prisma.$transaction([this.prisma.activity.findMany({ where, include: { user: { select: { username: true } } }, orderBy: { createdAt: 'desc' }, skip, take: pageSize }), this.prisma.activity.count({ where })]);
    return this.paginated(rows.map((item) => this.auditView(item)), total, page, pageSize);
  }

  async adminOverview(user: LearningRecord): Promise<AdminOverviewSnapshot> {
    await this.databaseAdmin(user);
    const now = new Date(); const since24h = new Date(now.getTime() - 24 * 60 * 60_000); const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const databaseStarted = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const databaseLatency = Date.now() - databaseStarted;
    const [registeredUsers, activeUsers24h, publishedChallenges, runningLabs, failedLabs24h, solves24h, aiRequests24h, pendingFeedback, draftAnnouncements, registrations, solves, aiRequests, audits] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: AccountStatus.PENDING_DELETION } } }),
      this.prisma.user.count({ where: { status: AccountStatus.ACTIVE, lastActiveAt: { gte: since24h } } }),
      this.prisma.challenge.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.labInstance.count({ where: { status: 'RUNNING', expiresAt: { gt: now } } }),
      this.prisma.labInstance.count({ where: { status: 'FAILED', stoppedAt: { gte: since24h } } }),
      this.prisma.challengeSolve.count({ where: { solvedAt: { gte: since24h } } }),
      this.prisma.aiMessage.count({ where: { role: 'assistant', createdAt: { gte: since24h } } }),
      this.prisma.feedback.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }),
      this.prisma.announcement.count({ where: { published: false, deletedAt: null } }),
      this.prisma.user.findMany({ where: { createdAt: { gte: since7d } }, select: { createdAt: true } }),
      this.prisma.challengeSolve.findMany({ where: { solvedAt: { gte: since7d } }, select: { solvedAt: true } }),
      this.prisma.aiMessage.findMany({ where: { role: 'assistant', createdAt: { gte: since7d } }, select: { createdAt: true } }),
      this.prisma.activity.findMany({ where: { OR: [{ type: { startsWith: 'ADMIN_' } }, { type: { in: ['LOGIN', 'LOGOUT_ALL'] } }] }, include: { user: { select: { username: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);
    const buckets = (dates: Date[]) => Array.from({ length: 7 }, (_, index) => { const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (6 - index)); const end = new Date(start.getTime() + 24 * 60 * 60_000); return dates.filter((value) => value >= start && value < end).length; });
    const health: AdminOverviewSnapshot['health'] = [
      { key: 'database', label: 'PostgreSQL', status: databaseLatency < 500 ? 'HEALTHY' : 'DEGRADED', detail: '主数据存储可访问', latencyMs: databaseLatency },
      { key: 'ai', label: 'AI 模型服务', status: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY ? 'HEALTHY' : 'UNKNOWN', detail: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY ? 'API 凭据已配置' : '未配置模型凭据' },
      { key: 'redis', label: 'Redis', status: process.env.REDIS_URL ? 'UNKNOWN' : 'UNKNOWN', detail: process.env.REDIS_URL ? '已配置，尚未接入主动探针' : '未配置缓存服务' },
      { key: 'labs', label: '靶场调度', status: failedLabs24h ? 'DEGRADED' : 'HEALTHY', detail: failedLabs24h ? `24 小时内 ${failedLabs24h} 个实例失败` : '24 小时内无失败实例' },
    ];
    const alerts: AdminOverviewSnapshot['alerts'] = [];
    if (failedLabs24h) alerts.push({ id: 'failed-labs', severity: 'CRITICAL', title: '靶场实例存在失败', detail: `24 小时内检测到 ${failedLabs24h} 个失败实例，请检查运行运维。`, createdAt: now.toISOString() });
    if (pendingFeedback) alerts.push({ id: 'pending-feedback', severity: pendingFeedback > 10 ? 'WARNING' : 'INFO', title: '存在待处理反馈', detail: `${pendingFeedback} 条反馈尚未闭环。`, createdAt: now.toISOString() });
    if (draftAnnouncements) alerts.push({ id: 'draft-announcements', severity: 'INFO', title: '公告草稿待处理', detail: `${draftAnnouncements} 篇草稿尚未发布。`, createdAt: now.toISOString() });
    return { generatedAt: now.toISOString(), environment: process.env.NODE_ENV ?? 'development', version: process.env.APP_VERSION ?? '2.0.0', health, metrics: { registeredUsers, activeUsers24h, publishedChallenges, runningLabs, failedLabs24h, solves24h, aiRequests24h, pendingFeedback, draftAnnouncements }, trends: { registrations: buckets(registrations.map((item) => item.createdAt)), solves: buckets(solves.map((item) => item.solvedAt)), aiRequests: buckets(aiRequests.map((item) => item.createdAt)) }, alerts, recentAudit: audits.map((item) => this.auditView(item)) };
  }

  async listChallenges(user?: LearningRecord) {
    const [challenges, solved] = await Promise.all([
      this.prisma.challenge.findMany({ where: { isActive: true, deletedAt: null }, include: { _count: { select: { solves: true } } }, orderBy: [{ category: 'asc' }, { points: 'asc' }] }),
      this.solvedIds(user),
    ]);
    return challenges.map((challenge) => this.challengeSummary(challenge, solved));
  }

  async challengeDetail(slug: string, user?: LearningRecord): Promise<ChallengeDetail> {
    const [challenge, solved] = await Promise.all([
      this.challengeBySlug(slug, { _count: { select: { solves: true } }, hints: { orderBy: { order: 'asc' } } }),
      this.solvedIds(user),
    ]);
    const [unlocks, workspace] = user
      ? await Promise.all([
        this.prisma.userHint.findMany({ where: { userId: user.id, hint: { challengeId: challenge.id } }, select: { hintId: true } }),
        this.workspaceFor(challenge.id, user.id),
      ])
      : [[], undefined];
    const unlocked = new Set(unlocks.map((item) => item.hintId));
    const guideHint = challenge.hints[0];
    const guideUnlocked = solved.has(challenge.id) || Boolean(guideHint && unlocked.has(guideHint.id));
    const hints = guideHint ? [{ id: guideHint.id, title: officialGuideFor(challenge.slug, guideHint.content).title, cost: 20, order: 1, unlocked: guideUnlocked, ...(guideUnlocked ? { content: officialGuideContent(challenge.slug, guideHint.content) } : {}) }] : [];
    const attempts = user ? await this.recentAttempts(user.id, challenge.id) : [];
    const submissionStats = { total: attempts.length, correct: attempts.filter((item) => item.correct).length };
    return {
      ...this.challengeSummary(challenge, solved),
      hints,
      attachments: challengeAttachments(challenge.slug),
      connection: undefined,
      workspace: workspace ?? { session: await this.sessionFor(undefined, challenge.id), recentSubmissions: [], submissionStats, resourceHealth: { status: 'READY' } },
      attempts,
      submissionStats,
    } as ChallengeDetail;
  }

  async workspace(slug: string, user: LearningRecord): Promise<WorkspaceOverview> {
    const challenge = await this.challengeBySlug(slug);
    await this.databaseUser(user.id);
    return this.workspaceFor(challenge.id, user.id);
  }

  async challengeNotes(user: LearningRecord): Promise<ChallengeNote[]> {
    await this.databaseUser(user.id);
    const notes = await this.prisma.challengeNote.findMany({
      where: { userId: user.id },
      include: { challenge: { select: { slug: true, title: true, category: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return notes.map((note) => ({
      id: note.id,
      slug: note.challenge.slug,
      challengeTitle: note.challenge.title,
      category: note.challenge.category,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }));
  }

  async challengeNotesForChallenge(slug: string, user: LearningRecord): Promise<ChallengeNote[]> {
    const challenge = await this.challengeBySlug(slug);
    await this.databaseUser(user.id);
    const notes = await this.prisma.challengeNote.findMany({
      where: { userId: user.id, challengeId: challenge.id },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map((note) => ({ id: note.id, slug: challenge.slug, challengeTitle: challenge.title, category: challenge.category, content: note.content, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() }));
  }

  async createChallengeNote(slug: string, user: LearningRecord, content: string): Promise<ChallengeNote> {
    const challenge = await this.challengeBySlug(slug);
    await this.databaseUser(user.id);
    if (!content.trim()) this.fail(400, 'VALIDATION_FAILED', 'Note content cannot be empty.');
    const note = await this.prisma.challengeNote.create({
      data: { userId: user.id, challengeId: challenge.id, content: content.trim() },
    });
    return { id: note.id, slug: challenge.slug, challengeTitle: challenge.title, category: challenge.category, content: note.content, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() };
  }

  async deleteChallengeNote(noteId: string, user: LearningRecord): Promise<{ success: true }> {
    await this.databaseUser(user.id);
    const deleted = await this.prisma.challengeNote.deleteMany({ where: { id: noteId, userId: user.id } });
    if (!deleted.count) this.fail(404, 'NOTE_NOT_FOUND', 'Challenge note not found.');
    return { success: true };
  }

  async challengeAttachment(slug: string, fileName: string) {
    const challenge = await this.challengeBySlug(slug);
    const attachment = resolveChallengeAttachment(challenge.slug, fileName);
    if (!attachment) this.fail(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found for this challenge.');
    return attachment;
  }

  async submit(slug: string, user: LearningRecord, flag: string) {
    if (!flag?.trim()) this.fail(400, 'VALIDATION_FAILED', 'Enter a flag before submitting.');
    const [challenge, databaseUser] = await Promise.all([
      this.challengeBySlug(slug, { skills: { include: { skill: true } } }),
      this.databaseUser(user.id),
    ]);
    let correct = false;
    try { correct = await argon2.verify(challenge.flagHash, flag.trim()); } catch { correct = false; }
    if (!correct) {
      const recentLab = await this.prisma.labInstance.findFirst({
        where: { userId: databaseUser.id, challengeId: challenge.id, expiresAt: { gt: new Date() } },
        orderBy: { startedAt: 'desc' },
      });
      correct = Boolean(recentLab && createSessionFlag(this.labFlagSecret, challenge.slug, recentLab.id) === flag.trim());
    }
    await this.prisma.challengeAttempt.create({ data: { userId: databaseUser.id, challengeId: challenge.id, submittedHash: this.attemptHash(flag.trim()), correct } });
    if (!correct) {
      await this.prisma.activity.create({ data: { userId: databaseUser.id, type: 'FLAG_ATTEMPT', metadata: { challengeId: challenge.id, message: `Attempted ${challenge.title}.` } } });
      return { success: false, message: 'Flag incorrect', attempts: await this.recentAttempts(databaseUser.id, challenge.id) };
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.challengeSolve.findUnique({ where: { userId_challengeId: { userId: databaseUser.id, challengeId: challenge.id } } });
      if (existing) return { alreadySolved: true, user: await tx.user.findUniqueOrThrow({ where: { id: databaseUser.id } }) };
      const beforeSolveCount = await tx.challengeSolve.count({ where: { challengeId: challenge.id } });
      await tx.challengeSolve.create({ data: { userId: databaseUser.id, challengeId: challenge.id, points: challenge.points, isFirstBlood: beforeSolveCount === 0 } });
      const updatedUser = await tx.user.update({
        where: { id: databaseUser.id },
        data: { score: { increment: challenge.points }, xp: { increment: challenge.points }, level: Math.max(1, Math.floor((databaseUser.xp + challenge.points) / 250) + 1), lastActiveAt: new Date() },
      });
      const skillRewards: Array<{ skillSlug: string; xp: number; newLevel: number }> = [];
      for (const relation of challenge.skills) {
        const existingSkill = await tx.userSkill.findUnique({ where: { userId_skillId: { userId: databaseUser.id, skillId: relation.skillId } } });
        const xp = (existingSkill?.xp ?? 0) + relation.xpReward;
        const level = Math.max(1, Math.floor(xp / 100) + 1);
        await tx.userSkill.upsert({
          where: { userId_skillId: { userId: databaseUser.id, skillId: relation.skillId } },
          update: { xp, level, status: SkillStatus.LEARNING },
          create: { userId: databaseUser.id, skillId: relation.skillId, xp, level, status: SkillStatus.LEARNING },
        });
        skillRewards.push({ skillSlug: relation.skill.slug, xp: relation.xpReward, newLevel: level });
      }
      await tx.activity.create({ data: { userId: databaseUser.id, type: 'CHALLENGE_SOLVE', metadata: { challengeId: challenge.id, message: `Solved ${challenge.title}.` } } });
      return { alreadySolved: false, user: updatedUser, isFirstBlood: beforeSolveCount === 0, skillRewards };
    });
    const attempts = await this.recentAttempts(databaseUser.id, challenge.id);
    if (result.alreadySolved) return { success: true, alreadySolved: true, message: 'Challenge already completed; score was not added twice.', newScore: result.user.score, attempts };
    return { success: true, points: challenge.points, newScore: result.user.score, isFirstBlood: result.isFirstBlood, skillRewards: result.skillRewards, attempts };
  }

  async unlockHint(slug: string, hintId: string, user: LearningRecord) {
    const challenge = await this.challengeBySlug(slug, { hints: true });
    const hint = challenge.hints[0];
    if (hint?.id !== hintId) this.fail(404, 'HINT_NOT_FOUND', 'Official guide not found.');
    if (!hint) this.fail(404, 'HINT_NOT_FOUND', 'Hint not found.');
    const [databaseUser, solved] = await Promise.all([
      this.databaseUser(user.id),
      this.prisma.challengeSolve.findUnique({ where: { userId_challengeId: { userId: user.id, challengeId: challenge.id } } }),
    ]);
    if (solved) return { content: officialGuideContent(challenge.slug, hint.content), cost: 0, newScore: databaseUser.score };
    const result = await this.prisma.$transaction(async (tx) => {
      const [transactionUser, existing] = await Promise.all([
        tx.user.findUnique({ where: { id: user.id } }),
        tx.userHint.findUnique({ where: { userId_hintId: { userId: user.id, hintId: hint.id } } }),
      ]);
      if (!transactionUser) this.fail(401, 'AUTH_FORBIDDEN', 'Your account is no longer available.');
      if (existing) this.fail(409, 'HINT_ALREADY_UNLOCKED', 'Hint is already unlocked.');
      if (transactionUser.score < 20) this.fail(400, 'INSUFFICIENT_POINTS', 'Not enough score to unlock this official guide.');
      const updatedUser = await tx.user.update({ where: { id: transactionUser.id }, data: { score: { decrement: 20 }, lastActiveAt: new Date() } });
      await tx.userHint.create({ data: { userId: transactionUser.id, hintId: hint.id } });
      await tx.activity.create({ data: { userId: transactionUser.id, type: 'HINT_UNLOCK', metadata: { challengeId: challenge.id, hintId: hint.id, message: `Unlocked official guide for ${challenge.title}.` } } });
      return updatedUser;
    });
    return { content: officialGuideContent(challenge.slug, hint.content), cost: 20, newScore: result.score };
  }

  async startLab(user: LearningRecord, challengeId: string): Promise<LabSession & { message?: string }> {
    const [challenge, databaseUser] = await Promise.all([this.challengeBySlug(challengeId), this.databaseUser(user.id)]);
    const existing = await this.sessionFor(databaseUser.id, challenge.id);
    if (existing.running) return { ...existing, message: 'A guided learning session is already running for this challenge.' };
    const ttl = Math.max(60, Number(process.env.LAB_TTL_SECONDS ?? 1800));
    const startedAt = new Date();
    const lab = await this.prisma.labInstance.create({ data: { userId: databaseUser.id, challengeId: challenge.id, status: 'RUNNING', startedAt, expiresAt: new Date(startedAt.getTime() + ttl * 1000) } });
    await this.prisma.activity.create({ data: { userId: databaseUser.id, type: 'LAB_START', metadata: { challengeId: challenge.id, message: `Started a guided session for ${challenge.title}.` } } });
    return { ...(await this.sessionFor(databaseUser.id, challenge.id)), message: 'Local CTF target started. Find the session flag and submit it from the workspace.' };
  }

  async labTarget(instanceId: string, user: LearningRecord) {
    const lab = await this.activeLabByInstance(instanceId, user.id);
    return createLabTarget(this.labFlagSecret, lab.challenge, { instanceId: lab.id, expiresAt: lab.expiresAt });
  }

  async interactLabTarget(instanceId: string, input: string, user: LearningRecord) {
    const lab = await this.activeLabByInstance(instanceId, user.id);
    return interactLabTarget(this.labFlagSecret, lab.challenge, { instanceId: lab.id, expiresAt: lab.expiresAt }, input);
  }

  async labStatus(slug: string, user: LearningRecord): Promise<{ session: LabSession; resourceHealth: { status: 'READY' } }> {
    const challenge = await this.challengeBySlug(slug);
    return { session: await this.sessionFor(user.id, challenge.id), resourceHealth: { status: 'READY' } };
  }

  async refreshLab(slug: string, user: LearningRecord): Promise<{ session: LabSession }> {
    const challenge = await this.challengeBySlug(slug);
    const lab = await this.prisma.labInstance.findFirst({ where: { userId: user.id, challengeId: challenge.id, status: 'RUNNING', expiresAt: { gt: new Date() } }, orderBy: { startedAt: 'desc' } });
    if (!lab) this.fail(404, 'LAB_NOT_RUNNING', 'No guided session is running for this challenge.');
    const expiresAt = new Date(Date.now() + Math.max(60, Number(process.env.LAB_TTL_SECONDS ?? 1800)) * 1000);
    await this.prisma.$transaction([
      this.prisma.labInstance.update({ where: { id: lab.id }, data: { expiresAt } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'LAB_REFRESH', metadata: { challengeId: challenge.id, message: `Refreshed a guided session for ${challenge.title}.` } } }),
    ]);
    return { session: await this.sessionFor(user.id, challenge.id) };
  }

  async stopLab(slug: string, user: LearningRecord): Promise<{ session: LabSession; message: string }> {
    const challenge = await this.challengeBySlug(slug);
    const lab = await this.prisma.labInstance.findFirst({ where: { userId: user.id, challengeId: challenge.id, status: 'RUNNING', expiresAt: { gt: new Date() } }, orderBy: { startedAt: 'desc' } });
    if (!lab) this.fail(404, 'LAB_NOT_RUNNING', 'No guided session is running for this challenge.');
    await this.prisma.$transaction([
      this.prisma.labInstance.update({ where: { id: lab.id }, data: { status: 'STOPPED', stoppedAt: new Date() } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'LAB_STOP', metadata: { challengeId: challenge.id, message: `Stopped a guided session for ${challenge.title}.` } } }),
    ]);
    return { session: await this.sessionFor(user.id, challenge.id), message: 'Guided learning session stopped.' };
  }

  async rangeOverview(user?: LearningRecord): Promise<RangeOverview> {
    const [availableTasks, solved, sessions] = await Promise.all([
      this.prisma.challenge.count({ where: { isActive: true } }),
      this.solvedIds(user),
      user ? this.prisma.labInstance.findMany({ where: { userId: user.id, status: 'RUNNING', expiresAt: { gt: new Date() }, challenge: { isActive: true } }, include: { challenge: true }, orderBy: { expiresAt: 'asc' } }) : Promise.resolve([]),
    ]);
    const tasks = await this.listChallenges(user);
    return {
      metrics: { availableTasks, activeSessions: sessions.length, completed: solved.size, attachments: attachmentCount() },
      sessions: sessions.map((lab) => ({ instanceId: lab.id, status: lab.status, running: true, remainingSeconds: Math.max(0, Math.ceil((lab.expiresAt.getTime() - Date.now()) / 1000)), slug: lab.challenge.slug, title: lab.challenge.title, category: lab.challenge.category, expiresAt: lab.expiresAt.toISOString(), expiresInMinutes: Math.max(0, Math.ceil((lab.expiresAt.getTime() - Date.now()) / 60_000)) })),
      tasks: tasks.filter((task) => !task.solved),
    };
  }

  async dashboardStats(user?: LearningRecord) {
    await this.prisma.labInstance.updateMany({ where: { status: 'RUNNING', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED', stoppedAt: new Date() } });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [users, challenges, solves, runningLabs, solvesToday] = await Promise.all([
      this.prisma.user.count(), this.prisma.challenge.count({ where: { isActive: true } }), this.prisma.challengeSolve.count(),
      this.prisma.labInstance.count({ where: { status: 'RUNNING', expiresAt: { gt: new Date() } } }),
      this.prisma.challengeSolve.count({ where: { solvedAt: { gte: startOfDay } } }),
    ]);
    return { activeUsers: users, registeredUsers: users, totalChallenges: challenges, totalSolves: solves, runningLabs, onlineUsers: user ? 1 : 0, solvesToday };
  }

  async dashboardEvents() {
    const activities = await this.prisma.activity.findMany({ include: { user: { select: { username: true } } }, orderBy: { createdAt: 'desc' }, take: 12 });
    return activities.map((activity) => ({ username: activity.user.username, type: activity.type, message: typeof activity.metadata === 'object' && activity.metadata && 'message' in activity.metadata ? String((activity.metadata as any).message) : activity.type, createdAt: activity.createdAt.toISOString() }));
  }

  async leaderboard() {
    const users = await this.prisma.user.findMany({ where: { role: 'USER', status: 'ACTIVE', deletedAt: null }, orderBy: [{ score: 'desc' }, { createdAt: 'asc' }], include: { _count: { select: { solves: true } } }, take: 100 });
    return users.map((user, index) => ({ id: user.id, rank: index + 1, username: user.username, level: user.level, score: user.score, solved: user._count.solves }));
  }

  async skillGraph() {
    const skills = await this.prisma.skill.findMany({ orderBy: { slug: 'asc' } });
    return { nodes: skills.map((skill) => ({ slug: skill.slug, name: skill.name, category: skill.category, description: skill.description, x: skill.x, y: skill.y })), edges: [] };
  }

  async userSkills(user: LearningRecord) {
    const [skills, userSkills] = await Promise.all([
      this.prisma.skill.findMany({ orderBy: { slug: 'asc' } }), this.prisma.userSkill.findMany({ where: { userId: user.id } }),
    ]);
    const userSkillById = new Map(userSkills.map((item) => [item.skillId, item]));
    return skills.map((skill) => {
      const progress = userSkillById.get(skill.id);
      const xp = progress?.xp ?? 0;
      return { skill: { slug: skill.slug, name: skill.name, category: skill.category, description: skill.description }, xp, level: progress?.level ?? Math.max(1, Math.floor(xp / 100) + 1), status: progress?.status ?? 'AVAILABLE' };
    });
  }

  async learningOverview(user?: LearningRecord) {
    const [courses, progress] = await Promise.all([
      this.prisma.course.findMany({ where: { isPublished: true }, orderBy: { title: 'asc' } }),
      user ? this.prisma.courseProgress.findMany({ where: { userId: user.id } }) : Promise.resolve([]),
    ]);
    const progressByCourse = new Map(progress.map((item) => [item.courseId, item]));
    const skillXp = user ? (await this.prisma.userSkill.aggregate({ where: { userId: user.id }, _sum: { xp: true } }))._sum.xp ?? 0 : 0;
    return {
      summary: { courseCount: courses.length, finished: progress.filter((item) => item.completedAt !== null).length, skillXp },
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        slug: course.slug,
        description: course.description,
        level: course.difficulty,
        duration: course.duration,
        category: course.category,
        chapters: Array.isArray(course.chapters) ? course.chapters.filter((chapter): chapter is string => typeof chapter === 'string') : [],
        challengeSlug: course.challengeSlug ?? '',
        progress: progressByCourse.get(course.id)?.progress ?? 0,
        completed: Boolean(progressByCourse.get(course.id)?.completedAt),
      })),
    };
  }

  async aiChat(user: LearningRecord, message: string, challengeId?: string, hintLevel = 1, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], skill: LearningSkillId = 'auto') {
    if (!message.trim()) this.fail(400, 'VALIDATION_FAILED', 'Enter a question for the learning assistant.');
    const challenge = challengeId ? await this.challengeBySlug(challengeId) : undefined;
    const previous = await this.prisma.aiMemory.findUnique({ where: { userId: user.id } });
    const memory = updateLearningMemory(previous?.snapshot, message);
    await this.prisma.$transaction([
      this.prisma.activity.create({ data: { userId: user.id, type: 'AI_TUTOR', metadata: { challengeId: challenge?.id, hintLevel, message: 'Used the AI learning agent center.' } } }),
      this.prisma.aiMemory.upsert({ where: { userId: user.id }, create: { userId: user.id, snapshot: memory }, update: { snapshot: memory } }),
    ]);
    return answerLearningQuestion(message, challenge?.title, hintLevel, history, skill, memory);
  }

  private aiConversationSummary(item: any): AiConversationSummary {
    return { id: item.id, title: item.title, archived: item.archived, messageCount: item._count?.messages ?? item.messages?.length ?? 0, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
  }

  async aiConversations(user: LearningRecord, archived = false): Promise<AiConversationSummary[]> {
    const items = await this.prisma.aiConversation.findMany({ where: { userId: user.id, archived }, include: { _count: { select: { messages: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 });
    return items.map((item) => this.aiConversationSummary(item));
  }

  async aiConversation(id: string, user: LearningRecord): Promise<AiConversationDetail> {
    const item = await this.prisma.aiConversation.findFirst({ where: { id, userId: user.id }, include: { messages: { orderBy: { createdAt: 'asc' } }, _count: { select: { messages: true } } } });
    if (!item) this.fail(404, 'AI_CONVERSATION_NOT_FOUND', 'Conversation not found or deleted.');
    return { ...this.aiConversationSummary(item), messages: item.messages.map((message) => ({ id: message.id, role: message.role as 'user' | 'assistant', content: message.content, ...(message.provider ? { provider: message.provider } : {}), feedback: (message.feedback as AiMessageFeedback) ?? null, createdAt: message.createdAt.toISOString() })) };
  }

  async createAiConversation(user: LearningRecord, title = '新的学习对话'): Promise<AiConversationSummary> {
    const item = await this.prisma.aiConversation.create({ data: { userId: user.id, title: title.trim().slice(0, 80) || '新的学习对话' }, include: { _count: { select: { messages: true } } } });
    return this.aiConversationSummary(item);
  }

  async updateAiConversation(id: string, user: LearningRecord, input: { title?: string; archived?: boolean }): Promise<AiConversationSummary> {
    const existing = await this.prisma.aiConversation.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) this.fail(404, 'AI_CONVERSATION_NOT_FOUND', 'Conversation not found or deleted.');
    const item = await this.prisma.aiConversation.update({ where: { id }, data: { ...(input.title !== undefined ? { title: input.title.trim().slice(0, 80) } : {}), ...(input.archived !== undefined ? { archived: input.archived } : {}) }, include: { _count: { select: { messages: true } } } });
    return this.aiConversationSummary(item);
  }

  async deleteAiConversation(id: string, user: LearningRecord) {
    const result = await this.prisma.aiConversation.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) this.fail(404, 'AI_CONVERSATION_NOT_FOUND', 'Conversation not found or deleted.');
    return { success: true as const };
  }

  async chatInAiConversation(id: string, user: LearningRecord, message: string, hintLevel = 1): Promise<AiConversationChatResult> {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id, userId: user.id }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 8 } } });
    if (!conversation) this.fail(404, 'AI_CONVERSATION_NOT_FOUND', 'Conversation not found or deleted.');
    const content = message.trim();
    if (!content) this.fail(400, 'VALIDATION_FAILED', 'Enter a question for the learning assistant.');
    const previousMemory = await this.prisma.aiMemory.findUnique({ where: { userId: user.id } });
    const memory = updateLearningMemory(previousMemory?.snapshot, content);
    const history = [...conversation.messages].reverse().map((entry) => ({ role: entry.role as 'user' | 'assistant', content: entry.content }));
    const title = conversation.messages.length ? conversation.title : conversationTitle(content);
    const userMessage = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.aiMessage.create({ data: { conversationId: id, role: 'user', content } });
      await transaction.aiConversation.update({ where: { id }, data: { title } });
      await transaction.aiMemory.upsert({ where: { userId: user.id }, create: { userId: user.id, snapshot: memory }, update: { snapshot: memory } });
      return created;
    });
    const answer = await answerLearningQuestion(content, undefined, hintLevel, history, 'auto', memory);
    const [assistantMessage, updated] = await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: { conversationId: id, role: 'assistant', content: answer.content, provider: answer.provider } }),
      this.prisma.aiConversation.update({ where: { id }, data: { title }, include: { _count: { select: { messages: true } } } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'AI_TUTOR', metadata: { conversationId: id, hintLevel, provider: answer.provider, message: 'Used the AI learning agent center.' } } }),
    ]);
    return {
      conversation: this.aiConversationSummary(updated),
      userMessage: { id: userMessage.id, role: 'user', content: userMessage.content, feedback: null, createdAt: userMessage.createdAt.toISOString() },
      assistantMessage: { id: assistantMessage.id, role: 'assistant', content: assistantMessage.content, provider: assistantMessage.provider ?? undefined, feedback: null, createdAt: assistantMessage.createdAt.toISOString() },
    };
  }

  async feedbackAiMessage(conversationId: string, messageId: string, user: LearningRecord, feedback: AiMessageFeedback) {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, userId: user.id }, select: { id: true } });
    if (!conversation) this.fail(404, 'AI_CONVERSATION_NOT_FOUND', 'Conversation not found or deleted.');
    const result = await this.prisma.aiMessage.updateMany({ where: { id: messageId, conversationId, role: 'assistant' }, data: { feedback } });
    if (!result.count) this.fail(404, 'AI_MESSAGE_NOT_FOUND', 'Answer not found or deleted.');
    return { success: true as const };
  }

  async regenerateAiMessage(conversationId: string, messageId: string, user: LearningRecord) {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, userId: user.id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!conversation) this.fail(404, 'AI_CONVERSATION_NOT_FOUND', 'Conversation not found or deleted.');
    const messageIndex = conversation.messages.findIndex((message) => message.id === messageId && message.role === 'assistant');
    const userMessage = messageIndex > 0 ? conversation.messages.slice(0, messageIndex).reverse().find((message) => message.role === 'user') : undefined;
    if (messageIndex < 0 || !userMessage) this.fail(404, 'AI_MESSAGE_NOT_FOUND', 'Could not find the question for this answer.');
    const userIndex = conversation.messages.findIndex((message) => message.id === userMessage.id);
    const history = conversation.messages.slice(Math.max(0, userIndex - 8), userIndex).map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));
    const storedMemory = await this.prisma.aiMemory.findUnique({ where: { userId: user.id } });
    const answer = await answerLearningQuestion(userMessage.content, undefined, 1, history, 'auto', normalizeLearningMemory(storedMemory?.snapshot));
    const updated = await this.prisma.aiMessage.update({ where: { id: messageId }, data: { content: answer.content, provider: answer.provider, feedback: null } });
    await this.prisma.activity.create({ data: { userId: user.id, type: 'AI_REGENERATE', metadata: { conversationId, messageId, provider: answer.provider, message: 'Regenerated an AI learning answer.' } } });
    return { id: updated.id, role: 'assistant' as const, content: updated.content, provider: updated.provider ?? undefined, feedback: null, createdAt: updated.createdAt.toISOString() };
  }

  async aiMemory(user: LearningRecord) {
    const memory = await this.prisma.aiMemory.findUnique({ where: { userId: user.id } });
    return normalizeLearningMemory(memory?.snapshot);
  }

  async clearAiMemory(user: LearningRecord) {
    await this.prisma.$transaction([
      this.prisma.aiMemory.deleteMany({ where: { userId: user.id } }),
      this.prisma.activity.deleteMany({ where: { userId: user.id, type: 'AI_MEMORY' } }),
      this.prisma.activity.create({ data: { userId: user.id, type: 'AI_MEMORY_CLEAR', metadata: { message: 'Cleared AI learning memory.' } } }),
    ]);
    return { success: true as const };
  }

  catalogSources() { return []; }
}
