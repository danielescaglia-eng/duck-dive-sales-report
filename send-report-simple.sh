#!/bin/bash
# Duck Dive Sales Report — Simple Email Friendly Template
REPO_DIR="/home/node/.openclaw/workspace/projects/duck-dive/sales-reports"
REPORT_DIR="$REPO_DIR/reports"
RECIPIENTS="daniele.scaglia@womix.io"

# 1. Genera i dati (aggiorna latest-meta.json)
cd "$REPO_DIR"
node daily-kpi-report.js --output-dir "$REPORT_DIR"

# 1b. Forza aggiornamento index.html per GitHub Pages
cp "$REPORT_DIR/latest.html" "$REPO_DIR/index.html"

# 2. Leggi i dati dal JSON
META=$(cat "$REPORT_DIR/latest-meta.json")
SUBJECT=$(echo "$META" | jq -r '.subject')
BEPPE_FR=$(echo "$META" | jq -r '.agents[] | select(.name=="Beppe") | .fR')
DIMITRI_FR=$(echo "$META" | jq -r '.agents[] | select(.name=="Dimitri Gennuso") | .fR')
BEPPE_VN=$(echo "$META" | jq -r '.agents[] | select(.name=="Beppe") | .vN')
DIMITRI_VN=$(echo "$META" | jq -r '.agents[] | select(.name=="Dimitri Gennuso") | .vN')

# 3. Crea il corpo della mail in HTML semplice (niente JS)
read -r -d '' EMAIL_BODY << EOF
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #333; line-height: 1.6;">
    <div style="max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <h2 style="color: #1e1b4b;">📊 Duck Dive Sales Report</h2>
        <p>Buongiorno Daniele, ecco i dati aggiornati estratti dal CRM:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f8fafc;">
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Agente</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Visite Nuove</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Fatturato Riordini</th>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">Beppe</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">$BEPPE_VN</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">€ $BEPPE_FR</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">Dimitri</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">$DIMITRI_VN</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">€ $DIMITRI_FR</td>
            </tr>
        </table>

        <div style="text-align: center; margin: 30px 0;">
            <a href="https://dashboard.duckdive.surf/" 
               style="background: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
               📈 Visualizza Report Online
            </a>
        </div>

        <p style="font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px;">
            Nota: Se il link non mostra i dati di oggi, attendi qualche minuto per l'aggiornamento della cache di Surge.
        </p>
    </div>
</body>
</html>
EOF

# 4. Invia l'email — DISABILITATO
echo "✅ Report generato localmente (invio email disabilitato)"
# gog gmail send --account eva@womix.io --to "$RECIPIENTS" --subject "$SUBJECT" --body-html "$EMAIL_BODY" -y

# 5. Push su GitHub per innescare (si spera) l'aggiornamento Surge
git add reports/latest.html reports/latest-meta.json index.html
git commit -m "Auto-update report $(date)"
git push origin master:main
