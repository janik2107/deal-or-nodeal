# Deal or NoDeal

Installierbare iPhone-Web-App (PWA) zum Bewerten von Renditeobjekten im Tinder-Stil:
nach **rechts** wischen = Deal, nach **links** = NoDeal, ↶ = rückgängig.

**App:** https://janik2107.github.io/deal-or-nodeal/ → in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

- Pro Karte: Eckdaten, Miete pro Monat und Jahr, Bruttorendite, Faktor, Kreditrechnung (Annuität), Cashflow, Eigenkapital für die Kaufnebenkosten, Links zum Exposé und zu ImmoMetrica.
- Oben einstellbar: Finanzierung 100/90/80 %, Zins, Laufzeit, Sortierung (Score, Cashflow, Rendite).
- Swipes werden dauerhaft im Gerät gespeichert (localStorage). Unter „Deals“ gibt es Deals und NoDeals, Export als CSV oder Text, unter „Mehr“ das Zurücksetzen.
- Funktioniert offline (Service Worker). Es gibt keinen Server und kein Konto, und die Daten verlassen das Gerät nicht.

## Annahmen der Rechnung

| Posten | Annahme |
|---|---|
| Darlehen | Kaufpreis × Finanzierungsanteil (Standard 100 %) |
| Rate | Annuität `K·r / (1 − (1+r)^−n)`, r = Zins/12, n = Jahre·12 (Standard 5 %, 30 J.) |
| Bewirtschaftung | 20 % der Ist-Miete |
| Cashflow | Ist-Miete/Monat − Rate − Bewirtschaftung (vor Steuern) |
| Grunderwerbsteuer | Sachsen 5,5 %, Sachsen-Anhalt 5,0 % (PLZ 06…) bzw. Feld `land` |
| Notar & Grundbuch | 2,0 % |
| Makler | 3,57 %, 0 % wenn `privat: true`, oder eigener Wert im Feld `makler` |
| Eigenkapital | Kaufnebenkosten + nicht finanzierter Kaufpreisanteil |

## Daten liefern: `data.json`

Die App lädt beim Start `data.json` aus diesem Repo. Neue Daten lassen sich auf zwei Wegen einspielen:

1. `data.json` im Repo ersetzen. Die App übernimmt die Datei beim nächsten Öffnen, sobald sich `stand` oder die Anzahl der Objekte geändert hat.
2. In der App unter **Mehr → Daten importieren (JSON)** eine Datei im gleichen Format wählen.

Es wird immer **zusammengeführt** und nie ersetzt:

- Objekte werden über ihre stabile `id` erkannt. Ersatzweise gilt ein gleicher `expose`- oder `immometrica`-Link als dasselbe Objekt.
- Bekannte Objekte werden aktualisiert, neue kommen hinzu.
- Bereits gewischte Objekte behalten ihre Bewertung.

### Schema

```json
{
  "schema": "dealnodeal/1",
  "stand": "2026-11-04",
  "quelle": "Text, optional",
  "listings": [
    {
      "id": "im:23410838",
      "typ": "MFH",
      "ort": "Torgau",
      "plz": "04860",
      "titel": "Mehrfamilienhaus mit 7 Einheiten …",
      "preis": 419000,
      "wfl": 553,
      "we": 7,
      "baujahr": 1900,
      "zustand": "Saniert",
      "mieteJahr": 52428,
      "brutto": 12.5,
      "faktor": 8.0,
      "preisQm": 758,
      "netto": 9.0,
      "score": 82,
      "expose": "https://…",
      "immometrica": "https://www.immometrica.com/de/offer/23410838",
      "linkstatus": "ok",
      "privat": false,
      "makler": 3.57,
      "land": "SN"
    }
  ]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | empfohlen | Stabile ID. Fehlt sie, wird sie gebildet: `im:<ImmoMetrica-Offer-Nr.>`, sonst der Exposé-Link. |
| `typ` | – | `MFH` (Standard) oder `ETW` |
| `preis` | ja | Kaufpreis in € |
| `mieteJahr` | ja | Ist-Jahresnettokaltmiete in €. Alternativ `mieteMonat`, das wird ×12 gerechnet. |
| `expose` / `immometrica` | mind. einer | Links zum Inserat. Bei gleichem Link wird nur ein Knopf gezeigt. |
| `brutto`, `faktor`, `preisQm` | – | Fehlen sie, werden sie aus Preis, Miete und Fläche berechnet. |
| `netto`, `score` | – | Grobe Nettorendite in % und Score (0–100, für die Sortierung) |
| `ort`, `plz`, `titel`, `wfl`, `we`, `baujahr`, `zustand` | – | Eckdaten |
| `linkstatus` | – | `ok`, `swap` (Original offline, Link zeigt auf ImmoMetrica), `blk` (Portal blockt die Prüfung), `im` |
| `privat` | – | `true` = Privatanbieter, also kein Makler |
| `makler` | – | Eigener Maklersatz in % (überschreibt die Annahme) |
| `land` | – | `SN`, `ST` oder `TH` für die Grunderwerbsteuer. Ohne Angabe gilt: PLZ 06… = ST, sonst SN. |

Statt des Objekts mit `listings` kann die Datei auch direkt eine Liste von Objekten enthalten.

## Technik

Reines HTML, CSS und JavaScript ohne Build-Schritt: `index.html`, `styles.css`, `app.js`, `sw.js` (Cache-Version `VERSION`), `manifest.json`, `data.json`.
Die Version steht als `VERSION` in `app.js` und `sw.js` und ist beim Ändern in beiden Dateien hochzuzählen.

## Neue Daten zusammenführen (`merge.py`)

```
python3 merge.py NEW.json --dry-run          # nur prüfen
python3 merge.py NEW.json                    # prüfen, zusammenführen, lokal committen
python3 merge.py NEW.json --push             # … und pushen
```

Das Skript prüft zuerst die Daten:
- Pflichtfelder, Zahlen und https-Links müssen stimmen.
- Kontaktdaten (E-Mail, Telefon, Namen, Straßen) dürfen nicht enthalten sein.
- Auffällige Objekte werden gemeldet: unplausible Rendite, Häuser, die als ETW geliefert wurden, und dasselbe Objekt unter anderer Inserat-Nr.

Danach führt es zusammen:
- Bestehende Objekte bleiben unverändert.
- Duplikate (gleiche `id`, Exposé- oder ImmoMetrica-URL) werden übersprungen.
- Neue Objekte werden angehängt und `stand` hochgesetzt.

Exit-Codes:

| Code | Bedeutung |
|---|---|
| 2 | Fehler, es wird nichts geschrieben |
| 3 | Warnungen, es wird nichts geschrieben. Mit `--allow-warnings` werden die Daten trotzdem übernommen. |
