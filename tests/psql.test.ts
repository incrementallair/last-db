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

test('Postgres driver read with joins', async () => {
  const databaseName = `last_db_join_test_${Date.now()}`;
  const driver = new PostgresDriver();

  try {
    await driver.setup(databaseName, schemas as any);

    // Seed: two users
    const [aliceId, bobId] = await driver.create(
      [
        {
          schema: 'User',
          data: { name: 'Alice', email: `alice-${randomUUID()}@example.com`, createdAt: new Date(), updatedAt: new Date() },
        },
        {
          schema: 'User',
          data: { name: 'Bob', email: `bob-${randomUUID()}@example.com`, createdAt: new Date(), updatedAt: new Date() },
        },
      ],
      databaseName,
      UserSchema as any,
    );

    // Seed: two posts (only Alice has a post)
    const postId = `post-${randomUUID()}`;
    await driver.create(
      [
        {
          schema: 'Post',
          data: { id: postId, title: 'Alice Post', content: 'content', authorId: aliceId, createdAt: new Date(), updatedAt: new Date() },
        },
      ],
      databaseName,
      PostSchema as any,
    );

    // Seed: a comment on that post by Bob, and one by Alice (the post author)
    await driver.create(
      [
        {
          schema: 'Comment',
          data: { id: `comment-${randomUUID()}`, postId, authorId: bobId, content: 'Nice post!', createdAt: new Date(), updatedAt: new Date() },
        },
        {
          schema: 'Comment',
          data: { id: `comment-${randomUUID()}`, postId, authorId: aliceId, content: 'Thanks!', createdAt: new Date(), updatedAt: new Date() },
        },
      ],
      databaseName,
      CommentSchema as any,
    );

    // 1. INNER JOIN – posts with their author's name (column:column mapping)
    const postsWithAuthor = await driver.read(
      [
        {
          schema: 'Post',
          joins: [
            { schema: 'User', type: 'INNER', on: { localColumn: 'authorId', foreignColumn: 'id' } },
          ],
        },
      ],
      databaseName,
      PostSchema as any,
    );

    assert.equal(postsWithAuthor.length, 1);
    assert.equal(postsWithAuthor[0].title, 'Alice Post');
    // joined User columns nested under schema name
    assert.equal(postsWithAuthor[0].User.name, 'Alice');

    // 2. LEFT JOIN – all users, with their posts (Bob has no post, should still appear)
    const usersWithPosts = await driver.read(
      [
        {
          schema: 'User',
          joins: [
            { schema: 'Post', type: 'LEFT', on: { localColumn: 'id', foreignColumn: 'authorId' } },
          ],
        },
      ],
      databaseName,
      UserSchema as any,
    );

    assert.equal(usersWithPosts.length, 2);
    const bobRow = usersWithPosts.find((r: any) => r.name === 'Bob');
    assert.ok(bobRow, 'Bob should appear in LEFT JOIN result');
    assert.equal(bobRow.Post.title, null, 'Bob has no post so title should be null');

    // 3. Multiple joins – comments with their post title and the commenter's name
    const commentsWithDetails = await driver.read(
      [
        {
          schema: 'Comment',
          filter: { content: 'Nice post!' },
          joins: [
            { schema: 'Post',    type: 'INNER', on: { localColumn: 'postId',   foreignColumn: 'id' } },
            { schema: 'User',    type: 'INNER', on: { localColumn: 'authorId', foreignColumn: 'id' } },
          ],
        },
      ],
      databaseName,
      CommentSchema as any,
    );

    assert.equal(commentsWithDetails.length, 1);
    assert.equal(commentsWithDetails[0].content, 'Nice post!');
    assert.equal(commentsWithDetails[0].Post.title, 'Alice Post');
    assert.equal(commentsWithDetails[0].User.name, 'Bob');

    // 4. Raw SQL expression for the ON clause
    const rawJoin = await driver.read(
      [
        {
          schema: 'Post',
          joins: [
            {
              schema: 'User',
              type: 'INNER',
              on: `"post"."authorId" = "user"."id"`,
            },
          ],
          filter: { title: 'Alice Post' },
        },
      ],
      databaseName,
      PostSchema as any,
    );

    assert.equal(rawJoin.length, 1);
    assert.equal(rawJoin[0].User.name, 'Alice');

    // 5. Array of column mappings — two conditions ANDed together
    const multiConditionJoin = await driver.read(
      [
        {
          schema: 'Comment',
          joins: [
            {
              schema: 'Post',
              type: 'INNER',
              on: [
                { localColumn: 'postId',   foreignColumn: 'id' },
                { localColumn: 'authorId', foreignColumn: 'authorId' },
              ],
            },
          ],
        },
      ],
      databaseName,
      CommentSchema as any,
    );

    // The second condition (comment.authorId = post.authorId) filters to only
    // Alice's comment since she is the post author — Bob's comment is excluded.
    assert.equal(multiConditionJoin.length, 1);
    assert.equal(multiConditionJoin[0].content, 'Thanks!');

    // 6. Alias — result is nested under the alias key, not the schema name
    const postsWithAlias = await driver.read(
      [
        {
          schema: 'Post',
          filter: { title: 'Alice Post' },
          joins: [
            { schema: 'User', alias: 'author', type: 'INNER', on: { localColumn: 'authorId', foreignColumn: 'id' } },
          ],
        },
      ],
      databaseName,
      PostSchema as any,
    );

    assert.equal(postsWithAlias.length, 1);
    assert.equal(postsWithAlias[0].author.name, 'Alice');
    assert.equal(postsWithAlias[0].User, undefined, 'schema-name key should not appear when alias is set');

    // 7. Same table joined twice with different aliases
    // Fetch Bob's comment with both the commenter name and the post-author name,
    // which requires joining User twice: once as 'commenter', once as 'postAuthor'.
    const commentsWithBothAuthors = await driver.read(
      [
        {
          schema: 'Comment',
          filter: { content: 'Nice post!' },
          joins: [
            { schema: 'User', alias: 'commenter',  type: 'INNER', on: { localColumn: 'authorId', foreignColumn: 'id' } },
            { schema: 'Post',                       type: 'INNER', on: { localColumn: 'postId',   foreignColumn: 'id' } },
            // postAuthor joins User a second time using the already-joined "post" table via raw SQL
            { schema: 'User', alias: 'postAuthor', type: 'INNER', on: `"post"."authorId" = "postAuthor"."id"` },
          ],
        },
      ],
      databaseName,
      CommentSchema as any,
    );

    assert.equal(commentsWithBothAuthors.length, 1);
    assert.equal(commentsWithBothAuthors[0].content, 'Nice post!');
    assert.equal(commentsWithBothAuthors[0].commenter.name, 'Bob');
    assert.equal(commentsWithBothAuthors[0].postAuthor.name, 'Alice');
  } finally {
    const adminClient = new Client(adminConfig);
    await adminClient.connect();
    await adminClient.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [databaseName]);
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)}`);
    await adminClient.end();
  }
});
