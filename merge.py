#!/usr/bin/env python3
"""Neue Objekte (Schema dealnodeal/1) in data.json zusammenführen.

  python3 merge.py NEW.json [--stand STAND] [--dry-run] [--push] [--allow-warnings]

- prüft NEW.json (Pflichtfelder, Zahlen, URLs, keine Kontakt-/Personendaten)
- bestehende Objekte bleiben unverändert; Duplikate (gleiche id, Exposé- oder ImmoMetrica-URL) werden übersprungen
- neue Objekte werden angehängt, `stand` wird hochgesetzt (die App lädt data.json neu, sobald stand/Anzahl sich ändern;
  Swipes hängen an der id und bleiben erhalten)
- committet lokal; mit --push auch pushen
Abbruch (Exit 2) bei Fehlern; Exit 3 bei Warnungen ohne --allow-warnings (dann wird nichts geschrieben).
"""
import json, re, sys, subprocess, argparse, datetime, os
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data.json')
FIELDS = ['id','typ','ort','plz','titel','preis','wfl','we','baujahr','zustand','mieteJahr','brutto','faktor','preisQm',
          'netto','score','expose','immometrica','linkstatus','privat','makler','land']
NUM = ['preis','wfl','we','baujahr','mieteJahr','brutto','faktor','preisQm','netto','score','makler']
HOSTS = {'immometrica.com','immobilienscout24.de','immowelt.de','immonet.de','kleinanzeigen.de','ohne-makler.net',
         'immobilien.sparkasse.de','markt.de','regionalimmobilien24.de','wohnungsboerse.net','zvg-portal.de','zvg24.net'}
PII = [(r'[\w.+-]+@[\w-]+\.[\w.]+', 'E-Mail-Adresse'),
       (r'(?:\+49|\b0)\s?\d{2,5}[\s/-]?\d{3,}[\s-]?\d{0,6}', 'Telefonnummer'),
       (r'\b(?:Herr|Frau|Hr\.|Fr\.)\s+[A-ZÄÖÜ][a-zäöüß]+', 'Personenname'),
       (r'\b[A-ZÄÖÜ][a-zäöüß-]+(?:straße|strasse|str\.|weg|gasse|allee|platz|ring)\s+\d+', 'Straßenadresse'),
       (r'\b(?:Tel|Telefon|Mobil|WhatsApp|Kontakt)\b', 'Kontaktangabe')]

def norm(u):
    if not u: return ''
    p = urlsplit(str(u).strip())
    return (p.netloc.lower().removeprefix('www.') + p.path.rstrip('/')).lower()

def imid(u):
    m = re.search(r'immometrica\.com/(?:[a-z]{2}/)?offer/(\d+)', u or '')
    return 'im:' + m.group(1) if m else None

def check(x, i, err, warn):
    tag = f"#{i} {x.get('id') or x.get('expose') or '?'}"
    for k in x:
        if k not in FIELDS and k != 'mieteMonat': warn.append(f'{tag}: unbekanntes Feld „{k}“ wird verworfen')
    for k in NUM:
        if k in x and x[k] is not None and not (isinstance(x[k], (int, float)) and not isinstance(x[k], bool)):
            err.append(f'{tag}: {k} ist keine Zahl ({x[k]!r})')
    if not isinstance(x.get('preis'), (int, float)) or x['preis'] <= 0: err.append(f'{tag}: preis fehlt/ungültig')
    mj = x.get('mieteJahr'); mm = x.get('mieteMonat')
    if mj is None and isinstance(mm, (int, float)): mj = x['mieteJahr'] = mm * 12
    if not isinstance(mj, (int, float)) or mj < 0: err.append(f'{tag}: mieteJahr fehlt/ungültig')
    elif isinstance(mm, (int, float)) and abs(mm * 12 - mj) > 12: warn.append(f'{tag}: mieteMonat×12 ≠ mieteJahr')
    if not (x.get('expose') or x.get('immometrica')): err.append(f'{tag}: kein Link')
    for k in ('expose', 'immometrica'):
        u = x.get(k)
        if not u: continue
        p = urlsplit(u)
        if p.scheme != 'https' or not p.netloc: err.append(f'{tag}: {k} ist keine https-URL')
        elif not any(p.netloc.lower().removeprefix('www.').endswith(h) for h in HOSTS): warn.append(f'{tag}: unbekannter Anbieter-Host {p.netloc}')
        if p.query and re.search(r'(token|session|sid|user|mail)=', p.query, re.I): err.append(f'{tag}: {k} enthält Sitzungs-/Nutzerparameter')
    if x.get('typ') not in ('MFH', 'ETW', 'Haus'): err.append(f'{tag}: typ muss MFH, Haus oder ETW sein')
    if x.get('plz') and not re.fullmatch(r'\d{5}', str(x['plz'])): err.append(f'{tag}: plz ungültig')
    if x.get('land') and x['land'] not in ('SN', 'ST', 'TH'): err.append(f'{tag}: land ungültig')
    if x.get('linkstatus') and x['linkstatus'] not in ('ok', 'swap', 'blk', 'im'): warn.append(f'{tag}: linkstatus unbekannt')
    if isinstance(x.get('preis'), (int, float)) and isinstance(mj, (int, float)) and x['preis'] > 0:
        br = mj / x['preis'] * 100
        if isinstance(x.get('brutto'), (int, float)) and abs(br - x['brutto']) > 0.2: warn.append(f'{tag}: brutto {x["brutto"]} passt nicht zu Miete/Preis ({br:.2f})')
        if br > 15: warn.append(f'{tag}: Bruttorendite {br:.1f} % > 15 % (unplausibel?)')
    for k, v in x.items():
        if isinstance(v, str) and k not in ('expose', 'immometrica'):
            for rx, what in PII:
                if re.search(rx, v): err.append(f'{tag}: {k} enthält evtl. {what}: „{v[:80]}“')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('new'); ap.add_argument('--stand'); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--push', action='store_true'); ap.add_argument('--allow-warnings', action='store_true')
    a = ap.parse_args()
    new = json.load(open(a.new, encoding='utf-8')); base = json.load(open(DATA, encoding='utf-8'))
    if isinstance(new, dict) and new.get('schema') not in (None, 'dealnodeal/1'): sys.exit(f'Unbekanntes Schema {new.get("schema")}')
    L = new['listings'] if isinstance(new, dict) else new
    err, warn = [], []
    for i, x in enumerate(L): check(x, i, err, warn)
    ids, links = {x['id'] for x in base['listings']}, set()
    for x in base['listings']: links |= {norm(x.get('expose')), norm(x.get('immometrica'))}
    links.discard('')
    add, dup = [], []
    HOUSE = re.compile(r'haus|villa|\bMFH\b|\bZFH\b|\bDHH\b|Wohneinheiten|\bWE\b|Familien|Gewerbe|Renditeobjekt', re.I)
    def tnorm(t): return re.sub(r'[^a-z0-9äöüß]+', ' ', str(t or '').lower()).strip()
    seen = {(b.get('ort'), b.get('preis')): b for b in base['listings']}
    seent = {tnorm(b.get('titel')): b for b in base['listings'] if len(tnorm(b.get('titel'))) > 15}
    for x in L:
        tag = x.get('id') or x.get('expose')
        if x.get('typ') == 'ETW' and (HOUSE.search(str(x.get('titel', ''))) or (x.get('wfl') or 0) > 180):
            warn.append(f'{tag}: als ETW geliefert, wirkt aber wie ein Haus/MFH („{str(x.get("titel"))[:60]}“, {x.get("wfl")} m²)')
        b = seen.get((x.get('ort'), x.get('preis'))) or seent.get(tnorm(x.get('titel')))
        if b and b['id'] != x.get('id'):
            warn.append(f'{tag}: wahrscheinlich dasselbe Objekt wie {b["id"]} ({b.get("typ")}, {b.get("ort")}, {b.get("preis")} €) – andere Inserat-Nr.')
    for x in L:
        x = {k: v for k, v in x.items() if k in FIELDS}
        x['id'] = str(x.get('id') or imid(x.get('immometrica')) or imid(x.get('expose')) or x.get('expose'))
        ls = {norm(x.get('expose')), norm(x.get('immometrica'))} - {''}
        if x['id'] in ids or (ls & links): dup.append(x['id']); continue
        ids.add(x['id']); links |= ls; add.append(x)
    print(f'Datei: {len(L)} Objekte · neu: {len(add)} · Duplikate: {len(dup)}' + (f' ({", ".join(dup[:10])}{" …" if len(dup) > 10 else ""})' if dup else ''))
    for w in warn: print('WARNUNG', w)
    for e in err: print('FEHLER ', e)
    if err: print('Abbruch: Fehler in den Daten, nichts geschrieben.'); sys.exit(2)
    if warn and not a.allow_warnings: print('Abbruch: Warnungen vorhanden (mit --allow-warnings trotzdem übernehmen), nichts geschrieben.'); sys.exit(3)
    if not add: print('Nichts Neues.'); return
    stand = a.stand or (new.get('stand') if isinstance(new, dict) else None) or datetime.date.today().isoformat()
    if stand <= str(base.get('stand', '')): stand = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    if stand <= str(base.get('stand', '')): sys.exit(f'stand {stand} ist nicht neuer als {base.get("stand")}')
    out = dict(base); out['stand'] = stand; out['listings'] = base['listings'] + add
    cnt = {t: sum(1 for x in out['listings'] if x.get('typ') == t) for t in ('MFH', 'Haus', 'ETW')}
    print(f'stand: {base.get("stand")} → {stand} · gesamt {len(out["listings"])} ({cnt["MFH"]} MFH, {cnt["Haus"]} Haus, {cnt["ETW"]} ETW)')
    if a.dry_run: print('Probelauf: nichts geschrieben.'); return
    json.dump(out, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    git = lambda *c: subprocess.run(['git', '-C', HERE, *c], check=True)
    git('add', 'data.json')
    git('-c', 'user.name=janik2107', '-c', 'user.email=janik2107@users.noreply.github.com', 'commit', '-q', '-m', f'Daten: +{len(add)} Objekte (stand {stand})')
    print('Lokal committet.')
    if a.push: git('push', '-q'); print('Gepusht.')

if __name__ == '__main__': main()
