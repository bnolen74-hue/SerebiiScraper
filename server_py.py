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
import json
from typing import Optional, List, Dict
from urllib.parse import urljoin, urlparse
import re

import requests
from bs4 import BeautifulSoup

DB_FILE = os.environ.get("DB_FILE", "pokedex.db")

GBA_SCOPE_REGIONS = {
    "kanto": "Kanto (FireRed/LeafGreen)",
    "sevii": "Sevii Islands (FireRed/LeafGreen)",
    "hoenn": "Hoenn (Ruby/Sapphire/Emerald)",
}

FRLG_VERSIONS = {"firered", "leafgreen"}
RSE_VERSIONS = {"ruby", "sapphire", "emerald"}

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


def ensure_location_cache_table() -> None:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pokemon_location_cache (
            pokemon_name TEXT PRIMARY KEY,
            source_name TEXT NOT NULL,
            tabs_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


@app.on_event("startup")
def _on_startup() -> None:
    ensure_location_cache_table()


def get_pokemon_entry(name: str):
    normalized = (name or "").strip().lower()
    if not normalized:
        return None

    candidates = [normalized]
    spaced = normalized.replace(" ", "-")
    if spaced not in candidates:
        candidates.append(spaced)

    if "-" in normalized:
        base = normalized.split("-", 1)[0]
        if base and base not in candidates:
            candidates.append(base)

    if " " in normalized:
        base = normalized.split(" ", 1)[0]
        if base and base not in candidates:
            candidates.append(base)

    conn = get_db()
    cur = conn.cursor()
    row = None
    for candidate in candidates:
        cur.execute("SELECT * FROM pokemon WHERE lower(name)=?", (candidate,))
        row = cur.fetchone()
        if row:
            break
    conn.close()
    return dict(row) if row else None


def _sort_locations(names):
    unique = sorted(set(names), key=lambda s: s.lower())

    def sort_key(value: str):
        m = re.search(r"(\d+)", value)
        if m:
            return (0, int(m.group(1)), value.lower())
        return (1, 9999, value.lower())

    unique.sort(key=sort_key)
    return unique


def _empty_tabs():
    return {
        "FRLG": {"label": "FireRed/LeafGreen", "routes": [], "other": []},
        "RSE": {"label": "Ruby/Sapphire/Emerald", "routes": [], "other": []},
    }


def _build_tabs_from_locations(locations):
    tabs = _empty_tabs()
    for loc in locations:
        location_name = (loc.get("name") or "").strip()
        if not location_name:
            continue

        region = (loc.get("region") or "").lower()
        game = "FRLG" if region in {"kanto", "sevii"} else "RSE" if region == "hoenn" else None
        if not game:
            continue

        if re.match(r"^route\s+\d+", location_name, flags=re.I):
            tabs[game]["routes"].append(location_name)
        else:
            tabs[game]["other"].append(location_name)

    for game in tabs:
        tabs[game]["routes"] = _sort_locations(tabs[game]["routes"])
        tabs[game]["other"] = _sort_locations(tabs[game]["other"])
    return tabs


def _read_cached_tabs(pokemon_name: str):
    ensure_location_cache_table()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT source_name,tabs_json,updated_at FROM pokemon_location_cache WHERE lower(pokemon_name)=?",
        (pokemon_name.lower(),),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    try:
        tabs = json.loads(row["tabs_json"])
    except Exception:
        return None
    return {
        "source_name": row["source_name"],
        "tabs": tabs,
        "updated_at": row["updated_at"],
    }


def _write_cached_tabs(pokemon_name: str, source_name: str, tabs):
    ensure_location_cache_table()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO pokemon_location_cache(pokemon_name,source_name,tabs_json,updated_at)
        VALUES (?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(pokemon_name) DO UPDATE SET
            source_name=excluded.source_name,
            tabs_json=excluded.tabs_json,
            updated_at=CURRENT_TIMESTAMP
        """,
        (pokemon_name.lower(), source_name.lower(), json.dumps(tabs)),
    )
    conn.commit()
    conn.close()


def _all_tab_lists_empty(tabs) -> bool:
    return not (
        tabs["FRLG"]["routes"]
        or tabs["FRLG"]["other"]
        or tabs["RSE"]["routes"]
        or tabs["RSE"]["other"]
    )


def _extract_locations_for_entry(entry: Dict):
    serebii_url = entry.get("serebii_url")
    if not serebii_url:
        return []

    locations = []
    try:
        resp = requests.get(
            serebii_url,
            timeout=12,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SerebiiScraper/1.0)"},
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        seen = set()

        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if "/pokearth/" not in href.lower():
                continue

            label = a.get_text(" ", strip=True)
            if not label or label.lower() in {"pokearth", "pokéarth"}:
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
    except Exception:
        pass

    if locations:
        return locations

    pokeapi_species_url = entry.get("pokeapi_url")
    pokemon_url = (
        pokeapi_species_url.replace("pokemon-species", "pokemon")
        if isinstance(pokeapi_species_url, str)
        else None
    )
    if not pokemon_url:
        return []

    try:
        poke_resp = requests.get(
            pokemon_url,
            timeout=12,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SerebiiScraper/1.0)"},
        )
        poke_resp.raise_for_status()
        poke_data = poke_resp.json()
        encounters_url = poke_data.get("location_area_encounters")
        if not encounters_url:
            return []

        encounter_resp = requests.get(
            encounters_url,
            timeout=12,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SerebiiScraper/1.0)"},
        )
        encounter_resp.raise_for_status()
        encounters = encounter_resp.json()

        fallback_seen = set()
        for enc in encounters:
            raw_area = enc.get("location_area", {}).get("name", "").strip().lower()
            if not raw_area:
                continue

            versions = {
                vd.get("version", {}).get("name", "").lower()
                for vd in enc.get("version_details", [])
                if vd.get("version", {}).get("name")
            }

            regions = set()
            if versions & FRLG_VERSIONS:
                regions.add("kanto")
            if versions & RSE_VERSIONS:
                regions.add("hoenn")
            if not regions:
                continue

            route_match = re.search(r"route-(\d+)", raw_area)
            if route_match:
                area_label = f"Route {route_match.group(1)}"
            else:
                area_label = raw_area.replace("-area", "").replace("-", " ").title()

            for region_key in regions:
                dedupe_key = (region_key, area_label.lower())
                if dedupe_key in fallback_seen:
                    continue
                fallback_seen.add(dedupe_key)
                locations.append(
                    {
                        "name": area_label,
                        "url": "",
                        "region": region_key,
                        "group": GBA_SCOPE_REGIONS[region_key],
                    }
                )
    except Exception:
        return []

    return locations


@app.get("/pokemon/{name}")
def read_pokemon(name: str):
    entry = get_pokemon_entry(name)
    if not entry:
        raise HTTPException(status_code=404, detail="not found")
    return entry


@app.get("/pokemon/{name}/locations")
def read_pokemon_locations(name: str):
    entry = get_pokemon_entry(name)
    if not entry:
        raise HTTPException(status_code=404, detail="not found")

    cached = _read_cached_tabs(entry["name"])
    if cached:
        tabs = cached["tabs"]
        locations = []
        for game_key in ("FRLG", "RSE"):
            game_tab = tabs.get(game_key, {}) if isinstance(tabs, dict) else {}
            for route_name in game_tab.get("routes", []):
                locations.append({"name": route_name, "region": "kanto" if game_key == "FRLG" else "hoenn"})
            for area_name in game_tab.get("other", []):
                locations.append({"name": area_name, "region": "kanto" if game_key == "FRLG" else "hoenn"})
        return {
            "name": entry["name"],
            "source_name": cached["source_name"],
            "tabs": tabs,
            "locations": locations,
            "cached": True,
            "updated_at": cached["updated_at"],
        }

    source_entry = entry
    locations = _extract_locations_for_entry(source_entry)
    tabs = _build_tabs_from_locations(locations)

    if _all_tab_lists_empty(tabs):
        try:
            if entry.get("pokeapi_url"):
                species_resp = requests.get(
                    entry["pokeapi_url"],
                    timeout=12,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; SerebiiScraper/1.0)"},
                )
                if species_resp.ok:
                    species_data = species_resp.json()
                    prev_name = species_data.get("evolves_from_species", {}).get("name")
                    if prev_name:
                        prev_entry = get_pokemon_entry(prev_name)
                        if prev_entry:
                            prev_locations = _extract_locations_for_entry(prev_entry)
                            prev_tabs = _build_tabs_from_locations(prev_locations)
                            if not _all_tab_lists_empty(prev_tabs):
                                source_entry = prev_entry
                                locations = prev_locations
                                tabs = prev_tabs
        except Exception:
            pass

    _write_cached_tabs(entry["name"], source_entry["name"], tabs)
    return {
        "name": entry["name"],
        "source_name": source_entry["name"],
        "tabs": tabs,
        "locations": locations,
        "cached": False,
    }


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
