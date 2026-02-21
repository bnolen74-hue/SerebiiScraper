"""Utility to load a scraped JSON index into a SQLite database.

The schema is intentionally simple:

CREATE TABLE pokemon (
    gen INTEGER,
    name TEXT,
    pokeapi_url TEXT,
    serebii_url TEXT,
    PRIMARY KEY(gen,name)
);

Usage:
    python import_to_sqlite.py --json gen1_3.json --db pokedex.db
"""
import argparse
import json
import sqlite3
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser(description="Import pokedex JSON into SQLite")
    p.add_argument("--json", required=True, help="Input JSON file produced by scraper")
    p.add_argument("--db", default="pokedex.db", help="SQLite database file")
    return p.parse_args()


def main():
    args = parse_args()
    data_path = Path(args.json)
    if not data_path.exists():
        raise FileNotFoundError(f"{args.json} not found")

    conn = sqlite3.connect(args.db)
    cursor = conn.cursor()
    cursor.execute(
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

    with open(data_path, encoding="utf-8") as f:
        entries = json.load(f)

    for ent in entries:
        cursor.execute(
            "INSERT OR REPLACE INTO pokemon (gen,name,pokeapi_url,serebii_url) VALUES (?,?,?,?)",
            (ent.get("gen"), ent.get("name"), ent.get("pokeapi_url"), ent.get("serebii_url")),
        )
    conn.commit()
    print(f"Imported {len(entries)} rows into {args.db}")


if __name__ == "__main__":
    main()
