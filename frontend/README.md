# Respondy

AI 실시간 대화 코칭 Electron 앱 (Nextron + Next.js).

## 요구 사항

- Node.js 20+
- macOS 또는 Windows (화면 OCR 캡처)
- 운영/개발용 Django API (`API_BASE_URL`)

## 설정

```bash
cp .env.example .env
# .env 에 API_BASE_URL 등 설정
npm install
```

## 개발

```bash
npm run dev
```

## 배포 빌드

```bash
npm run build
```

빌드 결과: `dist/` (`Respondy-*.dmg`, `Respondy-*.zip` 등)

운영 배포 시 `.env`의 `API_BASE_URL`이 설치 앱에서 읽히도록 별도 설정이 필요할 수 있습니다.

## 저장소 이름

로컬 폴더가 `mood-analyze`라면 원하면 `respondy`로 이름만 바꿔도 됩니다 (앱 동작과 무관).
