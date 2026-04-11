#!/bin/bash
cd /home/node/.openclaw/workspace/projects/duck-dive/sales-reports

echo "📊 Generating report..."
node daily-kpi-report.js --output-dir reports

if [ ! -f reports/latest-meta.json ]; then
  echo "❌ Error: Metadata not found"
  exit 1
fi

META=$(cat reports/latest-meta.json)
SUBJECT=$(echo "$META" | jq -r '.subject')
DATE_STR=$(date '+%A %d %B %Y')
CONSIDERATIONS="<p><strong>📈 Trend:</strong> Monitorare i numeri di questa settimana. Report completo domenica mattina.</p>"

EMAIL_BODY="<!DOCTYPE html><html lang='it'><head><meta charset='UTF-8'><style>body { font-family: sans-serif; background: #f5f5f5; padding: 20px; } .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); } .header { background: #1e1b4b; color: white; padding: 30px 20px; text-align: center; } .content { padding: 30px 20px; } .cta-button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; } .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; }</style></head><body><div class='container'><div class='header'><h1>📊 Duck Dive Sales Report</h1><p>$DATE_STR</p></div><div class='content'><p>Buongiorno Team,</p><p>Il report è pronto. <strong>Vedi i dettagli</strong>:</p><center><a href='https://duck-dive-report.surge.sh/' class='cta-button'>📈 Visualizza Report Completo</a></center>$CONSIDERATIONS<p>Grazie,<br><strong>Eva</strong> 🌿</p></div><div class='footer'><p>Report automatico generato da Duck Dive Sales Report</p></div></div></body></html>"

echo "📧 Sending to team..."
gog gmail send --account eva@womix.io --to "daniele.scaglia@womix.io,giuseppe.langella@duckdivegin.com,mella.federico@gmail.com,marco.biasibetti@gmail.com" --subject "$SUBJECT" --body-html "$EMAIL_BODY" -y
