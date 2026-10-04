import { RateLimiter } from '../core/rate-limiter';
import type { AntibanConfig } from '../types';

const mockConfig: AntibanConfig = {
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

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(mockConfig);
  });

  describe('getRandomDelay', () => {
    it('should return delay within configured range', () => {
      for (let i = 0; i < 100; i++) {
        const delay = rateLimiter.getRandomDelay();
        expect(delay).toBeGreaterThanOrEqual(mockConfig.minDelaySeconds * 1000 * 0.9);
        expect(delay).toBeLessThanOrEqual(mockConfig.maxDelaySeconds * 1000 * 1.1);
      }
    });

    it('should return different values on multiple calls', () => {
      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(rateLimiter.getRandomDelay());
      }
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('shouldPause', () => {
    it('should return true when reply count matches pause threshold', () => {
      expect(rateLimiter.shouldPause(5)).toBe(true);
      expect(rateLimiter.shouldPause(10)).toBe(true);
      expect(rateLimiter.shouldPause(15)).toBe(true);
    });

    it('should return false when reply count does not match threshold', () => {
      expect(rateLimiter.shouldPause(1)).toBe(false);
      expect(rateLimiter.shouldPause(3)).toBe(false);
      expect(rateLimiter.shouldPause(7)).toBe(false);
    });

    it('should return false for zero replies', () => {
      expect(rateLimiter.shouldPause(0)).toBe(false);
    });
  });

  describe('getPauseDuration', () => {
    it('should return duration close to configured value', () => {
      for (let i = 0; i < 100; i++) {
        const duration = rateLimiter.getPauseDuration();
        const expected = mockConfig.pauseDurationSeconds * 1000;
        expect(duration).toBeGreaterThanOrEqual(expected * 0.85);
        expect(duration).toBeLessThanOrEqual(expected * 1.15);
      }
    });
  });

  describe('checkReplyVariation', () => {
    it('should return true for sufficiently different replies', () => {
      const replies = [
        '这是第一条回复',
        '完全不同的内容在这里',
        'Another completely different message',
      ];
      expect(rateLimiter.checkReplyVariation(replies)).toBe(true);
    });

    it('should return false for very similar replies', () => {
      const replies = [
        '这是一条回复',
        '这是一条回复。',
        '这是一条回复！',
      ];
      expect(rateLimiter.checkReplyVariation(replies)).toBe(false);
    });

    it('should return true for single reply', () => {
      const replies = ['单条回复'];
      expect(rateLimiter.checkReplyVariation(replies)).toBe(true);
    });

    it('should return true when check is disabled', () => {
      rateLimiter.updateConfig({ ...mockConfig, checkReplyVariation: false });
      const replies = ['相同', '相同', '相同'];
      expect(rateLimiter.checkReplyVariation(replies)).toBe(true);
    });
  });

  describe('isWithinActiveHours', () => {
    it('should return true when no active hours are set', () => {
      rateLimiter.updateConfig({ ...mockConfig, activeHoursStart: undefined, activeHoursEnd: undefined });
      expect(rateLimiter.isWithinActiveHours(Date.now())).toBe(true);
    });
  });
});
