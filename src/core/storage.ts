import type {
  TargetUser,
  Post,
  ReplyTask,
  RepliedHistory,
  AppConfig,
  Platform,
  AntibanConfig,
  LLMConfig,
  ReplyTemplate,
  PlatformConfig,
} from '../types';

const DEFAULT_ANTIBAN_CONFIG: AntibanConfig = {
  minDelaySeconds: 60,
  maxDelaySeconds: 180,
  pauseAfterReplies: 5,
  pauseDurationSeconds: 300,
  maxRepliesPerHour: 10,
  maxRepliesPerDay: 50,
  maxRepliesPerUserPerDay: 3,
  activeHoursStart: '09:00',
  activeHoursEnd: '23:00',
  timezone: 'Asia/Shanghai',
  checkReplyVariation: true,
  minVariationThreshold: 0.3,
};

const DEFAULT_LLM_CONFIG: LLMConfig = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  systemPrompt: '你是一个专业的加密货币社区成员，善于发表有见地的评论。请用简洁、友好的语气回复帖子内容。',
  maxTokens: 150,
  temperature: 0.7,
  replyLanguage: 'zh-CN',
  replyTone: 'friendly',
};

const DEFAULT_TEMPLATES: ReplyTemplate[] = [
  { id: '1', name: '认同观点', template: '说得很有道理！{{author}} 的分析很到位。', enabled: true },
  { id: '2', name: '请求更多信息', template: '很有意思的观点，能详细说说吗？', enabled: true },
  { id: '3', name: '分享感谢', template: '感谢分享！很有价值的内容。', enabled: true },
];

const DEFAULT_PLATFORM_CONFIG = (platform: Platform): PlatformConfig => ({
  platform,
  selectors: {},
  debugMode: false,
});

export class StorageManager {
  static async getConfig(): Promise<AppConfig> {
    const result = await chrome.storage.local.get('config');
    return result.config || this.getDefaultConfig();
  }

  static async saveConfig(config: AppConfig): Promise<void> {
    await chrome.storage.local.set({ config });
  }

  static getDefaultConfig(): AppConfig {
    return {
      llm: DEFAULT_LLM_CONFIG,
      antiban: DEFAULT_ANTIBAN_CONFIG,
      templates: DEFAULT_TEMPLATES,
      platforms: {
        binance: DEFAULT_PLATFORM_CONFIG('binance'),
        okx: DEFAULT_PLATFORM_CONFIG('okx'),
        gate: DEFAULT_PLATFORM_CONFIG('gate'),
      },
      defaultPostsPerUser: 5,
      defaultSkipOlderThanHours: 24,
      fetchTimeoutMs: 45000,
      keepFetchTabOpen: false,
    };
  }

  static async getTargetUsers(): Promise<TargetUser[]> {
    const result = await chrome.storage.local.get('targetUsers');
    return result.targetUsers || [];
  }

  static async saveTargetUsers(users: TargetUser[]): Promise<void> {
    await chrome.storage.local.set({ targetUsers: users });
  }

  static async addTargetUser(user: TargetUser): Promise<void> {
    const users = await this.getTargetUsers();
    users.push(user);
    await this.saveTargetUsers(users);
  }

  static async removeTargetUser(userId: string): Promise<void> {
    const users = await this.getTargetUsers();
    const filtered = users.filter(u => u.id !== userId);
    await this.saveTargetUsers(filtered);
  }

  static async updateTargetUser(userId: string, updates: Partial<TargetUser>): Promise<void> {
    const users = await this.getTargetUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      await this.saveTargetUsers(users);
    }
  }

  static async getFetchedPosts(): Promise<Post[]> {
    const result = await chrome.storage.local.get('fetchedPosts');
    return result.fetchedPosts || [];
  }

  static async saveFetchedPosts(posts: Post[]): Promise<void> {
    await chrome.storage.local.set({ fetchedPosts: posts });
  }

  static async addFetchedPosts(posts: Post[]): Promise<void> {
    const existing = await this.getFetchedPosts();
    const newPosts = posts.filter(p => !existing.some(e => e.id === p.id));
    await this.saveFetchedPosts([...existing, ...newPosts]);
  }

  static async getReplyTasks(): Promise<ReplyTask[]> {
    const result = await chrome.storage.local.get('replyTasks');
    return result.replyTasks || [];
  }

  static async saveReplyTasks(tasks: ReplyTask[]): Promise<void> {
    await chrome.storage.local.set({ replyTasks: tasks });
  }

  static async updateReplyTask(taskId: string, updates: Partial<ReplyTask>): Promise<void> {
    const tasks = await this.getReplyTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...updates };
      await this.saveReplyTasks(tasks);
    }
  }

  static async getRepliedHistory(): Promise<RepliedHistory[]> {
    const result = await chrome.storage.local.get('repliedHistory');
    return result.repliedHistory || [];
  }

  static async addToRepliedHistory(entry: RepliedHistory): Promise<void> {
    const history = await this.getRepliedHistory();
    history.push(entry);
    
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filtered = history.filter(h => h.repliedAt > thirtyDaysAgo);
    
    await chrome.storage.local.set({ repliedHistory: filtered });
  }

  static async hasRepliedToPost(postId: string): Promise<boolean> {
    const history = await this.getRepliedHistory();
    return history.some(h => h.postId === postId);
  }

  static async clearOldData(): Promise<void> {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    const posts = await this.getFetchedPosts();
    const recentPosts = posts.filter(p => p.fetchedAt > sevenDaysAgo);
    await this.saveFetchedPosts(recentPosts);
    
    const tasks = await this.getReplyTasks();
    const activeTasks = tasks.filter(t => 
      t.status === 'pending' || t.status === 'sending' || 
      (t.status === 'failed' && (t.lastAttemptTime || 0) > sevenDaysAgo)
    );
    await this.saveReplyTasks(activeTasks);
  }

  static async exportData(): Promise<string> {
    const data = await chrome.storage.local.get(null);
    return JSON.stringify(data, null, 2);
  }

  static async importData(jsonString: string): Promise<void> {
    const data = JSON.parse(jsonString);
    await chrome.storage.local.set(data);
  }
}
