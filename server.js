const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const DB_PATH = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { quotations: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// API: list all
app.get('/api/quotations', (req, res) => {
  const db = readDB();
  res.json(db.quotations);
});

// API: get one
app.get('/api/quotations/:id', (req, res) => {
  const id = req.params.id;
  const db = readDB();
  const q = db.quotations.find(item => item.id === id);
  if (!q) return res.status(404).json({ message: 'Not found' });
  res.json(q);
});

// API: create
app.post('/api/quotations', (req, res) => {
  const db = readDB();
  const payload = req.body;
  const newQ = {
    id: uuidv4(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...payload
  };
  db.quotations.push(newQ);
  writeDB(db);
  res.status(201).json(newQ);
});

// API: update
app.put('/api/quotations/:id', (req, res) => {
  const id = req.params.id;
  const db = readDB();
  const idx = db.quotations.findIndex(item => item.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const updated = {
    ...db.quotations[idx],
    ...req.body,
    updated_at: new Date().toISOString()
  };
  db.quotations[idx] = updated;
  writeDB(db);
  res.json(updated);
});

// API: delete
app.delete('/api/quotations/:id', (req, res) => {
  const id = req.params.id;
  const db = readDB();
  const filtered = db.quotations.filter(item => item.id !== id);
  db.quotations = filtered;
  writeDB(db);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});