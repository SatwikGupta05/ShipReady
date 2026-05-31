const express = require('express');
const cors = require('cors');
const app = express();

// Dangerous: wildcard CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

app.listen(3000);
