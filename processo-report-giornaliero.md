# Processo: Report KPI Giornaliero Duck Dive

## Panoramica

Report automatico giornaliero che estrae i KPI di vendita dal Google Sheet "CRM Duck Dive"
e genera un'email HTML formattata pronta per l'invio.

## Fonte Dati

- **Google Sheet**: CRM Duck Dive
- **Sheet ID**: `13kGrvnOMhQL264pLBBrZMEBIjKPfPXzZ30le21_ho2g`
- **Tab**: Weekly KPI (gid=1062058428)
- **URL CSV**: `https://docs.google.com/spreadsheets/d/13kGrvnOMhQL264pLBBrZMEBIjKPfPXzZ30le21_ho2g/export?format=csv&gid=1062058428`

## Esecuzione

### Generare il report

```bash
cd /Users/danielescaglia/Desktop/Claude\ Code
node scripts/daily-kpi-report.js
```

### Output

Lo script genera 3 file in `docs/reports/`:

| File | Descrizione |
|------|-------------|
| `daily-kpi-YYYY-MM-DD.html` | Report HTML del giorno (archivio) |
| `latest.html` | Ultimo report generato (sovrascrive) |
| `latest-meta.json` | Metadata JSON con subject, destinatari, scores |

### Output JSON (per integrazione programmatica)

```bash
node scripts/daily-kpi-report.js --stdout
```

Restituisce un JSON con campi `subject` e `html` pronti per l'invio email.

## Istruzioni per OpenClaw

### Step 1: Genera il report

Esegui lo script Node.js:

```bash
node /Users/danielescaglia/Desktop/Claude\ Code/scripts/daily-kpi-report.js
```

### Step 2: Leggi il metadata

Leggi il file `docs/reports/latest-meta.json` per ottenere:
- `subject`: oggetto dell'email
- `agents`: lista agenti con score KPI

### Step 3: Leggi il contenuto HTML

Leggi il file `docs/reports/latest.html` — questo e' il body HTML dell'email.

### Step 4: Invia l'email

Invia l'email con:
- **To**: [DESTINATARI DA CONFIGURARE]
- **Subject**: il valore di `subject` dal metadata
- **Body (HTML)**: il contenuto di `latest.html`
- **Content-Type**: `text/html; charset=utf-8`

## Destinatari

> Da configurare. Aggiungere gli indirizzi email nel file `latest-meta.json`
> nel campo `recipients` o passarli come parametro.

## Schedule

- **Frequenza**: Giornaliero
- **Orario**: 07:00 (ora locale, CET/CEST)
- **Giorni**: Lunedi-Venerdi (giorni lavorativi)

## Contenuto del Report

### Sezioni

1. **Scorecard Agenti** — KPI% complessivo con semaforo (verde/giallo/rosso)
2. **Dettaglio KPI** — 6 metriche per agente con target e actual
3. **Venduto Settimana per Settimana** — Progressione fatturato con barre
4. **Canali di Vendita** — Breakdown per canale (Horeca, Distributori, etc.)
5. **Alert** — Segnalazioni automatiche su performance critiche

### KPI Tracciati

| KPI | Peso | Target Mensile |
|-----|------|----------------|
| Visite nuovi clienti | 5% | 60 |
| Conversione nuovi clienti | 10% | 8 |
| Visite clienti attivi | 5% | 90 |
| Conversione clienti attivi | 10% | 40 |
| Fatturato nuovi | 35% | €800 |
| Fatturato riordini | 35% | €7.000-€9.000 |

### Agenti

- Beppe
- Dimitri Gennuso
- Luca Vallini

## Troubleshooting

- **CSV non raggiungibile**: Verificare che il Google Sheet sia condiviso con "Chiunque con il link"
- **Dati vuoti**: Lo script logga il numero di righe e agenti trovati — controllare il CSV raw
- **Formato numeri**: Lo script gestisce formattazione italiana (€ 1.234,56)
