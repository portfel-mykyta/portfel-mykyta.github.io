#!/usr/bin/env python3
"""Збирає сторінку «Купівля в IBKR» (артефакт у Claude) з шаблону.

У шаблон вставляються знак Портфеля з index.html і спільне правило поповнення
plan-core.js, щоб сторінка рахувала так само, як застосунок.

    python3 tools/kupivlia/build.py OUT.html
"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def build() -> str:
    tpl = (HERE / 'kupivlia.template.html').read_text(encoding='utf-8')
    index = (ROOT / 'index.html').read_text(encoding='utf-8')
    core = (ROOT / 'plan-core.js').read_text(encoding='utf-8')
    mark = re.search(r'<symbol id="i-mark".*?</symbol>', index, re.S)
    if not mark:
        sys.exit('у index.html немає знака i-mark')
    if '</script' in core:
        sys.exit('plan-core.js не можна вбудувати: містить </script')
    out = tpl.replace('<!--@mark-->', mark.group(0)).replace('/*@plan-core*/', core.strip())
    if '<!--@' in out or '/*@' in out:
        sys.exit('лишилися незаповнені місця в шаблоні')
    if '—' in out:
        sys.exit('у сторінці є довге тире')
    return out


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = pathlib.Path(sys.argv[1])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(build(), encoding='utf-8')
    print(path, path.stat().st_size, 'байт')
