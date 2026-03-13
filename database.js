/**
 * 数据库模块 - SQLite
 * 管理提示词、图像和它们之间的关系
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

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
        reject(err);
        return;
      }
      createTables().then(resolve).catch(reject);
    });
  });
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
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO prompt_tag_groups (name, type, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `;
  const result = await run(sql, [name, type, sortOrder, now, now]);
  return { id: result.id, name, type, sortOrder };
}

/**
 * 获取所有提示词标签组
 */
async function getPromptTagGroups() {
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
  const now = new Date().toISOString();
  
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
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO image_tag_groups (name, type, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `;
  const result = await run(sql, [name, type, sortOrder, now, now]);
  return { id: result.id, name, type, sortOrder };
}

/**
 * 获取所有图像标签组
 */
async function getImageTagGroups() {
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
  const now = new Date().toISOString();
  
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

  // 获取所有提示词基本信息
  const sql = `
    SELECT p.*, GROUP_CONCAT(pt.name) as tags
    FROM prompts p
    LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id
    LEFT JOIN prompt_tags pt ON ptr.tag_id = pt.id
    WHERE p.is_deleted = 0
    GROUP BY p.id
    ORDER BY ${sortField} ${order}
  `;
  const rows = await all(sql);
  
  // 为每个提示词获取关联的图像
  const prompts = [];
  for (const row of rows) {
    // 构建标签列表（不包含收藏标签，收藏状态通过 isFavorite 字段单独处理）
    const tags = row.tags ? row.tags.split(',').filter(t => t) : [];
    
    const prompt = {
      id: row.id,
      title: row.title,
      content: row.content,
      contentTranslate: row.content_translate,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isFavorite: row.is_favorite === 1,
      is_safe: row.is_safe === 1 ? 1 : 0,
      note: row.note,
      tags: tags,
      images: []
    };

    // 获取关联的图像（按 sort_order 排序）
    const imagesSql = `
      SELECT i.id, i.file_name as fileName
      FROM images i
      JOIN prompt_image_relations pir ON i.id = pir.image_id
      WHERE pir.prompt_id = ?
      ORDER BY pir.sort_order ASC
    `;
    const images = await all(imagesSql, [row.id]);
    prompt.images = images || [];
    
    prompts.push(prompt);
  }
  
  return prompts;
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
  
  const prompt = {
    id: row.id,
    title: row.title,
    content: row.content,
    contentTranslate: row.content_translate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    note: row.note,
    tags: row.tags ? row.tags.split(',') : [],
    images: []
  };

  // 获取关联的图像
  const imagesSql = `
    SELECT i.id, i.file_name as fileName
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

  // 为每个提示词获取关联的图像
  const prompts = [];
  for (const row of rows) {
    // 构建标签列表（不包含收藏标签，收藏状态通过 isFavorite 字段单独处理）
    const tags = row.tags ? row.tags.split(',').filter(t => t) : [];

    const prompt = {
      id: row.id,
      title: row.title,
      content: row.content,
      contentTranslate: row.content_translate,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isFavorite: row.is_favorite === 1,
      is_safe: row.is_safe === 1 ? 1 : 0,
      note: row.note,
      tags: tags,
      images: []
    };

    // 获取关联的图像
    const imagesSql = `
      SELECT i.id, i.file_name as fileName
      FROM images i
      JOIN prompt_image_relations pir ON i.id = pir.image_id
      WHERE pir.prompt_id = ?
    `;
    const images = await all(imagesSql, [row.id]);
    prompt.images = images || [];

    prompts.push(prompt);
  }

  return prompts;
}

/**
 * 添加提示词
 */
async function addPrompt(prompt) {
  const { id, title, content, contentTranslate, tags = [], images = [], note = '', is_safe = 1 } = prompt;
  const now = new Date().toISOString();

  await run(
    'INSERT INTO prompts (id, title, content, content_translate, note, is_safe, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, title, content, contentTranslate || '', note, is_safe, now, now]
  );

  // 添加标签关联
  if (tags.length > 0) {
    await addPromptTags(id, tags);
  }

  // 添加图像关联
  if (images.length > 0) {
    await addPromptImages(id, images.map(img => img.id));
  }

  return getPromptById(id);
}

/**
 * 更新提示词
 */
async function updatePrompt(id, updates) {
  const { title, content, contentTranslate, tags, images, note, is_safe } = updates;
  const now = new Date().toISOString();

  if (title !== undefined || content !== undefined || contentTranslate !== undefined || note !== undefined || is_safe !== undefined) {
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
    if (is_safe !== undefined) {
      fields.push('is_safe = ?');
      values.push(is_safe);
    }
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await run(`UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  // 更新标签 - 增量更新方式
  if (tags !== undefined) {
    // 获取当前标签
    const currentTagsRow = await get(
      'SELECT GROUP_CONCAT(pt.name) as tags FROM prompt_tag_relations ptr JOIN prompt_tags pt ON ptr.tag_id = pt.id WHERE ptr.prompt_id = ?',
      [id]
    );
    const currentTagNames = currentTagsRow && currentTagsRow.tags ? currentTagsRow.tags.split(',') : [];

    // 找出新增和删除的标签
    const tagsToAdd = tags.filter(t => !currentTagNames.includes(t));
    const tagsToRemove = currentTagNames.filter(t => !tags.includes(t));

    // 只删除需要移除的标签关联
    for (const tagName of tagsToRemove) {
      const tagRow = await get('SELECT id FROM prompt_tags WHERE name = ?', [tagName]);
      if (tagRow) {
        await run('DELETE FROM prompt_tag_relations WHERE prompt_id = ? AND tag_id = ?', [id, tagRow.id]);
      }
    }

    // 只添加新增的标签
    if (tagsToAdd.length > 0) {
      await addPromptTags(id, tagsToAdd);
    }
  }

  // 更新图像关联
  if (images !== undefined) {
    // 获取当前关联的图像
    const currentImages = await all('SELECT image_id FROM prompt_image_relations WHERE prompt_id = ?', [id]);
    const currentImageIds = currentImages.map(row => row.image_id);
    const newImageIds = images.map(img => img.id);

    // 找出被移除的图像
    const removedImageIds = currentImageIds.filter(imgId => !newImageIds.includes(imgId));

    // 删除旧关联
    await run('DELETE FROM prompt_image_relations WHERE prompt_id = ?', [id]);

    // 添加新关联
    if (images.length > 0) {
      await addPromptImages(id, newImageIds);
    }

    // 更新被移除图像的更新时间
    for (const removedImageId of removedImageIds) {
      await run('UPDATE images SET updated_at = ? WHERE id = ?', [now, removedImageId]);
    }
  }

  return getPromptById(id);
}

/**
 * 软删除提示词
 */
async function deletePrompt(id) {
  const now = new Date().toISOString();
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
 * 切换提示词收藏状态
 * @param {string} id - 提示词ID
 * @param {boolean} isFavorite - 是否收藏
 */
async function toggleFavoritePrompt(id, isFavorite) {
  await run(
    'UPDATE prompts SET is_favorite = ? WHERE id = ?',
    [isFavorite ? 1 : 0, id]
  );
  return getPromptById(id);
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
  
  const prompts = [];
  for (const row of rows) {
    const prompt = {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isFavorite: row.is_favorite === 1,
      is_safe: row.is_safe === 1 ? 1 : 0,
      note: row.note,
      tags: row.tags ? row.tags.split(',') : [],
      images: []
    };

    const imagesSql = `
      SELECT i.id, i.file_name as fileName
      FROM images i
      JOIN prompt_image_relations pir ON i.id = pir.image_id
      WHERE pir.prompt_id = ?
    `;
    const images = await all(imagesSql, [row.id]);
    prompt.images = images || [];
    
    prompts.push(prompt);
  }
  
  return prompts;
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
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    note: row.note,
    tags: row.tags ? row.tags.split(',') : []
  }));
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
async function getPromptTagsWithGroup() {
  const sql = `
    SELECT pt.name, pt.group_id as groupId, ptg.name as groupName, ptg.type as groupType
    FROM prompt_tags pt
    LEFT JOIN prompt_tag_groups ptg ON pt.group_id = ptg.id
    ORDER BY ptg.sort_order ASC, pt.name ASC
  `;
  const rows = await all(sql);
  return rows.map(row => ({
    name: row.name,
    groupId: row.groupId,
    groupName: row.groupName,
    groupType: row.groupType
  }));
}

/**
 * 添加提示词标签
 * @param {string} name - 标签名称
 * @param {number} groupId - 标签组ID（可选）
 */
async function addPromptTag(name, groupId = null) {
  const now = new Date().toISOString();
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
  const now = new Date().toISOString();
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
 * 获取所有图像（不包括已删除的）
 * @param {string} sortBy - 排序字段: 'createdAt', 'fileName', 'width', 'height'
 * @param {string} sortOrder - 排序顺序: 'asc', 'desc'
 */
async function getImages(sortBy = 'createdAt', sortOrder = 'desc') {
  // 排序字段映射
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
  
  // 先获取所有图像基本信息
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
    
    // 构建标签列表（不包含收藏标签，收藏状态通过 isFavorite 字段单独处理）
    const tags = row.image_tags ? row.image_tags.split(',').filter(t => t) : [];
    
    images.push({
      id: row.id,
      fileName: row.file_name,
      storedName: row.stored_name,
      relativePath: row.relative_path,
      thumbnailPath: row.thumbnail_path,
      width: row.width,
      height: row.height,
      fileSize: row.file_size || 0,
      isFavorite: row.is_favorite === 1,
      is_safe: row.is_safe === 1 ? 1 : 0,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: tags,
      promptRefs: promptRows.map(p => ({
        promptId: p.id,
        promptTitle: p.title,
        promptContent: p.content
      }))
    });
  }

  return images;
}

/**
 * 获取所有图像（包括已删除的，用于清理孤儿文件）
 * @returns {Array} 所有图像记录
 */
async function getAllImages() {
  const sql = 'SELECT id, relative_path, thumbnail_path FROM images';
  return await all(sql);
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

  return {
    id: row.id,
    fileName: row.file_name,
    storedName: row.stored_name,
    relativePath: row.relative_path,
    thumbnailPath: row.thumbnail_path,
    width: row.width,
    height: row.height,
    fileSize: row.file_size || 0,
    isFavorite: row.is_favorite === 1,
    is_safe: row.is_safe === 1 ? 1 : 0,
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
}

/**
 * 切换图像收藏状态
 * @param {string} id - 图像ID
 * @param {boolean} isFavorite - 是否收藏
 */
async function toggleFavoriteImage(id, isFavorite) {
  const now = new Date().toISOString();
  await run(
    'UPDATE images SET is_favorite = ?, updated_at = ? WHERE id = ?',
    [isFavorite ? 1 : 0, now, id]
  );
  return getImageById(id);
}

/**
 * 更新图像安全评级状态
 * @param {string} id - 图像ID
 * @param {boolean} isSafe - 是否安全（1=安全，0=不安全）
 */
async function updateImageSafeStatus(id, isSafe) {
  const now = new Date().toISOString();
  await run(
    'UPDATE images SET is_safe = ?, updated_at = ? WHERE id = ?',
    [isSafe ? 1 : 0, now, id]
  );
  return getImageById(id);
}

/**
 * 更新提示词安全评级状态
 * @param {string} id - 提示词ID
 * @param {number} isSafe - 是否安全（1=安全，0=不安全）
 */
async function updatePromptSafeStatus(id, isSafe) {
  const now = new Date().toISOString();
  await run(
    'UPDATE prompts SET is_safe = ?, updated_at = ? WHERE id = ?',
    [isSafe, now, id]
  );
  return getPromptById(id);
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
  const rows = await all(imageSql);
  
  const images = [];
  for (const row of rows) {
    const promptSql = `
      SELECT p.id, p.title, p.content
      FROM prompts p
      JOIN prompt_image_relations pir ON p.id = pir.prompt_id
      WHERE pir.image_id = ? AND p.is_deleted = 0
    `;
    const promptRows = await all(promptSql, [row.id]);
    
    images.push({
      id: row.id,
      fileName: row.file_name,
      storedName: row.stored_name,
      relativePath: row.relative_path,
      thumbnailPath: row.thumbnail_path,
      width: row.width,
      height: row.height,
      fileSize: row.file_size || 0,
      isFavorite: row.is_favorite === 1,
      is_safe: row.is_safe === 1 ? 1 : 0,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: row.image_tags ? row.image_tags.split(',').filter(t => t) : [],
      promptRefs: promptRows.map(p => ({
        promptId: p.id,
        promptTitle: p.title,
        promptContent: p.content
      }))
    });
  }

  return images;
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

  const now = new Date().toISOString();

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
  const now = new Date().toISOString();
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
  const now = new Date().toISOString();
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
    
    images.push({
      id: row.id,
      fileName: row.file_name,
      storedName: row.stored_name,
      relativePath: row.relative_path,
      thumbnailPath: row.thumbnail_path,
      width: row.width,
      height: row.height,
      fileSize: row.file_size || 0,
      is_safe: row.is_safe === 1 ? 1 : 0,
      note: row.note,
      deletedAt: row.deleted_at,
      updatedAt: row.updated_at,
      tags: row.image_tags ? row.image_tags.split(',').filter(t => t) : [],
      promptRefs: promptRows.map(p => ({
        promptId: p.id,
        promptTitle: p.title,
        promptContent: p.content
      }))
    });
  }

  return images;
}

/**
 * 清空图像回收站
 * 删除所有软删除的图像记录和对应的物理文件
 * @param {string} dataDir - 数据目录路径
 */
async function emptyImageRecycleBin(dataDir) {
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
      // 关联已存在，忽略错误
      if (!err.message.includes('UNIQUE constraint failed')) {
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
    SELECT i.*
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
    is_safe: row.is_safe === 1 ? 1 : 0,
    note: row.note,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    createdAt: row.created_at
  }));
}

/**
 * 解除图像与提示词的关联
 * @param {string} imageId - 图像ID
 * @param {string} promptId - 提示词ID
 */
async function unlinkImageFromPrompt(imageId, promptId) {
  const now = new Date().toISOString();
  try {
    // 删除关联
    await run(
      'DELETE FROM prompt_image_relations WHERE image_id = ? AND prompt_id = ?',
      [imageId, promptId]
    );
    // 更新图像更新时间
    await run(
      'UPDATE images SET updated_at = ? WHERE id = ?',
      [now, imageId]
    );
    // 更新提示词更新时间
    await run(
      'UPDATE prompts SET updated_at = ? WHERE id = ?',
      [now, promptId]
    );
    return true;
  } catch (err) {
    console.error('Unlink image from prompt failed:', err);
    throw err;
  }
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
async function getImageTagsWithGroup() {
  const sql = `
    SELECT it.name, it.group_id as groupId, itg.name as groupName, itg.type as groupType
    FROM image_tags it
    LEFT JOIN image_tag_groups itg ON it.group_id = itg.id
    ORDER BY itg.sort_order ASC, it.name ASC
  `;
  const rows = await all(sql);
  return rows.map(row => ({
    name: row.name,
    groupId: row.groupId,
    groupName: row.groupName,
    groupType: row.groupType
  }));
}

/**
 * 添加图像标签
 * @param {string} name - 标签名称
 * @param {number} groupId - 标签组ID（可选）
 */
async function addImageTag(name, groupId = null) {
  const now = new Date().toISOString();
  try {
    await run(
      'INSERT INTO image_tags (name, group_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [name, groupId, now, now]
    );
  } catch (err) {
    // 标签已存在，更新组ID（如果提供了）
    if (err.message.includes('UNIQUE constraint failed')) {
      if (groupId !== null) {
        await run(
          'UPDATE image_tags SET group_id = ?, updated_at = ? WHERE name = ?',
          [groupId, now, name]
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
  const now = new Date().toISOString();
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

/**
 * 更新图像的标签（增量更新方式）
 */
async function updateImageTags(imageId, tagNames) {
  // 获取当前标签
  const currentTagNames = await getImageTagsByImageId(imageId);

  // 找出新增和删除的标签
  const tagsToAdd = tagNames.filter(t => !currentTagNames.includes(t));
  const tagsToRemove = currentTagNames.filter(t => !tagNames.includes(t));

  // 只删除需要移除的标签关联
  for (const tagName of tagsToRemove) {
    const tagRow = await get('SELECT id FROM image_tags WHERE name = ?', [tagName]);
    if (tagRow) {
      await run('DELETE FROM image_tag_relations WHERE image_id = ? AND tag_id = ?', [imageId, tagRow.id]);
    }
  }

  // 只添加新增的标签
  if (tagsToAdd.length > 0) {
    await addImageTags(imageId, tagsToAdd);
  }

  // 更新 updated_at 字段
  const now = new Date().toISOString();
  await run('UPDATE images SET updated_at = ? WHERE id = ?', [now, imageId]);
}

/**
 * 更新图像 note 字段（备注）
 * @param {string} imageId - 图像 ID
 * @param {string} note - 备注内容
 */
async function updateImageNote(imageId, note) {
  const now = new Date().toISOString();
  const sql = 'UPDATE images SET note = ?, updated_at = ? WHERE id = ?';
  await run(sql, [note, now, imageId]);
}

/**
 * 更新图像文件名
 * @param {string} imageId - 图像 ID
 * @param {string} fileName - 新文件名
 */
async function updateImageFileName(imageId, fileName) {
  const sql = 'UPDATE images SET file_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  await run(sql, [fileName, imageId]);
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

module.exports = {
  initDatabase,
  run,
  get,
  all,
  // Prompt 操作
  getPrompts,
  getPromptById,
  isTitleExists,
  addPrompt,
  updatePrompt,
  updatePromptSafeStatus,
  searchPrompts,
  deletePrompt,
  restorePrompt,
  permanentDeletePrompt,
  getDeletedPrompts,
  toggleFavoritePrompt,
  getFavoritePrompts,
  // 提示词标签组操作
  createPromptTagGroup,
  getPromptTagGroups,
  getPromptTagGroupById,
  updatePromptTagGroup,
  deletePromptTagGroup,
  // 提示词标签操作
  getPromptTags,
  getPromptTagsWithGroup,
  addPromptTag,
  addPromptTags,
  updatePromptTagGroupByTagName,
  // 图像操作
  getImages,
  getAllImages,
  getImageById,
  getImageByMD5,
  addImage,
  softDeleteImage,
  restoreImage,
  permanentDeleteImage,
  getDeletedImages,
  emptyImageRecycleBin,
  addPromptImages,
  getPromptImages,
  unlinkImageFromPrompt,
  getUnreferencedImages,
  toggleFavoriteImage,
  getFavoriteImages,
  // 图像标签组操作
  createImageTagGroup,
  getImageTagGroups,
  getImageTagGroupById,
  updateImageTagGroup,
  deleteImageTagGroup,
  // 图像标签操作
  getImageTags,
  getImageTagsWithGroup,
  addImageTag,
  addImageTags,
  updateImageTags,
  deleteImageTag,
  assignImageTagToBelongGroup,
  // 图像扩展字段
  updateImageNote,
  updateImageFileName,
  updateImageSafeStatus,
  // 数据清理
  clearAllData,
  // 统计
  getStatistics
};
