

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
};

export const PostSchema = {
  name: 'Post',
  properties: {
    id: 'string',
    title: 'string',
    content: 'string',
    authorId: 'User',
    createdAt: 'date',
    updatedAt: 'date',
  },
  primaryKey: 'id',
};

export const CommentSchema = {
  name: 'Comment',
  properties: {
    id: 'string',
    postId: 'Post',
    authorId: 'User',
    content: 'string',
    createdAt: 'date',
    updatedAt: 'date',
  },
  primaryKey: 'id',
};

export const schemas = [UserSchema, PostSchema, CommentSchema];