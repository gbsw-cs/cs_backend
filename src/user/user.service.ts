import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserResponseDto } from './dto/user-response.dto.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<UserResponseDto> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('유저를 찾을 수 없습니다.');
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImg: user.profileImg,
        createdAt: user.createdAt,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 회원 정보를 조회할 수 없습니다.',
      );
    }
  }
}
