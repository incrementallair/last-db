
import type { Schema } from '../../index';

export const UserSchema = {
  name: 'User',
  properties: {
    id: {
      type: 'bigint',
      indexed: true,
      unique: true,
      autoIncrement: true,
    },
    name: 'string',
    email: { type: 'string', indexed: true, unique: true, required: true },
    // password is write-only: stored but never returned in read results
    password: { type: 'string', required: true },
    createdAt: 'date',
    updatedAt: 'date',
  },
  primaryKey: 'id',
  permissions: {
    // Row-level: a user can only read their own record
    read: (ctx) => ({ id: ctx.userId }),
    // Row-level: a user can only update/delete their own record
    write: (ctx) => ({ id: ctx.userId }),
    columns: {
      // Never include the password hash in any read result
      password: { readable: false },
    },
  },
  views: {
    // Safe projection for surfacing author info alongside posts/comments —
    // intentionally does not include email so it can be shown to other users
    author: {
      columns: ['id', 'name'],
    },
  },
} satisfies Schema;

export const PostSchema = {
  name: 'Post',
  properties: {
    id: 'string',
    title: 'string',
    content: 'string',
    authorId: { type: 'User', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    createdAt: 'date',
    updatedAt: 'date',
  },
  primaryKey: 'id',
  permissions: {
    // Row-level: users can only read posts they authored
    read: (ctx) => ({ authorId: ctx.userId }),
    // Row-level: users can only create, update, or delete posts they authored
    write: (ctx) => ({ authorId: ctx.userId }),
  },
} satisfies Schema;

export const CommentSchema = {
  name: 'Comment',
  properties: {
    id: 'string',
    postId: { type: 'Post', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    authorId: { type: 'User', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    content: 'string',
    createdAt: 'date',
    updatedAt: 'date',
  },
  primaryKey: 'id',
  permissions: {
    // Row-level: users can only read comments they authored
    read: (ctx) => ({ authorId: ctx.userId }),
    // Row-level: users can only create, update, or delete comments they authored
    write: (ctx) => ({ authorId: ctx.userId }),
  },
} satisfies Schema;

export const schemas = [UserSchema, PostSchema, CommentSchema];