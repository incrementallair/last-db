
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
    createdAt: 'date',
    updatedAt: 'date',
  },
  primaryKey: 'id',
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
} satisfies Schema;

export const schemas = [UserSchema, PostSchema, CommentSchema];