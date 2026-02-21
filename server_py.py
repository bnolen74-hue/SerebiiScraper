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

DB_FILE = os.environ.get("DB_FILE", "pokedex.db")

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
