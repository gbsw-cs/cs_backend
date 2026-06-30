# 앉아봐 — 개발자 맞춤형 무의식 자세 교정 서비스

> 경북 소프트웨어 마이스터 고등학교 캡스톤 프로젝트

웹캠을 통해 실시간으로 자세를 감지하고, 거북목·라운드숄더·어깨 비대칭·슬라우칭 등 나쁜 자세를 자동으로 분류하여 교정을 돕는 서비스의 **백엔드 API 서버**입니다.

---

## 기술 스택

| 분류 | 기술 |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Auth | JWT + Google OAuth 2.0 |
| Cache / Session | Redis (ioredis) |
| Push | Firebase Admin (FCM) |
| Mail | Nodemailer |
| API Docs | Swagger (OpenAPI 3) |
| Security | Helmet, Throttler |

---

## 주요 기능

- **자세 감지 세션** — 감지 시작/일시정지/재개/종료, 구간(segment) 및 이벤트 배치 업로드
- **대시보드** — 오늘의 건강 점수, 주간/일간 슬롯별 통계, 자세 타임라인
- **배지 시스템** — 누적 바른 자세 시간 · 연속 달성 일수 기반 배지 자동 부여
- **주간 리포트** — AI 솔루션 포함 리포트를 이메일 또는 Notion으로 발송
- **푸시 알림** — FCM을 통한 자세 경고 알림
- **인증** — 이메일/비밀번호 회원가입·로그인, Google OAuth, 이메일 인증 코드

---

## 감지 유형

| 코드 | 설명 |
|---|---|
| `GOOD_POSTURE` | 바른 자세 |
| `TURTLE_NECK` | 거북목 |
| `ROUND_SHOULDER` | 라운드숄더 |
| `SHOULDER_ASYMMETRY` | 어깨 비대칭 |
| `SLOUCH` | 슬라우칭 |
| `DARK_ENV` | 어두운 환경 |
| `UNCLASSIFIED` | 미분류 |

---

## 시작하기

### 사전 요구사항

- Node.js 20+
- PostgreSQL
- Redis

### 설치

```bash
npm install
```

### 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 아래 항목을 설정합니다.

```env
# Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME

# JWT
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Frontend
FRONTEND_URL=http://localhost:5173

# Mail (Nodemailer)
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=your_email
MAIL_PASS=your_password

# Firebase (FCM)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY=your_private_key
```

### 데이터베이스 마이그레이션

```bash
npx prisma migrate deploy
```

### 시드 데이터 삽입 (배지 마스터 등)

```bash
npm run seed
```

---

## 실행

```bash
# 개발 (watch 모드)
npm run start:dev

# 프로덕션 (마이그레이션 후 실행)
npm run start:prod
```

서버가 실행되면 Swagger UI에서 API 문서를 확인할 수 있습니다.

```
http://localhost:3000/api
```

---

## API 개요

| 태그 | 엔드포인트 | 설명 |
|---|---|---|
| **Auth** | `POST /auth/signup` | 회원가입 |
| | `POST /auth/login` | 로그인 |
| | `GET /auth/google` | Google OAuth 시작 |
| | `POST /auth/refresh` | 토큰 갱신 |
| | `POST /auth/logout` | 로그아웃 |
| | `DELETE /auth/withdraw` | 회원탈퇴 |
| | `POST /auth/email/send-code` | 이메일 인증 코드 발송 |
| | `POST /auth/email/verify-code` | 이메일 인증 코드 확인 |
| **Session** | `POST /sessions` | 세션 시작 |
| | `POST /sessions/:id/pause` | 세션 일시정지 |
| | `POST /sessions/:id/resume` | 세션 재개 |
| | `POST /sessions/:id/end` | 세션 종료 + 집계 + 배지 |
| | `POST /sessions/:id/segments` | 구간 배치 업로드 |
| | `GET /sessions/current` | 현재 진행 중인 세션 조회 |
| **Dashboard** | `GET /dashboard/today` | 오늘의 건강 점수 |
| | `GET /dashboard/weekly` | 주간 통계 |
| | `GET /dashboard/daily` | 일간 슬롯별 통계 |
| | `POST /dashboard/timeline` | 타임라인 항목 추가 |
| | `GET /dashboard/timeline` | 날짜별 타임라인 조회 |
| **User** | `GET /users/me` | 내 정보 조회 |
| | `PATCH /users/me/profile` | 프로필 수정 |
| | `PATCH /users/me/settings` | 설정 수정 |
| | `PATCH /users/me/password` | 비밀번호 변경 |
| | `GET /users/me/badges` | 내 배지 조회 |
| | `GET /users/me/badges/progress` | 배지 진행도 조회 |
| | `POST /users/me/push-tokens` | FCM 푸시 토큰 등록 |
| **Badge** | `GET /badges` | 전체 배지 목록 조회 |
| **Report** | `GET /users/me/reports` | 주간 리포트 이력 |
| | `GET /users/me/reports/:id` | 리포트 단건 조회 |

---

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run start:dev` | 개발 서버 실행 (watch) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start:prod` | 프로덕션 실행 |
| `npm run test` | 단위 테스트 |
| `npm run test:cov` | 커버리지 포함 테스트 |
| `npm run lint` | ESLint 검사 및 자동 수정 |
| `npm run seed` | 시드 데이터 삽입 |

---

## 프로젝트 구조

```
src/
├── auth/          # 인증 (JWT, Google OAuth, 이메일 인증)
├── session/       # 감지 세션 관리
├── dashboard/     # 대시보드 통계 및 타임라인
├── user/          # 사용자 정보 및 설정
├── badge/         # 배지 시스템
├── report/        # 주간 리포트
└── common/        # 공통 데코레이터, 가드, 유틸
prisma/
├── schema.prisma  # DB 스키마
└── migrations/    # 마이그레이션 이력
```

---

## 라이선스

Private — 경북 소프트웨어 마이스터 고등학교 캡스톤 프로젝트
