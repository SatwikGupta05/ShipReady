const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Secure session
app.use(session({
  secret: process.env.SESSION_SECRET || 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p',
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Safe queries with Prisma
app.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(req.params.id) },
  });
  res.json(user);
});

// Safe parameterized query
app.get('/posts', async (req, res) => {
  const posts = await prisma.post.findMany({
    where: { published: true },
  });
  res.json(posts);
});

app.listen(3000);
