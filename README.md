# bbs-web

### 소스코드 Clone
```sh
git clone https://github.com/gcjjyy/bbs-web.git
cd bbs-web
```

### 의존성 설치
```sh
npm run install:all
```

### frontend 빌드
```sh
npm run build
```

### 서버 실행
```sh
npm run serve
```

### 브라우저에서 http://localhost:8199 접속

### 개발 서버
```sh
npm run dev:frontend
npm run dev:server
```

### 검증
```sh
npm run verify
```

개별 확인이 필요할 때는 아래 명령어를 실행합니다.

```sh
cd frontend && npm run test:ci
cd frontend && npm run build
cd server && bun run typecheck
```
