import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    test: {
        // 기본은 node (DOM 무관 모듈용). DOM/React 필요한 파일은 파일 상단에
        // `// @vitest-environment happy-dom` 코멘트로 per-file override.
        environment: 'node',
        // canary 스크립트(scripts/canary)도 포함 — auto-fix 후보 채점 로직은 한 번
        // 틀리면 잘못된 selector를 자동 PR로 올리므로 테스트 대상이어야 한다.
        include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
    },
});
