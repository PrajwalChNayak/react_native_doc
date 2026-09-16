---
title: SQLite
description: expo-sqlite gives an Expo app a real on-device SQLite database — opening it, parameterised queries, migrations with user_version, transactions, the React provider, and the SQLCipher option.
status: current
toolchain: expo
sdk: 57
---

`expo-sqlite` embeds SQLite in your app and exposes it through an async (and a synchronous) JavaScript
API. It is the right home for structured, queryable data that has to survive an app restart: offline
caches, drafts, message history, anything you would otherwise fake with a large JSON blob.

```bash
npx expo install expo-sqlite
```

That resolves `expo-sqlite@~57.0.3` on SDK 57. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) for why the
command matters.

## Why it exists / when to use it — and when NOT to

Use it when you need to **query** data: filter, sort, join, paginate, or update one record out of
thousands without rewriting the rest.

Do **not** use it for:

- **Secrets.** A plain SQLite file is readable plaintext on a rooted device or from a debuggable build.
  Tokens belong in [`expo-secure-store`](secure-store.md). If the whole database is sensitive, use the
  SQLCipher option described below.
- **A handful of preferences.** AsyncStorage is simpler for `theme: 'dark'`.
- **Large binary blobs.** Store images and video as files with
  [`expo-file-system`](file-system-and-storage.md) and keep the path in a row.

## Expo Go vs development build

**Works in Expo Go — except for SQLCipher.** The core API is included in Expo Go.

The config plugin options (`useSQLCipher`, `enableFTS`, `useLibSQL`, `customBuildFlags`,
`withSQLiteVecExtension`) change how SQLite is **compiled**, and Expo Go's binary is already built. The
Expo documentation states plainly that SQLCipher is not supported on Expo Go. Any of those options
means a [development build](../expo-development-builds/why-you-need-one.md).

## Basic example

```ts title=lib/db.ts
import * as SQLite from 'expo-sqlite';

type Note = {id: number; title: string; body: string; updated_at: number};

export async function openNotesDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('notes.db');
  // WAL lets readers proceed while a write is in progress. Set it once,
  // when the database is created; it persists in the file.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

export async function addNote(
  db: SQLite.SQLiteDatabase,
  title: string,
  body: string,
): Promise<number> {
  // Values are bound, never concatenated into the SQL string.
  const result = await db.runAsync(
    'INSERT INTO notes (title, body, updated_at) VALUES (?, ?, ?)',
    title,
    body,
    Date.now(),
  );
  return result.lastInsertRowId;
}

export async function searchNotes(db: SQLite.SQLiteDatabase, term: string): Promise<Note[]> {
  return db.getAllAsync<Note>(
    'SELECT * FROM notes WHERE title LIKE $pattern ORDER BY updated_at DESC',
    {$pattern: `%${term}%`},
  );
}
```

## How it works

### Opening a database

`openDatabaseAsync(databaseName, options?, directory?)` resolves a `SQLiteDatabase`. The file lives in
`defaultDatabaseDirectory` inside the app sandbox unless you pass a directory. Connections are cached by
name; pass `useNewConnection: true` in the options when you deliberately need a second one.

| `SQLiteOpenOptions` | Meaning |
| --- | --- |
| `enableChangeListener` | Turns on SQLite's update hook so `addDatabaseChangeListener` fires. Default `false`. |
| `useNewConnection` | Open a new connection even if one with that name is cached. Default `false`. |
| `libSQLOptions` | `{url, authToken, remoteOnly?}` for the libSQL integration; requires the `useLibSQL` plugin option. |

### Query methods

| Method | Returns | Use it for |
| --- | --- | --- |
| `execAsync(sql)` | `Promise<void>` | Schema and multi-statement scripts. **Binds no parameters.** |
| `runAsync(sql, ...params)` | `Promise<SQLiteRunResult>` | `INSERT` / `UPDATE` / `DELETE`; exposes `lastInsertRowId` and `changes`. |
| `getFirstAsync<T>(sql, ...params)` | `Promise<T \| null>` | One row. |
| `getAllAsync<T>(sql, ...params)` | `Promise<T[]>` | All rows, loaded into memory. |
| `getEachAsync<T>(sql, ...params)` | `AsyncIterableIterator<T>` | Large result sets, one row at a time. |
| `prepareAsync(sql)` | `Promise<SQLiteStatement>` | The same statement run many times. |
| `withTransactionAsync(task)` | `Promise<void>` | Atomic multi-step writes. |
| `withExclusiveTransactionAsync(task)` | `Promise<void>` | A transaction no other query on the connection can interleave with. |
| `closeAsync()` | `Promise<void>` | Releasing the connection. |

Every async method has a `…Sync` counterpart (`runSync`, `getAllSync`, …). They block the JS thread for
the duration of the query. Use them only for tiny reads at startup, never inside a render.

Parameters bind either positionally (`?`, passed variadically or as an array) or by name (`$name`,
`:name`, `@name`, passed as an object whose keys include the prefix).

### Tagged template queries

`SQLiteDatabase` also exposes `sql`, a tagged template that turns interpolated values into bound
parameters:

```ts title=lib/taggedQuery.ts
import type {SQLiteDatabase} from 'expo-sqlite';

type User = {id: number; name: string};

export async function findUser(db: SQLiteDatabase, id: number): Promise<User | null> {
  // `${id}` is bound as a parameter, not spliced into the text.
  return db.sql<User>`SELECT id, name FROM users WHERE id = ${id}`.first();
}
```

### Migrations with `PRAGMA user_version`

SQLite stores a free integer in the file header. Using it as a schema version gives you ordered,
idempotent migrations without a migrations table:

```ts title=lib/migrate.ts
import type {SQLiteDatabase} from 'expo-sqlite';

const LATEST_VERSION = 2;

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{user_version: number}>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version >= LATEST_VERSION) {
    return;
  }

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL
      );
    `);
    version = 1;
  }

  if (version === 1) {
    await db.execAsync('ALTER TABLE notes ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;');
    version = 2;
  }

  // PRAGMA does not accept bound parameters. `version` is a number we
  // computed, never user input, so interpolating it here is safe.
  await db.execAsync(`PRAGMA user_version = ${version}`);
}
```

### The React provider

`SQLiteProvider` opens the database once, runs `onInit` before rendering its children, and makes the
connection available through `useSQLiteContext()`:

```tsx title=app/_layout.tsx
import {SQLiteProvider, useSQLiteContext, type SQLiteDatabase} from 'expo-sqlite';
import {useEffect, useState} from 'react';
import {Text, View} from 'react-native';

async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY NOT NULL, title TEXT NOT NULL);',
  );
}

function NoteCount() {
  const db = useSQLiteContext();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    db.getFirstAsync<{n: number}>('SELECT COUNT(*) AS n FROM notes').then((row) =>
      setCount(row?.n ?? 0),
    );
  }, [db]);

  return <Text>{count === null ? 'Loading…' : `${count} notes`}</Text>;
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="notes.db" onInit={migrate}>
      <View>
        <NoteCount />
      </View>
    </SQLiteProvider>
  );
}
```

`SQLiteProvider` also accepts `assetSource={{assetId: require('./assets/seed.db')}}` to copy a
pre-populated database out of the bundle on first launch, and `useSuspense` to integrate with
`React.Suspense`.

## Native configuration

No permission is required on either platform: the database lives inside the app sandbox. The config
plugin only exists to change the **build** of SQLite. Options can be set at the top level (both
platforms) or under `ios` / `android` to override one platform.

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-sqlite",
        {
          "useSQLCipher": true,
          "enableFTS": true
        }
      ]
    ]
  }
}
```

The plugin writes these as `expo.sqlite.*` entries in `ios/Podfile.properties.json`
(`expo.sqlite.useSQLCipher`, `expo.sqlite.enableFTS`, and so on). No `Info.plist` usage string is
involved.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-sqlite",
        {
          "android": {
            "useSQLCipher": true,
            "enableFTS": true
          }
        }
      ]
    ]
  }
}
```

The plugin writes the same keys into `android/gradle.properties`. No `AndroidManifest.xml` permission
is added.
:::

| Plugin option | Effect |
| --- | --- |
| `useSQLCipher` | Builds against SQLCipher so the file can be encrypted with `PRAGMA key`. |
| `enableFTS` | Enables the full-text search modules. |
| `useLibSQL` | Builds against libSQL instead of SQLite. |
| `withSQLiteVecExtension` | Bundles the `sqlite-vec` extension. |
| `customBuildFlags` | Extra compile-time flags passed to the SQLite build. |

Changing any option changes native code, so you must rebuild the development build. See
[What a Config Plugin Is](../expo-config-plugins/what-they-are.md).

## Platform differences

| Concern | iOS | Android | Web |
| --- | --- | --- | --- |
| Status | Stable | Stable | **Alpha** — may be unstable |
| File location | App sandbox | App private storage | OPFS via WebAssembly |
| Extra requirements | None | None | `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers for `SharedArrayBuffer` |

## Common patterns

### Atomic batch writes

```ts title=lib/importNotes.ts
import type {SQLiteDatabase} from 'expo-sqlite';

export async function importNotes(
  db: SQLiteDatabase,
  notes: {title: string; body: string}[],
): Promise<void> {
  // withExclusiveTransactionAsync hands you a transaction-scoped object.
  // Queries run through `txn` cannot be interleaved with other queries on
  // the connection, which withTransactionAsync does not guarantee.
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const note of notes) {
      await txn.runAsync(
        'INSERT INTO notes (title, body, updated_at) VALUES (?, ?, ?)',
        note.title,
        note.body,
        Date.now(),
      );
    }
  });
}
```

### Reusing a prepared statement

```ts title=lib/bulkInsert.ts
import type {SQLiteDatabase} from 'expo-sqlite';

export async function insertTags(db: SQLiteDatabase, tags: string[]): Promise<void> {
  const statement = await db.prepareAsync('INSERT OR IGNORE INTO tags (name) VALUES ($name)');
  try {
    for (const name of tags) {
      await statement.executeAsync({$name: name});
    }
  } finally {
    // An unfinalized statement holds native resources until the connection
    // closes. Always finalize in `finally`, so a thrown insert cannot leak it.
    await statement.finalizeAsync();
  }
}
```

### Streaming a large table

```ts title=lib/exportNotes.ts
import type {SQLiteDatabase} from 'expo-sqlite';

export async function countLongNotes(db: SQLiteDatabase): Promise<number> {
  let n = 0;
  // getEachAsync yields one row at a time instead of materialising the
  // whole result set in memory.
  for await (const row of db.getEachAsync<{body: string}>('SELECT body FROM notes')) {
    if (row.body.length > 1000) {
      n++;
    }
  }
  return n;
}
```

## Performance considerations

- **Enable WAL once**, at creation. It lets reads continue during a write.
- **Wrap bulk writes in a transaction.** Hundreds of individual `runAsync` calls each commit and fsync;
  one transaction commits once.
- **Index the columns you filter and sort on.** `EXPLAIN QUERY PLAN` shows whether SQLite is scanning.
- **Prefer `getEachAsync` over `getAllAsync`** for results that could be large.
- **Avoid the `…Sync` methods** in anything the user can see; they freeze the JS thread.

## Security considerations

### SQL injection

**Threat.** User input reaches a query as SQL text rather than as a value, and an attacker changes what
the query does.

**Exploit.** A search box wired through string concatenation:

```ts title=lib/vulnerableSearch.ts
import type {SQLiteDatabase} from 'expo-sqlite';

// VULNERABLE: do not ship this.
export async function vulnerableSearch(db: SQLiteDatabase, term: string) {
  return db.getAllAsync(`SELECT * FROM notes WHERE title = '${term}'`);
}
```

Typing `' OR '1'='1` returns every row. With `execAsync` — which runs multiple statements — the input
`x'; DROP TABLE notes; --` destroys the table.

**Fix.** Bind every value. `runAsync`, `getFirstAsync`, `getAllAsync`, `getEachAsync`, prepared
statements and the `sql` tagged template all bind parameters. Never pass user input to `execAsync`.

```ts title=lib/safeSearch.ts
import type {SQLiteDatabase} from 'expo-sqlite';

export async function safeSearch(db: SQLiteDatabase, term: string) {
  return db.getAllAsync('SELECT * FROM notes WHERE title = ?', term);
}
```

**Verification.** Call `safeSearch(db, "' OR '1'='1")` and confirm it returns an empty array (no note
has that literal title), while the vulnerable version returns every row.

### Data at rest

**Threat.** Someone with access to the device's app storage copies the database file.

**Exploit.** On a debuggable Android build:

```bash
adb shell run-as com.example.myapp ls files/SQLite
adb exec-out run-as com.example.myapp cat files/SQLite/notes.db > notes.db
sqlite3 notes.db "select * from notes;"
```

Every row comes out as plaintext.

**Fix.** If the data is sensitive, build with `useSQLCipher: true` and set a key before any other
statement. Store the key itself in [`expo-secure-store`](secure-store.md), never in the bundle.

```ts title=lib/encryptedDb.ts
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export async function openEncryptedDb(): Promise<SQLite.SQLiteDatabase> {
  let key = await SecureStore.getItemAsync('db_key');
  if (key === null) {
    // A random per-install key, held in the Keychain / Keystore.
    key = Crypto.randomUUID();
    await SecureStore.setItemAsync('db_key', key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }
  const db = await SQLite.openDatabaseAsync('secure.db');
  // PRAGMA key must run before any other statement. The key is generated
  // by us, not user input; escape single quotes defensively anyway.
  await db.execAsync(`PRAGMA key = '${key.replace(/'/g, "''")}'`);
  return db;
}
```

**Verification.** Pull the file again with the `adb` commands above. `sqlite3 notes.db "select * from
notes;"` now fails with `file is not a database`.

Be precise about what this buys you: SQLCipher protects the file **at rest**. It does not protect data
from your own running process, and on a compromised device an attacker who hooks the process can read
the key when your app reads it.

## Common mistakes

- **Concatenating input into SQL.** Wrong: `` getAllAsync(`... WHERE id = ${id}`) ``. Right:
  `getAllAsync('... WHERE id = ?', id)`, or the `sql` tagged template.
- **Passing user input to `execAsync`.** It binds nothing and runs multiple statements.
- **Forgetting to finalize prepared statements.** Put `finalizeAsync()` in a `finally` block.
- **Running `CREATE TABLE` in every component.** Put schema setup in one migration function, run once
  via `SQLiteProvider`'s `onInit`.
- **Relying on `withTransactionAsync` for ordering.** Other queries on the same connection can run
  inside it. Use `withExclusiveTransactionAsync` when interleaving would corrupt the result.
- **Expecting SQLCipher to work in Expo Go.** It needs a development build with the plugin option.
- **Setting `PRAGMA key` after another statement.** It must be first, or the database opens unencrypted.
- **Storing images as BLOBs.** Keep files on disk and store the path.
- **Using the `…Sync` API inside render.** It blocks the JS thread for the whole query.

## Related topics

- [Secure Store](secure-store.md) — where the SQLCipher key and tokens belong.
- [File System and Storage](file-system-and-storage.md) — files, and where binary data should live.
- [Background Tasks](background-tasks.md) — syncing a local database while the app is backgrounded.
- [Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md) — the storage threat model.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — why the SQLCipher option needs a rebuild.
- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — when Expo Go stops being enough.
