"""Simple FastAPI service exposing pokedex data from SQLite.

Usage:
    uvicorn server_py:app --reload

Environment variables:
    DB_FILE - SQLite database path (default pokedex.db)
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import sqlite3
from typing import Optional, List, Dict
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

DB_FILE = os.environ.get("DB_FILE", "pokedex.db")

GBA_SCOPE_REGIONS = {
    "kanto": "Kanto (FireRed/LeafGreen)",
    "sevii": "Sevii Islands (FireRed/LeafGreen)",
    "hoenn": "Hoenn (Ruby/Sapphire/Emerald)",
}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/pokemon/{name}")
def read_pokemon(name: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pokemon WHERE lower(name)=?", (name.lower(),))
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    return dict(row)


@app.get("/pokemon/{name}/locations")
def read_pokemon_locations(name: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pokemon WHERE lower(name)=?", (name.lower(),))
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="not found")

    entry = dict(row)
    serebii_url = entry.get("serebii_url")
    if not serebii_url:
        return {"name": entry.get("name", name), "locations": []}

    try:
        resp = requests.get(
            serebii_url,
            timeout=12,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; SerebiiScraper/1.0)"
            },
        )
        resp.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"failed to fetch serebii page: {exc}")

    soup = BeautifulSoup(resp.text, "html.parser")
    locations = []
    seen = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if "/pokearth/" not in href.lower():
            continue

        label = a.get_text(" ", strip=True)
        if not label:
            continue
        if label.lower() in {"pokearth", "pokéarth"}:
            continue

        full_url = urljoin(serebii_url, href)
        parsed = urlparse(full_url)
        path_parts = [p for p in parsed.path.split("/") if p]

        region_key = None
        for idx, part in enumerate(path_parts):
            if part.lower() == "pokearth" and idx + 1 < len(path_parts):
                region_key = path_parts[idx + 1].lower()
                break

        if not region_key or region_key not in GBA_SCOPE_REGIONS:
            continue

        key = (label.lower(), full_url.lower())
        if key in seen:
            continue
        seen.add(key)
        locations.append(
            {
                "name": label,
                "url": full_url,
                "region": region_key,
                "group": GBA_SCOPE_REGIONS[region_key],
            }
        )

    return {"name": entry.get("name", name), "locations": locations}


@app.get("/gens/{gen}")
def read_gen(gen: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pokemon WHERE gen=?", (gen,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/pokemon-names")
def all_names(gen: Optional[int] = None):
    """Return list of all pokemon names; optionally filter by generation."""
    conn = get_db()
    cur = conn.cursor()
    if gen is not None:
        cur.execute("SELECT name FROM pokemon WHERE gen=?", (gen,))
    else:
        # default behavior: only return names from gens 1–3
        cur.execute("SELECT name FROM pokemon WHERE gen BETWEEN 1 AND 3")
    rows = cur.fetchall()
    conn.close()
    names = sorted({r[0] for r in rows})
    return names


class MCPRequest(BaseModel):
    pokemonName: Optional[str]


@app.post("/mcp/get-pokemon-data")
def mcp_get(data: MCPRequest):
    name = data.pokemonName
    if not name:
        raise HTTPException(status_code=400, detail="pokemonName required")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pokemon WHERE lower(name)=?", (name.lower(),))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else {}
