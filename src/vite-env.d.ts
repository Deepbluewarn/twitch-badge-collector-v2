/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BASE_URL: string
    readonly VITE_BASE_HOSTNAME: string
    readonly VITE_BUILD_ENV: string

    readonly VITE_MAXNUMCHATS_DEFAULT: string
    readonly VITE_FIREFOX_RATE_EXT_LINK: string
    readonly VITE_CHROMIUM_RATE_EXT_LINK: string
    readonly VITE_DONATE_LINK: string
    readonly VITE_DOCUMENTATION: string
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare module '*?script&module';