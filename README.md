# last-db

> Define your schema once. Get row-level security, column-level security, type-safe CRUD, and Express handlers — for free.

Most backend data layers make you choose: raw SQL with full control and zero safety, or a heavy ORM that abstracts the wrong things and leaves you wrestling with security yourself. **last-db** takes a different bet — that the most dangerous part of a data layer isn't the query, it's *who's allowed to run it*.

## The Big Idea

Permissions aren't middleware. They're not a decorator, not a service layer, not something you bolt on after the fact. In last-db, security rules live **inside the schema** and are enforced before a single SQL statement is built.

```ts
export const UserSchema = {
  name: 'User',
  properties: {
    id:        { type: 'bigint', autoIncrement: true, indexed: true, unique: true },
    name:      'string',
    email:     { type: 'string', indexed: true, unique: true, required: true },
    password:  { type: 'string', required: true },
    createdAt: 'date',
    updatedAt: 'date',
  },
  primaryKey: 'id',
  permissions: {
    // A user can only read their own row — always, no matter what
    read:  (ctx) => ({ id: ctx.userId }),
    // A user can only mutate their own row
    write: (ctx) => ({ id: ctx.userId }),
    columns: {
      // The password hash is never, ever returned from a read
      password: { readable: false },
    },
  },
  views: {
    // Safe public projection — email excluded, can be shown to other users
    author: { columns: ['id', 'name'] },
  },
} satisfies Schema;
```

That's it. Your app never has to remember to filter by `userId`. It can't forget — the filter is stamped on every query, on every path, automatically.

## How It Works

### 1. Schema → Database

Call `setup()` once (e.g., on app boot) and last-db creates your tables, indexes, and foreign key constraints automatically:

```ts
const driver = new PostgresDriver();
await driver.setup('myapp', [UserSchema, PostSchema, CommentSchema]);
```

No migration files. No manual `ALTER TABLE`. Foreign keys with cascade actions (`CASCADE`, `SET NULL`, etc.) are inferred from the schema — two-pass so ordering never matters.

### 2. ProtectedDriver — the security wrapper

`ProtectedDriver` wraps any `Driver` implementation and intercepts every operation:

| Operation | What it does |
|-----------|-------------|
| `read`    | Merges the schema's `read` filter into every `WHERE` clause; strips non-readable columns from results |
| `create`  | Stamps ownership fields from the `write` filter onto the payload (callers can't spoof `authorId`) |
| `update`  | Merges the `write` filter into the `WHERE` clause; strips non-writable columns from the update payload |
| `delete`  | Merges the `write` filter into the `WHERE` clause |

The `PermissionContext` (just `{ userId }`) is passed **per call**, not at construction time, making `ProtectedDriver` safe to share across requests.

### 3. Express Handlers — one line to wire it up

```ts
import { createHandler, readHandler, updateHandler, deleteHandler } from 'last-db';

app.post('/create', createHandler(driver, 'myapp', schemas, (req) => ({ userId: req.user.id })));
app.post('/read',   readHandler(driver, 'myapp', schemas, (req) => ({ userId: req.user.id })));
app.post('/update', updateHandler(driver, 'myapp', schemas, (req) => ({ userId: req.user.id })));
app.post('/delete', deleteHandler(driver, 'myapp', schemas, (req) => ({ userId: req.user.id })));
```

The `getCtx` callback is the only place your auth logic lives. Everything downstream — row filtering, column stripping, ownership stamping — happens inside the driver.

### 4. A Rich Query Language

Use `ReadSpec` to express the full power of your queries without writing SQL:

```ts
// Filter with comparison operators
{ filter: { createdAt: { $gte: startDate, $lt: endDate } } }

// Logical AND / OR
{ filter: { $or: [{ status: 'active' }, { role: 'admin' }] } }

// IN lists
{ filter: { id: { $in: [1, 2, 3] } } }

// Joins — results reconstructed into nested objects automatically
{
  schema: 'Post',
  filter: { title: { $eq: 'Hello World' } },
  joins: [{
    schema: 'User',
    alias: 'author',
    type: 'LEFT',
    on: { localColumn: 'authorId', foreignColumn: 'id' },
  }],
  sort: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
}
// → [{ id: '...', title: '...', author: { id: 1, name: 'Alice' } }]
```

## The Driver Contract

`PostgresDriver` implements the `Driver` interface. The interface is lean on purpose — swap in a different backend without touching any schema, permission, or handler code:

```ts
interface Driver {
  setup(database: string, schemas: Schema[]): Promise<void>;
  create(specs: CreateSpec[], database: string, schema: Schema): Promise<number[]>;
  read(specs: ReadSpec[], database: string, schema: Schema): Promise<any[]>;
  update(specs: UpdateSpec[], database: string, schema: Schema): Promise<number>;
  delete(specs: DeleteSpec[], database: string, schema: Schema): Promise<number>;
}
```

## Getting Started

```bash
npm install
```

Run the test suite against a local Postgres instance:

```bash
PGHOST=localhost PGUSER=postgres npm test
```

The tests spin up a fresh database, exercise the full CRUD lifecycle including cascade deletes and FK enforcement, then clean up after themselves.

## Tech

- **TypeScript** — fully typed schemas, specs, and permission functions
- **PostgreSQL** (`pg`) via connection pooling — parameterised queries throughout, no string interpolation of user values
- **Express 5** for the HTTP handler layer
- Node's built-in `node:test` runner — no extra test framework needed

## Why "last-db"?

Because it's the last database layer you should need to write.
