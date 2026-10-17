#!/usr/bin/env python3
"""Builds the word data files in js/ from the downloaded sources.

Sources (download into one folder, pass it as the first argument):
  wortliste.txt       github.com/davidak/wortliste
  cmudict.dict        github.com/cmusphinx/cmudict (BSD-style license)
  en_50k.txt, de_50k.txt   github.com/hermitdave/FrequencyWords (CC BY-SA 4.0)
  openthesaurus.txt   openthesaurus.de/export/OpenThesaurus-Textversion.zip (LGPL)
"""
import json, os, re, sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js')
ALPHA = re.compile(r'^[A-Za-zÄÖÜäöüß]{2,}$')


def freq(name):
    ranks = {}
    with open(os.path.join(src, name), encoding='utf8') as f:
        for line in f:
            w = line.split(' ')[0].strip().lower()
            if w and w not in ranks:
                ranks[w] = len(ranks)
    return ranks


def write_js(name, var, value, comment):
    with open(os.path.join(out, name), 'w', encoding='utf8') as f:
        f.write('// ' + comment + '\n')
        f.write('window.' + var + ' = ' + json.dumps(value, ensure_ascii=False) + ';\n')


de_rank, en_rank = freq('de_50k.txt'), freq('en_50k.txt')

# German: drop common English words that German texts don't use ("Age", "Language"),
# then put the frequent words first so their index doubles as frequency rank.
words = []
for w in open(os.path.join(src, 'wortliste.txt'), encoding='utf8').read().split():
    if not ALPHA.match(w) or re.match(r'^[A-ZÄÖÜ]{2,}$', w):
        continue
    l = w.lower()
    if en_rank.get(l, 1e9) < 30000 and l not in de_rank:
        continue
    words.append(w)
words = sorted(set(words))
ranked = sorted((w for w in words if w.lower() in de_rank), key=lambda w: (de_rank[w.lower()], w))
seen = set(ranked)
rest = [w for w in words if w not in seen]
write_js('words.js', 'RAIM_WORDS', {'ranked': len(ranked), 'words': '\n'.join(ranked + rest)},
         'German word list: github.com/davidak/wortliste, ordered by frequency (FrequencyWords, CC BY-SA 4.0)')
print('de words', len(words), 'ranked', len(ranked))

# English: frequent words with a CMU pronunciation, in frequency order
pron = {}
for line in open(os.path.join(src, 'cmudict.dict'), encoding='utf8'):
    line = line.split('#')[0].strip()
    if not line:
        continue
    word, phones = line.split(' ', 1)
    if '(' in word:
        continue
    pron.setdefault(word, phones)
en = [w for w in sorted(en_rank, key=en_rank.get) if re.match(r'^[a-z]{2,}$|^[ai]$', w) and w in pron]
write_js('words-en.js', 'RAIM_WORDS_EN', '\n'.join(w + ' ' + pron[w] for w in en),
         'English pronunciations: CMU Pronouncing Dictionary (BSD), words from FrequencyWords (CC BY-SA 4.0)')
print('en words', len(en))

# German thesaurus: one synonym set per line, without usage notes like "(ugs.)"
sets = []
for line in open(os.path.join(src, 'openthesaurus.txt'), encoding='utf8'):
    if line.startswith('#'):
        continue
    terms = []
    for t in line.strip().split(';'):
        t = re.sub(r'\s*\([^)]*\)\s*', ' ', t).strip()
        if t and not t.endswith('...') and not t.startswith('...') and len(t) < 40:
            terms.append(t)
    if len(terms) > 1:
        sets.append(';'.join(dict.fromkeys(terms)))
write_js('thesaurus-de.js', 'RAIM_THES_DE', '\n'.join(sets), 'German synonyms: OpenThesaurus (openthesaurus.de, LGPL)')
print('thesaurus sets', len(sets))
