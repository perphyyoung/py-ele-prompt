---
name: "sqlite-optimization"
description: "SQLite database optimization patterns for query performance, index design, and transaction management. Invoke when writing SQL queries, designing schemas, or optimizing database operations."
---

# SQLite Optimization Skill

Expert guidance for SQLite database optimization, query performance tuning, index design, and transaction management in Node.js applications.

**PROACTIVE ACTIVATION**: Use this skill automatically when working with SQLite databases in Node.js/Electron projects. Detect SQLite usage through `sqlite3` or `better-sqlite3` dependencies, or presence of database files (`.db`, `.sqlite`, `.sqlite3`).

**DETECTION**: At the start of a session, check for:
- `sqlite3` or `better-sqlite3` in `package.json` dependencies
- Presence of `.db`, `.sqlite`, or `.sqlite3` files
- SQL queries in code (SELECT, INSERT, UPDATE, DELETE statements)
- Database connection code

**USE CASES**: Writing optimized SQL queries, designing database schemas, creating indexes, managing transactions, implementing connection pooling, and reviewing database code.

---

## Auto-activation

This skill activates automatically in projects using SQLite.

### Project Detection

Check if this is a SQLite project:

```bash
# Check package.json for SQLite dependency
grep -i "sqlite" package.json

# Check for database files
find . -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3"
```

If SQLite is detected, apply this skill's patterns proactively when:

- Writing SQL queries
- Designing database schemas
- Creating or modifying tables
- Implementing data access layers
- Optimizing slow queries
- Managing transactions
- Setting up indexes

---

## Philosophy: Optimize for Read Performance, Ensure Data Integrity

SQLite optimization priorities:

| Principle | Description | Priority |
|-----------|-------------|----------|
| **Index Strategically** | Create indexes on frequently queried columns | P0 |
| **Use Transactions** | Batch operations in transactions for atomicity and speed | P0 |
| **Query Optimization** | Write efficient queries, avoid N+1, use JOINs properly | P0 |
| **WAL Mode** | Enable Write-Ahead Logging for better concurrency | P1 |
| **Connection Pooling** | Reuse connections, don't create/destroy repeatedly | P1 |
| **Pragma Tuning** | Configure cache size, synchronous mode, etc. | P2 |

---

## Index Design

### When to Create Indexes

Create indexes on columns that are:

1. **Used in WHERE clauses** - Filter conditions
2. **Used in JOIN conditions** - Foreign keys and relationships
3. **Used in ORDER BY** - Sorting columns
4. **Used in GROUP BY** - Aggregation columns
5. **High selectivity** - Many unique values

### Index Creation Patterns

```sql
-- ✅ GOOD: Index on frequently filtered columns
CREATE INDEX idx_prompts_updated_at ON prompts(updated_at);
CREATE INDEX idx_prompts_is_deleted ON prompts(is_deleted);
CREATE INDEX idx_prompts_is_favorite ON prompts(is_favorite);

-- ✅ GOOD: Composite index for multi-column queries
-- Optimizes: WHERE is_deleted = 0 ORDER BY updated_at DESC
CREATE INDEX idx_prompts_deleted_updated ON prompts(is_deleted, updated_at DESC);

-- ✅ GOOD: Partial index for filtered subsets
-- Only indexes non-deleted prompts, smaller and faster
CREATE INDEX idx_prompts_active ON prompts(updated_at) WHERE is_deleted = 0;

-- ❌ AVOID: Index on low-selectivity columns
CREATE INDEX idx_prompts_is_deleted ON prompts(is_deleted); -- Only 0 or 1
-- Unless used in WHERE clauses frequently

-- ❌ AVOID: Too many indexes on write-heavy tables
-- Each INSERT/UPDATE must update all indexes
```

### Index Selection Strategy

```sql
-- Query pattern 1: Filter by status, sort by date
SELECT * FROM prompts 
WHERE is_deleted = 0 
ORDER BY updated_at DESC;

-- Optimal index:
CREATE INDEX idx_prompts_deleted_updated ON prompts(is_deleted, updated_at DESC);

-- Query pattern 2: Search by content
SELECT * FROM prompts 
WHERE content LIKE '%keyword%';

-- Note: LIKE with leading wildcard cannot use regular index
-- Solution: Use FULLTEXT search (SQLite 3.9.0+)
CREATE VIRTUAL TABLE prompts_fts USING fts5(content, title);

-- Query pattern 3: Join optimization
SELECT p.*, i.file_name 
FROM prompts p
JOIN prompt_image_relations pir ON p.id = pir.prompt_id
JOIN images i ON pir.image_id = i.id
WHERE p.is_deleted = 0;

-- Optimal indexes:
CREATE INDEX idx_prompt_image_relations_prompt_id ON prompt_image_relations(prompt_id);
CREATE INDEX idx_prompt_image_relations_image_id ON prompt_image_relations(image_id);
```

### Analyze Index Usage

```javascript
// Enable query plan analysis
db.run('EXPLAIN QUERY PLAN SELECT * FROM prompts WHERE is_deleted = 0')

// Output:
// 0|0|0|SEARCH prompts USING INDEX idx_prompts_deleted_updated (is_deleted=?)
// ✅ Using index

// vs:
// 0|0|0|SCAN prompts
// ❌ Full table scan - needs index
```

---

## Query Optimization

### Pattern 1: Avoid SELECT *

```sql
-- ❌ BAD: Selects all columns, wasteful
SELECT * FROM prompts WHERE is_deleted = 0;

-- ✅ GOOD: Select only needed columns
SELECT id, title, content, updated_at 
FROM prompts 
WHERE is_deleted = 0;
```

**Benefits**:
- Less data transfer
- Better index coverage
- Clearer intent

### Pattern 2: Use EXISTS instead of IN for Subqueries

```sql
-- ❌ BAD: IN with subquery can be slow
SELECT * FROM prompts 
WHERE id IN (SELECT prompt_id FROM prompt_image_relations);

-- ✅ GOOD: EXISTS stops at first match
SELECT * FROM prompts p
WHERE EXISTS (
  SELECT 1 FROM prompt_image_relations pir 
  WHERE pir.prompt_id = p.id
);
```

### Pattern 3: Avoid N+1 Queries

```javascript
// ❌ BAD: N+1 query problem
const prompts = await db.all('SELECT * FROM prompts WHERE is_deleted = 0')

for (const prompt of prompts) {
  // One query per prompt = N queries
  const images = await db.all(
    'SELECT * FROM images WHERE id IN (SELECT image_id FROM prompt_image_relations WHERE prompt_id = ?)',
    prompt.id
  )
  prompt.images = images
}

// ✅ GOOD: Single query with JOIN
const prompts = await db.all(`
  SELECT p.*, GROUP_CONCAT(i.file_name) as image_files
  FROM prompts p
  LEFT JOIN prompt_image_relations pir ON p.id = pir.prompt_id
  LEFT JOIN images i ON pir.image_id = i.id
  WHERE p.is_deleted = 0
  GROUP BY p.id
`)

// Or use IN clause (2 queries total)
const prompts = await db.all('SELECT * FROM prompts WHERE is_deleted = 0')
const promptIds = prompts.map(p => p.id)

const relations = await db.all(`
  SELECT pir.prompt_id, i.* 
  FROM prompt_image_relations pir
  JOIN images i ON pir.image_id = i.id
  WHERE pir.prompt_id IN (${promptIds.map(() => '?').join(',')})
`, ...promptIds)

// Group in JavaScript
const imagesByPromptId = {}
for (const rel of relations) {
  if (!imagesByPromptId[rel.prompt_id]) {
    imagesByPromptId[rel.prompt_id] = []
  }
  imagesByPromptId[rel.prompt_id].push(rel)
}

prompts.forEach(p => {
  p.images = imagesByPromptId[p.id] || []
})
```

### Pattern 4: Use UNION ALL instead of UNION

```sql
-- ❌ BAD: UNION removes duplicates (requires sorting)
SELECT id FROM prompts WHERE is_deleted = 0
UNION
SELECT id FROM prompts WHERE is_favorite = 1;

-- ✅ GOOD: UNION ALL keeps duplicates (faster)
SELECT id FROM prompts WHERE is_deleted = 0
UNION ALL
SELECT id FROM prompts WHERE is_favorite = 1;
```

**Only use UNION if you need duplicate removal**.

### Pattern 5: Optimize LIKE Queries

```sql
-- ❌ BAD: Leading wildcard prevents index usage
SELECT * FROM prompts WHERE content LIKE '%keyword%';

-- ✅ GOOD: Trailing wildcard can use index
SELECT * FROM prompts WHERE content LIKE 'keyword%';

-- ✅ BEST: Use FULLTEXT search for complex searches
CREATE VIRTUAL TABLE prompts_fts USING fts5(content, title);

-- Insert data
INSERT INTO prompts_fts(rowid, content, title)
SELECT id, content, title FROM prompts;

-- Search (much faster than LIKE)
SELECT p.* FROM prompts p
JOIN prompts_fts fts ON p.id = fts.rowid
WHERE prompts_fts MATCH 'keyword';
```

### Pattern 6: Use CTEs for Complex Queries

```sql
-- ❌ BAD: Repeated subqueries
SELECT * FROM prompts 
WHERE id IN (SELECT prompt_id FROM prompt_image_relations WHERE image_id = ?)
AND updated_at > (SELECT AVG(updated_at) FROM prompts);

-- ✅ GOOD: Common Table Expression (CTE)
WITH recent_image_prompts AS (
  SELECT prompt_id FROM prompt_image_relations WHERE image_id = ?
),
avg_date AS (
  SELECT AVG(updated_at) as avg_updated FROM prompts
)
SELECT p.* FROM prompts p
JOIN recent_image_prompts rip ON p.id = rip.prompt_id
CROSS JOIN avg_date
WHERE p.updated_at > avg_date.avg_updated;
```

---

## Transaction Management

### Why Use Transactions

1. **Atomicity** - All or nothing
2. **Performance** - Batch operations are 10-100x faster
3. **Consistency** - Database stays in valid state

### Pattern 1: Batch Inserts

```javascript
// ❌ BAD: Individual inserts (slow)
for (const prompt of prompts) {
  await db.run(
    'INSERT INTO prompts (title, content) VALUES (?, ?)',
    prompt.title,
    prompt.content
  )
}

// ✅ GOOD: Transaction (10-100x faster)
await db.run('BEGIN TRANSACTION')
try {
  const stmt = db.prepare('INSERT INTO prompts (title, content) VALUES (?, ?)')
  for (const prompt of prompts) {
    await stmt.run(prompt.title, prompt.content)
  }
  await db.run('COMMIT')
} catch (error) {
  await db.run('ROLLBACK')
  throw error
}
```

### Pattern 2: Prepared Statements in Transactions

```javascript
// ✅ BEST: Prepared statement + transaction
class PromptRepository {
  async bulkInsert(prompts) {
    const db = this.db
    
    return db.transaction(async () => {
      // Prepare once
      const insertPrompt = db.prepare(`
        INSERT INTO prompts (id, title, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      
      const insertTag = db.prepare(`
        INSERT INTO prompt_tag_relations (tag_id, target_id)
        VALUES (?, ?)
      `)
      
      // Execute many times
      for (const prompt of prompts) {
        await insertPrompt.run(
          prompt.id,
          prompt.title,
          prompt.content,
          prompt.createdAt,
          prompt.updatedAt
        )
        
        // Batch insert tags too
        if (prompt.tags?.length > 0) {
          await insertTag.run(
            prompt.tags.map(tagId => [tagId, prompt.id])
          )
        }
      }
    })()
  }
}
```

### Pattern 3: Nested Transactions (Savepoints)

```javascript
// SQLite supports savepoints for nested transactions
await db.run('BEGIN TRANSACTION')
try {
  // Outer transaction
  await db.run('INSERT INTO prompts (title) VALUES (?)', 'Main')
  
  // Savepoint (nested transaction)
  await db.run('SAVEPOINT sp1')
  try {
    await db.run('INSERT INTO prompts (title) VALUES (?)', 'Nested')
    await db.run('RELEASE SAVEPOINT sp1') // Commit savepoint
  } catch (e) {
    await db.run('ROLLBACK TO SAVEPOINT sp1') // Rollback savepoint only
  }
  
  await db.run('COMMIT') // Commit outer transaction
} catch (error) {
  await db.run('ROLLBACK')
  throw error
}
```

### Pattern 4: Optimistic Locking

```javascript
// Use updated_at for optimistic concurrency control
async function updatePrompt(id, data) {
  const result = await db.run(`
    UPDATE prompts 
    SET title = ?, content = ?, updated_at = ?
    WHERE id = ? AND updated_at = ?
  `, data.title, data.content, new Date().toISOString(), id, data.oldUpdatedAt)
  
  if (result.changes === 0) {
    throw new Error('Record was modified by another transaction')
  }
  
  return result
}
```

---

## Connection Management

### Pattern 1: Single Connection (Electron Apps)

```javascript
// database.js - Single connection for entire app lifecycle
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

class Database {
  constructor(dbPath) {
    // ✅ Single connection
    this.db = new sqlite3.Database(dbPath)
    
    // ✅ Configure pragmas
    this.configurePragmas()
  }
  
  configurePragmas() {
    return new Promise((resolve, reject) => {
      // Enable WAL mode for better concurrency
      this.db.run('PRAGMA journal_mode=WAL', (err) => {
        if (err) return reject(err)
        
        // Set cache size (negative = KB, positive = pages)
        this.db.run('PRAGMA cache_size=-64000', (err) => { // 64MB
          if (err) return reject(err)
          
          // Enable foreign keys
          this.db.run('PRAGMA foreign_keys=ON', (err) => {
            if (err) return reject(err)
            resolve()
          })
        })
      })
    })
  }
  
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }
  
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err)
        else resolve({ changes: this.changes, lastID: this.lastID })
      })
    })
  }
  
  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

// Usage
const db = new Database(path.join(app.getPath('userData'), 'prompt-manager.db'))
module.exports = db
```

### Pattern 2: Connection Pooling (Server Apps)

```javascript
// For high-concurrency scenarios
const sqlite3 = require('sqlite3')

class ConnectionPool {
  constructor(dbPath, size = 5) {
    this.dbPath = dbPath
    this.size = size
    this.connections = []
    this.available = []
    this.waiting = []
    
    // Create pool
    for (let i = 0; i < size; i++) {
      const db = new sqlite3.Database(dbPath)
      this.connections.push(db)
      this.available.push(db)
    }
  }
  
  async acquire() {
    if (this.available.length > 0) {
      return this.available.pop()
    }
    
    // Wait for available connection
    return new Promise((resolve) => {
      this.waiting.push(resolve)
    })
  }
  
  release(db) {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()
      resolve(db)
    } else {
      this.available.push(db)
    }
  }
  
  async query(sql, params = []) {
    const db = await this.acquire()
    try {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err)
          else resolve(rows)
        })
      })
    } finally {
      this.release(db)
    }
  }
  
  async close() {
    for (const db of this.connections) {
      await new Promise((resolve, reject) => {
        db.close((err) => err ? reject(err) : resolve())
      })
    }
  }
}
```

---

## PRAGMA Configuration

### Essential PRAGMAs

```javascript
// Configure on connection open
const pragmas = {
  // Write-Ahead Logging - better concurrency
  'journal_mode': 'WAL',
  
  // Synchronous mode (NORMAL is safe with WAL)
  'synchronous': 'NORMAL',
  
  // Cache size (negative = KB)
  'cache_size': '-64000', // 64MB
  
  // Enable foreign keys
  'foreign_keys': 'ON',
  
  // Temporary store in memory
  'temp_store': 'MEMORY',
  
  // Memory-mapped I/O (SQLite 3.7.17+)
  'mmap_size': '268435456', // 256MB
}

for (const [pragma, value] of Object.entries(pragmas)) {
  db.run(`PRAGMA ${pragma} = ${value}`)
}
```

### PRAGMA Explanations

| PRAGMA | Recommended Value | Purpose |
|--------|------------------|---------|
| `journal_mode` | WAL | Write-Ahead Logging for better read/write concurrency |
| `synchronous` | NORMAL | Balance between safety and performance (safe with WAL) |
| `cache_size` | -64000 (64MB) | Increase from default 2MB for better performance |
| `foreign_keys` | ON | Enforce referential integrity |
| `temp_store` | MEMORY | Store temporary tables in memory |
| `mmap_size` | 268435456 (256MB) | Enable memory-mapped I/O for large files |

---

## Schema Design

### Normalization vs Denormalization

```sql
-- ✅ GOOD: Normalized schema (3NF)
CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE,
  type TEXT
);

CREATE TABLE prompt_tag_relations (
  tag_id TEXT,
  target_id TEXT,
  created_at DATETIME,
  PRIMARY KEY (tag_id, target_id),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (target_id) REFERENCES prompts(id)
);

-- Query with JOIN
SELECT p.*, GROUP_CONCAT(t.name) as tags
FROM prompts p
LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.target_id
LEFT JOIN tags t ON ptr.tag_id = t.id
WHERE p.is_deleted = 0
GROUP BY p.id;
```

**When to Denormalize**:

```sql
-- ✅ GOOD: Denormalize for read performance
CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  -- Denormalized: store tag count for quick display
  tag_count INTEGER DEFAULT 0,
  -- Denormalized: store first image for preview
  preview_image_path TEXT,
  created_at DATETIME,
  updated_at DATETIME
);

-- Update denormalized fields on write
CREATE TRIGGER update_tag_count AFTER INSERT ON prompt_tag_relations
BEGIN
  UPDATE prompts 
  SET tag_count = (
    SELECT COUNT(*) FROM prompt_tag_relations WHERE target_id = NEW.target_id
  )
  WHERE id = NEW.target_id;
END;
```

### Indexing Strategy

```sql
-- Core tables
CREATE INDEX idx_prompts_updated_at ON prompts(updated_at DESC);
CREATE INDEX idx_prompts_created_at ON prompts(created_at DESC);
CREATE INDEX idx_prompts_is_deleted ON prompts(is_deleted);
CREATE INDEX idx_prompts_is_favorite ON prompts(is_favorite);

-- Composite indexes for common query patterns
CREATE INDEX idx_prompts_active_updated ON prompts(is_deleted, updated_at DESC);
CREATE INDEX idx_prompts_favorite_updated ON prompts(is_favorite, updated_at DESC);

-- Relationship tables
CREATE INDEX idx_prompt_image_relations_prompt_id ON prompt_image_relations(prompt_id);
CREATE INDEX idx_prompt_image_relations_image_id ON prompt_image_relations(image_id);
CREATE INDEX idx_prompt_tag_relations_target_id ON prompt_tag_relations(target_id);
CREATE INDEX idx_prompt_tag_relations_tag_id ON prompt_tag_relations(tag_id);
```

---

## Performance Monitoring

### Query Profiling

```javascript
// Enable query profiling
db.run('PRAGMA profiling = ON')

// Or manually track slow queries
class ProfiledDatabase {
  constructor(db) {
    this.db = db
    this.slowQueryThreshold = 100 // ms
  }
  
  async query(sql, params = []) {
    const start = Date.now()
    try {
      return await this.db.query(sql, params)
    } finally {
      const duration = Date.now() - start
      if (duration > this.slowQueryThreshold) {
        console.warn(`Slow query (${duration}ms):`, sql, params)
      }
    }
  }
}
```

### Analyze Table Statistics

```sql
-- Update statistics
ANALYZE;

-- View statistics
SELECT * FROM sqlite_stat1;

-- Check index usage
SELECT * FROM sqlite_stat1 WHERE tbl = 'prompts';
```

### Vacuum and Optimize

```javascript
// Periodic maintenance
async function optimizeDatabase() {
  // Reclaim space from deleted rows
  await db.run('VACUUM')
  
  // Update statistics
  await db.run('ANALYZE')
  
  // Check integrity
  const result = await db.get('PRAGMA integrity_check')
  if (result.integrity_check !== 'ok') {
    console.error('Database integrity check failed:', result)
  }
}

// Run monthly or after large deletions
setInterval(optimizeDatabase, 30 * 24 * 60 * 60 * 1000) // 30 days
```

---

## Common Anti-Patterns

### Anti-Pattern 1: Missing Indexes

```sql
-- ❌ BAD: No index on filtered column
SELECT * FROM prompts WHERE is_deleted = 0 AND updated_at > ?;

-- ✅ GOOD: Add composite index
CREATE INDEX idx_prompts_deleted_updated ON prompts(is_deleted, updated_at);
```

### Anti-Pattern 2: Functions on Indexed Columns

```sql
-- ❌ BAD: Function prevents index usage
SELECT * FROM prompts WHERE DATE(created_at) = '2024-01-01';

-- ✅ GOOD: Use range query
SELECT * FROM prompts 
WHERE created_at >= '2024-01-01 00:00:00' 
AND created_at < '2024-01-02 00:00:00';
```

### Anti-Pattern 3: OR Conditions

```sql
-- ❌ BAD: OR can prevent index usage
SELECT * FROM prompts WHERE id = ? OR title LIKE ?;

-- ✅ GOOD: Use UNION
SELECT * FROM prompts WHERE id = ?
UNION
SELECT * FROM prompts WHERE title LIKE ?;
```

### Anti-Pattern 4: Unparameterized Queries (SQL Injection!)

```javascript
// ❌ DANGEROUS: SQL injection vulnerability
const title = userInput
db.run(`SELECT * FROM prompts WHERE title = '${title}'`)

// ✅ SAFE: Parameterized query
db.run('SELECT * FROM prompts WHERE title = ?', [userInput])
```

### Anti-Pattern 5: Large Transactions

```javascript
// ❌ BAD: Transaction holds lock too long
await db.run('BEGIN')
for (let i = 0; i < 10000; i++) {
  await processItem(i) // Slow operation
  await db.run('INSERT INTO logs VALUES (?)', i)
}
await db.run('COMMIT')

// ✅ GOOD: Batch in smaller transactions
const batchSize = 100
for (let i = 0; i < 10000; i += batchSize) {
  await db.run('BEGIN')
  try {
    for (let j = i; j < i + batchSize; j++) {
      await db.run('INSERT INTO logs VALUES (?)', j)
    }
    await db.run('COMMIT')
  } catch (e) {
    await db.run('ROLLBACK')
    throw e
  }
}
```

---

## Code Generation Guidelines

When generating SQLite code:

1. **Always use parameterized queries** - Prevent SQL injection
2. **Create indexes on foreign keys** - Optimize JOINs
3. **Use transactions for batch operations** - 10-100x faster
4. **Enable WAL mode** - Better concurrency
5. **Use prepared statements** - Reuse query plans
6. **Avoid SELECT *** - Select only needed columns
7. **Use EXPLAIN QUERY PLAN** - Verify index usage
8. **Configure PRAGMAs** - Optimize cache and I/O
9. **Handle errors in transactions** - Always ROLLBACK on error
10. **Monitor slow queries** - Log queries > 100ms

---

## Proactive Application

When SQLite is detected in the project, automatically apply these patterns:

### When Writing Queries

Always check for index usage:

```javascript
// Before: May cause full table scan
const prompts = await db.query(
  'SELECT * FROM prompts WHERE is_deleted = 0 ORDER BY updated_at DESC'
)

// After: Verify with EXPLAIN
const plan = await db.query(
  'EXPLAIN QUERY PLAN SELECT * FROM prompts WHERE is_deleted = 0 ORDER BY updated_at DESC'
)
console.log(plan) // Should show "USING INDEX"

// If no index, create one
await db.query('CREATE INDEX idx_prompts_deleted_updated ON prompts(is_deleted, updated_at DESC)')
```

### When Designing Schema

Always include indexes:

```sql
-- When creating a new table, include indexes
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  file_name TEXT,
  created_at DATETIME,
  is_deleted INTEGER,
  is_favorite INTEGER
);

-- Add indexes immediately
CREATE INDEX idx_images_created_at ON images(created_at DESC);
CREATE INDEX idx_images_is_deleted ON images(is_deleted);
CREATE INDEX idx_images_is_favorite ON images(is_favorite);
```

### When Reviewing Code

Flag these issues:

- ❌ Missing indexes on WHERE/JOIN/ORDER BY columns
- ❌ No transaction for batch operations
- ❌ Unparameterized queries (SQL injection risk)
- ❌ SELECT * instead of specific columns
- ❌ N+1 query pattern
- ❌ No WAL mode configured
- ❌ Missing error handling in transactions
- ❌ LIKE with leading wildcard
- ❌ Functions on indexed columns
- ❌ No connection cleanup on app quit

---

## Performance Checklist

Before deploying a SQLite-based application, verify:

- [ ] All foreign keys have indexes
- [ ] Frequently filtered columns have indexes
- [ ] Composite indexes match query patterns
- [ ] WAL mode is enabled
- [ ] Cache size is configured (≥64MB)
- [ ] Batch operations use transactions
- [ ] All queries are parameterized
- [ ] No N+1 query patterns
- [ ] Slow queries are logged and optimized
- [ ] Database is vacuumed periodically
- [ ] Statistics are updated (ANALYZE)
- [ ] Connection is properly closed on quit

---

## Additional Resources

- [SQLite Query Planner](https://www.sqlite.org/queryplanner.html)
- [SQLite Indexes](https://www.sqlite.org/lang_createindex.html)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [SQLite PRAGMA](https://www.sqlite.org/pragma.html)
- [SQLite Performance Tuning](https://www.sqlite.org/speed.html)
- [EXPLAIN QUERY PLAN](https://www.sqlite.org/eqp.html)
