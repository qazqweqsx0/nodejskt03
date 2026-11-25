'use strict';

const express = require('express');
const Joi = require('joi');

const config = require('../config');
const { validate } = require('../middleware/validate');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const { defaultPage, defaultLimit, maxLimit } = config.pagination;

const idSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(defaultPage),
  limit: Joi.number().integer().min(1).max(maxLimit).default(defaultLimit),
});

const createUserSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(254).required(),
  name: Joi.string().trim().min(1).max(120).required(),
  role: Joi.string().valid('USER', 'ADMIN').default('USER'),
});

const updateUserSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(254),
  name: Joi.string().trim().min(1).max(120),
  role: Joi.string().valid('USER', 'ADMIN'),
})
  .min(1)
  .messages({ 'object.min': 'Нужно передать хотя бы одно поле: email, name или role' });

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
};

function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const { page, limit } = req.query;

    const [total, users] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          ...userSelect,
          _count: { select: { posts: true } },
        },
      }),
    ]);

    res.json({
      data: users,
      meta: paginationMeta(total, page, limit),
    });
  }),
);

router.get(
  '/:id',
  validate(idSchema, 'params'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        ...userSelect,
        posts: {
          orderBy: { createdAt: 'desc' },
          include: { tags: true },
        },
      },
    });

    if (!user) {
      throw ApiError.notFound(`Пользователь с id ${req.params.id} не найден`);
    }

    res.json({ data: user });
  }),
);

router.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    try {
      const user = await prisma.user.create({
        data: req.body,
        select: userSelect,
      });

      res.status(201).json({ data: user });
    } catch (error) {
      if (error.code === 'P2002') {
        throw ApiError.conflict(`Пользователь с email "${req.body.email}" уже существует`, {
          field: 'email',
        });
      }
      throw error;
    }
  }),
);

router.patch(
  '/:id',
  validate(idSchema, 'params'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    try {
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: req.body,
        select: userSelect,
      });

      res.json({ data: user });
    } catch (error) {
      if (error.code === 'P2025') {
        throw ApiError.notFound(`Пользователь с id ${req.params.id} не найден`);
      }
      if (error.code === 'P2002') {
        throw ApiError.conflict(`Пользователь с email "${req.body.email}" уже существует`, {
          field: 'email',
        });
      }
      throw error;
    }
  }),
);

router.delete(
  '/:id',
  validate(idSchema, 'params'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    try {
      await prisma.user.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      if (error.code === 'P2025') {
        throw ApiError.notFound(`Пользователь с id ${req.params.id} не найден`);
      }
      throw error;
    }
  }),
);

module.exports = router;
