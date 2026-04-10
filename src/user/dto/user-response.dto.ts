import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ description: '유저 ID' })
  id: string;

  @ApiProperty({ description: '이메일' })
  email: string;

  @ApiProperty({ description: '이름' })
  name: string;

  @ApiProperty({ description: '프로필 이미지', nullable: true })
  profileImg: string | null;

  @ApiProperty({ description: '생성일' })
  createdAt: Date;
}
