/**
 * 数据库模块 - SQLite
 * 管理提示词、图像和它们之间的关系
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { promises as fs } from 'fs';
import { logInfo, logDebug, logError } from './logger.js';
import { localTime } from './utils/TimeUtils.js';

sqlite3.verbose();

let db = null;

/**
 * 初始化数据库
 * @param {string} dataDir - 数据目录路径
 */
async function initDatabase(dataDir) {
  // 确保数据目录存在
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'prompt-manager.db');

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logError('Database', 'Failed to open database', { error: err.message });
        reject(err);
        return;
      }

      createTables().then(resolve).catch(reject);
    });
  });
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 创建数据库表
 */
async function createTables() {
  const tables = [
    // 提示词表
    `CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_translate TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0,
      deleted_at DATETIME,
      is_favorite INTEGER DEFAULT 0,
      is_safe INTEGER DEFAULT 1,
      note TEXT DEFAULT ''
    )`,

    // 图像表
    `CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      thumbnail_path TEXT,
      md5 TEXT UNIQUE,
      thumbnail_md5 TEXT,
      width INTEGER,
      height INTEGER,
      file_size INTEGER DEFAULT 0,
      gen_params TEXT DEFAULT '{}',  -- JSON格式存储生成参数
      is_deleted INTEGER DEFAULT 0,
      deleted_at DATETIME,
      is_favorite INTEGER DEFAULT 0,
      is_safe INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      note TEXT DEFAULT ''
    )`,

    // 提示词标签组表
    `CREATE TABLE IF NOT EXISTS prompt_tag_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'multi',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // 提示词标签表
    `CREATE TABLE IF NOT EXISTS prompt_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      group_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES prompt_tag_groups(id) ON DELETE SET NULL
    )`,

    // 提示词-标签关联表
    `CREATE TABLE IF NOT EXISTS prompt_tag_relations (
      prompt_id TEXT,
      tag_id INTEGER,
      PRIMARY KEY (prompt_id, tag_id),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES prompt_tags(id) ON DELETE CASCADE
    )`,

    // 提示词-图像关联表
    `CREATE TABLE IF NOT EXISTS prompt_image_relations (
      prompt_id TEXT,
      image_id TEXT,
      sort_order INTEGER DEFAULT 0,
      PRIMARY KEY (prompt_id, image_id),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
    )`,

    // 图像标签组表
    `CREATE TABLE IF NOT EXISTS image_tag_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'multi',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // 图像标签表
    `CREATE TABLE IF NOT EXISTS image_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      group_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES image_tag_groups(id) ON DELETE SET NULL
    )`,

    // 图像-标签关联表
    `CREATE TABLE IF NOT EXISTS image_tag_relations (
      image_id TEXT,
      tag_id INTEGER,
      PRIMARY KEY (image_id, tag_id),
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES image_tags(id) ON DELETE CASCADE
    )`
  ];

  for (const sql of tables) {
    await run(sql);
  }

  // 创建数据库版本表（用于未来可能的迁移）
  await run(`CREATE TABLE IF NOT EXISTS db_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 初始化特殊标签
  await initSpecialTags();

  // 创建索引以优化查询性能
  await createIndexes();

  // 配置 PRAGMA 以优化性能
  await configurePragmas();
}

/**
 * 配置数据库 PRAGMA
 * 优化缓存、并发和 I/O 性能
 */
async function configurePragmas() {
  const pragmas = [
    { name: 'journal_mode', value: 'WAL' },           // 写前日志模式，提升并发性能
    { name: 'synchronous', value: 'NORMAL' },         // 平衡安全与性能
    { name: 'cache_size', value: '-64000' },          // 64MB 缓存（负值表示 KB）
    { name: 'foreign_keys', value: 'ON' },            // 启用外键约束
    { name: 'temp_store', value: 'MEMORY' },          // 临时表存内存
    { name: 'mmap_size', value: '268435456' }         // 256MB 内存映射
  ];

  for (const { name, value } of pragmas) {
    try {
      await run(`PRAGMA ${name} = ${value}`);
    } catch (error) {
      console.warn(`Failed to set PRAGMA ${name}:`, error.message);
    }
  }
}

/**
 * 创建数据库索引
 * 优化常用查询的性能
 */
async function createIndexes() {
  const indexes = [
    // 提示词表索引
    'CREATE INDEX IF NOT EXISTS idx_prompts_updated_at ON prompts(updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_prompts_is_deleted ON prompts(is_deleted)',
    'CREATE INDEX IF NOT EXISTS idx_prompts_is_favorite ON prompts(is_favorite)',
    'CREATE INDEX IF NOT EXISTS idx_prompts_is_safe ON prompts(is_safe)',
    // 复合索引：常用查询模式
    'CREATE INDEX IF NOT EXISTS idx_prompts_deleted_updated ON prompts(is_deleted, updated_at DESC)',

    // 图像表索引
    'CREATE INDEX IF NOT EXISTS idx_images_updated_at ON images(updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_images_is_deleted ON images(is_deleted)',
    'CREATE INDEX IF NOT EXISTS idx_images_is_favorite ON images(is_favorite)',
    'CREATE INDEX IF NOT EXISTS idx_images_is_safe ON images(is_safe)',
    'CREATE INDEX IF NOT EXISTS idx_images_md5 ON images(md5)',
    // 复合索引
    'CREATE INDEX IF NOT EXISTS idx_images_deleted_updated ON images(is_deleted, updated_at DESC)',

    // 关联表索引 - 优化 JOIN 查询
    'CREATE INDEX IF NOT EXISTS idx_prompt_image_relations_prompt_id ON prompt_image_relations(prompt_id)',
    'CREATE INDEX IF NOT EXISTS idx_prompt_image_relations_image_id ON prompt_image_relations(image_id)',
    'CREATE INDEX IF NOT EXISTS idx_prompt_tag_relations_prompt_id ON prompt_tag_relations(prompt_id)',
    'CREATE INDEX IF NOT EXISTS idx_prompt_tag_relations_tag_id ON prompt_tag_relations(tag_id)',
    'CREATE INDEX IF NOT EXISTS idx_image_tag_relations_image_id ON image_tag_relations(image_id)',
    'CREATE INDEX IF NOT EXISTS idx_image_tag_relations_tag_id ON image_tag_relations(tag_id)',
    
    // 标签组索引 - 优化标签组查询
    'CREATE INDEX IF NOT EXISTS idx_prompt_tags_group_id ON prompt_tags(group_id)',
    'CREATE INDEX IF NOT EXISTS idx_image_tags_group_id ON image_tags(group_id)',

    // 部分索引 - 只索引活跃数据，更小更快
    'CREATE INDEX IF NOT EXISTS idx_prompts_active_updated ON prompts(updated_at DESC) WHERE is_deleted = 0',
    'CREATE INDEX IF NOT EXISTS idx_images_active_updated ON images(updated_at DESC) WHERE is_deleted = 0',
    'CREATE INDEX IF NOT EXISTS idx_prompts_active_favorite ON prompts(updated_at DESC) WHERE is_deleted = 0 AND is_favorite = 1',
    'CREATE INDEX IF NOT EXISTS idx_images_active_favorite ON images(updated_at DESC) WHERE is_deleted = 0 AND is_favorite = 1'
  ];

  for (const sql of indexes) {
    try {
      await run(sql);
    } catch (error) {
      console.error('Failed to create index:', sql, error);
    }
  }
}

/**
 * 初始化特殊标签
 * 插入系统保留的特殊标签（如违单）
 */
async function initSpecialTags() {
  // 违单标签 - 用于标记违反单选组限制的图像/提示词
  const violatingTag = await get('SELECT id FROM image_tags WHERE name = ?', ['违单']);
  if (!violatingTag) {
    const _time = localTime();
    await run(
      'INSERT INTO image_tags (name, created_at, updated_at) VALUES (?, ?, ?)',
      ['违单', _time, _time]
    );
  }
}

// 事务状态跟踪
let transactionDepth = 0;

/**
 * 在事务中执行异步操作
 * 支持嵌套调用（如果已经在事务中，直接执行函数而不开始新事务）
 * @param {Function} asyncFn - 异步函数
 * @returns {Promise<any>} 函数返回值
 */
async function runInTransaction(asyncFn) {
  // 如果已经在事务中，直接执行函数
  if (transactionDepth > 0) {
    return await asyncFn();
  }

  transactionDepth++;
  await run('BEGIN TRANSACTION');
  try {
    const result = await asyncFn();
    await run('COMMIT');
    return result;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  } finally {
    transactionDepth--;
  }
}

// 慢查询阈值（毫秒）
const SLOW_QUERY_THRESHOLD = 100;

/**
 * 包装 all 查询，添加性能监控
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数
 * @returns {Promise<Array>} 查询结果
 */
async function timedAll(sql, params = []) {
  const start = Date.now();
  try {
    return await all(sql, params);
  } finally {
    const duration = Date.now() - start;
    if (duration > SLOW_QUERY_THRESHOLD) {
      console.warn(`[Slow Query] ${duration}ms: ${sql.substring(0, 100)}...`);
    }
  }
}

/**
 * 包装 get 查询，添加性能监控
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数
 * @returns {Promise<Object>} 查询结果
 */
async function timedGet(sql, params = []) {
  const start = Date.now();
  try {
    return await get(sql, params);
  } finally {
    const duration = Date.now() - start;
    if (duration > SLOW_QUERY_THRESHOLD) {
      console.warn(`[Slow Query] ${duration}ms: ${sql.substring(0, 100)}...`);
    }
  }
}

/**
 * 数据库维护优化
 * 定期执行 VACUUM 和 ANALYZE
 */
async function optimizeDatabase() {
  console.log('[DB] Starting optimization...');

  try {
    // 回收空间
    await run('VACUUM');
    console.log('[DB] VACUUM completed');

    // 更新统计信息
    await run('ANALYZE');
    console.log('[DB] ANALYZE completed');

    // 完整性检查
    const result = await get('PRAGMA integrity_check');
    if (result.integrity_check !== 'ok') {
      console.error('[DB] Integrity check failed:', result);
    } else {
      console.log('[DB] Integrity check passed');
    }

    console.log('[DB] Optimization completed');
    return true;
  } catch (error) {
    console.error('[DB] Optimization failed:', error);
    throw error;
  }
}

/**
 * 执行 SQL 语句
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

/**
 * 查询单条记录
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * 查询多条记录
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ==================== Tag Group 操作 ====================

/**
 * 创建提示词标签组
 * @param {string} name - 标签组名称
 * @param {string} type - 选择类型: 'single' | 'multi'
 * @param {number} sortOrder - 排序顺序
 */
async function createPromptTagGroup(name, type = 'multi', sortOrder = 0) {
  const now = localTime();
  const sql = `
    INSERT INTO prompt_tag_groups (name, type, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `;
  const result = await run(sql, [name, type, sortOrder, now, now]);
  return { id: result.id, name, type, sortOrder };
}

/**
 * 获取所有提示词标签组（仅组定义，不含标签）
 */
async function getPromptTagGroupsOnly() {
  const sql = `
    SELECT id, name, type, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt
    FROM prompt_tag_groups
    ORDER BY sort_order ASC, created_at ASC
  `;
  return await all(sql);
}

/**
 * 更新提示词标签组
 * @param {number} id - 标签组ID
 * @param {object} updates - 更新内容
 */
async function updatePromptTagGroup(id, updates) {
  const { name, type, sortOrder } = updates;
  const now = localTime();
  
  const fields = [];
  const values = [];
  
  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (type !== undefined) {
    fields.push('type = ?');
    values.push(type);
  }
  if (sortOrder !== undefined) {
    fields.push('sort_order = ?');
    values.push(sortOrder);
  }
  
  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);
  
  const sql = `UPDATE prompt_tag_groups SET ${fields.join(', ')} WHERE id = ?`;
  await run(sql, values);
  return getPromptTagGroupById(id);
}

/**
 * 获取单个提示词标签组
 */
async function getPromptTagGroupById(id) {
  const sql = `
    SELECT id, name, type, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt
    FROM prompt_tag_groups
    WHERE id = ?
  `;
  return await get(sql, [id]);
}

/**
 * 删除提示词标签组
 * @param {number} id - 标签组ID
 */
async function deletePromptTagGroup(id) {
  // 关联的标签会被设置为 group_id = NULL (ON DELETE SET NULL)
  const sql = 'DELETE FROM prompt_tag_groups WHERE id = ?';
  await run(sql, [id]);
  return true;
}

/**
 * 创建图像标签组
 * @param {string} name - 标签组名称
 * @param {string} type - 选择类型: 'single' | 'multi'
 * @param {number} sortOrder - 排序顺序
 */
async function createImageTagGroup(name, type = 'multi', sortOrder = 0) {
  const now = localTime();
  const sql = `
    INSERT INTO image_tag_groups (name, type, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `;
  const result = await run(sql, [name, type, sortOrder, now, now]);
  return { id: result.id, name, type, sortOrder };
}

/**
 * 获取所有图像标签组（仅组定义，不含标签）
 */
async function getImageTagGroupsOnly() {
  const sql = `
    SELECT id, name, type, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt
    FROM image_tag_groups
    ORDER BY sort_order ASC, created_at ASC
  `;
  return await all(sql);
}

/**
 * 更新图像标签组
 * @param {number} id - 标签组ID
 * @param {object} updates - 更新内容
 */
async function updateImageTagGroup(id, updates) {
  const { name, type, sortOrder } = updates;
  const now = localTime();
  
  const fields = [];
  const values = [];
  
  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (type !== undefined) {
    fields.push('type = ?');
    values.push(type);
  }
  if (sortOrder !== undefined) {
    fields.push('sort_order = ?');
    values.push(sortOrder);
  }
  
  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);
  
  const sql = `UPDATE image_tag_groups SET ${fields.join(', ')} WHERE id = ?`;
  await run(sql, values);
  return getImageTagGroupById(id);
}

/**
 * 获取单个图像标签组
 */
async function getImageTagGroupById(id) {
  const sql = `
    SELECT id, name, type, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt
    FROM image_tag_groups
    WHERE id = ?
  `;
  return await get(sql, [id]);
}

/**
 * 删除图像标签组
 * @param {number} id - 标签组ID
 */
async function deleteImageTagGroup(id) {
  // 关联的标签会被设置为 group_id = NULL (ON DELETE SET NULL)
  const sql = 'DELETE FROM image_tag_groups WHERE id = ?';
  await run(sql, [id]);
  return true;
}

// ==================== Prompt 操作 ====================

/**
 * 将数据库行映射为提示词对象
 * @param {Object} row - 数据库行
 * @param {Object} options - 可选配置
 * @param {boolean} options.includeImages - 是否包含 images 数组（默认 true）
 * @param {boolean} options.includeDeletedAt - 是否包含 deletedAt 字段（默认 false）
 * @returns {Object} 提示词对象
 */
function mapRowToPrompt(row, options = {}) {
  const { includeImages = true, includeDeletedAt = false } = options;

  const prompt = {
    id: row.id,
    title: row.title,
    content: row.content,
    contentTranslate: row.content_translate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isFavorite: row.is_favorite === 1,
    isSafe: row.is_safe === 1 ? 1 : 0,
    isDeleted: row.is_deleted === 1,
    note: row.note,
    tags: row.tags ? row.tags.split(',').filter(t => t) : []
  };

  if (includeImages) {
    prompt.images = [];
  }

  if (includeDeletedAt) {
    prompt.deletedAt = row.deleted_at;
  }

  return prompt;
}

/**
 * 批量获取提示词的关联图像
 * 优化 N+1 查询问题，使用单次查询 + JavaScript 分组
 * @param {Array} promptRows - 提示词行数据
 * @param {Object} options - 选项
 * @param {boolean} options.includeDeletedAt - 是否包含 deletedAt 字段
 * @returns {Promise<Array>} 包含图像的提示词列表
 */
async function getPromptsWithImages(promptRows, options = {}) {
  if (promptRows.length === 0) return [];

  const promptIds = promptRows.map(r => r.id);
  const placeholders = promptIds.map(() => '?').join(',');

  const sql = `
    SELECT pir.prompt_id, i.id, i.file_name as fileName,
           i.relative_path as relativePath, i.thumbnail_path as thumbnailPath
    FROM prompt_image_relations pir
    JOIN images i ON pir.image_id = i.id
    WHERE pir.prompt_id IN (${placeholders})
    ORDER BY pir.prompt_id, pir.sort_order ASC
  `;

  const allImages = await all(sql, promptIds);

  const imagesByPromptId = {};
  for (const img of allImages) {
    const key = String(img.prompt_id);
    if (!imagesByPromptId[key]) {
      imagesByPromptId[key] = [];
    }
    imagesByPromptId[key].push(img);
  }

  return promptRows.map(row => {
    const prompt = mapRowToPrompt(row, options);
    const rowIdStr = String(row.id);
    prompt.images = imagesByPromptId[rowIdStr] || [];
    return prompt;
  });
}

/**
 * 获取所有提示词（不包括已删除的）
 * @param {string} sortBy - 排序字段: 'updatedAt', 'createdAt', 'title'
 * @param {string} sortOrder - 排序顺序: 'asc', 'desc'
 */
async function getPrompts(sortBy = 'updatedAt', sortOrder = 'desc') {
  // 排序字段映射
  const sortFieldMap = {
    'updatedAt': 'p.updated_at',
    'createdAt': 'p.created_at',
    'title': 'p.title'
  };

  const sortField = sortFieldMap[sortBy] || 'p.updated_at';
  const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // 获取所有提示词基本信息（包括已删除的）
  const sql = `
    SELECT p.*, GROUP_CONCAT(pt.name) as tags
    FROM prompts p
    LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id
    LEFT JOIN prompt_tags pt ON ptr.tag_id = pt.id
    GROUP BY p.id
    ORDER BY ${sortField} ${order}
  `;
  
  const rows = await all(sql);

  // 使用批量查询获取图像，避免 N+1 问题
  return getPromptsWithImages(rows);
}

/**
 * 检查标题是否已存在
 * @param {string} title - 提示词标题
 * @param {string} excludeId - 排除的提示词ID（用于编辑时排除自己）
 * @returns {Promise<boolean>} - 是否存在
 */
async function isTitleExists(title, excludeId = null) {
  let sql = 'SELECT COUNT(*) as count FROM prompts WHERE title = ? AND is_deleted = 0';
  const params = [title];
  
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  
  const result = await get(sql, params);
  return result.count > 0;
}

/**
 * 获取单个提示词
 */
async function getPromptById(id) {
  const sql = `
    SELECT p.*, GROUP_CONCAT(pt.name) as tags
    FROM prompts p
    LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id
    LEFT JOIN prompt_tags pt ON ptr.tag_id = pt.id
    WHERE p.id = ? AND p.is_deleted = 0
    GROUP BY p.id
  `;
  const row = await get(sql, [id]);
  if (!row) return null;

  const prompt = mapRowToPrompt(row);

  // 获取关联的图像
  const imagesSql = `
    SELECT i.id, i.file_name as fileName,
           i.relative_path as relativePath, i.thumbnail_path as thumbnailPath
    FROM images i
    JOIN prompt_image_relations pir ON i.id = pir.image_id
    WHERE pir.prompt_id = ?
  `;
  const images = await all(imagesSql, [id]);
  prompt.images = images || [];

  return prompt;
}

/**
 * 搜索提示词
 * 在数据库层面进行搜索，支持标题、内容、翻译、标签和备注搜索
 * @param {string} query - 搜索关键词
 * @returns {Promise<Array>} - 匹配的提示词列表
 */
async function searchPrompts(query) {
  const lowerQuery = `%${query.toLowerCase()}%`;

  // 搜索提示词（标题、内容、翻译、标签、备注匹配）
  const sql = `
    SELECT DISTINCT p.*, GROUP_CONCAT(pt.name) as tags
    FROM prompts p
    LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id
    LEFT JOIN prompt_tags pt ON ptr.tag_id = pt.id
    WHERE p.is_deleted = 0
    AND (
      LOWER(p.title) LIKE ?
      OR LOWER(p.content) LIKE ?
      OR LOWER(p.content_translate) LIKE ?
      OR LOWER(p.note) LIKE ?
      OR p.id IN (
        SELECT DISTINCT p2.id
        FROM prompts p2
        JOIN prompt_tag_relations ptr2 ON p2.id = ptr2.prompt_id
        JOIN prompt_tags pt2 ON ptr2.tag_id = pt2.id
        WHERE LOWER(pt2.name) LIKE ?
      )
    )
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `;

  const rows = await all(sql, [lowerQuery, lowerQuery, lowerQuery, lowerQuery, lowerQuery]);

  // 使用批量查询获取图像，避免 N+1 问题
  return getPromptsWithImages(rows);
}

/**
 * 添加提示词
 * 使用事务确保数据一致性
 */
async function addPrompt(prompt) {
  const { id, title, content, contentTranslate, tags = [], images = [], note = '', isSafe = 1 } = prompt;
  const now = localTime();

  return runInTransaction(async () => {
    await run(
      'INSERT INTO prompts (id, title, content, content_translate, note, is_safe, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, content, contentTranslate || '', note, isSafe, now, now]
    );

    // 添加标签关联
    if (tags.length > 0) {
      await addPromptTags(id, tags);
    }

    // 添加图像关联
    if (images.length > 0) {
      const imageIds = images.map(img => img.id);
      await addPromptImages(id, imageIds);
    }

    return getPromptById(id);
  });
}

/**
 * 更新提示词
 * 使用事务确保数据一致性
 */
async function updatePrompt(id, updates) {
  const { title, content, contentTranslate, tags, images, note, isSafe, isFavorite } = updates;
  const now = localTime();

  return runInTransaction(async () => {
    const relatedFields = ['tags', 'images'];
    const hasBasicFieldUpdate = Object.keys(updates).some(key => !relatedFields.includes(key));

    if (hasBasicFieldUpdate) {
      const fields = [];
      const values = [];

      if (title !== undefined) {
        fields.push('title = ?');
        values.push(title);
      }
      if (content !== undefined) {
        fields.push('content = ?');
        values.push(content);
      }
      if (contentTranslate !== undefined) {
        fields.push('content_translate = ?');
        values.push(contentTranslate);
      }
      if (note !== undefined) {
        fields.push('note = ?');
        values.push(note);
      }
      if (isSafe !== undefined) {
        fields.push('is_safe = ?');
        values.push(isSafe);
      }
      if (isFavorite !== undefined) {
        fields.push('is_favorite = ?');
        values.push(isFavorite ? 1 : 0);
      }
      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);

      await run(`UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // 更新标签 - 增量更新方式
    if (tags !== undefined) {
      const currentTagsRow = await get(
        'SELECT GROUP_CONCAT(pt.name) as tags FROM prompt_tag_relations ptr JOIN prompt_tags pt ON ptr.tag_id = pt.id WHERE ptr.prompt_id = ?',
        [id]
      );
      const currentTagNames = currentTagsRow && currentTagsRow.tags ? currentTagsRow.tags.split(',') : [];

      const tagsToAdd = tags.filter(t => !currentTagNames.includes(t));
      const tagsToRemove = currentTagNames.filter(t => !tags.includes(t));

      const tagsChanged = tagsToAdd.length > 0 || tagsToRemove.length > 0;

      for (const tagName of tagsToRemove) {
        const tagRow = await get('SELECT id FROM prompt_tags WHERE name = ?', [tagName]);
        if (tagRow) {
          await run('DELETE FROM prompt_tag_relations WHERE prompt_id = ? AND tag_id = ?', [id, tagRow.id]);
        }
      }

      if (tagsToAdd.length > 0) {
        await addPromptTags(id, tagsToAdd);
      }

      if (tagsChanged && !hasBasicFieldUpdate) {
        await run('UPDATE prompts SET updated_at = ? WHERE id = ?', [now, id]);
      }
    }

    // 更新图像关联
    if (images !== undefined) {
      const currentImageRows = await all(
        'SELECT image_id FROM prompt_image_relations WHERE prompt_id = ?',
        [id]
      );
      const currentImageIds = currentImageRows.map(r => r.image_id);
      const newImageIds = images.map(img => img.id);

      const imagesToAdd = newImageIds.filter(imgId => !currentImageIds.includes(imgId));
      const imagesToRemove = currentImageIds.filter(imgId => !newImageIds.includes(imgId));

      await run('DELETE FROM prompt_image_relations WHERE prompt_id = ?', [id]);
      if (images.length > 0) {
        await addPromptImages(id, newImageIds);
      }

      if (imagesToAdd.length > 0) {
        await run(
          `UPDATE images SET updated_at = ? WHERE id IN (${imagesToAdd.map(() => '?').join(',')})`,
          [now, ...imagesToAdd]
        );
      }
      if (imagesToRemove.length > 0) {
        await run(
          `UPDATE images SET updated_at = ? WHERE id IN (${imagesToRemove.map(() => '?').join(',')})`,
          [now, ...imagesToRemove]
        );
      }

      if (!hasBasicFieldUpdate) {
        await run('UPDATE prompts SET updated_at = ? WHERE id = ?', [now, id]);
      }
    }

    return getPromptById(id);
  });
}

/**
 * 软删除提示词
 */
async function deletePrompt(id) {
  const now = localTime();
  await run(
    'UPDATE prompts SET is_deleted = 1, deleted_at = ? WHERE id = ?',
    [now, id]
  );
  return true;
}

/**
 * 恢复已删除的提示词
 */
async function restorePrompt(id) {
  await run(
    'UPDATE prompts SET is_deleted = 0, deleted_at = NULL WHERE id = ?',
    [id]
  );
  return getPromptById(id);
}

/**
 * 永久删除提示词
 */
async function permanentDeletePrompt(id) {
  await run('DELETE FROM prompts WHERE id = ?', [id]);
  return true;
}

/**
 * 获取收藏的提示词
 */
async function getFavoritePrompts() {
  const sql = `
    SELECT p.*, GROUP_CONCAT(pt.name) as tags
    FROM prompts p
    LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id
    LEFT JOIN prompt_tags pt ON ptr.tag_id = pt.id
    WHERE p.is_deleted = 0 AND p.is_favorite = 1
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `;
  const rows = await all(sql);
  return getPromptsWithImages(rows);
}

/**
 * 获取回收站中的提示词
 */
async function getDeletedPrompts() {
  const sql = `
    SELECT p.*, GROUP_CONCAT(pt.name) as tags
    FROM prompts p
    LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id
    LEFT JOIN prompt_tags pt ON ptr.tag_id = pt.id
    WHERE p.is_deleted = 1
    GROUP BY p.id
    ORDER BY p.deleted_at DESC
  `;
  const rows = await all(sql);
  return getPromptsWithImages(rows, { includeImages: true, includeDeletedAt: true });
}

// ==================== 标签操作 ====================

/**
 * 获取所有提示词标签
 */
async function getPromptTags() {
  const rows = await all('SELECT name FROM prompt_tags ORDER BY name');
  return rows.map(row => row.name);
}

/**
 * 获取所有提示词标签（包含组信息）
 */
async function getPromptTagsWithGroupInfo() {
  const sql = `
    SELECT pt.name, pt.group_id as groupId, ptg.name as groupName, ptg.type as groupType, ptg.sort_order as groupSortOrder
    FROM prompt_tags pt
    LEFT JOIN prompt_tag_groups ptg ON pt.group_id = ptg.id
    ORDER BY ptg.sort_order ASC, pt.name ASC
  `;
  const rows = await all(sql);
  return rows.map(row => ({
    name: row.name,
    groupId: row.groupId,
    groupName: row.groupName,
    groupType: row.groupType,
    groupSortOrder: row.groupSortOrder
  }));
}

/**
 * 添加提示词标签
 * @param {string} name - 标签名称
 * @param {number} groupId - 标签组ID（可选）
 */
async function addPromptTag(name, groupId = null) {
  const now = localTime();
  try {
    await run(
      'INSERT INTO prompt_tags (name, group_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [name, groupId, now, now]
    );
  } catch (err) {
    // 标签已存在，更新组ID（如果提供了）
    if (err.message.includes('UNIQUE constraint failed')) {
      if (groupId !== null) {
        await run(
          'UPDATE prompt_tags SET group_id = ?, updated_at = ? WHERE name = ?',
          [groupId, now, name]
        );
      }
    } else {
      throw err;
    }
  }

  // 获取标签 ID
  const row = await get('SELECT id FROM prompt_tags WHERE name = ?', [name]);
  return row ? row.id : null;
}

/**
 * 更新提示词标签的所属组
 * @param {string} tagName - 标签名称
 * @param {number|null} groupId - 标签组ID
 */
async function updatePromptTagGroupByTagName(tagName, groupId) {
  const now = localTime();
  await run(
    'UPDATE prompt_tags SET group_id = ?, updated_at = ? WHERE name = ?',
    [groupId, now, tagName]
  );
}

/**
 * 为提示词添加标签
 */
async function addPromptTags(promptId, tagNames) {
  for (const tagName of tagNames) {
    const tagId = await addPromptTag(tagName);
    if (tagId) {
      try {
        await run(
          'INSERT INTO prompt_tag_relations (prompt_id, tag_id) VALUES (?, ?)',
          [promptId, tagId]
        );
      } catch (err) {
        // 关联已存在，忽略错误
        if (!err.message.includes('UNIQUE constraint failed')) {
          throw err;
        }
      }
    }
  }
}

// ==================== 图像操作 ====================

/**
 * 将数据库行映射为图像对象
 * @param {Object} row - 数据库行
 * @param {Array} promptRows - 关联的提示词行
 * @param {Object} options - 可选配置
 * @param {boolean} options.includeDeletedAt - 是否包含 deletedAt 字段
 * @returns {Object} 图像对象
 */
function mapRowToImage(row, promptRows = [], options = {}) {
  const { includeDeletedAt = false } = options;

  const image = {
    id: row.id,
    fileName: row.file_name,
    storedName: row.stored_name,
    relativePath: row.relative_path,
    thumbnailPath: row.thumbnail_path,
    width: row.width,
    height: row.height,
    fileSize: row.file_size || 0,
    isFavorite: row.is_favorite === 1,
    isSafe: row.is_safe === 1 ? 1 : 0,
    isDeleted: row.is_deleted === 1,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: row.image_tags ? row.image_tags.split(',').filter(t => t) : [],
    promptRefs: promptRows.map(p => ({
      promptId: p.id,
      promptTitle: p.title,
      promptContent: p.content
    }))
  };

  if (includeDeletedAt) {
    image.deletedAt = row.deleted_at;
  }

  return image;
}

/**
 * 批量获取图像的关联提示词引用
 * @param {Array<string>} imageIds - 图像 ID 数组
 * @returns {Promise<Array>} 提示词引用列表
 */
async function getPromptRefsForImages(imageIds) {
  if (imageIds.length === 0) return [];
  const placeholders = imageIds.map(() => '?').join(',');
  const sql = `
    SELECT pir.image_id, p.id, p.title, p.content
    FROM prompt_image_relations pir
    JOIN prompts p ON pir.prompt_id = p.id
    WHERE pir.image_id IN (${placeholders}) AND p.is_deleted = 0
  `;
  return await all(sql, imageIds);
}

/**
 * 图像查询公共方法 - 批量获取关联数据避免 N+1 问题
 * @param {string} baseSql - 基础 SQL 查询
 * @param {Array} params - 查询参数
 * @returns {Promise<Array>} 图像列表
 */
async function getImagesCore(baseSql, params) {
  const rows = await all(baseSql, params);
  if (rows.length === 0) return [];

  const imageIds = rows.map(r => r.id);
  const promptRefs = await getPromptRefsForImages(imageIds);

  const refsByImageId = {};
  for (const ref of promptRefs) {
    if (!refsByImageId[ref.image_id]) refsByImageId[ref.image_id] = [];
    refsByImageId[ref.image_id].push({ id: ref.id, title: ref.title, content: ref.content });
  }

  return rows.map(row => mapRowToImage(row, refsByImageId[row.id] || []));
}

/**
 * 获取所有图像（不包括已删除的）
 * @param {string} sortBy - 排序字段: 'createdAt', 'fileName', 'width', 'height'
 * @param {string} sortOrder - 排序顺序: 'asc', 'desc'
 */
async function getImages(sortBy = 'createdAt', sortOrder = 'desc') {
  const sortFieldMap = {
    'createdAt': 'i.created_at',
    'updatedAt': 'i.updated_at',
    'fileName': 'i.file_name',
    'width': 'i.width',
    'height': 'i.height',
    'fileSize': 'i.file_size'
  };

  const sortField = sortFieldMap[sortBy] || 'i.created_at';
  const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const imageSql = `
    SELECT i.*,
           (SELECT GROUP_CONCAT(DISTINCT it.name)
            FROM image_tag_relations itr
            JOIN image_tags it ON itr.tag_id = it.id
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    WHERE i.is_deleted = 0
    ORDER BY ${sortField} ${order}
  `;
  return getImagesCore(imageSql, []);
}

/**
 * 根据 ID 批量获取图像
 * @param {Array<string>} ids - 图像 ID 数组
 * @returns {Array} 图像列表
 */
async function getImagesByIds(ids) {
  if (!ids || ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const sql = `
    SELECT i.*,
           (SELECT GROUP_CONCAT(DISTINCT it.name)
            FROM image_tag_relations itr
            JOIN image_tags it ON itr.tag_id = it.id
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    WHERE i.id IN (${placeholders}) AND i.is_deleted = 0
  `;
  return await getImagesCore(sql, ids);
}

/**
 * 获取所有图像
 * @param {Object} options - 选项
 * @param {boolean} options.forCleanup - 是否用于清理孤儿文件（只返回路径），默认 false
 * @returns {Array} 图像记录
 */
async function getAllImages(options = {}) {
  const { forCleanup = false } = options;
  
  if (forCleanup) {
    // 清理孤儿文件：只需要路径，不需要关联数据
    const sql = 'SELECT id, relative_path, thumbnail_path FROM images';
    return await all(sql);
  }
  
  // 默认：统计或其他场景，使用完整查询
  const imageSql = `
    SELECT i.*,
           (SELECT GROUP_CONCAT(DISTINCT it.name)
            FROM image_tag_relations itr
            JOIN image_tags it ON itr.tag_id = it.id
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    ORDER BY i.created_at DESC
  `;
  return getImagesCore(imageSql, []);
}

/**
 * 根据 MD5 查找图像
 */
async function getImageById(id) {
  // 先获取图像基本信息和标签（使用子查询避免重复）
  const imageSql = `
    SELECT i.*, 
           (SELECT GROUP_CONCAT(DISTINCT it.name) 
            FROM image_tag_relations itr 
            JOIN image_tags it ON itr.tag_id = it.id 
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    WHERE i.id = ?
  `;
  const row = await get(imageSql, [id]);
  if (!row) return null;

  // 单独获取关联的提示词信息
  const promptSql = `
    SELECT p.id, p.title, p.content
    FROM prompts p
    JOIN prompt_image_relations pir ON p.id = pir.prompt_id
    WHERE pir.image_id = ? AND p.is_deleted = 0
  `;
  const promptRows = await all(promptSql, [id]);

  return mapRowToImage(row, promptRows);
}

/**
 * 更新图像
 * @param {string} id - 图像 ID
 * @param {Object} updates - 更新内容
 * @param {boolean} [updates.isFavorite] - 是否收藏
 * @param {boolean} [updates.isSafe] - 是否安全
 * @param {string} [updates.note] - 备注
 * @param {string} [updates.fileName] - 文件名
 * @param {string[]} [updates.tags] - 标签列表（增量更新）
 * @param {Array} [updates.prompts] - 关联的提示词列表（增量更新）
 */
async function updateImage(id, updates) {
  const { isFavorite, isSafe, note, fileName, tags, prompts } = updates;
  const now = localTime();

  return runInTransaction(async () => {
    const relatedFields = ['tags', 'prompts'];
    const hasBasicFieldUpdate = Object.keys(updates).some(key => !relatedFields.includes(key));

    if (hasBasicFieldUpdate) {
      const fields = [];
      const values = [];

      if (isFavorite !== undefined) {
        fields.push('is_favorite = ?');
        values.push(isFavorite ? 1 : 0);
      }
      if (isSafe !== undefined) {
        fields.push('is_safe = ?');
        values.push(isSafe ? 1 : 0);
      }
      if (note !== undefined) {
        fields.push('note = ?');
        values.push(note);
      }
      if (fileName !== undefined) {
        fields.push('file_name = ?');
        values.push(fileName);
      }
      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);

      await run(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    if (tags !== undefined) {
      const currentTagNames = await getImageTagsByImageId(id);
      const tagsToAdd = tags.filter(t => !currentTagNames.includes(t));
      const tagsToRemove = currentTagNames.filter(t => !tags.includes(t));
      const tagsChanged = tagsToAdd.length > 0 || tagsToRemove.length > 0;

      for (const tagName of tagsToRemove) {
        const tagRow = await get('SELECT id FROM image_tags WHERE name = ?', [tagName]);
        if (tagRow) {
          await run('DELETE FROM image_tag_relations WHERE image_id = ? AND tag_id = ?', [id, tagRow.id]);
        }
      }

      if (tagsToAdd.length > 0) {
        await addImageTags(id, tagsToAdd);
      }

      if (tagsChanged && !hasBasicFieldUpdate) {
        await run('UPDATE images SET updated_at = ? WHERE id = ?', [now, id]);
      }
    }

    if (prompts !== undefined) {
      const currentPromptRows = await all(
        'SELECT prompt_id FROM prompt_image_relations WHERE image_id = ?',
        [id]
      );
      const currentPromptIds = currentPromptRows.map(r => r.prompt_id);
      const newPromptIds = prompts.map(p => p.id || p);

      const promptsToAdd = newPromptIds.filter(pid => !currentPromptIds.includes(pid));
      const promptsToRemove = currentPromptIds.filter(pid => !newPromptIds.includes(pid));

      await run('DELETE FROM prompt_image_relations WHERE image_id = ?', [id]);
      if (prompts.length > 0) {
        await addImagePrompts(id, newPromptIds);
      }

      if (promptsToAdd.length > 0) {
        await run(
          `UPDATE prompts SET updated_at = ? WHERE id IN (${promptsToAdd.map(() => '?').join(',')})`,
          [now, ...promptsToAdd]
        );
      }
      if (promptsToRemove.length > 0) {
        await run(
          `UPDATE prompts SET updated_at = ? WHERE id IN (${promptsToRemove.map(() => '?').join(',')})`,
          [now, ...promptsToRemove]
        );
      }

      if (!hasBasicFieldUpdate) {
        await run('UPDATE images SET updated_at = ? WHERE id = ?', [now, id]);
      }
    }

    return getImageById(id);
  });
}

/**
 * 获取收藏的图像
 */
async function getFavoriteImages() {
  const imageSql = `
    SELECT i.*,
           (SELECT GROUP_CONCAT(DISTINCT it.name)
            FROM image_tag_relations itr
            JOIN image_tags it ON itr.tag_id = it.id
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    WHERE i.is_deleted = 0 AND i.is_favorite = 1
    ORDER BY i.created_at DESC
  `;
  return await getImagesCore(imageSql, []);
}

/**
 * 根据 MD5 查找图像
 */
async function getImageByMD5(md5) {
  const row = await get('SELECT * FROM images WHERE md5 = ?', [md5]);
  return row || null;
}

/**
 * 添加图像
 */
async function addImage(image) {
  const {
    id,
    fileName,
    storedName,
    relativePath,
    thumbnailPath,
    md5,
    thumbnailMD5,
    width,
    height,
    fileSize
  } = image;

  const now = localTime();

  await run(
    `INSERT INTO images (id, file_name, stored_name, relative_path, thumbnail_path, md5, thumbnail_md5, width, height, file_size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fileName, storedName, relativePath, thumbnailPath, md5, thumbnailMD5, width || null, height || null, fileSize || 0, now, now]
  );

  return getImageById(id);
}

/**
 * 软删除图像（移动到回收站）
 */
async function softDeleteImage(id) {
  const now = localTime();
  await run(
    'UPDATE images SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id]
  );
  return true;
}

/**
 * 恢复已删除的图像
 */
async function restoreImage(id) {
  const now = localTime();
  await run(
    'UPDATE images SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?',
    [now, id]
  );
  return getImageById(id);
}

/**
 * 删除图像的物理文件
 * @param {Object} image - 图像对象
 * @param {string} dataDir - 数据目录路径
 */
async function deleteImageFiles(image, dataDir) {
  try {
    // 删除原图
    if (image.relative_path) {
      const imagePath = path.join(dataDir, image.relative_path);
      await fs.unlink(imagePath).catch(() => {});
    }
    // 删除缩略图
    if (image.thumbnail_path) {
      const thumbnailPath = path.join(dataDir, image.thumbnail_path);
      await fs.unlink(thumbnailPath).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to delete image file:', error);
  }
}

/**
 * 永久删除图像
 * @param {string} id - 图像ID
 * @param {string} dataDir - 数据目录路径
 */
async function permanentDeleteImage(id, dataDir) {
  // 先获取图像信息以删除物理文件
  const image = await get('SELECT * FROM images WHERE id = ?', [id]);
  
  if (image) {
    await deleteImageFiles(image, dataDir);
  }
  
  // 删除数据库记录
  await run('DELETE FROM images WHERE id = ?', [id]);
  return true;
}

/**
 * 获取回收站中的图像
 */
async function getDeletedImages() {
  // 先获取所有已删除的图像基本信息
  const imageSql = `
    SELECT i.*, 
           (SELECT GROUP_CONCAT(DISTINCT it.name) 
            FROM image_tag_relations itr 
            JOIN image_tags it ON itr.tag_id = it.id 
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    WHERE i.is_deleted = 1
    ORDER BY i.deleted_at DESC
  `;
  const rows = await all(imageSql);
  
  // 为每个图像获取关联的提示词信息
  const images = [];
  for (const row of rows) {
    const promptSql = `
      SELECT p.id, p.title, p.content
      FROM prompts p
      JOIN prompt_image_relations pir ON p.id = pir.prompt_id
      WHERE pir.image_id = ? AND p.is_deleted = 0
    `;
    const promptRows = await all(promptSql, [row.id]);
    images.push(mapRowToImage(row, promptRows, { includeDeletedAt: true }));
  }

  return images;
}

/**
 * 清空图像回收站
 * 删除所有软删除的图像记录和对应的物理文件
 * @param {string} dataDir - 数据目录路径
 */
async function emptyImageTrash(dataDir) {
  // 获取所有软删除的图像
  const deletedImages = await all('SELECT * FROM images WHERE is_deleted = 1');

  // 删除物理文件
  for (const image of deletedImages) {
    await deleteImageFiles(image, dataDir);
  }

  // 删除数据库记录
  await run('DELETE FROM images WHERE is_deleted = 1');
  return true;
}

/**
 * 为提示词添加图像关联
 * @param {string} promptId - 提示词ID
 * @param {Array} imageIds - 图像ID数组
 * @param {boolean} preserveOrder - 是否保留数组顺序（默认true）
 */
async function addPromptImages(promptId, imageIds, preserveOrder = true) {
  for (let i = 0; i < imageIds.length; i++) {
    const imageId = imageIds[i];
    const sortOrder = preserveOrder ? i : 0;

    try {
      await run(
        'INSERT INTO prompt_image_relations (prompt_id, image_id, sort_order) VALUES (?, ?, ?)',
        [promptId, imageId, sortOrder]
      );
    } catch (err) {
      if (!err.message.includes('UNIQUE constraint failed') && !err.message.includes('FOREIGN KEY constraint failed')) {
        throw err;
      }
    }
  }
}

/**
 * 为图像添加提示词关联
 * @param {string} imageId - 图像ID
 * @param {Array} promptIds - 提示词ID数组
 * @param {boolean} preserveOrder - 是否保留数组顺序（默认true）
 */
async function addImagePrompts(imageId, promptIds, preserveOrder = true) {
  for (let i = 0; i < promptIds.length; i++) {
    const promptId = promptIds[i];
    const sortOrder = preserveOrder ? i : 0;

    try {
      await run(
        'INSERT INTO prompt_image_relations (prompt_id, image_id, sort_order) VALUES (?, ?, ?)',
        [promptId, imageId, sortOrder]
      );
    } catch (err) {
      if (!err.message.includes('UNIQUE constraint failed') && !err.message.includes('FOREIGN KEY constraint failed')) {
        throw err;
      }
    }
  }
}

/**
 * 获取提示词关联的图像
 */
async function getPromptImages(promptId) {
  const sql = `
    SELECT i.*,
           (SELECT GROUP_CONCAT(DISTINCT it.name)
            FROM image_tag_relations itr
            JOIN image_tags it ON itr.tag_id = it.id
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    JOIN prompt_image_relations pir ON i.id = pir.image_id
    WHERE pir.prompt_id = ?
    ORDER BY pir.sort_order ASC
  `;
  const rows = await all(sql, [promptId]);
  return rows.map(row => ({
    id: row.id,
    fileName: row.file_name,
    storedName: row.stored_name,
    relativePath: row.relative_path,
    thumbnailPath: row.thumbnail_path,
    width: row.width,
    height: row.height,
    isSafe: row.is_safe === 1 ? 1 : 0,
    note: row.note,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    tags: row.image_tags ? row.image_tags.split(',').filter(t => t) : [],
    promptRefs: [{ promptId: promptId }]
  }));
}

/**
 * 获取未被引用的图像
 */
async function getUnreferencedImages() {
  const sql = `
    SELECT i.*
    FROM images i
    LEFT JOIN prompt_image_relations pir ON i.id = pir.image_id
    WHERE pir.prompt_id IS NULL
  `;
  const rows = await all(sql);
  return rows.map(row => ({
    id: row.id,
    fileName: row.file_name,
    storedName: row.stored_name,
    relativePath: row.relative_path,
    thumbnailPath: row.thumbnail_path,
    width: row.width,
    height: row.height,
    is_safe: row.is_safe === 1 ? 1 : 0,
    note: row.note,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

// ==================== 图像标签管理 ====================

/**
 * 获取所有图像标签
 */
async function getImageTags() {
  const sql = 'SELECT name FROM image_tags ORDER BY name';
  const rows = await all(sql);
  return rows.map(row => row.name);
}

/**
 * 获取所有图像标签（包含组信息）
 */
async function getImageTagsWithGroupInfo() {
  const sql = `
    SELECT it.name, it.group_id as groupId, itg.name as groupName, itg.type as groupType, itg.sort_order as groupSortOrder
    FROM image_tags it
    LEFT JOIN image_tag_groups itg ON it.group_id = itg.id
    ORDER BY itg.sort_order ASC, it.name ASC
  `;
  const rows = await all(sql);
  return rows.map(row => ({
    name: row.name,
    groupId: row.groupId,
    groupName: row.groupName,
    groupType: row.groupType,
    groupSortOrder: row.groupSortOrder
  }));
}

/**
 * 添加图像标签
 * @param {string} name - 标签名称
 * @param {number} groupId - 标签组ID（可选）
 */
async function addImageTag(name, groupId = null) {
  const nowIso = localTime();
  try {
    await run(
      'INSERT INTO image_tags (name, group_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [name, groupId, nowIso, nowIso]
    );
  } catch (err) {
    // 标签已存在，更新组ID（如果提供了）
    if (err.message.includes('UNIQUE constraint failed')) {
      if (groupId !== null) {
        await run(
          'UPDATE image_tags SET group_id = ?, updated_at = ? WHERE name = ?',
          [groupId, nowIso, name]
        );
      }
    } else {
      throw err;
    }
  }
}

/**
 * 为图像添加多个标签
 */
async function addImageTags(imageId, tagNames) {
  for (const tagName of tagNames) {
    // 先确保标签存在
    await addImageTag(tagName);

    // 获取标签ID
    const tagRow = await get('SELECT id FROM image_tags WHERE name = ?', [tagName]);
    if (tagRow) {
      try {
        await run('INSERT INTO image_tag_relations (image_id, tag_id) VALUES (?, ?)', [imageId, tagRow.id]);
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint failed')) {
          throw err;
        }
      }
    }
  }
}

/**
 * 删除图像标签
 * 从 image_tags 表中删除标签
 * @param {string} name - 标签名称
 */
async function deleteImageTag(name) {
  await run('DELETE FROM image_tags WHERE name = ?', [name]);
}

/**
 * 分配图像标签到所属组
 * @param {string} tagName - 标签名称
 * @param {number|null} groupId - 标签组ID
 */
async function assignImageTagToBelongGroup(tagName, groupId) {
  const now = localTime();
  await run(
    'UPDATE image_tags SET group_id = ?, updated_at = ? WHERE name = ?',
    [groupId, now, tagName]
  );
}

/**
 * 获取图像的标签
 */
async function getImageTagsByImageId(imageId) {
  const sql = `
    SELECT it.name
    FROM image_tags it
    JOIN image_tag_relations itr ON it.id = itr.tag_id
    WHERE itr.image_id = ?
    ORDER BY it.name
  `;
  const rows = await all(sql, [imageId]);
  return rows.map(row => row.name);
}

// ==================== 统计数据 ====================

/**
 * 获取数据库统计信息
 * 返回提示词、图像、标签等的数量统计
 */
async function getStatistics() {
  try {
    // 提示词统计
    const promptStats = await get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted
      FROM prompts
    `);

    // 图像统计
    const imageStats = await get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_deleted = 0 AND EXISTS (
          SELECT 1 FROM prompt_image_relations pir WHERE pir.image_id = images.id
        ) THEN 1 ELSE 0 END) as referenced,
        SUM(CASE WHEN is_deleted = 0 AND NOT EXISTS (
          SELECT 1 FROM prompt_image_relations pir WHERE pir.image_id = images.id
        ) THEN 1 ELSE 0 END) as unreferenced,
        SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted
      FROM images
    `);

    // 标签统计
    const promptTagStats = await get(`
      SELECT COUNT(*) as total FROM prompt_tags
    `);

    const imageTagStats = await get(`
      SELECT COUNT(*) as total FROM image_tags
    `);

    // 关联统计
    const relationStats = await get(`
      SELECT
        COUNT(*) as totalRelations,
        COUNT(DISTINCT prompt_id) as promptsWithImages
      FROM prompt_image_relations
    `);

    return {
      prompts: {
        total: promptStats.total || 0,
        active: promptStats.active || 0,
        deleted: promptStats.deleted || 0,
        tags: promptTagStats.total || 0
      },
      images: {
        total: imageStats.total || 0,
        referenced: imageStats.referenced || 0,
        unreferenced: imageStats.unreferenced || 0,
        deleted: imageStats.deleted || 0,
        tags: imageTagStats.total || 0
      },
      relations: {
        total: relationStats.totalRelations || 0,
        promptsWithImages: relationStats.promptsWithImages || 0
      }
    };
  } catch (err) {
    console.error('Get statistics failed:', err);
    throw err;
  }
}

// ==================== 清空所有数据 ====================

/**
 * 重命名数据目录
 * @param {string} dataDir - 当前数据目录路径
 * @returns {Promise<string>} 新目录路径（带时间后缀）
 */
async function renameDataDirectory(dataDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const parentDir = path.dirname(dataDir);
  const dirName = path.basename(dataDir);
  const newPath = path.join(parentDir, `${dirName}_${timestamp}`);
  await fs.rename(dataDir, newPath);
  return newPath;
}

/**
 * 清空所有数据
 * 删除所有提示词、图像、标签和关联关系
 */
async function clearAllData() {
  try {
    // 删除关联表数据
    await run('DELETE FROM prompt_tag_relations');
    await run('DELETE FROM prompt_image_relations');
    await run('DELETE FROM image_tag_relations');
    
    // 删除主表数据
    await run('DELETE FROM prompts');
    await run('DELETE FROM images');
    await run('DELETE FROM prompt_tags');
    await run('DELETE FROM image_tags');
    
    // 重置自增ID
    await run('DELETE FROM sqlite_sequence WHERE name IN (?, ?, ?, ?, ?, ?, ?)', 
      ['prompts', 'images', 'prompt_tags', 'image_tags', 'prompt_tag_relations', 'prompt_image_relations', 'image_tag_relations']);
    
    console.debug('All data cleared');
    return true;
  } catch (err) {
    console.error('Clear all data failed:', err);
    throw err;
  }
}

export {
  initDatabase,
  closeDatabase,
  run,
  get,
  all,
  // Prompt 操作
  getPrompts,
  getPromptById,
  isTitleExists,
  addPrompt,
  updatePrompt,
  searchPrompts,
  deletePrompt,
  restorePrompt,
  permanentDeletePrompt,
  getDeletedPrompts,
  getFavoritePrompts,
  // 提示词标签组操作
  createPromptTagGroup,
  getPromptTagGroupsOnly,
  getPromptTagGroupById,
  updatePromptTagGroup,
  deletePromptTagGroup,
  // 提示词标签操作
  getPromptTags,
  getPromptTagsWithGroupInfo,
  addPromptTag,
  addPromptTags,
  updatePromptTagGroupByTagName,
  // 图像操作
  getImages,
  getImagesByIds,
  getAllImages,
  getImageById,
  getImageByMD5,
  addImage,
  softDeleteImage,
  restoreImage,
  permanentDeleteImage,
  getDeletedImages,
  emptyImageTrash,
  addPromptImages,
  addImagePrompts,
  getPromptImages,
  getUnreferencedImages,
  updateImage,
  getFavoriteImages,
  // 图像标签组操作
  createImageTagGroup,
  getImageTagGroupsOnly,
  getImageTagGroupById,
  updateImageTagGroup,
  deleteImageTagGroup,
  // 图像标签操作
  getImageTags,
  getImageTagsWithGroupInfo,
  addImageTag,
  addImageTags,
  deleteImageTag,
  assignImageTagToBelongGroup,
  // 数据清理
  renameDataDirectory,
  clearAllData,
  // 统计
  getStatistics,
  // 数据库维护
  optimizeDatabase
};
