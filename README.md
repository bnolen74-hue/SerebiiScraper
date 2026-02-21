# Serebii Scraper

Small utility to find Serebii per-Pokémon pages for generations 1–9 and
optionally populate a SQLite database that your app can query.

Quick start
-----------

1. Create a virtualenv and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Run the scraper (example: Gen 1–3, save to database and JSON):

```bash
python3 serebiiscrape.py --gens 1-3 --out gen1_3.json --db pokedex.db
```

Options
-------
- `--gens`: Generations to scrape (e.g. `1`, `1-3`, `1,4,7`, or `all`) — default `1-9`.
- `--out`: Output JSON filename (default `serebii_index.json`).
- `--db`: Path to a SQLite database file; if provided the script will create/update a table named `pokemon` storing the scraped rows.
- `--save-html`: Save discovered HTML pages to `--out-dir`.
- `--out-dir`: Directory for saved HTML pages (default `serebii_pages`).
- `--delay`: Seconds to sleep between requests (default `1.0`).
- `--limit`: Limit species per generation for testing.

Database & scheduling
---------------------
Run the scraper once with `--db pokedex.db` to populate a local SQLite file.
Subsequent executions will upsert into the same database; you can store the
`.db` in your mobile app or expose it via a small API.

**Dev container note:** if you are working inside the VS Code remote/devcontainer
environment you'll need to forward port 3000 so the host machine and mobile
devices can reach the server. The provided `.devcontainer/devcontainer.json`
already includes:

```json
"forwardPorts": [3000]
```

Rebuild the container (Command Palette → "Remote-Containers: Rebuild").

A simple cron job example (runs daily at 3 AM):

```bash
0 3 * * * cd /path/to/SerebiiScraper && \
  . /path/to/venv/bin/activate && \
  python serebiiscrape.py --gens 1-9 --db pokedex.db --delay 1.0
```

Server
------

If you want to expose the data via HTTP/MCP:

1. Install Node dependencies:
   ```bash
   cd /path/to/SerebiiScraper
   npm install
   ```
2. Make sure `pokedex.db` exists (run the scraper with `--db`).
3. Start the server:
   ```bash
   DB_FILE=pokedex.db npm start
   ```

The server exposes these routes:

- `GET /pokemon/:name` – lookup by name
- `GET /gens/:gen` – list all species in a generation
- `POST /mcp/get-pokemon-data` – MCP tool style, body `{ pokemonName: "bulbasaur" }`

Your mobile app or AI interface can call these endpoints to retrieve
pokédex entries dynamically.

The database schema:

```sql
CREATE TABLE pokemon (
    gen INTEGER,
    name TEXT,
    pokeapi_url TEXT,
    serebii_url TEXT,
    PRIMARY KEY(gen,name)
);
```


Web & mobile clients
---------------------

A simple browser UI is provided under `web/`:

```bash
# start back end first
. venv/bin/activate && uvicorn server_py:app --port 3000 &
# from another shell
python3 -m http.server 8000 --directory web
```

Open `http://localhost:8000` in a browser and you can query names; the
page calls the local API on the same origin.  The simple client will display
sprites, stats, egg moves and the evolution chain by fetching additional
information from the PokéAPI.  You can also click through to the Serebii
page if a URL was found.  Styling mimics a retro Pokédex screen; modify
`web/index.html` and `web/app.js` as desired or port the logic to your
framework of choice.

For an iPhone (or any Expo/React Native) app, the example component in
`ui_example.js` demonstrates the same lookup screen.  To build your own
app:

1. Install Node/npm on your development machine and run `npx expo init
   pokedex-app` (choose a blank template).
2. Copy `ui_example.js` into `pokedex-app/components` (or inline it in
   `App.js`).  Adjust the fetch URLs to point at your server (you may
   need to forward port 3000 from the container).
3. Run `cd pokedex-app && npm start` and follow Expo's instructions to
   run on a simulator or a physical iPhone via the Expo Go app.
4. The `PokedexScreen`, `PokemonLookup`, and `ExampleSearch` components
   can be reused directly; they rely only on `fetch` and `react-native`
   primitives.

The same technique works for Android or a progressive web app.

License
-------

License
-------
Use at your own risk. This is a small utility script.

