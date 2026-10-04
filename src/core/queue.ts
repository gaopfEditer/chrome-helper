import type { ReplyTask, QueueStats, AntibanConfig } from '../types';
import { StorageManager } from './storage';
import { RateLimiter } from './rate-limiter';

export interface QueueState {
  isPaused: boolean;
  isRunning: boolean;
  currentTaskId?: string;
  nextScheduledTime?: number;
  consecutiveReplies: number;
}

export class QueueManager {
  private state: QueueState = {
    isPaused: false,
    isRunning: false,
    consecutiveReplies: 0,
  };
  private rateLimiter: RateLimiter;
  private alarmName = 'replyQueue';

  constructor(antibanConfig: AntibanConfig) {
    this.rateLimiter = new RateLimiter(antibanConfig);
  }

  async updateConfig(antibanConfig: AntibanConfig): Promise<void> {
    this.rateLimiter.updateConfig(antibanConfig);
  }

  async getStats(): Promise<QueueStats> {
    const tasks = await StorageManager.getReplyTasks();
    const repliesInLastHour = await this.rateLimiter.getRepliesInLastHour();
    const repliesInLastDay = await this.rateLimiter.getRepliesInLastDay();

    return {
      totalTasks: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      sending: tasks.filter(t => t.status === 'sending').length,
      sent: tasks.filter(t => t.status === 'sent').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      skipped: tasks.filter(t => t.status === 'skipped').length,
      isPaused: this.state.isPaused,
      isRunning: this.state.isRunning,
      currentTaskId: this.state.currentTaskId,
      nextScheduledTime: this.state.nextScheduledTime,
      repliesInLastHour,
      repliesInLastDay,
    };
  }

  async start(): Promise<void> {
    if (this.state.isRunning) {
      console.log('队列已在运行中');
      return;
    }

    this.state.isPaused = false;
    this.state.isRunning = true;
    this.state.consecutiveReplies = 0;

    await this.scheduleNextTask(0);
  }

  async pause(): Promise<void> {
    this.state.isPaused = true;
    await chrome.alarms.clear(this.alarmName);
    console.log('队列已暂停');
  }

  async resume(): Promise<void> {
    if (!this.state.isRunning) {
      await this.start();
      return;
    }

    this.state.isPaused = false;
    await this.scheduleNextTask(0);
    console.log('队列已恢复');
  }

  async stop(): Promise<void> {
    this.state.isPaused = false;
    this.state.isRunning = false;
    this.state.currentTaskId = undefined;
    this.state.consecutiveReplies = 0;
    await chrome.alarms.clear(this.alarmName);
    console.log('队列已停止');
  }

  isPaused(): boolean {
    return this.state.isPaused;
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }

  async processNextTask(): Promise<void> {
    if (this.state.isPaused || !this.state.isRunning) {
      console.log('队列已暂停或停止，跳过任务处理');
      return;
    }

    const canReply = await this.rateLimiter.canReplyNow();
    if (!canReply.allowed) {
      console.log(`速率限制: ${canReply.reason}`);
      if (canReply.retryAfter) {
        const delayMs = canReply.retryAfter - Date.now();
        await this.scheduleNextTask(Math.max(delayMs, 60000));
      } else {
        await this.stop();
      }
      return;
    }

    const tasks = await StorageManager.getReplyTasks();
    const pendingTasks = tasks.filter(t => t.status === 'pending');

    if (pendingTasks.length === 0) {
      console.log('没有待处理的任务，队列结束');
      await this.stop();
      return;
    }

    const task = pendingTasks[0];
    
    const canReplyToUser = await this.rateLimiter.canReplyToUser(task.post.targetUserId);
    if (!canReplyToUser.allowed) {
      console.log(`跳过任务 ${task.id}: ${canReplyToUser.reason}`);
      await StorageManager.updateReplyTask(task.id, { 
        status: 'skipped',
        error: canReplyToUser.reason,
      });
      await this.scheduleNextTask(1000);
      return;
    }

    this.state.currentTaskId = task.id;

    try {
      await StorageManager.updateReplyTask(task.id, {
        status: 'sending',
        attempts: task.attempts + 1,
        lastAttemptTime: Date.now(),
      });

      const response = await this.sendMessage('executeReply', { taskId: task.id });

      if (!response?.success) {
        console.log(`任务 ${task.id} 发送失败:`, response?.error);
        if (response?.blockedDetected) {
          await this.stop();
        } else {
          await this.scheduleNextTask(5000);
        }
        return;
      }

      this.state.consecutiveReplies++;

      if (this.rateLimiter.shouldPause(this.state.consecutiveReplies)) {
        console.log(`已连续回复 ${this.state.consecutiveReplies} 次，暂停一段时间`);
        const pauseDuration = this.rateLimiter.getPauseDuration();
        this.state.consecutiveReplies = 0;
        await this.scheduleNextTask(pauseDuration);
      } else {
        const delay = this.rateLimiter.getRandomDelay();
        await this.scheduleNextTask(delay);
      }

    } catch (error) {
      console.error('处理任务失败:', error);
      await StorageManager.updateReplyTask(task.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : '未知错误',
      });
      await this.scheduleNextTask(5000);
    }
  }

  private async scheduleNextTask(delayMs: number): Promise<void> {
    const scheduleTime = Date.now() + delayMs;
    this.state.nextScheduledTime = scheduleTime;

    await chrome.alarms.clear(this.alarmName);
    await chrome.alarms.create(this.alarmName, {
      delayInMinutes: delayMs / 60000,
    });

    console.log(`下一个任务计划在 ${new Date(scheduleTime).toLocaleString()} 执行`);
  }

  private async sendMessage(action: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name === this.alarmName) {
      await this.processNextTask();
    }
  }

  async retryFailedTask(taskId: string): Promise<void> {
    await StorageManager.updateReplyTask(taskId, {
      status: 'pending',
      error: undefined,
    });
  }

  async removeTask(taskId: string): Promise<void> {
    const tasks = await StorageManager.getReplyTasks();
    const filtered = tasks.filter(t => t.id !== taskId);
    await StorageManager.saveReplyTasks(filtered);
  }

  async clearCompletedTasks(): Promise<void> {
    const tasks = await StorageManager.getReplyTasks();
    const active = tasks.filter(t => 
      t.status === 'pending' || t.status === 'sending' || t.status === 'failed'
    );
    await StorageManager.saveReplyTasks(active);
  }
}
