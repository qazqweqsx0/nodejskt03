'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

const config = require('./config');
const usersRouter = require('./routes/users');
const postsRouter = require('./routes/posts');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const prisma = new PrismaClient();
const app = express();

app.disable('x-powered-by');
app.locals.prisma = prisma;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

if (config.env !== 'test') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'kt03 — REST API блог-платформы',
    endpoints: {
      users: '/api/users',
      posts: '/api/posts',
      health: '/health',
    },
  });
});

app.use('/api/users', usersRouter);
app.use('/api/posts', postsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

let server = null;

if (require.main === module) {
  server = app.listen(config.port, () => {
    console.log(`[kt03] API запущен: http://localhost:${config.port} (${config.env})`);
  });
}

async function shutdown(signal) {
  console.log(`[kt03] Получен ${signal}, останавливаем сервер...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

module.exports = app;
