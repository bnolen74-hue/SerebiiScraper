// simple Express server exposing pokedex data from SQLite

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'pokedex.db');

const app = express();
app.use(cors());
app.use(express.json());

function getDb() {
    return new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY);
}

app.get('/pokemon/:name', (req, res) => {
    const name = req.params.name.toLowerCase();
    const db = getDb();
    db.get(
        'SELECT * FROM pokemon WHERE lower(name)=?',
        [name],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'not found' });
            res.json(row);
        }
    );
    db.close();
});

app.get('/gens/:gen', (req, res) => {
    const gen = parseInt(req.params.gen, 10);
    const db = getDb();
    db.all('SELECT * FROM pokemon WHERE gen=?', [gen], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
    db.close();
});

// MCP tool-style endpoints
app.post('/mcp/get-pokemon-data', (req, res) => {
    const { pokemonName } = req.body;
    if (!pokemonName) return res.status(400).json({ error: 'pokemonName required' });
    const db = getDb();
    db.get(
        'SELECT * FROM pokemon WHERE lower(name)=?',
        [pokemonName.toLowerCase()],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(row || {});
        }
    );
    db.close();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`pokedex server listening on ${port}`));
