#!/usr/bin/env python3
"""Збирає Портфель для Claude (артефакт): той самий застосунок, плюс живі дані й купівля
через конектор Interactive Brokers.

    python3 tools/artifact/build.py OUT_DIR

У OUT_DIR кладе portfel.html (сторінка). Зашифрований data.enc.json публікується поруч
окремо, з гілки data.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
KUP = ROOT / 'tools' / 'kupivlia' / 'kupivlia.template.html'


def read(p):
    return (ROOT / p).read_text(encoding='utf-8')


def scope_css(css, scope):
    """Префікс до кожного селектора; блоки токенів (:root) відкидаються, бо токени ті самі."""
    out, i = [], 0
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    while i < len(css):
        j = css.find('{', i)
        if j < 0:
            break
        head = css[i:j].strip()
        if head.startswith('@media') or head.startswith('@supports'):
            depth, k = 1, j + 1
            while depth:
                depth += {'{': 1, '}': -1}.get(css[k], 0)
                k += 1
            inner = scope_css(css[j + 1:k - 1], scope)
            if inner.strip():
                out.append(head + '{' + inner + '}')
            i = k
            continue
        k = css.find('}', j)
        body = css[j + 1:k]
        i = k + 1
        if head.startswith('@keyframes'):
            # keyframes: тіло з вкладеними дужками
            depth, k2 = 1, j + 1
            while depth:
                depth += {'{': 1, '}': -1}.get(css[k2], 0)
                k2 += 1
            out.append(css[css.rfind('@', 0, j + 1):k2] if False else head + css[j:k2])
            i = k2
            continue
        sels = [s.strip() for s in head.split(',')]
        if any(':root' in s for s in sels) or not head:
            continue
        new = []
        for s in sels:
            if s in ('body', 'html', '*', '*::before', '*::after'):
                continue
            new.append(scope + ' ' + s)
        if new:
            out.append(', '.join(new) + '{' + body + '}')
    return '\n'.join(out)


def build():
    index = read('index.html')
    css = read('app.css')
    css = re.sub(r'@font-face\s*\{[^}]*\}', '', css)
    body = re.search(r'<body>(.*)</body>', index, re.S).group(1)
    body = re.sub(r'<script[^>]*></script>', '', body)

    kup = KUP.read_text(encoding='utf-8')
    kcss = re.search(r'<style>(.*?)</style>', kup, re.S).group(1)
    kjs = re.findall(r'<script>(.*?)</script>', kup, re.S)[1]
    # Розмітка «Купівлі»: від рядка рахунку до примітки внизу
    start = kup.index('<p class="acct"')
    end = kup.index('</div>\n\n<script>')
    kmark = kup[start:end]
    kmark = re.sub(r'\b(id|aria-labelledby|for)="([^"]+)"', lambda m: m.group(1) + '="k' + m.group(2) + '"', kmark)
    panel = ('\n    <section class="panel buy" id="buy" aria-labelledby="buyTitle">\n'
             '      <div class="panel-head"><div class="head-title"><h2 id="buyTitle">Купівля</h2>'
             '<p class="panel-meta">Будь-яка акція чи фонд американських бірж за живими цінами IBKR. '
             'Заявку відправляєш ти, в IBKR.</p></div>'
             '<button class="icon-btn" id="kreload" type="button" aria-label="Оновити дані IBKR" title="Оновити дані IBKR">'
             '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-refresh"></use></svg></button></div>\n'
             + kmark + '\n    </section>\n')
    anchor = re.search(r'(<section class="panel plan" id="plan".*?</section>)', body, re.S)
    body = body[:anchor.end()] + panel + body[anchor.end():]

    scoped = scope_css(kcss, '#buy') + '\n#buy { --shadow: none; }\n#buy #kplan { display: none; }\n' \
        '#buy .card { background: var(--paper); box-shadow: none; }\n#buy .acct { padding: 0; }\n'

    page = ('<title>Портфель</title>\n'
            '<meta name="claude:viewport-fit-sides" content="cover">\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geologica:wght,SHRP@300..700,0..100&display=swap">\n'
            '<style>\n' + css + '\n' + scoped + '\n</style>\n'
            '<script>window.PORTFEL_IN_CLAUDE = true; window.KUPIVLIA_PREFIX = \'k\';</script>\n'
            '<script>\n' + read('boot.js') + '\n</script>\n'
            + body +
            '\n<script>\n' + read('plan-core.js') + '\n</script>\n'
            '<script>\n' + kjs + '\n</script>\n'
            '<script>\n' + read('app.js') + '\n</script>\n')
    if '—' in page:
        sys.exit('у сторінці є довге тире')
    return page


if __name__ == '__main__':
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    (out / 'portfel.html').write_text(build(), encoding='utf-8')
    print(out / 'portfel.html', (out / 'portfel.html').stat().st_size, 'байт')
