# Medium → dev.to Autopublisher

Automaticky cross-postuje nové Medium články na dev.to po jejich publikaci.

## Jak to funguje

- Render.com Cron Job běží v pondělí, středu a pátek ve 14:00, 16:00 a 18:00 UTC
- Skript načte Medium RSS feed a porovná s Notion databází
- Nové články publikuje na dev.to s canonical URL na Medium
- Uloží záznam do Notion (title, Medium URL, dev.to URL, datum, status)
- Pošle push notifikaci přes ntfy.sh

## Setup

### 1. Notion databáze

Vytvoř novou databázi v Notion s těmito sloupci:
- `Name` (Title)
- `Medium URL` (URL)
- `Dev.to URL` (URL)
- `Published At` (Date)
- `Status` (Select: Published / Error)

Zkopíruj ID databáze z URL: `notion.so/workspace/[DATABASE_ID]?v=...`

### 2. Notion Integration Token

1. Jdi na https://www.notion.so/my-integrations
2. Vytvoř novou integraci "Medium Autopublish"
3. Zkopíruj "Internal Integration Token"
4. V Notion databázi klikni na ••• → Connections → přidej svou integraci

### 3. Dev.to API klíč

Již vytvořen: `uaKJkF8BGywXsKgJDyCjKwXe`
(uloženo v dev.to Settings → Extensions)

### 4. Ntfy.sh topic

1. Stáhni app ntfy.sh do mobilu (iOS/Android, zdarma)
2. Zvol si unikátní název topicu, např. `daniel-medium-abc123`
   ⚠️ Topic je veřejný — použij náhodný string aby ho nikdo neguessoval
3. V appce přidej subscription na svůj topic

### 5. GitHub repository

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/medium-to-devto.git
git push -u origin main
```

### 6. Render.com

1. Jdi na https://dashboard.render.com
2. New → Cron Job
3. Připoj GitHub repo
4. Render automaticky načte `render.yaml`
5. Přidej Environment Variables v dashboardu:
   - `DEVTO_API_KEY`
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
   - `NTFY_TOPIC`

## Lokální testování

```bash
cp .env.example .env
# Vyplň hodnoty v .env
npm install
node index.js
```
