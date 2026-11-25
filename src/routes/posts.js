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
  search: Joi.string().trim().max(200),
  published: Joi.boolean(),
  authorId: Joi.number().integer().positive(),
  page: Joi.number().integer().min(1).default(defaultPage),
  limit: Joi.number().integer().min(1).max(maxLimit).default(defaultLimit),
});

const tagsSchema = Joi.array().items(Joi.string().trim().min(1).max(50));

const createPostSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  content: Joi.string().allow('', null),
  published: Joi.boolean().default(false),
  authorId: Joi.number().integer().positive().required(),
  tags: tagsSchema.default([]),
});

const updatePostSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200),
  content: Joi.string().allow('', null),
  published: Joi.boolean(),
  authorId: Joi.number().integer().positive(),
  tags: tagsSchema,
})
  .min(1)
  .messages({ 'object.min': 'Нужно передать хотя бы одно поле: title, content, published, authorId или tags' });

const postInclude = {
  author: {
    select: { id: true, email: true, name: true, role: true },
  },
  tags: {
    orderBy: { name: 'asc' },
  },
};

function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

function buildWhere({ search, published, authorId }) {
  const where = {};

  if (search) {
    where.title = { contains: search };
    if (config.isPostgres) {
      where.title.mode = 'insensitive';
    }
  }
  if (published !== undefined) {
    where.published = published;
  }
  if (authorId !== undefined) {
    where.authorId = authorId;
  }

  return where;
}

function normalizeTags(tags = []) {
  const unique = new Set(
    tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  );
  return [...unique];
}

function tagConnections(tags) {
  return tags.map((name) => ({
    where: { name },
    create: { name },
  }));
}

router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const { page, limit } = req.query;
    const where = buildWhere(req.query);

    const [total, posts] = await prisma.$transaction([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: postInclude,
      }),
    ]);

    res.json({
      data: posts,
      meta: paginationMeta(total, page, limit),
    });
  }),
);

router.get(
  '/:id',
  validate(idSchema, 'params'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: postInclude,
    });

    if (!post) {
      throw ApiError.notFound(`Пост с id ${req.params.id} не найден`);
    }

    res.json({ data: post });
  }),
);

router.post(
  '/',
  validate(createPostSchema),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const { title, content, published, authorId } = req.body;
    const tags = normalizeTags(req.body.tags);

    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });

    if (!author) {
      throw ApiError.badRequest(`Автор с id ${authorId} не найден`, { field: 'authorId' });
    }

    const post = await prisma.post.create({
      data: {
        title,
        content: content ?? null,
        published,
        authorId,
        ...(tags.length > 0 ? { tags: { connectOrCreate: tagConnections(tags) } } : {}),
      },
      include: postInclude,
    });

    res.status(201).json({ data: post });
  }),
);

router.patch(
  '/:id',
  validate(idSchema, 'params'),
  validate(updatePostSchema),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const { tags, ...fields } = req.body;

    const data = { ...fields };

    if (tags !== undefined) {
      const names = normalizeTags(tags);
      data.tags = names.length > 0
        ? { set: [], connectOrCreate: tagConnections(names) }
        : { set: [] };
    }

    if (fields.authorId !== undefined) {
      const author = await prisma.user.findUnique({
        where: { id: fields.authorId },
        select: { id: true },
      });

      if (!author) {
        throw ApiError.badRequest(`Автор с id ${fields.authorId} не найден`, { field: 'authorId' });
      }
    }

    try {
      const post = await prisma.post.update({
        where: { id: req.params.id },
        data,
        include: postInclude,
      });

      res.json({ data: post });
    } catch (error) {
      if (error.code === 'P2025') {
        throw ApiError.notFound(`Пост с id ${req.params.id} не найден`);
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
      await prisma.post.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      if (error.code === 'P2025') {
        throw ApiError.notFound(`Пост с id ${req.params.id} не найден`);
      }
      throw error;
    }
  }),
);

module.exports = router;
