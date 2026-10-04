import {
  generateId,
  formatTimestamp,
  timeAgo,
  truncateText,
  getPlatformDisplayName,
  isValidUrl,
  extractUsernameFromUrl,
  randomInt,
} from '../utils/helpers';

describe('Helpers', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(1000);
    });

    it('should generate IDs containing timestamp', () => {
      const id = generateId();
      const timestamp = parseInt(id.split('-')[0]);
      expect(timestamp).toBeGreaterThan(Date.now() - 1000);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('formatTimestamp', () => {
    it('should format timestamp correctly', () => {
      const timestamp = new Date('2024-01-15T10:30:00').getTime();
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toContain('2024');
      expect(formatted).toContain('01');
      expect(formatted).toContain('15');
    });
  });

  describe('timeAgo', () => {
    it('should return "X秒前" for recent timestamps', () => {
      const timestamp = Date.now() - 30 * 1000;
      expect(timeAgo(timestamp)).toMatch(/\d+秒前/);
    });

    it('should return "X分钟前" for minute-old timestamps', () => {
      const timestamp = Date.now() - 5 * 60 * 1000;
      expect(timeAgo(timestamp)).toMatch(/\d+分钟前/);
    });

    it('should return "X小时前" for hour-old timestamps', () => {
      const timestamp = Date.now() - 3 * 60 * 60 * 1000;
      expect(timeAgo(timestamp)).toMatch(/\d+小时前/);
    });

    it('should return "X天前" for day-old timestamps', () => {
      const timestamp = Date.now() - 5 * 24 * 60 * 60 * 1000;
      expect(timeAgo(timestamp)).toMatch(/\d+天前/);
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than max length', () => {
      const text = '短文本';
      expect(truncateText(text, 10)).toBe(text);
    });

    it('should truncate text longer than max length', () => {
      const text = '这是一段很长的文本内容';
      const truncated = truncateText(text, 10);
      expect(truncated.length).toBeLessThanOrEqual(10);
      expect(truncated).toContain('...');
    });

    it('should handle empty text', () => {
      expect(truncateText('', 10)).toBe('');
    });
  });

  describe('getPlatformDisplayName', () => {
    it('should return correct display names', () => {
      expect(getPlatformDisplayName('binance')).toBe('币安广场');
      expect(getPlatformDisplayName('okx')).toBe('OKX');
      expect(getPlatformDisplayName('gate')).toBe('Gate');
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidUrl('https://binance.com/en/square')).toBe(true);
      expect(isValidUrl('https://www.okx.com')).toBe(true);
      expect(isValidUrl('http://gate.io')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('extractUsernameFromUrl', () => {
    it('should extract username from Binance profile URL', () => {
      const url = 'https://binance.com/en/square/profile/username123';
      expect(extractUsernameFromUrl(url, 'binance')).toBe('username123');
    });

    it('should return null for invalid URLs', () => {
      expect(extractUsernameFromUrl('not a url', 'binance')).toBeNull();
    });
  });

  describe('randomInt', () => {
    it('should return integer within range', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomInt(10, 20);
        expect(result).toBeGreaterThanOrEqual(10);
        expect(result).toBeLessThanOrEqual(20);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('should return min when min equals max', () => {
      expect(randomInt(5, 5)).toBe(5);
    });
  });
});
