import type { AdminAuditRecord, AdminChallengeInput, AdminChallengeRecord, AdminLabRecord, AdminListQuery, AdminOverviewSnapshot, AdminUserCreate, AdminUserRecord, AdminUserUpdate, Announcement, AnnouncementInput, AuthResponse, AuthUser, CalendarMemo, CalendarMemoInput, ChallengeDetail, ChallengeDiagnostic, ChallengeNote, ChallengeSummary, Competition, CompetitionInput, DashboardEvent, DashboardStats, FeedbackInput, FeedbackRecord, FeedbackUpdate, ForumPostDetail, ForumPostInput, ForumPostSummary, ForumReply, ForumReplyInput, LabInteractionResult, LabSession, LabTarget, LeaderboardEntry, LearningOverview, Paginated, RangeOverview, SkillGraph, SkillProgress, SubmissionResult, TrainingTool, TrainingToolInput, WorkspaceOverview } from '@cyberquest/shared';
import type { ChallengeAttachmentFile } from './challenge-attachments';
import type { LearningSkillId } from './ai-learning-skills';
import type { LearningMemory } from './ai-learning-memory';
import type { AiConversationChatResult, AiConversationDetail, AiConversationSummary, AiMessageFeedback } from './ai-conversations';

export type LearningRecord = Record<string, any>;
type RepositoryResult<T> = T | Promise<T>;

/**
 * Application boundary for platform state.
 *
 * The local JSON implementation is intentionally behind this port so that the
 * HTTP surface can be retained when Prisma/PostgreSQL replaces it.
 */
export interface LearningRepository {
  assertRateLimit(scope: string, identity: string, max: number, milliseconds: number): void;
  userFromAuthorization(header?: string): LearningRecord | undefined;
  requireUser(header?: string): LearningRecord;
  login(email: string, password: string): Promise<AuthResponse>;
  adminLogin(password: string): Promise<AuthResponse>;
  logout(user: LearningRecord): RepositoryResult<{ success: true }>;
  register(input: { username?: string; email?: string; password?: string }): Promise<AuthResponse>;
  me(user: LearningRecord): RepositoryResult<AuthUser>;
  createAdminUser(input: AdminUserCreate, user: LearningRecord): RepositoryResult<AdminUserRecord>;
  adminUsers(user: LearningRecord, query?: AdminListQuery): RepositoryResult<Paginated<AdminUserRecord>>;
  adminUser(id: string, user: LearningRecord): RepositoryResult<AdminUserRecord>;
  updateAdminUser(id: string, input: AdminUserUpdate, user: LearningRecord): RepositoryResult<AdminUserRecord>;
  deleteAdminUser(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  restoreAdminUser(id: string, user: LearningRecord): RepositoryResult<AdminUserRecord>;
  revokeAdminUserSessions(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  announcements(): RepositoryResult<Announcement[]>;
  adminAnnouncements(user: LearningRecord, query?: AdminListQuery): RepositoryResult<Paginated<Announcement>>;
  createAnnouncement(input: AnnouncementInput, user: LearningRecord): RepositoryResult<Announcement>;
  updateAnnouncement(id: string, input: AnnouncementInput, user: LearningRecord): RepositoryResult<Announcement>;
  deleteAnnouncement(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  competitions(): RepositoryResult<Competition[]>;
  adminCompetitions(user: LearningRecord, query?: AdminListQuery): RepositoryResult<Paginated<Competition>>;
  createCompetition(input: CompetitionInput, user: LearningRecord): RepositoryResult<Competition>;
  updateCompetition(id: string, input: CompetitionInput, user: LearningRecord): RepositoryResult<Competition>;
  deleteCompetition(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  calendarMemos(user: LearningRecord): RepositoryResult<CalendarMemo[]>;
  createCalendarMemo(input: CalendarMemoInput, user: LearningRecord): RepositoryResult<CalendarMemo>;
  updateCalendarMemo(id: string, input: CalendarMemoInput, user: LearningRecord): RepositoryResult<CalendarMemo>;
  deleteCalendarMemo(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  tools(): RepositoryResult<TrainingTool[]>;
  adminTools(user: LearningRecord, query?: AdminListQuery): RepositoryResult<Paginated<TrainingTool>>;
  createTool(input: TrainingToolInput, user: LearningRecord): RepositoryResult<TrainingTool>;
  updateTool(id: string, input: TrainingToolInput, user: LearningRecord): RepositoryResult<TrainingTool>;
  deleteTool(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  createFeedback(input: FeedbackInput, user: LearningRecord): RepositoryResult<FeedbackRecord>;
  adminFeedback(user: LearningRecord, query?: AdminListQuery): RepositoryResult<Paginated<FeedbackRecord>>;
  updateFeedback(id: string, input: FeedbackUpdate, user: LearningRecord): RepositoryResult<FeedbackRecord>;
  deleteFeedback(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  forumPosts(): RepositoryResult<ForumPostSummary[]>;
  forumPost(id: string): RepositoryResult<ForumPostDetail>;
  createForumPost(input: ForumPostInput, user: LearningRecord): RepositoryResult<ForumPostDetail>;
  createForumReply(id: string, input: ForumReplyInput, user: LearningRecord): RepositoryResult<ForumReply>;
  deleteForumPost(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  adminChallenges(user: LearningRecord, query?: AdminListQuery): RepositoryResult<Paginated<AdminChallengeRecord>>;
  createAdminChallenge(input: AdminChallengeInput, user: LearningRecord): RepositoryResult<AdminChallengeRecord>;
  updateAdminChallenge(id: string, input: AdminChallengeInput, user: LearningRecord): RepositoryResult<AdminChallengeRecord>;
  deleteAdminChallenge(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  diagnoseAdminChallenge(id: string, user: LearningRecord): RepositoryResult<ChallengeDiagnostic>;
  adminLabs(user: LearningRecord): RepositoryResult<AdminLabRecord[]>;
  stopAdminLab(instanceId: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  adminAudit(user: LearningRecord, query?: AdminListQuery): RepositoryResult<Paginated<AdminAuditRecord>>;
  adminOverview(user: LearningRecord): RepositoryResult<AdminOverviewSnapshot>;
  userSkills(user: LearningRecord): RepositoryResult<SkillProgress[]>;
  listChallenges(user?: LearningRecord): RepositoryResult<ChallengeSummary[]>;
  challengeDetail(slug: string, user?: LearningRecord): RepositoryResult<ChallengeDetail>;
  workspace(slug: string, user: LearningRecord): RepositoryResult<WorkspaceOverview>;
  challengeNotes(user: LearningRecord): RepositoryResult<ChallengeNote[]>;
  challengeNotesForChallenge(slug: string, user: LearningRecord): RepositoryResult<ChallengeNote[]>;
  createChallengeNote(slug: string, user: LearningRecord, content: string): RepositoryResult<ChallengeNote>;
  deleteChallengeNote(noteId: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  challengeAttachment(slug: string, fileName: string): RepositoryResult<ChallengeAttachmentFile>;
  submit(slug: string, user: LearningRecord, flag: string): RepositoryResult<SubmissionResult>;
  unlockHint(slug: string, hintId: string, user: LearningRecord): RepositoryResult<{ content: string; cost: number; newScore: number }>;
  startLab(user: LearningRecord, challengeId: string): RepositoryResult<LabSession & { message?: string }>;
  labTarget(instanceId: string, user: LearningRecord): RepositoryResult<LabTarget>;
  interactLabTarget(instanceId: string, input: string, user: LearningRecord): RepositoryResult<LabInteractionResult>;
  labStatus(slug: string, user: LearningRecord): RepositoryResult<{ session: LabSession; resourceHealth: { status: 'READY' } }>;
  refreshLab(slug: string, user: LearningRecord): RepositoryResult<{ session: LabSession }>;
  stopLab(slug: string, user: LearningRecord): RepositoryResult<{ session: LabSession; message: string }>;
  rangeOverview(user?: LearningRecord): RepositoryResult<RangeOverview>;
  dashboardStats(user?: LearningRecord): RepositoryResult<DashboardStats>;
  dashboardEvents(): RepositoryResult<DashboardEvent[]>;
  leaderboard(): RepositoryResult<LeaderboardEntry[]>;
  skillGraph(): RepositoryResult<SkillGraph>;
  learningOverview(user?: LearningRecord): RepositoryResult<LearningOverview>;
  aiChat(user: LearningRecord, message: string, challengeId?: string, hintLevel?: number, history?: Array<{ role: 'user' | 'assistant'; content: string }>, skill?: LearningSkillId): RepositoryResult<{ content: string; provider: string }>;
  aiConversations(user: LearningRecord, archived?: boolean): RepositoryResult<AiConversationSummary[]>;
  aiConversation(id: string, user: LearningRecord): RepositoryResult<AiConversationDetail>;
  createAiConversation(user: LearningRecord, title?: string): RepositoryResult<AiConversationSummary>;
  updateAiConversation(id: string, user: LearningRecord, input: { title?: string; archived?: boolean }): RepositoryResult<AiConversationSummary>;
  deleteAiConversation(id: string, user: LearningRecord): RepositoryResult<{ success: true }>;
  chatInAiConversation(id: string, user: LearningRecord, message: string, hintLevel?: number): RepositoryResult<AiConversationChatResult>;
  feedbackAiMessage(conversationId: string, messageId: string, user: LearningRecord, feedback: AiMessageFeedback): RepositoryResult<{ success: true }>;
  regenerateAiMessage(conversationId: string, messageId: string, user: LearningRecord): RepositoryResult<import('./ai-conversations').AiMessageRecord>;
  aiMemory(user: LearningRecord): RepositoryResult<LearningMemory>;
  clearAiMemory(user: LearningRecord): RepositoryResult<{ success: true }>;
  catalogSources(): unknown[];
}

export const LEARNING_REPOSITORY = Symbol('LEARNING_REPOSITORY');
