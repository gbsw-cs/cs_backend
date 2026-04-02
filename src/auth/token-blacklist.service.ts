import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module.js';

@Injectable()
export class TokenBlacklistService {
  private readonly PREFIX = 'blacklist:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async blacklist(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.PREFIX + jti, '1', 'EX', ttlSeconds);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redis.get(this.PREFIX + jti);
    return result !== null;
  }
}
