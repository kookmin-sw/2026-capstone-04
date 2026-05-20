# Respondy Backend

Respondy 백엔드는 AI 기반 커뮤니케이션 어시스턴트의 Django REST API 서버입니다.

주요 역할은 사용자 인증, 인물(Avatar) 관리, 수동 입력 분석, 실시간 캡처 분석, 분석 기록 관리, AI 챗 기능, Gemini API 연동입니다.

---

## 1. 기술 스택

- Python 3.12
- Django 6.0
- Django REST Framework
- djangorestframework-simplejwt
- PostgreSQL / Supabase
- Google Gemini API
- Gunicorn
- systemd
- AWS EC2

Nginx reverse proxy, HTTPS, Refresh Token Blacklist, Docker, CI/CD는 현재 적용되어 있지 않으며 향후 개선 계획입니다.

---

## 2. 프로젝트 구조

```text
respondy/
├── manage.py
├── requirements.txt
├── README.md
├── .env.example
├── config/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
├── conversations/
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   ├── services.py
│   ├── urls.py
│   ├── tests.py
│   ├── admin.py
│   └── migrations/
└── ai_coaching/
    ├── models.py
    ├── serializers.py
    ├── views.py
    ├── services.py
    ├── urls.py
    ├── tests.py
    ├── admin.py
    └── migrations/
```

---

## 3. 환경 변수

`.env.example`을 참고하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

필수 값:

```env
SECRET_KEY=
DEBUG=True
DATABASE_URL=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

주의사항:

- `.env`는 GitHub에 업로드하지 않습니다.
- `DATABASE_URL`에는 Supabase PostgreSQL 연결 문자열을 넣습니다.
- `GEMINI_API_KEY`는 Gemini 기반 분석 및 AI 챗 응답 생성에 사용됩니다.

---

## 4. 로컬 실행

```bash
python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

python3 manage.py migrate
python3 manage.py runserver 0.0.0.0:8000
```

상태 확인:

```bash
curl http://127.0.0.1:8000/api/health/
```

DB 연결 확인:

```bash
curl http://127.0.0.1:8000/api/db-check/
```

---

## 5. 인증 방식

대부분의 API는 JWT 인증이 필요합니다.

```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

현재 인증 구조:

- Access Token 기반 API 인증
- Refresh Token 기반 Access Token 재발급
- 사용자별 데이터 접근 제한
- 비밀번호 정책 적용

현재 미적용:

- Refresh Token Blacklist

---

## 6. 주요 API

Base URL:

```text
http://98.92.254.32:8000/api
```

### 6.1 Health

```text
GET /health/       # 서버 상태 확인
GET /db-check/     # DB 연결 확인
```

### 6.2 Auth

```text
POST /auth/signup/             # 회원가입
POST /auth/login/              # 로그인
POST /auth/logout/             # 로그아웃
POST /auth/refresh/            # Access Token 재발급
GET  /auth/me/                 # 내 계정 정보 조회
GET  /auth/profile/            # 프로필 조회
PATCH /auth/profile/           # 프로필 수정
POST /auth/password/           # 비밀번호 변경
POST /auth/privacy-consent/    # 개인정보 활용 동의 저장
```

프로필 예시:

```json
{
  "name": "홍길동",
  "email": "user@example.com",
  "birth_date": "2001-01-01"
}
```

### 6.3 Avatar

```text
GET    /avatars/          # 인물 목록 조회
POST   /avatars/          # 인물 생성
GET    /avatars/{id}/     # 인물 상세 조회
PATCH  /avatars/{id}/     # 인물 수정
DELETE /avatars/{id}/     # 인물 삭제
```

인물 생성 예시:

```json
{
  "name": "김민지",
  "age_group": "20대",
  "current_relation": "선후배",
  "target_relation": "친한 친구",
  "personality": "조용하지만 배려심이 많음",
  "speech_style": "부드럽고 짧게 말함",
  "background": "같은 동아리에서 만남",
  "memo": "답장이 느린 편",
  "is_active": true
}
```

### 6.4 Manual Analysis

```text
POST /manual-analysis/    # 수동 입력 분석
```

요청 예시:

```json
{
  "avatar_id": 1,
  "title": "김민지와의 수동 입력 대화",
  "platform_type": "kakao",
  "goal_type": "general",
  "situation_context": "약속을 잡는 상황",
  "analysis_goal": "부담스럽지 않게 답장하고 싶음",
  "received_message": "그래"
}
```

특징:

- 개인정보 활용 동의가 필요합니다.
- 요청 1회로 세션, 캡처 요청, 추출 메시지, 분석 결과가 함께 생성됩니다.
- 사용자 입력 텍스트는 프론트에서 임의 분류하지 않고 그대로 백엔드로 전달합니다.

### 6.5 Analysis Records

```text
GET    /sessions/           # 분석 기록 목록 조회
POST   /sessions/           # 실시간 분석 세션 생성
GET    /sessions/{id}/      # 분석 기록 상세 조회
DELETE /sessions/{id}/      # 분석 기록 삭제
POST   /sessions/{id}/end/  # 실시간 분석 세션 종료
```

특징:

- 수동 입력 분석은 보통 하나의 메시지를 포함합니다.
- 실시간 분석은 분석 시작부터 종료까지 하나의 세션으로 관리됩니다.
- 분석 가능한 내용이 없는 세션은 목록에 노출하지 않습니다.

### 6.6 Real-Time Capture Analysis

```text
GET  /sessions/{session_id}/captures/    # 세션별 캡처 목록 조회
POST /sessions/{session_id}/captures/    # 캡처 업로드 및 분석
```

요청 예시:

```json
{
  "image_base64": "data:image/png;base64,...",
  "source_type": "electron",
  "screen_context": {
    "platform_type": "kakao",
    "window_title": "카카오톡",
    "detected_change": true
  }
}
```

처리 정책:

- `image_url`, `image_file`, `image_base64` 중 하나가 필요합니다.
- `image_hash`를 생성하여 동일 캡처 중복 분석을 방지합니다.
- Gemini가 추출한 마지막 의미 있는 메시지가 사용자 메시지이면 분석을 스킵합니다.
- 내 메시지를 제외한 최신 상대 메시지가 이전과 동일하면 분석을 스킵합니다.
- 분석 가능한 상대 메시지가 없으면 분석 기록을 저장하지 않습니다.
- 분석 완료 후 원본 이미지 데이터는 삭제합니다.

### 6.7 AI Chat

```text
GET   /coaching/chats/                  # AI 챗 세션 목록 조회
POST  /coaching/chats/                  # AI 챗 세션 생성
GET   /coaching/chats/{id}/             # AI 챗 세션 상세 조회
PUT   /coaching/chats/{id}/             # AI 챗 세션 전체 수정
PATCH /coaching/chats/{id}/             # AI 챗 세션 일부 수정
POST  /coaching/chats/{id}/archive/     # AI 챗 세션 보관
POST  /coaching/chats/{id}/messages/    # AI 챗 메시지 전송
POST  /coaching/chats/{id}/retry/       # 실패한 AI 응답 재시도
```

특징:

- 사용자가 생성한 Avatar 정보를 기반으로 AI 챗 응답을 생성합니다.
- AI 챗이 일반 GPT처럼 동작하지 않도록 아바타 역할 유지 규칙을 적용합니다.
- Gemini 응답 실패 시 실패 메시지를 저장하고 retry API로 재시도할 수 있습니다.

---

## 7. 주요 모델

```text
UserProfile
- user, name, birth_date
- privacy_consent_at, privacy_consent_version

Avatar
- user, name, age_group
- current_relation, target_relation
- personality, speech_style, background, memo
- is_active

ConversationSession
- user, avatar, title
- platform_type, goal_type
- situation_context, analysis_goal
- status

CaptureRequest
- session
- image_url, image_file, image_base64, image_hash
- source_type, processing_status
- screen_context
- gemini_extract_raw, gemini_analyze_raw

ExtractedMessage
- capture_request, session
- sender_type, content, message_order
- confidence_score

AnalysisResult
- session, capture_request
- summary, emotion, tone, risk_level
- strategy, recommended_replies
- caution_points, follow_up_suggestions

AIChatSession
- user, avatar, title
- situation_context, status

AIChatMessage
- chat_session
- sender_type, content, status
- error_message, raw_response
```

---

## 8. AI 분석 결과 형식

Gemini 분석 결과는 `AnalysisResult`에 저장됩니다.

```json
{
  "summary": "대화 분위기 요약",
  "emotion": "neutral",
  "tone": "casual",
  "risk_level": "low",
  "strategy": "대화 전략",
  "recommended_replies": [
    "추천 답장 1",
    "추천 답장 2",
    "추천 답장 3"
  ],
  "caution_points": [],
  "follow_up_suggestions": []
}
```

주의사항:

- `emotion`, `tone`, `risk_level`은 사용자가 입력하는 값이 아니라 Gemini 분석 결과입니다.
- 프론트엔드는 사용자의 자유 입력을 임의로 분류하지 않고 그대로 백엔드에 전달합니다.
- 백엔드는 Avatar 정보와 상황 설명을 함께 사용하여 Gemini 프롬프트를 구성합니다.

---

## 9. 내부 선택값

프론트/백엔드 내부에서 사용하는 코드 값입니다.

```text
platform_type
- kakao
- instagram
- sms
- discord
- whatsapp
- unknown

goal_type
- keep_good
- build_interest
- resolve_conflict
- persuade
- distance
- general

source_type
- electron
- web
- api
- other

processing_status
- uploaded
- extracting
- extracted
- analyzing
- completed
- failed

emotion
- positive
- neutral
- annoyed
- sad
- angry
- anxious
- mixed
- unknown

tone
- friendly
- casual
- polite
- cold
- sensitive
- aggressive
- awkward
- unknown

risk_level
- low
- medium
- high
- unknown
```

---

## 10. 테스트

테스트 실행:

```bash
python3 manage.py test
```

현재 테스트 파일:

```text
conversations/tests.py    # 21개
ai_coaching/tests.py      # 11개
```

총 테스트 수:

```text
32개
```

주요 검증 항목:

- 회원가입 및 로그인
- 약한 비밀번호 거부
- 프로필 수정
- 비밀번호 변경
- 개인정보 동의 저장
- 사용자별 Avatar 데이터 분리
- 수동 입력 분석
- 실시간 캡처 분석
- image_hash 기반 중복 분석 방지
- 내 메시지 및 중복 상대 메시지 분석 스킵
- 분석 완료 후 원본 이미지 삭제
- 분석 기록 사용자별 접근 제어
- 세션 종료 후 캡처 거부
- AI 챗 세션 생성/수정/보관
- AI 챗 메시지 전송
- AI 응답 실패 처리 및 retry

---

## 11. EC2 배포

현재 백엔드 서버는 AWS EC2에서 Gunicorn + systemd 기반으로 실행됩니다.

EC2 프로젝트 경로:

```bash
cd ~/respondy
```

일반 배포 반영:

```bash
git pull origin main
source .venv/bin/activate
python3 manage.py migrate
sudo systemctl restart respondy
sudo systemctl status respondy
```

로그 확인:

```bash
sudo journalctl -u respondy -f
```

EC2 내부 상태 확인:

```bash
curl http://127.0.0.1:8000/api/health/
```

현재 적용 완료:

- AWS EC2
- Gunicorn
- systemd
- Supabase PostgreSQL 연동
- Gemini API 연동

향후 개선 계획:

- Nginx reverse proxy
- HTTPS
- Refresh Token Blacklist
- Docker 기반 배포
- CI/CD 자동 배포
