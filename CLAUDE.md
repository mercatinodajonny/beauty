# BeautyApp — Istruzioni di lavoro

## Flusso obbligatorio per OGNI modifica al codice

1. **Backup prima di modificare**: copia il file che sto per cambiare in `backups/` con timestamp,
   es. `backups/App.2026-06-18_14-30.jsx`. Non sovrascrivere mai backup esistenti.
2. **Applica la modifica** richiesta.
3. **Build + deploy**: esegui `npx vite build --base=/beauty/` e pubblica `dist/` sul branch `gh-pages`
   (così la preview su https://mercatinodajonny.github.io/beauty/ si aggiorna).
4. **Push del sorgente** sul branch di lavoro.

## Ripristino
Se l'utente dice "torna alla versione precedente" / "annulla", ripristina l'ultimo file da `backups/`.

## Note repo
- App principale: `src/App.jsx` (file unico, mantenuto dal collaboratore; include mappe Leaflet/OSM).
- Non committare mai `.env.local`.
- Lingua: rispondere sempre in italiano.
- `git push` diretto può essere bloccato: in tal caso usare gli strumenti GitHub MCP per pushare.
