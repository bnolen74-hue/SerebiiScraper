"""SQLite helper for Serebii dex data.

Provides functions to initialize the database and upsert entries from
scrape JSON. The schema is simple: one table for species, indexed by
name+generation.
"""
import sqlite3
from typing import Iterable, Dict

SCHEMA = """
CREATE TABLE IF NOT EXISTS pokemon (
    gen INTEGER NOT NULL,
    name TEXT NOT NULL,
    pokeapi_url TEXT,
    serebii_url TEXT,
    PRIMARY KEY(gen, name)
);
"""


def connect(db_path: str = "pokedex.db") -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.executescript(SCHEMA)
    conn.commit()


def upsert_entries(conn: sqlite3.Connection, entries: Iterable[Dict]) -> None:
    cur = conn.cursor()
    for e in entries:
        cur.execute(
            """
            INSERT INTO pokemon(gen,name,pokeapi_url,serebii_url)
            VALUES (:gen,:name,:pokeapi_url,:serebii_url)
            ON CONFLICT(gen,name) DO UPDATE SET
                pokeapi_url=excluded.pokeapi_url,
                serebii_url=excluded.serebii_url
            """,
            e,
        )
    conn.commit()


def query_pokemon(conn: sqlite3.Connection, name: str):
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM pokemon WHERE name = ? COLLATE NOCASE", (name,)
    )
    return cur.fetchall()
