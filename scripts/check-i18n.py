#!/usr/bin/env python3
"""번역 파일 점검: en 기준 키 누락/잉여, 자리표시자({{x}}, $1, <b>) 보존, 빈 문자열.

사용: python3 scripts/check-i18n.py [언어...]   (생략하면 전부)
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'src/translate'
EXT = ROOT / 'public/_locales'
# ko는 원본, translation_notice류는 ko에 일부러 없다.
SOURCE_ONLY_MISSING = {'ko': {'translation_notice', 'translationNotice'}}
TOKENS = re.compile(r'\{\{\{?[^}]+\}?\}\}|\$\d|</?[a-z]+\s*/?>')


def flat(d, p=''):
    out = {}
    for k, v in d.items():
        out.update(flat(v, f'{p}{k}.') if isinstance(v, dict) else {p + k: v})
    return out


def compare(name, base, target, allowed_missing):
    errs = []
    for k in sorted(set(base) - set(target) - allowed_missing):
        errs.append(f'missing key {k}')
    for k in sorted(set(target) - set(base)):
        errs.append(f'extra key {k}')
    for k in sorted(set(base) & set(target)):
        if not str(target[k]).strip():
            errs.append(f'empty {k}')
        elif sorted(TOKENS.findall(base[k])) != sorted(TOKENS.findall(target[k])):
            errs.append(f'placeholders differ {k}: {TOKENS.findall(base[k])} vs {TOKENS.findall(target[k])}')
    return [f'[{name}] {e}' for e in errs]


def main(langs):
    base_app = flat(json.loads((APP / 'en/en.json').read_text()))
    base_ext = {k: v['message'] for k, v in json.loads((EXT / 'en/messages.json').read_text()).items()}
    if not langs:
        langs = sorted(p.name for p in APP.iterdir() if p.is_dir() and p.name != 'en')
    errs = []
    for lang in langs:
        allowed = SOURCE_ONLY_MISSING.get(lang, set())
        app = APP / lang / f'{lang}.json'
        ext = EXT / lang.replace('-', '_') / 'messages.json'
        for f in (app, ext):
            if not f.exists():
                errs.append(f'[{lang}] file missing: {f.relative_to(ROOT)}')
        if app.exists():
            errs += compare(f'{lang} app', base_app, flat(json.loads(app.read_text())), allowed)
        if ext.exists():
            errs += compare(f'{lang} ext', base_ext, {k: v['message'] for k, v in json.loads(ext.read_text()).items()}, allowed)
    print('\n'.join(errs) or f'OK: {", ".join(langs)}')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
