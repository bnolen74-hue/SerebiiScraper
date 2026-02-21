#!/usr/bin/env python3
"""Serebii dex finder: maps Pokemon species to Serebii pages by generation.

This script uses the PokéAPI to enumerate species by generation (1-9)
and then tries several Serebii URL patterns to discover the site's
per-Pokémon pages. It writes a JSON list with discovered URLs and
optionally saves page HTML files.

Usage examples:
  python serebiiscrape.py --gens 1-2 --out out.json --save-html

"""
import argparse
import json
import os
import time
import unicodedata
from typing import List, Optional

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# optional sqlite helper
try:
    from . import db
except ImportError:
    import db

HEADERS = {
    "User-Agent": "serebii-scraper/1.0 (+https://github.com/)"
}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    for ch in ["'", "\u2019", ".", ",", ":"]:
        s = s.replace(ch, "")
    # keep dashes for joined names, but prefer dash-separated form
    s = s.replace(" ", "-")
    s = s.replace("--", "-")
    s = s.replace("♀", "f")
    s = s.replace("♂", "m")
    s = s.replace("é", "e")
    return s


def name_variants(name: str) -> List[str]:
    """Return plausible Serebii name variants for a species name."""
    base = slugify(name)
    variants = [base]
    # Known special-case mappings where Serebii uses different slugs
    special_mappings = {
        "mr-mime": ["mr-mime", "mrmime"],
        "mr-rime": ["mr-rime", "mrrime"],
        "type-null": ["type-null", "typenull"],
        "jangmo-o": ["jangmo-o", "jangmoo"],
        "hakamo-o": ["hakamo-o", "hakamoo"],
        "kommo-o": ["kommo-o", "kommoo"],
        "tapu-koko": ["tapu-koko", "tapukoko"],
        "tapu-lele": ["tapu-lele", "tapulele"],
        "tapu-bulu": ["tapu-bulu", "tapubulu"],
        "tapu-fini": ["tapu-fini", "tapufini"],
        "ho-oh": ["ho-oh", "hooh"],
        "porygon-z": ["porygon-z", "porygonz"],
    }
    if name in special_mappings:
        variants = special_mappings[name] + variants
    # join-without-dash
    if "-" in base:
        variants.append(base.replace("-", ""))
        # sometimes site uses no gender suffix or different forms
        parts = base.split("-")
        variants.extend(parts)
    # also try capitalized first letter
    variants.append(base.capitalize())
    # try removing vowels occasionally (rare) - keep conservative
    variants = list(dict.fromkeys(variants))
    return variants


def get_species_for_gen(gen: int) -> List[dict]:
    url = f"https://pokeapi.co/api/v2/generation/{gen}/"
    r = requests.get(url, headers=HEADERS, timeout=10)
    r.raise_for_status()
    data = r.json()
    return data.get("pokemon_species", [])


def candidate_urls(name: str) -> List[str]:
    variants = name_variants(name)
    prefixes = [
        "https://www.serebii.net/pokedex-swsh/",
        "https://www.serebii.net/pokedex-sv/",
        "https://www.serebii.net/pokedex-sm/",
        "https://www.serebii.net/pokedex-lgpe/",
        "https://www.serebii.net/pokedex/",
    ]
    urls = []
    for v in variants:
        for p in prefixes:
            urls.append(f"{p}{v}.shtml")
            urls.append(f"{p}{v}/")
    return urls


def find_serebii_page(name: str, session: requests.Session) -> Optional[str]:
    for url in candidate_urls(name):
        try:
            r = session.get(url, headers=HEADERS, timeout=10)
        except Exception:
            continue
        if r.status_code == 200:
            return url
        # some pages return 403 — treat as found but blocked
        if r.status_code in (403, 401):
            return url
    return None


def save_html(url: str, html: str, out_dir: str, name: str):
    fn = f"{slugify(name)}.html"
    path = os.path.join(out_dir, fn)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


def parse_args():
    p = argparse.ArgumentParser(description="Serebii dex URL finder (gens 1-9)")
    p.add_argument("--gens", default="1-9", help="Generation(s) to scrape: e.g. 1,3,1-3,all")
    p.add_argument("--out", default="serebii_index.json", help="Output JSON file")
    p.add_argument("--save-html", action="store_true", help="Save discovered HTML pages")
    p.add_argument("--out-dir", default="serebii_pages", help="Directory for saved HTML pages")
    p.add_argument("--delay", type=float, default=1.0, help="Delay between requests (seconds)")
    p.add_argument("--limit", type=int, default=0, help="Limit number of species per gen (for testing)")
    p.add_argument("--db", help="Path to SQLite database file (will be created/updated)")
    return p.parse_args()


def expand_gens(spec: str) -> List[int]:
    if spec == "all":
        return list(range(1, 10))
    parts = spec.split(",")
    out = []
    for part in parts:
        if "-" in part:
            a, b = part.split("-")
            out.extend(list(range(int(a), int(b) + 1)))
        else:
            out.append(int(part))
    return sorted(set(out))


def init_db(path: str):
    """Create sqlite database with pokemon table if it doesn't exist."""
    import sqlite3

    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pokemon (
            gen INTEGER,
            name TEXT,
            pokeapi_url TEXT,
            serebii_url TEXT,
            PRIMARY KEY(gen,name)
        )
        """
    )
    conn.commit()
    conn.close()


def save_to_db(path: str, entries: List[dict]):
    """Upsert scraped entries into SQLite database."""
    import sqlite3

    conn = sqlite3.connect(path)
    cur = conn.cursor()
    for e in entries:
        cur.execute(
            """
            INSERT INTO pokemon(gen,name,pokeapi_url,serebii_url)
            VALUES(?,?,?,?)
            ON CONFLICT(gen,name) DO UPDATE SET
                pokeapi_url=excluded.pokeapi_url,
                serebii_url=excluded.serebii_url
            """,
            (e.get("gen"), e.get("name"), e.get("pokeapi_url"), e.get("serebii_url")),
        )
    conn.commit()
    conn.close()


def main():
    args = parse_args()
    gens = expand_gens(args.gens)
    session = requests.Session()
    results = []
    if args.save_html:
        os.makedirs(args.out_dir, exist_ok=True)
    if args.db:
        init_db(args.db)

    for gen in gens:
        try:
            species = get_species_for_gen(gen)
        except Exception as e:
            print(f"Failed to fetch generation {gen} from PokéAPI: {e}")
            continue

        if args.limit and args.limit > 0:
            species = species[: args.limit]

        for sp in tqdm(species, desc=f"Gen {gen}"):
            name = sp["name"]
            entry = {"name": name, "gen": gen, "pokeapi_url": sp.get("url")}
            url = find_serebii_page(name, session)
            entry["serebii_url"] = url
            results.append(entry)
            if url and args.save_html:
                try:
                    r = session.get(url, headers=HEADERS, timeout=10)
                    if r.status_code == 200:
                        save_html(url, r.text, args.out_dir, name)
                except Exception:
                    pass
            time.sleep(args.delay)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"Wrote {len(results)} entries to {args.out}")
    if args.db:
        conn = db.connect(args.db)
        db.init_db(conn)
        db.upsert_entries(conn, results)
        print(f"Upserted {len(results)} rows into {args.db}")


if __name__ == "__main__":
    main()

