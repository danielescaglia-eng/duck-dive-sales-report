#!/bin/bash
# Duck Dive Sales Report — Double Wave Delivery (Dane first, then Team)
REPO_DIR="/home/node/.openclaw/workspace/projects/duck-dive/sales-reports"
REPORT_DIR="/home/node/.openclaw/workspace/public/duck-dive"
DANE_EMAIL="daniele.scaglia@womix.io"
TEAM_EMAILS="daniele.scaglia@womix.io,giuseppe.langella@duckdivegin.com,mella.federico@gmail.com,marco.biasibetti@gmail.com"

# 1. NON rigenerare i dati qui per evitare conflitti con il push notturno.
# I dati vengono generati e pushati dal cron job delle 02:00.
# Qui leggiamo solo l'ultima versione disponibile localmente.
cd "$REPO_DIR"

# 2. Leggi i dati dal JSON (aggiornato dal cron notturno)
META=$(cat "$REPORT_DIR/latest-meta.json")
SUBJECT=$(echo "$META" | jq -r '.subject')
BEPPE_FR=$(echo "$META" | jq -r '.agents[] | select(.name=="Beppe") | .fR')
DIMITRI_FR=$(echo "$META" | jq -r '.agents[] | select(.name=="Dimitri Gennuso") | .fR')
BEPPE_VN=$(echo "$META" | jq -r '.agents[] | select(.name=="Beppe") | .vN')
DIMITRI_VN=$(echo "$META" | jq -r '.agents[] | select(.name=="Dimitri Gennuso") | .vN')

# 3. Crea il corpo della mail in HTML semplificato
read -r -d '' EMAIL_BODY << EOF
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #333; line-height: 1.6;">
    <div style="max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <h2 style="color: #1e1b4b;">📊 Duck Dive Sales Report</h2>
        <p>Buongiorno, ecco i dati aggiornati estratti dal CRM:</p>
        
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
            <a href="http://187.77.93.30:8085/latest.html" 
               style="background: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
               📈 Visualizza Report Online
            </a>
        </div>
    </div>
</body>
</html>
EOF

# 4. Invia l'email a tutto il team (incluso Dane)
echo "📧 Invio report a tutto il team..."
gog gmail send --account eva@womix.io --to "$TEAM_EMAILS" --subject "$SUBJECT" --body-html "$EMAIL_BODY" -y

# 5. Rimosso push da qui, ora gestito dal cron job dedicato delle 02:00
exit 0
