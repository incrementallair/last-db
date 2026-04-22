import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PostgresDriver } from '../drivers';
import { CommentSchema, PostSchema, UserSchema, schemas } from '../app/schema';

const adminDatabase = process.env.PGADMIN_DB ?? 'postgres';

const adminConfig = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: adminDatabase,
};

const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`;

test('Postgres driver setup/create/read/update/delete', async () => {
  const databaseName = `last_db_test_${Date.now()}`;
  const driver = new PostgresDriver();

  try {
    await driver.setup(databaseName, schemas as any);

    const createdUsers = await driver.create(
      [
        {
          schema: 'User',
          data: {
            name: 'Alice',
            email: `alice-${randomUUID()}@example.com`,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ],
      databaseName,
      UserSchema as any,
    );

    assert.equal(createdUsers.length, 1);
    assert.ok(createdUsers[0] > 0);

    const users = await driver.read(
      [
        {
          schema: 'User',
          filter: { id: createdUsers[0] },
          limit: 1,
        },
      ],
      databaseName,
      UserSchema as any,
    );

    assert.equal(users.length, 1);
    assert.equal(Number(users[0].id), createdUsers[0]);
    assert.equal(users[0].name, 'Alice');

    const updatedRows = await driver.update(
      [
        {
          schema: 'User',
          filter: { id: createdUsers[0] },
          update: { name: 'Alice Updated' },
        },
      ],
      databaseName,
      UserSchema as any,
    );

    assert.equal(updatedRows, 1);

    const updatedUsers = await driver.read(
      [
        {
          schema: 'User',
          filter: { id: createdUsers[0] },
        },
      ],
      databaseName,
      UserSchema as any,
    );

    assert.equal(updatedUsers[0].name, 'Alice Updated');

    await driver.create(
      [
        {
          schema: 'Post',
          data: {
            id: `post-${randomUUID()}`,
            title: 'Hello Post',
            content: 'Post content',
            authorId: createdUsers[0],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ],
      databaseName,
      PostSchema as any,
    );

    const posts = await driver.read(
      [
        {
          schema: 'Post',
          filter: { title: { $eq: 'Hello Post' } },
          limit: 1,
        },
      ],
      databaseName,
      PostSchema as any,
    );

    assert.equal(posts.length, 1);

    await driver.create(
      [
        {
          schema: 'Comment',
          data: {
            id: `comment-${randomUUID()}`,
            postId: posts[0].id,
            authorId: createdUsers[0],
            content: 'A comment',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ],
      databaseName,
      CommentSchema as any,
    );

    const comments = await driver.read(
      [
        {
          schema: 'Comment',
          filter: { postId: posts[0].id },
          sort: { createdAt: 'asc' },
        },
      ],
      databaseName,
      CommentSchema as any,
    );

    assert.equal(comments.length, 1);
    assert.equal(comments[0].content, 'A comment');

    const deletedRows = await driver.delete(
      [
        {
          schema: 'User',
          filter: { id: createdUsers[0] },
        },
      ],
      databaseName,
      UserSchema as any,
    );

    assert.equal(deletedRows, 1);

    const deletedRead = await driver.read(
      [
        {
          schema: 'User',
          filter: { id: createdUsers[0] },
        },
      ],
      databaseName,
      UserSchema as any,
    );

    assert.equal(deletedRead.length, 0);

    // FK CASCADE: deleting the user should have cascade-deleted their posts and comments
    const cascadedPosts = await driver.read(
      [{ schema: 'Post', filter: { authorId: createdUsers[0] } }],
      databaseName,
      PostSchema as any,
    );
    assert.equal(cascadedPosts.length, 0, 'posts should be cascade-deleted when author is deleted');

    const cascadedComments = await driver.read(
      [{ schema: 'Comment', filter: { authorId: createdUsers[0] } }],
      databaseName,
      CommentSchema as any,
    );
    assert.equal(cascadedComments.length, 0, 'comments should be cascade-deleted when author is deleted');

    // FK enforcement: inserting a post with a non-existent authorId must fail
    await assert.rejects(
      () =>
        driver.create(
          [
            {
              schema: 'Post',
              data: {
                id: `post-${randomUUID()}`,
                title: 'Orphan Post',
                content: 'Should fail',
                authorId: 99999999,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
          ],
          databaseName,
          PostSchema as any,
        ),
      (err: any) => {
        assert.ok(err.code === '23503', `expected FK violation error code 23503, got ${err.code}`);
        return true;
      },
    );
  } finally {
    const adminClient = new Client(adminConfig);
    await adminClient.connect();
    await adminClient.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [databaseName]);
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)}`);
    await adminClient.end();
  }
});
