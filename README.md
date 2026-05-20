[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/Lvs6kcL8)

# RESPONDY - AI 기반 커뮤니케이션 어시스턴트

## 1. 프로젝트 소개

**RESPONDY**는 메신저 대화 과정에서 사용자가 느끼는 답장 부담과 의사소통의 어려움을 줄이기 위한 AI 기반 커뮤니케이션 지원 서비스입니다.

사용자는 카카오톡 대화 화면 또는 직접 입력한 메시지를 기반으로 상대방의 감정, 대화 맥락, 위험도, 추천 답장 등을 확인할 수 있습니다. 또한 사용자가 설정한 인물 정보를 바탕으로 AI 챗을 진행하며 실제 대화 상황을 연습할 수 있습니다.

본 프로젝트는 Electron/Nextron 기반 데스크톱 클라이언트, Django REST Framework 기반 백엔드 서버, Supabase PostgreSQL 데이터베이스, Google Gemini API를 연동하여 구현되었습니다.

---

## 2. 주요 기능

### 실시간 메시지 분석

- Electron 기반 데스크톱 앱에서 카카오톡 화면 변화 감지
- 새 메시지 감지 시 대화 화면 캡처
- Django 서버로 캡처 이미지 전송
- Gemini API 기반 메시지 추출 및 감정/맥락 분석
- 추천 답장 및 후속 대화 전략 제공
- image_hash 기반 중복 분석 방지
- 내 메시지만 감지되거나 상대방의 새 메시지가 없을 경우 분석 스킵
- 분석 완료 후 원본 이미지 데이터 삭제

### 수동 입력 분석

- 사용자가 상대 메시지와 상황 설명을 직접 입력
- 선택한 인물 정보와 함께 AI 분석 수행
- 감정 분석, 대화 맥락 해석, 추천 답장 제공
- 분석 결과를 기록으로 저장하고 이후 다시 조회 가능

### AI 챗

- 사용자가 생성한 인물 정보를 기반으로 AI와 대화 연습
- 인물의 관계, 성격, 말투, 특이사항 반영
- 사용자 메시지와 AI 응답 저장
- AI 응답 실패 시 retry 기능 제공

### 마이페이지

- 사용자 정보 조회 및 수정
- 비밀번호 변경
- 분석 기록 조회 및 삭제
- 인물 생성, 수정, 삭제

### 보안 및 데이터 관리

- JWT 기반 사용자 인증
- 사용자별 아바타, 분석 기록, AI 챗 데이터 분리
- 개인정보 활용 동의 저장
- 동의하지 않은 사용자의 분석 기능 차단
- 비밀번호 정책 적용
- 분석 후 원본 이미지 데이터 삭제

---

## 3. 시스템 구조

```text
사용자
  ↓
Electron / Nextron 데스크톱 클라이언트
  ↓
Django REST API 서버
  ├─ 사용자 인증 및 권한 검증
  ├─ 개인정보 동의 확인
  ├─ 실시간/수동 분석 처리
  └─ AI 챗 처리
  ↓
Supabase PostgreSQL
  └─ 사용자, 인물, 분석 기록, AI 챗 데이터 저장

Django REST API 서버
  ↓
Google Gemini API
  └─ 이미지 기반 메시지 추출, 감정 분석, 답장 추천, AI 챗 응답 생성
```

---

## 4. 기술 스택

### Frontend / Desktop

- Electron
- Nextron
- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Python
- Django
- Django REST Framework
- JWT Authentication

### Database

- Supabase PostgreSQL

### AI

- Google Gemini API

### Deployment

- AWS EC2
- Gunicorn
- systemd

Nginx reverse proxy, HTTPS, Refresh Token Blacklist, Docker, CI/CD는 향후 개선 계획입니다.

---

## 5. 프로젝트 구조

```text
RESPONDY/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/
│   ├── conversations/
│   └── ai_coaching/
│
├── frontend/
│   ├── package.json
│   ├── electron-builder.yml
│   ├── main/
│   ├── renderer/
│   ├── shared/
│   └── resources/
│
└── README.md
```

---

## 6. 설치 및 실행 방법

### 6.1 Backend 실행

```bash
cd backend

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

python manage.py migrate
python manage.py runserver
```

Windows 환경에서 가상환경을 활성화할 경우:

```bash
.venv\Scripts\activate
```

### 6.2 Frontend / Electron 실행

```bash
cd frontend

npm install
npm run dev
```

현재 프론트엔드/Electron 프로젝트의 개발 실행 명령어는 `npm run dev`입니다.

---

## 7. 환경 변수 설정

백엔드 실행 전 `.env` 파일을 생성하고 아래 항목을 설정해야 합니다.

```text
SECRET_KEY=
DEBUG=True
DATABASE_URL=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

환경 변수에는 데이터베이스 접속 정보, Gemini API Key, Django Secret Key 등 민감한 정보가 포함되므로 GitHub에 업로드하지 않습니다.

---

## 8. 주요 API

### 서버 상태

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/health/` | 서버 상태 확인 |
| GET | `/api/db-check/` | 데이터베이스 연결 확인 |

### 인증

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/api/auth/signup/` | 회원가입 |
| POST | `/api/auth/login/` | 로그인 및 JWT 발급 |
| POST | `/api/auth/logout/` | 로그아웃 |
| POST | `/api/auth/refresh/` | Access Token 재발급 |
| GET | `/api/auth/me/` | 내 계정 정보 조회 |
| GET | `/api/auth/profile/` | 사용자 프로필 조회 |
| PATCH | `/api/auth/profile/` | 사용자 프로필 수정 |
| POST | `/api/auth/password/` | 비밀번호 변경 |
| POST | `/api/auth/privacy-consent/` | 개인정보 활용 동의 저장 |

### 인물

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/avatars/` | 인물 목록 조회 |
| POST | `/api/avatars/` | 인물 생성 |
| GET | `/api/avatars/{id}/` | 인물 상세 조회 |
| PATCH | `/api/avatars/{id}/` | 인물 수정 |
| DELETE | `/api/avatars/{id}/` | 인물 삭제 |

### 분석

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/api/manual-analysis/` | 수동 입력 분석 |
| GET | `/api/sessions/` | 분석 기록 목록 조회 |
| POST | `/api/sessions/` | 실시간 분석 세션 생성 |
| GET | `/api/sessions/{id}/` | 분석 기록 상세 조회 |
| DELETE | `/api/sessions/{id}/` | 분석 기록 삭제 |
| POST | `/api/sessions/{id}/end/` | 실시간 분석 세션 종료 |
| GET | `/api/sessions/{session_id}/captures/` | 세션별 캡처 목록 조회 |
| POST | `/api/sessions/{session_id}/captures/` | 실시간 캡처 분석 |

### AI 챗

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/coaching/chats/` | AI 챗 세션 목록 조회 |
| POST | `/api/coaching/chats/` | AI 챗 세션 생성 |
| GET | `/api/coaching/chats/{id}/` | AI 챗 세션 상세 조회 |
| PATCH | `/api/coaching/chats/{id}/` | AI 챗 세션 수정 |
| POST | `/api/coaching/chats/{id}/archive/` | AI 챗 세션 보관 |
| POST | `/api/coaching/chats/{id}/messages/` | AI 챗 메시지 전송 |
| POST | `/api/coaching/chats/{id}/retry/` | AI 응답 재시도 |

---

## 9. 테스트

본 프로젝트에서는 Django 기반 자동화 테스트를 통해 주요 백엔드 기능을 검증했습니다.

검증 항목은 다음과 같습니다.

- 회원가입 및 로그인
- JWT 인증
- 비밀번호 정책
- 개인정보 활용 동의
- 사용자별 아바타 데이터 분리
- 수동 입력 분석
- 실시간 캡처 분석
- image_hash 기반 중복 분석 방지
- 내 메시지 및 중복 상대 메시지 분석 스킵
- 분석 후 원본 이미지 데이터 삭제
- 분석 기록 접근 제어
- AI 챗 세션 생성 및 메시지 전송
- AI 응답 실패 처리 및 retry

테스트 실행:

```bash
cd backend
python manage.py test
```

현재 기준으로 `conversations` 앱과 `ai_coaching` 앱을 중심으로 총 32개의 테스트를 수행하였습니다.

---

## 10. 배포 상태

백엔드 서버는 AWS EC2 환경에서 실행되도록 구성했습니다.

- AWS EC2 기반 Linux 서버 사용
- Gunicorn을 통한 Django WSGI 실행
- systemd 서비스 등록을 통한 백그라운드 실행 및 재시작 관리
- Supabase PostgreSQL 외부 데이터베이스 연동
- Google Gemini API 연동

향후 개선 계획:

- Nginx reverse proxy 적용
- HTTPS 적용
- Refresh Token Blacklist 적용
- Docker 기반 배포
- CI/CD 자동 배포
- Electron 클라이언트 설치 파일 배포

---

## 11. 팀 소개

| 이름 | 역할 |
| --- | --- |
| 허승범 | 백엔드 API, DB 설계, JWT 인증, Gemini 연동, 프롬프트 튜닝, 배포, 테스트 |
| 임은빈 | UI/UX 구성, Figma 디자인, 마이페이지·인물 관리·분석 기록 UI, 문서화 |
| 송승은 | 프론트엔드/Electron 개발, 실시간 감지·캡처 흐름, UI 구현 |
| 지수연 | UI/UX 구성, Figma 디자인, 사용자 가이드·프로필/비밀번호 UI |
| 안재훈 | AI 챗 기능, Gemini 아바타 응답 서비스, AI 챗 API 및 테스트, 프롬프트 규칙 보완 |

발표자료 및 최종 보고서는 팀원 전체가 공동으로 작성하였습니다.

---

## 12. 소개 영상

프로젝트 소개 영상은 아래 링크를 통해 확인할 수 있습니다.

영상 링크: 추후 추가 예정

---

## 13. 향후 개선 계획

- 민감 정보 자동 마스킹
- 이미지 블러 처리
- HTTPS 적용
- Nginx reverse proxy 적용
- Refresh Token Blacklist 적용
- 사용자별 AI API 호출 제한
- 분석 결과 캐싱
- 다양한 화면 해상도 및 카카오톡 창 크기 대응
- Electron 클라이언트 자동 업데이트
- 다양한 메신저 플랫폼 지원

---

## 14. 기타

본 프로젝트는 국민대학교 소프트웨어융합대학 소프트웨어학부 다학제간캡스톤디자인I 과목의 캡스톤 디자인 프로젝트로 진행되었습니다.
