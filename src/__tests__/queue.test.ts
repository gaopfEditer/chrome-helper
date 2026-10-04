import { QueueManager } from '../core/queue';
import type { AntibanConfig } from '../types';

const mockConfig: AntibanConfig = {
  minDelaySeconds: 1,
  maxDelaySeconds: 2,
  pauseAfterReplies: 3,
  pauseDurationSeconds: 5,
  maxRepliesPerHour: 10,
  maxRepliesPerDay: 50,
  maxRepliesPerUserPerDay: 3,
  activeHoursStart: undefined,
  activeHoursEnd: undefined,
  timezone: 'Asia/Shanghai',
  checkReplyVariation: false,
  minVariationThreshold: 0.3,
};

const mockStorage = {
  replyTasks: [],
  repliedHistory: [],
};

(globalThis as any).chrome = {
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
  },
  runtime: {
    sendMessage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorage[keys as keyof typeof mockStorage] });
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            result[key] = mockStorage[key as keyof typeof mockStorage];
          });
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
} as any;

describe('QueueManager', () => {
  let queueManager: QueueManager;

  beforeEach(() => {
    queueManager = new QueueManager(mockConfig);
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should set isRunning to true', async () => {
      await queueManager.start();
      expect(queueManager.isRunning()).toBe(true);
    });

    it('should set isPaused to false', async () => {
      await queueManager.start();
      expect(queueManager.isPaused()).toBe(false);
    });

    it('should not start if already running', async () => {
      await queueManager.start();
      const firstStart = queueManager.isRunning();
      await queueManager.start();
      expect(queueManager.isRunning()).toBe(firstStart);
    });
  });

  describe('pause', () => {
    it('should set isPaused to true', async () => {
      await queueManager.start();
      await queueManager.pause();
      expect(queueManager.isPaused()).toBe(true);
    });

    it('should clear alarms', async () => {
      await queueManager.start();
      await queueManager.pause();
      expect(chrome.alarms.clear).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should set isRunning to false', async () => {
      await queueManager.start();
      await queueManager.stop();
      expect(queueManager.isRunning()).toBe(false);
    });

    it('should set isPaused to false', async () => {
      await queueManager.start();
      await queueManager.stop();
      expect(queueManager.isPaused()).toBe(false);
    });

    it('should clear alarms', async () => {
      await queueManager.start();
      await queueManager.stop();
      expect(chrome.alarms.clear).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('should set isPaused to false', async () => {
      await queueManager.start();
      await queueManager.pause();
      await queueManager.resume();
      expect(queueManager.isPaused()).toBe(false);
    });

    it('should start queue if not running', async () => {
      await queueManager.resume();
      expect(queueManager.isRunning()).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      const stats = await queueManager.getStats();
      
      expect(stats).toHaveProperty('totalTasks');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('sending');
      expect(stats).toHaveProperty('sent');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('skipped');
      expect(stats).toHaveProperty('isPaused');
      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('repliesInLastHour');
      expect(stats).toHaveProperty('repliesInLastDay');
    });

    it('should reflect current state', async () => {
      await queueManager.start();
      const stats = await queueManager.getStats();
      expect(stats.isRunning).toBe(true);
      expect(stats.isPaused).toBe(false);
    });
  });
});
