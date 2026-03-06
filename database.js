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
  const dbPath = path.join(dataDir, 'prompt-manager.db');
  
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.debug('Connected to SQLite database');
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0,
      deleted_at DATETIME
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
      is_deleted INTEGER DEFAULT 0,
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // 提示词标签表
    `CREATE TABLE IF NOT EXISTS prompt_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      PRIMARY KEY (prompt_id, image_id),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
    )`,

    // 图像标签表
    `CREATE TABLE IF NOT EXISTS image_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  
  console.debug('Database tables created');
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

// ==================== Prompt 操作 ====================

/**
 * 获取所有提示词（不包括已删除的）
 */
async function getPrompts() {
  // 获取所有提示词基本信息
  const sql = `
    SELECT p.*, GROUP_CONCAT(pt.name) as tags
    FROM prompts p
    LEFT JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id
    LEFT JOIN prompt_tags pt ON ptr.tag_id = pt.id
    WHERE p.is_deleted = 0
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `;
  const rows = await all(sql);
  
  // 为每个提示词获取关联的图像
  const prompts = [];
  for (const row of rows) {
    const prompt = {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
 * 添加提示词
 */
async function addPrompt(prompt) {
  const { id, title, content, tags = [], images = [] } = prompt;
  const now = new Date().toISOString();
  
  await run(
    'INSERT INTO prompts (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, title, content, now, now]
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
  const { title, content, tags, images } = updates;
  const now = new Date().toISOString();
  
  if (title !== undefined || content !== undefined) {
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
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    
    await run(`UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  
  // 更新标签
  if (tags !== undefined) {
    await run('DELETE FROM prompt_tag_relations WHERE prompt_id = ?', [id]);
    if (tags.length > 0) {
      await addPromptTags(id, tags);
    }
  }
  
  // 更新图像关联
  if (images !== undefined) {
    await run('DELETE FROM prompt_image_relations WHERE prompt_id = ?', [id]);
    if (images.length > 0) {
      await addPromptImages(id, images.map(img => img.id));
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
    ...row,
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
 * 添加提示词标签
 */
async function addPromptTag(name) {
  try {
    await run('INSERT INTO prompt_tags (name) VALUES (?)', [name]);
  } catch (err) {
    // 标签已存在，忽略错误
    if (!err.message.includes('UNIQUE constraint failed')) {
      throw err;
    }
  }
  
  // 获取标签 ID
  const row = await get('SELECT id FROM prompt_tags WHERE name = ?', [name]);
  return row ? row.id : null;
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
 */
async function getImages() {
  // 先获取所有图像基本信息
  const imageSql = `
    SELECT i.*, 
           (SELECT GROUP_CONCAT(DISTINCT it.name) 
            FROM image_tag_relations itr 
            JOIN image_tags it ON itr.tag_id = it.id 
            WHERE itr.image_id = i.id) as image_tags
    FROM images i
    WHERE i.is_deleted = 0
    ORDER BY i.created_at DESC
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
      md5: row.md5,
      thumbnailMD5: row.thumbnail_md5,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
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
 * 根据 ID 获取图像
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
    md5: row.md5,
    thumbnailMD5: row.thumbnail_md5,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    tags: row.image_tags ? row.image_tags.split(',').filter(t => t) : [],
    promptRefs: promptRows.map(p => ({
      promptId: p.id,
      promptTitle: p.title,
      promptContent: p.content
    }))
  };
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
    height
  } = image;

  const createdAt = new Date().toISOString();

  await run(
    `INSERT INTO images (id, file_name, stored_name, relative_path, thumbnail_path, md5, thumbnail_md5, width, height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fileName, storedName, relativePath, thumbnailPath, md5, thumbnailMD5, width || null, height || null, createdAt]
  );
  
  return getImageById(id);
}

/**
 * 软删除图像（移动到回收站）
 */
async function softDeleteImage(id) {
  const now = new Date().toISOString();
  await run(
    'UPDATE images SET is_deleted = 1, deleted_at = ? WHERE id = ?',
    [now, id]
  );
  return true;
}

/**
 * 恢复已删除的图像
 */
async function restoreImage(id) {
  await run(
    'UPDATE images SET is_deleted = 0, deleted_at = NULL WHERE id = ?',
    [id]
  );
  return getImageById(id);
}

/**
 * 永久删除图像
 */
async function permanentDeleteImage(id) {
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
      md5: row.md5,
      thumbnailMD5: row.thumbnail_md5,
      width: row.width,
      height: row.height,
      deletedAt: row.deleted_at,
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
 */
async function emptyImageRecycleBin() {
  await run('DELETE FROM images WHERE is_deleted = 1');
  return true;
}

/**
 * 为提示词添加图像关联
 */
async function addPromptImages(promptId, imageIds) {
  for (const imageId of imageIds) {
    try {
      await run(
        'INSERT INTO prompt_image_relations (prompt_id, image_id) VALUES (?, ?)',
        [promptId, imageId]
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
  `;
  return await all(sql, [promptId]);
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
  return await all(sql);
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
 * 添加图像标签
 */
async function addImageTag(name) {
  try {
    await run('INSERT INTO image_tags (name) VALUES (?)', [name]);
  } catch (err) {
    if (!err.message.includes('UNIQUE constraint failed')) {
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
 * 更新图像的标签（先删除再添加）
 */
async function updateImageTags(imageId, tagNames) {
  // 删除现有标签关联
  await run('DELETE FROM image_tag_relations WHERE image_id = ?', [imageId]);

  // 添加新标签
  if (tagNames && tagNames.length > 0) {
    await addImageTags(imageId, tagNames);
  }
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
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM prompt_image_relations pir WHERE pir.image_id = images.id
        ) THEN 1 ELSE 0 END) as referenced,
        SUM(CASE WHEN NOT EXISTS (
          SELECT 1 FROM prompt_image_relations pir WHERE pir.image_id = images.id
        ) THEN 1 ELSE 0 END) as unreferenced
      FROM images
    `);

    // 标签统计
    const tagStats = await get(`
      SELECT COUNT(*) as total FROM prompt_tags
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
        deleted: promptStats.deleted || 0
      },
      images: {
        total: imageStats.total || 0,
        referenced: imageStats.referenced || 0,
        unreferenced: imageStats.unreferenced || 0
      },
      tags: {
        total: tagStats.total || 0
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
  deletePrompt,
  restorePrompt,
  permanentDeletePrompt,
  getDeletedPrompts,
  // 提示词标签操作
  getPromptTags,
  addPromptTag,
  addPromptTags,
  // 图像操作
  getImages,
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
  getUnreferencedImages,
  // 图像标签操作
  getImageTags,
  addImageTag,
  addImageTags,
  updateImageTags,
  // 数据清理
  clearAllData,
  // 统计
  getStatistics
};
