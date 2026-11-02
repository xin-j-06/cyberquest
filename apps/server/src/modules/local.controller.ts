import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, Req, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { LEARNING_REPOSITORY, LearningRepository } from './learning.repository';
import { AdminChallengeDto, AdminListQueryDto, AdminLoginDto, AdminUserCreateDto, AdminUserUpdateDto, AiChatDto, AiConversationCreateDto, AiConversationMessageDto, AiConversationUpdateDto, AiMessageFeedbackDto, AnnouncementDto, CalendarMemoDto, CompetitionDto, FeedbackCreateDto, FeedbackUpdateDto, ForumPostDto, ForumReplyDto, LabInteractionDto, LoginDto, RegisterDto, SaveChallengeNoteDto, StartLabDto, SubmitFlagDto, TrainingToolDto } from './request.dto';
import { RealtimeGateway } from './realtime.gateway';
import type { LabSession } from '@cyberquest/shared';
import { aiProviderStatus } from './ai-model-provider';
import { learningSkillCatalog } from './ai-learning-skills';

type ClientRequest = { ip?: string; socket?: { remoteAddress?: string } };

@Controller()
export class LocalController {
  constructor(@Inject(LEARNING_REPOSITORY) private readonly store: LearningRepository, private readonly realtime: RealtimeGateway) {}

  private user(authorization?: string) { return this.store.requireUser(authorization); }
  private optionalUser(authorization?: string) { return this.store.userFromAuthorization(authorization); }
  private clientKey(request?: ClientRequest) { return request?.ip || request?.socket?.remoteAddress || 'local'; }

  @Post('auth/login')
  async login(@Body() body: LoginDto, @Req() request: ClientRequest) {
    this.store.assertRateLimit('login', `${this.clientKey(request)}:${body.email.toLowerCase()}`, 8, 60_000);
    return this.store.login(body.email, body.password);
  }

  @Post('auth/admin-login')
  async adminLogin(@Body() body: AdminLoginDto, @Req() request: ClientRequest) {
    this.store.assertRateLimit('admin-login', this.clientKey(request), 6, 60_000);
    return this.store.adminLogin(body.password);
  }

  @Post('auth/register')
  async register(@Body() body: RegisterDto, @Req() request: ClientRequest) {
    this.store.assertRateLimit('register', this.clientKey(request), 5, 60_000);
    return this.store.register(body);
  }

  @Post('auth/logout') logout(@Headers('authorization') authorization?: string) { return this.store.logout(this.user(authorization)); }
  @Get('users/me') me(@Headers('authorization') authorization?: string) { return this.store.me(this.user(authorization)); }
  @Get('users/me/skills') userSkills(@Headers('authorization') authorization?: string) { return this.store.userSkills(this.user(authorization)); }
  @Post('admin/users') createAdminUser(@Body() body: AdminUserCreateDto, @Headers('authorization') authorization?: string) { return this.store.createAdminUser(body, this.user(authorization)); }
  @Get('admin/users') adminUsers(@Query() query: AdminListQueryDto, @Headers('authorization') authorization?: string) { return this.store.adminUsers(this.user(authorization), query); }
  @Get('admin/users/:id') adminUser(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.adminUser(id, this.user(authorization)); }
  @Patch('admin/users/:id') updateAdminUser(@Param('id') id: string, @Body() body: AdminUserUpdateDto, @Headers('authorization') authorization?: string) { return this.store.updateAdminUser(id, body, this.user(authorization)); }
  @Delete('admin/users/:id') deleteAdminUser(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteAdminUser(id, this.user(authorization)); }
  @Post('admin/users/:id/restore') restoreAdminUser(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.restoreAdminUser(id, this.user(authorization)); }
  @Post('admin/users/:id/revoke-sessions') revokeAdminUserSessions(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.revokeAdminUserSessions(id, this.user(authorization)); }
  @Get('announcements') announcements() { return this.store.announcements(); }
  @Get('admin/announcements') adminAnnouncements(@Query() query: AdminListQueryDto, @Headers('authorization') authorization?: string) { return this.store.adminAnnouncements(this.user(authorization), query); }
  @Post('admin/announcements') createAnnouncement(@Body() body: AnnouncementDto, @Headers('authorization') authorization?: string) { return this.store.createAnnouncement(body, this.user(authorization)); }
  @Patch('admin/announcements/:id') updateAnnouncement(@Param('id') id: string, @Body() body: AnnouncementDto, @Headers('authorization') authorization?: string) { return this.store.updateAnnouncement(id, body, this.user(authorization)); }
  @Delete('admin/announcements/:id') deleteAnnouncement(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteAnnouncement(id, this.user(authorization)); }
  @Get('competitions') competitions() { return this.store.competitions(); }
  @Get('admin/competitions') adminCompetitions(@Query() query: AdminListQueryDto, @Headers('authorization') authorization?: string) { return this.store.adminCompetitions(this.user(authorization), query); }
  @Post('admin/competitions') createCompetition(@Body() body: CompetitionDto, @Headers('authorization') authorization?: string) { return this.store.createCompetition(body, this.user(authorization)); }
  @Patch('admin/competitions/:id') updateCompetition(@Param('id') id: string, @Body() body: CompetitionDto, @Headers('authorization') authorization?: string) { return this.store.updateCompetition(id, body, this.user(authorization)); }
  @Delete('admin/competitions/:id') deleteCompetition(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteCompetition(id, this.user(authorization)); }
  @Get('calendar/memos') calendarMemos(@Headers('authorization') authorization?: string) { return this.store.calendarMemos(this.user(authorization)); }
  @Post('calendar/memos') createCalendarMemo(@Body() body: CalendarMemoDto, @Headers('authorization') authorization?: string) { return this.store.createCalendarMemo(body, this.user(authorization)); }
  @Patch('calendar/memos/:id') updateCalendarMemo(@Param('id') id: string, @Body() body: CalendarMemoDto, @Headers('authorization') authorization?: string) { return this.store.updateCalendarMemo(id, body, this.user(authorization)); }
  @Delete('calendar/memos/:id') deleteCalendarMemo(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteCalendarMemo(id, this.user(authorization)); }
  @Get('tools') tools() { return this.store.tools(); }
  @Get('admin/tools') adminTools(@Query() query: AdminListQueryDto, @Headers('authorization') authorization?: string) { return this.store.adminTools(this.user(authorization), query); }
  @Post('admin/tools') createTool(@Body() body: TrainingToolDto, @Headers('authorization') authorization?: string) { return this.store.createTool(body, this.user(authorization)); }
  @Patch('admin/tools/:id') updateTool(@Param('id') id: string, @Body() body: TrainingToolDto, @Headers('authorization') authorization?: string) { return this.store.updateTool(id, body, this.user(authorization)); }
  @Delete('admin/tools/:id') deleteTool(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteTool(id, this.user(authorization)); }
  @Post('feedback') createFeedback(@Body() body: FeedbackCreateDto, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization);
    this.store.assertRateLimit('feedback', `${this.clientKey(request)}:${user.id}`, 5, 60_000);
    return this.store.createFeedback(body, user);
  }
  @Get('admin/feedback') adminFeedback(@Query() query: AdminListQueryDto, @Headers('authorization') authorization?: string) { return this.store.adminFeedback(this.user(authorization), query); }
  @Patch('admin/feedback/:id') updateFeedback(@Param('id') id: string, @Body() body: FeedbackUpdateDto, @Headers('authorization') authorization?: string) { return this.store.updateFeedback(id, body, this.user(authorization)); }
  @Delete('admin/feedback/:id') deleteFeedback(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteFeedback(id, this.user(authorization)); }
  @Get('forum/posts') forumPosts() { return this.store.forumPosts(); }
  @Get('forum/posts/:id') forumPost(@Param('id') id: string) { return this.store.forumPost(id); }
  @Post('forum/posts') createForumPost(@Body() body: ForumPostDto, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization); this.store.assertRateLimit('forum-post', `${this.clientKey(request)}:${user.id}`, 4, 60_000); return this.store.createForumPost(body, user);
  }
  @Post('forum/posts/:id/replies') createForumReply(@Param('id') id: string, @Body() body: ForumReplyDto, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization); this.store.assertRateLimit('forum-reply', `${this.clientKey(request)}:${user.id}`, 12, 60_000); return this.store.createForumReply(id, body, user);
  }
  @Delete('forum/posts/:id') deleteForumPost(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteForumPost(id, this.user(authorization)); }
  @Get('admin/challenges') adminChallenges(@Query() query: AdminListQueryDto, @Headers('authorization') authorization?: string) { return this.store.adminChallenges(this.user(authorization), query); }
  @Post('admin/challenges') createAdminChallenge(@Body() body: AdminChallengeDto, @Headers('authorization') authorization?: string) { return this.store.createAdminChallenge(body, this.user(authorization)); }
  @Patch('admin/challenges/:id') updateAdminChallenge(@Param('id') id: string, @Body() body: AdminChallengeDto, @Headers('authorization') authorization?: string) { return this.store.updateAdminChallenge(id, body, this.user(authorization)); }
  @Delete('admin/challenges/:id') deleteAdminChallenge(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteAdminChallenge(id, this.user(authorization)); }
  @Post('admin/challenges/:id/diagnose') diagnoseAdminChallenge(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.diagnoseAdminChallenge(id, this.user(authorization)); }
  @Get('admin/labs') adminLabs(@Headers('authorization') authorization?: string) { return this.store.adminLabs(this.user(authorization)); }
  @Post('admin/labs/:instanceId/stop') stopAdminLab(@Param('instanceId') instanceId: string, @Headers('authorization') authorization?: string) { return this.store.stopAdminLab(instanceId, this.user(authorization)); }
  @Get('admin/audit') adminAudit(@Query() query: AdminListQueryDto, @Headers('authorization') authorization?: string) { return this.store.adminAudit(this.user(authorization), query); }
  @Get('admin/overview') adminOverview(@Headers('authorization') authorization?: string) { return this.store.adminOverview(this.user(authorization)); }
  @Get('challenges') challenges(@Headers('authorization') authorization?: string) { return this.store.listChallenges(this.optionalUser(authorization)); }
  @Get('challenges/:id') challenge(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.challengeDetail(id, this.optionalUser(authorization)); }
  @Get('challenges/:id/workspace') workspace(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.workspace(id, this.user(authorization)); }
  @Get('users/me/notes') challengeNotes(@Headers('authorization') authorization?: string) { return this.store.challengeNotes(this.user(authorization)); }
  @Get('challenges/:id/notes') challengeNotesForChallenge(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.challengeNotesForChallenge(id, this.user(authorization)); }
  @Post('challenges/:id/notes') createChallengeNote(@Param('id') id: string, @Body() body: SaveChallengeNoteDto, @Headers('authorization') authorization?: string) { return this.store.createChallengeNote(id, this.user(authorization), body.content); }
  @Delete('users/me/notes/:noteId') deleteChallengeNote(@Param('noteId') noteId: string, @Headers('authorization') authorization?: string) { return this.store.deleteChallengeNote(noteId, this.user(authorization)); }

  @Get('challenges/:id/attachments/:fileName')
  async downloadAttachment(@Param('id') id: string, @Param('fileName') fileName: string, @Headers('authorization') authorization?: string) {
    this.user(authorization);
    const attachment = await this.store.challengeAttachment(id, fileName);
    return new StreamableFile(createReadStream(attachment.path), {
      type: attachment.mediaType,
      disposition: `attachment; filename="${attachment.name}"`,
      length: attachment.size,
    });
  }

  @Post('challenges/:id/submit')
  async submit(@Param('id') id: string, @Body() body: SubmitFlagDto, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization);
    this.store.assertRateLimit('flag', `${this.clientKey(request)}:${user.id}`, 12, 60_000);
    const result = await this.store.submit(id, user, body.flag);
    if (result.success && !result.alreadySolved) this.realtime.emitChallengeSolved({ challengeRef: id, points: result.points ?? 0, isFirstBlood: Boolean(result.isFirstBlood) });
    return result;
  }

  @Post('challenges/:id/hints/:hintId/unlock')
  unlockHint(@Param('id') id: string, @Param('hintId') hintId: string, @Headers('authorization') authorization?: string) { return this.store.unlockHint(id, hintId, this.user(authorization)); }

  @Post('labs/start')
  async startLab(@Body() body: StartLabDto, @Headers('authorization') authorization?: string) {
    const user = this.user(authorization);
    const session = await this.store.startLab(user, body.challengeId);
    this.realtime.emitLabStatus(user.id, { challengeRef: body.challengeId, session: session as LabSession });
    return session;
  }
  @Get('labs/instances/:instanceId/target')
  labTarget(@Param('instanceId') instanceId: string, @Headers('authorization') authorization?: string) {
    return this.store.labTarget(instanceId, this.user(authorization));
  }
  @Post('labs/instances/:instanceId/interact')
  interactLabTarget(@Param('instanceId') instanceId: string, @Body() body: LabInteractionDto, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization);
    this.store.assertRateLimit('lab-interact', `${this.clientKey(request)}:${user.id}:${instanceId}`, 30, 60_000);
    return this.store.interactLabTarget(instanceId, body.input, user);
  }
  @Get('labs/:id/status') labStatus(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.labStatus(id, this.user(authorization)); }
  @Post('labs/:id/refresh')
  async refreshLab(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const user = this.user(authorization);
    const result = await this.store.refreshLab(id, user);
    this.realtime.emitLabStatus(user.id, { challengeRef: id, session: result.session });
    return result;
  }
  @Post('labs/:id/stop')
  async stopLab(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const user = this.user(authorization);
    const result = await this.store.stopLab(id, user);
    this.realtime.emitLabStatus(user.id, { challengeRef: id, session: result.session });
    return result;
  }

  @Get('range/overview') range(@Headers('authorization') authorization?: string) { return this.store.rangeOverview(this.optionalUser(authorization)); }
  @Get('dashboard/stats') stats(@Headers('authorization') authorization?: string) { return this.store.dashboardStats(this.optionalUser(authorization)); }
  @Get('dashboard/events') events() { return this.store.dashboardEvents(); }
  @Get('leaderboard') leaderboard() { return this.store.leaderboard(); }
  @Get('skills') skills() { return this.store.skillGraph(); }
  @Get('learning/overview') learning(@Headers('authorization') authorization?: string) { return this.store.learningOverview(this.optionalUser(authorization)); }
  @Get('catalog/sources') catalogSources() { return this.store.catalogSources(); }

  @Post('ai/chat')
  ai(@Body() body: AiChatDto, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization);
    this.store.assertRateLimit('ai', `${this.clientKey(request)}:${user.id}`, 20, 60_000);
    return this.store.aiChat(user, body.message, body.challengeId, body.hintLevel ?? 1, body.history, body.skill);
  }
  @Get('ai/conversations')
  aiConversations(@Headers('authorization') authorization?: string) { return this.store.aiConversations(this.user(authorization), false); }
  @Get('ai/conversations/archived')
  archivedAiConversations(@Headers('authorization') authorization?: string) { return this.store.aiConversations(this.user(authorization), true); }
  @Post('ai/conversations')
  createAiConversation(@Body() body: AiConversationCreateDto, @Headers('authorization') authorization?: string) { return this.store.createAiConversation(this.user(authorization), body.title); }
  @Get('ai/conversations/:id')
  aiConversation(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.aiConversation(id, this.user(authorization)); }
  @Patch('ai/conversations/:id')
  updateAiConversation(@Param('id') id: string, @Body() body: AiConversationUpdateDto, @Headers('authorization') authorization?: string) { return this.store.updateAiConversation(id, this.user(authorization), body); }
  @Delete('ai/conversations/:id')
  deleteAiConversation(@Param('id') id: string, @Headers('authorization') authorization?: string) { return this.store.deleteAiConversation(id, this.user(authorization)); }
  @Post('ai/conversations/:id/messages')
  chatInAiConversation(@Param('id') id: string, @Body() body: AiConversationMessageDto, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization);
    this.store.assertRateLimit('ai', `${this.clientKey(request)}:${user.id}`, 20, 60_000);
    return this.store.chatInAiConversation(id, user, body.message, body.hintLevel ?? 1);
  }
  @Patch('ai/conversations/:id/messages/:messageId/feedback')
  feedbackAiMessage(@Param('id') id: string, @Param('messageId') messageId: string, @Body() body: AiMessageFeedbackDto, @Headers('authorization') authorization?: string) {
    return this.store.feedbackAiMessage(id, messageId, this.user(authorization), body.feedback);
  }
  @Post('ai/conversations/:id/messages/:messageId/regenerate')
  regenerateAiMessage(@Param('id') id: string, @Param('messageId') messageId: string, @Headers('authorization') authorization?: string, @Req() request?: ClientRequest) {
    const user = this.user(authorization);
    this.store.assertRateLimit('ai', `${this.clientKey(request)}:${user.id}`, 20, 60_000);
    return this.store.regenerateAiMessage(id, messageId, user);
  }
  @Get('ai/skills')
  aiSkills(@Headers('authorization') authorization?: string) { this.user(authorization); return learningSkillCatalog(); }
  @Get('ai/memory')
  aiMemory(@Headers('authorization') authorization?: string) { return this.store.aiMemory(this.user(authorization)); }
  @Delete('ai/memory')
  clearAiMemory(@Headers('authorization') authorization?: string) { return this.store.clearAiMemory(this.user(authorization)); }
  @Get('ai/status')
  aiStatus(@Headers('authorization') authorization?: string) { this.user(authorization); return aiProviderStatus(); }
}
