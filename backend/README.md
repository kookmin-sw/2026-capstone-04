# Respondy Backend

Respondy is a Django REST API server for AI-based conversation coaching.
It supports avatar management, manual message analysis, real-time capture analysis, analysis records, user profile updates, and password changes.

## Tech Stack

- Python 3.12
- Django 6.0
- Django REST Framework
- Simple JWT
- PostgreSQL / Supabase
- Gemini API
- Gunicorn + systemd on EC2

## Project Structure

```text
respondy/
├── config/             # Django project settings and root URLs
├── conversations/      # Main API app
├── ai_coaching/        # AI chat app area
├── manage.py
├── requirements.txt
└── .env.example
```

## Environment Variables

Create a `.env` file from `.env.example`.

```bash
cp .env.example .env
```

Required values:

```env
SECRET_KEY=
DEBUG=True
DATABASE_URL=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Notes:

- `DATABASE_URL` is the PostgreSQL connection string. Use the Supabase pooler/direct connection string depending on the deployment environment.
- `GEMINI_API_KEY` is required for OCR and AI analysis.
- Do not commit `.env`.

## Local Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 manage.py migrate
python3 manage.py runserver 0.0.0.0:8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health/
```

## Authentication

Most APIs require JWT authentication.

```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

Token lifetime:

- Access token: 30 minutes
- Refresh token: 7 days

## Main API Endpoints

Base URL:

```text
http://98.92.254.32:8000/api
```

### Auth

```text
POST /auth/signup/        # Sign up
POST /auth/login/         # Log in
POST /auth/logout/        # Log out
GET  /auth/me/            # Current user info
GET  /auth/profile/       # User profile
PATCH /auth/profile/      # Update profile
POST /auth/password/      # Change password
POST /auth/refresh/       # Refresh JWT access token
```

Profile fields:

```json
{
  "name": "홍길동",
  "email": "user@example.com",
  "birth_date": "2001-01-01"
}
```

### Avatars

```text
GET    /avatars/          # Avatar list
POST   /avatars/          # Create avatar
GET    /avatars/{id}/     # Avatar detail
PATCH  /avatars/{id}/     # Update avatar
DELETE /avatars/{id}/     # Delete avatar
```

Main avatar fields:

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

User-entered avatar fields are mostly free text.

### Manual Analysis

```text
POST /manual-analysis/
```

Request:

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

Current service policy:

- `platform_type` should be fixed to `kakao`.
- `goal_type` can be fixed to `general` if the UI does not provide a goal selector.
- User text fields should be sent as entered by the user.

### Analysis Records

```text
GET    /sessions/         # Analysis record list
POST   /sessions/         # Create session
GET    /sessions/{id}/    # Analysis record detail
DELETE /sessions/{id}/    # Delete analysis record
```

List response includes:

```json
{
  "id": 1,
  "title": "김민지와의 수동 입력 대화",
  "avatar_name": "김민지",
  "analysis_type": "manual",
  "latest_summary": "편안한 분위기",
  "latest_emotion": "neutral",
  "latest_tone": "casual",
  "latest_risk_level": "low",
  "latest_capture_status": "completed"
}
```

Detail response includes:

```json
{
  "latest_messages": [],
  "latest_analysis": {},
  "captures": [],
  "analysis_results": []
}
```

Manual analysis usually stores one received message.
Real-time analysis can store multiple OCR-extracted messages.

### Real-Time Capture Analysis

```text
GET  /sessions/{session_id}/captures/
POST /sessions/{session_id}/captures/
```

Request:

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

Notes:

- One of `image_url`, `image_file`, or `image_base64` is required.
- The current real-time target platform is KakaoTalk.
- Capture image data is cleared after analysis to reduce stored sensitive data.

## AI Analysis Output

Gemini analysis results are stored in `AnalysisResult`.

Main fields:

```json
{
  "summary": "...",
  "emotion": "neutral",
  "tone": "casual",
  "risk_level": "low",
  "strategy": "...",
  "recommended_replies": ["...", "...", "..."],
  "caution_points": [],
  "follow_up_suggestions": []
}
```

Important:

- `emotion`, `tone`, and `risk_level` are backend/Gemini output values.
- The frontend should not infer these values from user text.
- Prompt tuning may adjust the exact analysis quality and response criteria later.

## Internal Code Values

These are not user-entered values. They are internal frontend/backend code values.

Frontend usually sends:

```text
platform_type = kakao
goal_type = general
source_type = electron  # real-time capture only
```

Backend usually returns:

```text
analysis_type
processing_status
emotion
tone
risk_level
```

## EC2 Deployment

EC2 project path:

```bash
cd ~/respondy
```

Update deployment:

```bash
git pull origin main
source .venv/bin/activate
python3 manage.py migrate
sudo systemctl restart respondy
sudo systemctl status respondy
```

Check logs:

```bash
sudo journalctl -u respondy -f
```

Health check on EC2:

```bash
curl http://127.0.0.1:8000/api/health/
```

## Current Development Notes

- Real-time automatic detection is dependent on the Electron/frontend implementation.
- The backend real-time capture API is prepared, but repeated identical captures should ideally be filtered by Electron first.
- OCR/privacy concerns are reduced by not keeping original capture image data after analysis.
- For stronger duplicate prevention later, an image hash field can be added without storing original images.
- AI chatbot work is separate and should be merged after its branch is ready.
