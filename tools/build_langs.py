#!/usr/bin/env python3
"""Builds js/words-<lang>.js for every language besides German and English.

Each word gets its pronunciation in the rhyme engine's sound code (see fromCode in js/rhyme.js):
"cons|vowel|cons|vowel|cons", a vowel followed by ":" when long. That way every language
rhymes with every other one, like German with English.

Sources (download into one folder, pass it as the first argument):
  WikiPron TSVs    github.com/CUNY-CL/wikipron  data/scrape/tsv/*.tsv (pronunciations from Wiktionary, CC BY-SA)
  *_50k.txt        github.com/hermitdave/FrequencyWords  content/2018/<lang>/<lang>_50k.txt (CC BY-SA 4.0)
Turkish, Albanian, Romanian and Kurdish are spelled almost as spoken; words without a WikiPron
entry get their pronunciation from the spelling rules below.
"""
import json, os, re, sys, unicodedata

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js')
MAX_WORDS = 30000

LANGS = {
    # code: (WikiPron files, frequency lists, spelling rules)
    'es': (['spa_latn_la_broad'], ['es'], None),
    'fr': (['fra_latn_broad'], ['fr'], None),
    'it': (['ita_latn_broad'], ['it'], None),
    'pt': (['por_latn_bz_broad'], ['pt'], None),
    'pl': (['pol_latn_broad'], ['pl'], None),
    'ru': (['rus_cyrl_narrow'], ['ru'], None),
    'uk': (['ukr_cyrl_narrow'], ['uk'], None),
    'nl': (['nld_latn_broad'], ['nl'], None),
    'el': (['ell_grek_broad'], ['el'], None),
    'ar': (['ara_arab_broad'], ['ar'], None),
    'fa': (['fas_arab_narrow'], ['fa'], None),
    'bks': (['hbs_latn_broad'], ['hr', 'bs', 'sr'], None),
    'ro': (['ron_latn_broad'], ['ro'], 'ro'),
    'tr': (['tur_latn_broad'], ['tr'], 'tr'),
    'sq': (['sqi_latn_broad'], ['sq'], 'sq'),
    'ku': (['kmr_latn_broad'], [], 'ku'),
}

# ---------- IPA -> sound code ----------
VOWELS = {
    'a': 'a', 'ɑ': 'a', 'æ': 'a', 'ä': 'a', 'ɐ': 'a', 'ɒ': 'a', 'ʌ': 'a', 'ɶ': 'a',
    'e': 'e', 'ɛ': 'e', 'ɜ': 'e', 'ɞ': 'e',
    'ə': '@', 'ɘ': '@', 'ɤ': '@',
    'i': 'i', 'ɪ': 'i', 'ɨ': 'i', 'ɯ': 'i',
    'o': 'o', 'ɔ': 'o',
    'u': 'u', 'ʊ': 'u', 'ɷ': 'u',
    'ø': 'ö', 'œ': 'ö', 'ɵ': 'ö',
    'y': 'ü', 'ʏ': 'ü', 'ʉ': 'ü',
}
CONS = [
    ('t͡ʃ', 'tS'), ('d͡ʒ', 'dS'), ('t͡s', 'ts'), ('d͡z', 'ds'), ('tʃ', 'tS'), ('dʒ', 'dS'), ('ts', 'ts'), ('dz', 'ds'),
    ('t͡ɕ', 'tS'), ('d͡ʑ', 'dS'), ('tɕ', 'tS'), ('dʑ', 'dS'), ('t͡ʂ', 'tS'), ('d͡ʐ', 'dS'), ('tʂ', 'tS'), ('dʐ', 'dS'),
    ('p', 'p'), ('b', 'b'), ('t', 't'), ('d', 'd'), ('k', 'k'), ('g', 'g'), ('ɡ', 'g'), ('q', 'k'), ('c', 'k'), ('ɟ', 'g'),
    ('m', 'm'), ('ɱ', 'm'), ('n', 'n'), ('ɲ', 'nj'), ('ŋ', 'N'), ('ɴ', 'N'),
    ('f', 'f'), ('v', 'v'), ('ʋ', 'v'), ('β', 'b'), ('ɸ', 'f'), ('θ', 't'), ('ð', 'd'),
    ('s', 's'), ('z', 's'), ('ʃ', 'S'), ('ʒ', 'S'), ('ɕ', 'S'), ('ʑ', 'S'), ('ʂ', 'S'), ('ʐ', 'S'),
    ('x', 'X'), ('χ', 'X'), ('ç', 'X'), ('ɣ', 'g'), ('ʁ', 'r'), ('ħ', 'h'), ('h', 'h'), ('ɦ', 'h'),
    ('r', 'r'), ('ɾ', 'r'), ('ɹ', 'r'), ('ʀ', 'r'), ('ɽ', 'r'), ('ɻ', 'r'), ('ʙ', 'r'),
    ('l', 'l'), ('ɫ', 'l'), ('ʎ', 'l'), ('ɭ', 'l'), ('ʟ', 'l'),
    ('j', 'j'), ('ʝ', 'j'), ('w', 'v'), ('ɥ', 'j'), ('ʍ', 'v'),
]
NASAL = '̃'
DROP = set('ˈˌ.‿ʲʷˠˤʰ̪̥̬̩̯͜ʼ ̚˞ʔʕ-ːˑ')


def strip_marks(tok):
    """Remove stress/diacritics but keep nasalisation and length."""
    d = unicodedata.normalize('NFD', tok)
    nasal = NASAL in d
    long = 'ː' in d or 'ˑ' in d
    base = ''.join(ch for ch in d if not unicodedata.combining(ch) and ch not in DROP)
    return base, nasal, long


def diphthong(base):
    a, b = base[0], base[1]
    if a in 'aɑæä' and b in 'ɪijy':
        return 'A'
    if a in 'aɑæä' and b in 'ʊuw':
        return 'W'
    if a in 'ɔo' and b in 'ɪiyʏj':
        return 'Y'
    if a in 'eɛ' and b in 'ɪij':
        return 'e:'
    if a in 'oə' and b in 'ʊuw':
        return 'o:'
    return None


def ipa_to_code(phones):
    cons, vowels = [''], []
    for tok in phones:
        base, nasal, long = strip_marks(tok)
        if not base:
            continue
        if base[0] in VOWELS:
            v = None
            if len(base) > 1 and base[1] in VOWELS or (len(base) > 1 and base[1] in 'jw'):
                v = diphthong(base)
            if v is None:
                v = VOWELS[base[0]] + (':' if long else '')
            elif long and not v.endswith(':') and v not in 'AYW':
                v += ':'
            vowels.append(v)
            cons.append('N' if nasal else '')
            continue
        i = 0
        while i < len(base):
            for k, c in CONS:
                if base.startswith(k, i):
                    cons[-1] += c
                    i += len(k)
                    break
            else:
                if base[i] in VOWELS:   # vowel inside a consonant token (rare)
                    vowels.append(VOWELS[base[i]])
                    cons.append('')
                i += 1
    if not vowels:
        return None
    out = [cons[0]]
    for v, c in zip(vowels, cons[1:]):
        out += [v, c]
    return '|'.join(out)


# ---------- spelling rules for languages spoken as written ----------
RULES = {
    'tr': [('ç', 'tʃ'), ('ş', 'ʃ'), ('c', 'dʒ'), ('ğ', 'ː'), ('ı', 'ɯ'), ('ö', 'ø'), ('ü', 'y'), ('j', 'ʒ'), ('y', 'j'),
           ('â', 'aː'), ('î', 'iː'), ('û', 'uː')],
    'sq': [('xh', 'dʒ'), ('sh', 'ʃ'), ('zh', 'ʒ'), ('gj', 'ɟ'), ('nj', 'ɲ'), ('ll', 'ɫ'), ('rr', 'r'), ('dh', 'ð'), ('th', 'θ'),
           ('ë', 'ə'), ('ç', 'tʃ'), ('x', 'dz'), ('q', 'c'), ('c', 'ts'), ('y', 'y'), ('j', 'j')],
    'ro': [('che', 'ke'), ('chi', 'ki'), ('ghe', 'ge'), ('ghi', 'gi'), ('ce', 'tʃe'), ('ci', 'tʃi'), ('ge', 'dʒe'), ('gi', 'dʒi'),
           ('ă', 'ə'), ('â', 'ɨ'), ('î', 'ɨ'), ('ș', 'ʃ'), ('ş', 'ʃ'), ('ț', 'ts'), ('ţ', 'ts'), ('x', 'ks'), ('c', 'k'), ('j', 'ʒ')],
    'ku': [('ê', 'eː'), ('î', 'iː'), ('û', 'uː'), ('ç', 'tʃ'), ('ş', 'ʃ'), ('c', 'dʒ'), ('j', 'ʒ'), ('y', 'j'), ('x', 'x'),
           ('i', 'ɪ'), ('e', 'ɛ'), ('u', 'ʊ')],
}


def spell(lang, word):
    w = word.lower()
    if lang == 'ro':
        w = re.sub(r'(?<=[^aeiouăâî])i$', '', w)  # final -i after a consonant is only palatalisation
    out = []
    i = 0
    rules = RULES[lang]
    while i < len(w):
        for k, v in rules:
            if w.startswith(k, i):
                out.append(v)
                i += len(k)
                break
        else:
            out.append(w[i])
            i += 1
    phones = []
    for chunk in out:
        if chunk == 'ː':
            if phones:
                phones[-1] += 'ː'
            continue
        # split multi-letter results into phones the converter understands
        phones.extend([chunk] if chunk in ('tʃ', 'dʒ', 'dz', 'ts') or len(chunk) == 1 or chunk.endswith('ː') else list(chunk))
    return phones


# ---------- word lists ----------
ARABIC_MARKS = re.compile('[ً-ٰٟـ]')


def norm(word, lang):
    w = unicodedata.normalize('NFC', word.strip().lower())
    if lang in ('ar', 'fa'):
        w = ARABIC_MARKS.sub('', w)
    if lang in ('ru', 'uk', 'el', 'bks'):
        w = unicodedata.normalize('NFC', ''.join(ch for ch in unicodedata.normalize('NFD', w) if ch != '́'))
    return w


def good_word(w):
    return len(w) >= 2 and all(ch.isalpha() or ch in "'’" for ch in w) and not any(ch.isdigit() for ch in w)


def load_pron(files, lang):
    """word -> phones. Wiktionary often lists several pronunciations (and acronyms like "CE");
    take the lowercase entry whose length best fits the spelling, which skips stray variants."""
    variants = {}
    for f in files:
        with open(os.path.join(SRC, f + '.tsv'), encoding='utf8') as fh:
            for line in fh:
                parts = line.rstrip('\n').split('\t')
                if len(parts) < 2 or '‿' in parts[1]:
                    continue
                w = norm(parts[0], lang)
                variants.setdefault(w, []).append((parts[0] != parts[0].lower(), parts[1].split(' ')))
    pron = {}
    for w, vs in variants.items():
        if lang in ('ar', 'fa'):   # the script leaves out short vowels, so length says nothing
            pron[w] = min(vs, key=lambda v: v[0])[1]
        else:
            pron[w] = min(vs, key=lambda v: (v[0], abs(len(v[1]) - len(w))))[1]
    return pron


def load_freq(lists, lang, script_ok):
    seen, order = set(), []
    for name in lists:
        path = os.path.join(SRC, name + '_50k.txt')
        with open(path, encoding='utf8') as fh:
            rank = [norm(l.split(' ')[0], lang) for l in fh]
        for i, w in enumerate(rank):
            if good_word(w) and script_ok(w) and w not in seen:
                seen.add(w)
                order.append((i, w))
    order.sort()
    return [w for _, w in order]


LATIN = re.compile(r'^[a-zà-žḃ-ỿ’\']+$', re.I)
SCRIPTS = {
    'ru': re.compile(r'^[а-яё]+$'), 'uk': re.compile(r'^[а-щьюяєіїґ’\']+$'),
    'el': re.compile(r'^[α-ωάέήίόύώϊϋΐΰς]+$'), 'ar': re.compile(r'^[ء-ي]+$'), 'fa': re.compile(r'^[ء-يپچژکگی‌]+$'),
}

total = 0
for lang, (wp_files, freq_lists, rules) in LANGS.items():
    pron = load_pron(wp_files, lang)
    script_ok = SCRIPTS.get(lang, LATIN).match
    words = load_freq(freq_lists, lang, script_ok) if freq_lists else sorted(w for w in pron if good_word(w))
    ranked = len(words) if freq_lists else 0
    rows, from_rules = [], 0
    for w in words:
        phones = pron.get(w)
        if phones is None and rules:
            phones = spell(rules, w)
            from_rules += 1
        if phones is None:
            continue
        code = ipa_to_code(phones)
        if code:
            rows.append(w + '\t' + code)
        if len(rows) >= MAX_WORDS:
            break
    # a word's position is its frequency rank only when the list came from a frequency list
    data = {'ranked': len(rows) if ranked else 0, 'words': '\n'.join(rows)}
    with open(os.path.join(OUT, 'words-' + lang + '.js'), 'w', encoding='utf8') as fh:
        fh.write('// Pronunciations: WikiPron (Wiktionary, CC BY-SA)' + (', spelling rules' if rules else '') +
                 '; word frequency: FrequencyWords (CC BY-SA 4.0). Built by tools/build_langs.py\n')
        fh.write('window.RAIM_LANG_' + lang.upper() + ' = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    total += len(rows)
    print('%-4s %6d words  (%d from rules, %d WikiPron entries)' % (lang, len(rows), from_rules, len(pron)))
print('total', total)
