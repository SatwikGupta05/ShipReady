const express = require('express');
const app = express();

app.get('/users', async (req, res) => {
  const userId = req.query.id;
  // VULNERABLE: string concatenation in SQL query
  const query = `SELECT * FROM users WHERE id = ${userId}`;
  const result = await db.execute(query);
  res.json(result);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  // VULNERABLE: direct interpolation
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  const user = await db.query(query);
  res.json(user);
});
