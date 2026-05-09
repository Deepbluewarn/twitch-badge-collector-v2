import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    test: {
        // 도메인 모듈 단위 테스트 — DOM 불필요. browser 환경 필요해지면
        // 'happy-dom' 또는 'jsdom' 추가 후 environment 옵션 설정.
        environment: 'node',
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
