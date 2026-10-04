import type { AntibanConfig, RepliedHistory, Platform } from '../types';
import { StorageManager } from './storage';

export class RateLimiter {
  private config: AntibanConfig;

  constructor(config: AntibanConfig) {
    this.config = config;
  }

  updateConfig(config: AntibanConfig): void {
    this.config = config;
  }

  getRandomDelay(): number {
    const min = this.config.minDelaySeconds * 1000;
    const max = this.config.maxDelaySeconds * 1000;
    const jitter = Math.random() * 0.2 - 0.1;
    const base = Math.random() * (max - min) + min;
    return Math.floor(base * (1 + jitter));
  }

  shouldPause(replyCount: number): boolean {
    return replyCount > 0 && replyCount % this.config.pauseAfterReplies === 0;
  }

  getPauseDuration(): number {
    const base = this.config.pauseDurationSeconds * 1000;
    const jitter = Math.random() * 0.3 - 0.15;
    return Math.floor(base * (1 + jitter));
  }

  async canReplyNow(): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    const now = Date.now();

    if (!this.isWithinActiveHours(now)) {
      const nextActiveTime = this.getNextActiveTime(now);
      return {
        allowed: false,
        reason: '不在活跃时间段内',
        retryAfter: nextActiveTime,
      };
    }

    const history = await StorageManager.getRepliedHistory();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const repliesInLastHour = history.filter(h => h.repliedAt > oneHourAgo).length;
    if (repliesInLastHour >= this.config.maxRepliesPerHour) {
      return {
        allowed: false,
        reason: `已达到每小时回复上限 (${this.config.maxRepliesPerHour})`,
        retryAfter: this.getOldestReplyTime(history, oneHourAgo) + 60 * 60 * 1000,
      };
    }

    const repliesInLastDay = history.filter(h => h.repliedAt > oneDayAgo).length;
    if (repliesInLastDay >= this.config.maxRepliesPerDay) {
      return {
        allowed: false,
        reason: `已达到每日回复上限 (${this.config.maxRepliesPerDay})`,
        retryAfter: this.getOldestReplyTime(history, oneDayAgo) + 24 * 60 * 60 * 1000,
      };
    }

    return { allowed: true };
  }

  async canReplyToUser(targetUserId: string): Promise<{ allowed: boolean; reason?: string }> {
    const history = await StorageManager.getRepliedHistory();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const tasks = await StorageManager.getReplyTasks();
    const userRepliesCount = tasks.filter(t => 
      t.post.targetUserId === targetUserId &&
      t.status === 'sent' &&
      (t.sentAt || 0) > oneDayAgo
    ).length;

    if (userRepliesCount >= this.config.maxRepliesPerUserPerDay) {
      return {
        allowed: false,
        reason: `已达到对该用户的每日回复上限 (${this.config.maxRepliesPerUserPerDay})`,
      };
    }

    return { allowed: true };
  }

  isWithinActiveHours(timestamp: number): boolean {
    if (!this.config.activeHoursStart || !this.config.activeHoursEnd) {
      return true;
    }

    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.config.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const timeString = formatter.format(date);
    const [hours, minutes] = timeString.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;

    const [startHours, startMinutes] = this.config.activeHoursStart.split(':').map(Number);
    const startTotalMinutes = startHours * 60 + startMinutes;

    const [endHours, endMinutes] = this.config.activeHoursEnd.split(':').map(Number);
    const endTotalMinutes = endHours * 60 + endMinutes;

    return currentMinutes >= startTotalMinutes && currentMinutes <= endTotalMinutes;
  }

  private getNextActiveTime(fromTimestamp: number): number {
    if (!this.config.activeHoursStart) {
      return fromTimestamp;
    }

    const [hours, minutes] = this.config.activeHoursStart.split(':').map(Number);
    const date = new Date(fromTimestamp);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.config.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const dateMap: Record<string, string> = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        dateMap[part.type] = part.value;
      }
    });

    const nextActive = new Date(
      `${dateMap.year}-${dateMap.month}-${dateMap.day}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
    );

    if (nextActive.getTime() <= fromTimestamp) {
      nextActive.setDate(nextActive.getDate() + 1);
    }

    return nextActive.getTime();
  }

  private getOldestReplyTime(history: RepliedHistory[], afterTimestamp: number): number {
    const filtered = history.filter(h => h.repliedAt > afterTimestamp);
    if (filtered.length === 0) return Date.now();
    return Math.min(...filtered.map(h => h.repliedAt));
  }

  async getRepliesInLastHour(): Promise<number> {
    const history = await StorageManager.getRepliedHistory();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return history.filter(h => h.repliedAt > oneHourAgo).length;
  }

  async getRepliesInLastDay(): Promise<number> {
    const history = await StorageManager.getRepliedHistory();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return history.filter(h => h.repliedAt > oneDayAgo).length;
  }

  checkReplyVariation(replies: string[]): boolean {
    if (!this.config.checkReplyVariation || replies.length < 2) {
      return true;
    }

    for (let i = 0; i < replies.length - 1; i++) {
      for (let j = i + 1; j < replies.length; j++) {
        const similarity = this.calculateSimilarity(replies[i], replies[j]);
        if (similarity > (1 - this.config.minVariationThreshold)) {
          return false;
        }
      }
    }

    return true;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}
