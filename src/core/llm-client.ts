import type { LLMConfig, Post } from '../types';

export interface LLMResponse {
  success: boolean;
  reply?: string;
  error?: string;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  updateConfig(config: LLMConfig): void {
    this.config = config;
  }

  async generateReply(post: Post): Promise<LLMResponse> {
    if (!this.config.enabled || !this.config.apiKey) {
      return {
        success: false,
        error: 'LLM 未配置或未启用',
      };
    }

    try {
      const messages = [
        {
          role: 'system',
          content: this.config.systemPrompt,
        },
        {
          role: 'user',
          content: this.buildUserPrompt(post),
        },
      ];

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('API 返回空响应');
      }

      const reply = data.choices[0].message.content.trim();

      if (!reply) {
        throw new Error('生成的回复为空');
      }

      return {
        success: true,
        reply,
      };

    } catch (error) {
      console.error('LLM 生成失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  private buildUserPrompt(post: Post): string {
    const parts = [
      `平台: ${this.getPlatformName(post.platform)}`,
      `作者: ${post.author}`,
      `帖子内容:\n${post.content}`,
      `\n请为这条帖子生成一个${this.config.replyLanguage}的回复，语气${this.config.replyTone}，不要超过${this.config.maxTokens / 2}字。`,
    ];

    return parts.join('\n');
  }

  private getPlatformName(platform: string): string {
    const names: Record<string, string> = {
      binance: '币安广场',
      okx: 'OKX 社区',
      gate: 'Gate 广场',
    };
    return names[platform] || platform;
  }

  async batchGenerateReplies(posts: Post[]): Promise<Map<string, LLMResponse>> {
    const results = new Map<string, LLMResponse>();

    for (const post of posts) {
      const response = await this.generateReply(post);
      results.set(post.id, response);
      
      await this.delay(1000);
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
