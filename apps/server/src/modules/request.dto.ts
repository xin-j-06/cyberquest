import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { LEARNING_SKILL_IDS, type LearningSkillId } from './ai-learning-skills';
import { PASSWORD_PATTERN, USERNAME_PATTERN } from './account-credentials';

export class LoginDto {
  @IsEmail({}, { message: '请输入有效的邮箱地址。' })
  @MaxLength(254, { message: '邮箱地址不能超过 254 个字符。' })
  email!: string;

  @IsString({ message: '密码格式不正确。' })
  @Length(8, 128, { message: '密码长度须为 8–128 位。' })
  password!: string;
}

export class AdminLoginDto {
  @IsString({ message: '管理员密码格式不正确。' })
  @Length(8, 128, { message: '管理员密码长度须为 8–128 位。' })
  password!: string;
}

export class RegisterDto extends LoginDto {
  @IsString({ message: '用户名格式不正确。' })
  @Length(2, 24, { message: '用户名长度须为 2–24 位。' })
  @Matches(USERNAME_PATTERN, { message: '用户名只能包含中英文或数字。' })
  username!: string;

  @IsString({ message: '密码格式不正确。' })
  @Length(10, 128, { message: '注册密码长度须为 10–128 位。' })
  @Matches(PASSWORD_PATTERN, { message: '密码须同时包含大写字母、小写字母、数字和特殊字符，且不能含空格。' })
  password!: string;
}

export class AdminUserUpdateDto {
  @IsOptional()
  @IsString()
  @Length(2, 24)
  @Matches(USERNAME_PATTERN)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsIn(['USER', 'ADMIN'])
  role?: 'USER' | 'ADMIN';

  @IsOptional()
  @IsIn(['ACTIVE', 'FROZEN', 'DISABLED', 'PENDING_DELETION'])
  status?: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'PENDING_DELETION';

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class AdminListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(200) query?: string;
  @IsOptional() @IsString() @MaxLength(80) status?: string;
  @IsOptional() @IsString() @MaxLength(80) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
}

export class AdminUserCreateDto extends RegisterDto {
  @IsOptional()
  @IsIn(['USER', 'ADMIN'])
  role?: 'USER' | 'ADMIN';
}

export class AnnouncementDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 5_000)
  content?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional() @IsIn(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']) reviewStatus?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  @IsOptional() @IsIn(['NORMAL', 'IMPORTANT', 'URGENT']) priority?: 'NORMAL' | 'IMPORTANT' | 'URGENT';
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '') @IsISO8601() scheduledAt?: string | null;
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '') @IsISO8601() expiresAt?: string | null;
  @IsOptional() @IsString() @Length(2, 80) audience?: string;
}

export class CompetitionDto {
  @IsOptional() @IsString() @Length(2, 120) title?: string;
  @IsOptional() @IsIn(['INTERNATIONAL', 'DOMESTIC', 'UNIVERSITY']) category?: 'INTERNATIONAL' | 'DOMESTIC' | 'UNIVERSITY';
  @IsOptional() @IsString() @Length(2, 120) operator?: string;
  @IsOptional() @IsString() @Length(2, 60) status?: string;
  @IsOptional() @IsString() @Length(2, 120) scope?: string;
  @IsOptional() @IsString() @Length(10, 2_000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @Length(1, 30, { each: true }) tags?: string[];
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(1_000) url?: string;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() endAt?: string;
  @IsOptional() @IsISO8601() registrationDeadline?: string;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsIn(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']) reviewStatus?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  @IsOptional() @IsString() @Length(2, 80) timezone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) capacity?: number;
  @IsOptional() @IsString() @MaxLength(120) format?: string;
  @IsOptional() @IsBoolean() sourceVerified?: boolean;
}

export class CalendarMemoDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsString() @Length(1, 120) title?: string;
  @IsOptional() @IsString() @MaxLength(1_000) note?: string;
}

export class TrainingToolDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 8) icon?: string;
  @IsOptional() @IsString() @Length(2, 60) category?: string;
  @IsOptional() @IsString() @Length(10, 2_000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @Length(1, 40, { each: true }) platforms?: string[];
  @IsOptional() @IsString() @Length(2, 120) source?: string;
  @IsOptional() @IsString() @Length(2, 500) usagePath?: string;
  @ValidateIf((_object, value) => value !== undefined && value !== '') @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(1_000) officialUrl?: string;
  @IsOptional() @IsString() @Length(2, 40) actionLabel?: string;
  @IsOptional() @IsString() @MaxLength(1_000) installCommand?: string;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() recommended?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
  @IsOptional() @IsString() @MaxLength(80) version?: string;
  @IsOptional() @IsString() @Matches(/^$|^[a-fA-F0-9]{64}$/) checksumSha256?: string;
  @IsOptional() @IsString() @MaxLength(120) license?: string;
  @IsOptional() @IsBoolean() sourceVerified?: boolean;
  @IsOptional() @IsBoolean() deprecated?: boolean;
  @IsOptional() @IsIn(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']) reviewStatus?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
}
export class AdminChallengeDto {
  @IsOptional() @IsString() @Length(2, 80) slug?: string;
  @IsOptional() @IsString() @Length(2, 120) title?: string;
  @IsOptional() @IsIn(['WEB', 'CRYPTO', 'NETWORK', 'REVERSE', 'PWN', 'FORENSICS', 'MISC']) category?: 'WEB' | 'CRYPTO' | 'NETWORK' | 'REVERSE' | 'PWN' | 'FORENSICS' | 'MISC';
  @IsOptional() @IsIn(['EASY', 'MEDIUM', 'HARD']) difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) points?: number;
  @IsOptional() @IsString() @Length(2, 2_000) description?: string;
  @IsOptional() @IsString() @Length(2, 2_000) goal?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @Length(1, 30, { each: true }) tags?: string[];
  @IsOptional() @IsString() @Length(6, 512) flag?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDynamic?: boolean;
  @IsOptional() @IsString() @Length(2, 80) labKind?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(180) labTtlMinutes?: number;
  @IsOptional() @IsString() @Length(2, 80) skillSlug?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) xpReward?: number;
  @IsOptional() @IsString() @Length(2, 4_000) guideSummary?: string;
  @IsOptional() @IsString() @Length(2, 4_000) guidePrinciple?: string;
  @IsOptional() @IsString() @Length(2, 20_000) guideSteps?: string;
  @IsOptional() @IsIn(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']) reviewStatus?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  @IsOptional() @IsString() @MaxLength(80) owner?: string;
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '') @IsISO8601() scheduledAt?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000) maxConcurrentLabs?: number;
  @IsOptional() @Type(() => Number) @Min(0.1) @Max(16) cpuLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(128) @Max(65_536) memoryLimitMb?: number;
}

export class FeedbackCreateDto {
  @IsIn(['BUG', 'SUGGESTION']) type!: 'BUG' | 'SUGGESTION';
  @IsString() @Length(2, 120) title!: string;
  @IsString() @Length(10, 5_000) content!: string;
  @IsOptional() @IsString() @Length(1, 500) pageUrl?: string;
}

export class FeedbackUpdateDto {
  @IsOptional() @IsIn(['NEW', 'IN_PROGRESS', 'RESOLVED']) status?: 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
  @IsOptional() @IsString() @MaxLength(5_000) adminNote?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  @IsOptional() @IsIn(['S4', 'S3', 'S2', 'S1']) severity?: 'S4' | 'S3' | 'S2' | 'S1';
  @IsOptional() @IsString() @MaxLength(80) assignee?: string;
  @IsOptional() @IsString() @MaxLength(5_000) publicReply?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @Length(1, 30, { each: true }) tags?: string[];
}

export class ForumPostDto {
  @IsIn(['QA', 'WRITEUP', 'TOOLS', 'RESOURCES']) category!: 'QA' | 'WRITEUP' | 'TOOLS' | 'RESOURCES';
  @IsString() @Length(4, 160) title!: string;
  @IsString() @Length(20, 20_000) content!: string;
}

export class ForumReplyDto {
  @IsString() @Length(2, 10_000) content!: string;
}

export class SubmitFlagDto {
  @IsString()
  @Length(1, 512)
  flag!: string;
}

export class SaveChallengeNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content!: string;
}

export class StartLabDto {
  @IsString()
  @Length(1, 100)
  challengeId!: string;
}

export class LabInteractionDto {
  @IsString()
  @Length(1, 2_048)
  input!: string;
}

export class AiHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @Length(1, 2_000)
  content!: string;
}

export class AiChatDto {
  @IsString()
  @Length(1, 1_000)
  message!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  challengeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  hintLevel?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => AiHistoryMessageDto)
  history?: AiHistoryMessageDto[];

  @IsOptional()
  @IsIn(LEARNING_SKILL_IDS)
  skill?: LearningSkillId;
}

export class AiConversationCreateDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  title?: string;
}

export class AiConversationUpdateDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  title?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class AiConversationMessageDto {
  @IsString()
  @Length(1, 1_000)
  message!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  hintLevel?: number;
}

export class AiMessageFeedbackDto {
  @IsIn(['helpful', 'unhelpful', null])
  feedback!: 'helpful' | 'unhelpful' | null;
}
