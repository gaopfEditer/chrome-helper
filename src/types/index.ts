export type Platform = 'binance' | 'okx' | 'gate';

export interface TargetUser {
  id: string;
  platform: Platform;
  username: string;
  profileUrl: string;
  maxPosts?: number;
  skipOlderThanHours?: number;
  enabled: boolean;
  lastFetchTime?: number;
}

export interface Post {
  id: string;
  platform: Platform;
  targetUserId: string;
  author: string;
  authorUrl: string;
  content: string;
  postUrl: string;
  timestamp: number;
  fetchedAt: number;
}

export interface GeneratedReply {
  postId: string;
  content: string;
  generatedAt: number;
  edited: boolean;
  approved: boolean;
  skipped: boolean;
}

export interface ReplyTask {
  id: string;
  post: Post;
  reply: GeneratedReply;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  lastAttemptTime?: number;
  error?: string;
  sentAt?: number;
}

export interface LLMConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  replyLanguage: string;
  replyTone: string;
}

export interface ReplyTemplate {
  id: string;
  name: string;
  template: string;
  enabled: boolean;
}

export interface AntibanConfig {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  pauseAfterReplies: number;
  pauseDurationSeconds: number;
  maxRepliesPerHour: number;
  maxRepliesPerDay: number;
  maxRepliesPerUserPerDay: number;
  activeHoursStart?: string;
  activeHoursEnd?: string;
  timezone: string;
  checkReplyVariation: boolean;
  minVariationThreshold: number;
}

export interface RepliedHistory {
  postId: string;
  platform: Platform;
  repliedAt: number;
  replyContent: string;
}

export interface PlatformConfig {
  platform: Platform;
  selectors: {
    [key: string]: string[];
  };
  debugMode: boolean;
}

export interface AppConfig {
  llm: LLMConfig;
  antiban: AntibanConfig;
  templates: ReplyTemplate[];
  platforms: Record<Platform, PlatformConfig>;
  defaultPostsPerUser: number;
  defaultSkipOlderThanHours: number;
  fetchTimeoutMs: number;
  keepFetchTabOpen: boolean;
}

export interface QueueStats {
  totalTasks: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  isPaused: boolean;
  isRunning: boolean;
  currentTaskId?: string;
  nextScheduledTime?: number;
  repliesInLastHour: number;
  repliesInLastDay: number;
}
