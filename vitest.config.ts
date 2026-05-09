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
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
