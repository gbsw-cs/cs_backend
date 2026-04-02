import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from '../../user/user.service.js';
import { TokenBlacklistService } from '../token-blacklist.service.js';

export interface JwtPayload {
  sub: number;
  email: string;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userService: UserService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'default-secret-key',
    });
  }

  async validate(payload: JwtPayload & { exp: number }) {
    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(payload.jti);
    if (isBlacklisted) {
      throw new UnauthorizedException('만료된 토큰입니다.');
    }

    const user = await this.userService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
