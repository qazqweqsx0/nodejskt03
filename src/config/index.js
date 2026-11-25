'use strict';

require('dotenv').config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  pagination: {
    defaultPage: toInt(process.env.DEFAULT_PAGE, 1),
    defaultLimit: toInt(process.env.DEFAULT_LIMIT, 10),
    maxLimit: toInt(process.env.MAX_LIMIT, 100),
  },
};

if (!config.databaseUrl) {
  throw new Error(
    'DATABASE_URL не задан. Скопируйте .env.example в .env и укажите строку подключения к базе данных.',
  );
}

config.isPostgres = /^postgres(ql)?:\/\//i.test(config.databaseUrl);

module.exports = config;
