import { TagUI } from '../TagUI.js';

/**
 * 面板项渲染器
 * 统一构建提示词和图像面板项（卡片/列表项）的 HTML
 */
export class PanelItemRenderer {
  /**
   * 构建面板项配置
   * @param {Object} options - 配置选项
   * @param {string} options.type - 类型 ('prompt' | 'image')
   * @param {Object} options.item - 数据项
   * @param {Object} options.icons - 图标对象
   * @param {string} options.sortBy - 当前排序字段
   * @param {Object} options.app - 应用实例
   * @returns {PanelItemConfig} 面板项配置对象
   */
  static buildConfig(options) {
    const { type, item, icons, sortBy, app } = options;

    if (type === 'prompt') {
      return PanelItemRenderer.buildPromptConfig(item, icons, sortBy, app);
    } else if (type === 'image') {
      return PanelItemRenderer.buildImageConfig(item, icons, sortBy, app);
    }

    throw new Error(`Unknown type: ${type}`);
  }

  /**
   * 构建提示词配置
   * @param {Object} prompt - 提示词对象
   * @param {Object} icons - 图标对象
   * @param {string} sortBy - 当前排序字段
   * @param {Object} app - 应用实例
   * @returns {PanelItemConfig}
   */
  static buildPromptConfig(prompt, icons, sortBy, app) {
    const favoriteIcon = prompt.isFavorite ? icons.favorite.filled : icons.favorite.outline;
    const tagsHtml = TagUI.generateTagsHtml(prompt.tags, 'tag-display', 'tag-display-empty');
    const hasImages = prompt.images && prompt.images.length > 0;
    const firstImageId = hasImages ? prompt.images[0].id : '';

    // 根据排序规则确定底部显示内容
    let dynamicInfo = '';
    if (sortBy === 'updatedAt' && prompt.updatedAt) {
      const date = new Date(prompt.updatedAt);
      dynamicInfo = `<div class="prompt-card-dynamic-info">更新于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else if (sortBy === 'createdAt' && prompt.createdAt) {
      const date = new Date(prompt.createdAt);
      dynamicInfo = `<div class="prompt-card-dynamic-info">创建于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else {
      dynamicInfo = `<div class="prompt-card-title">${TagUI.escapeHtml(prompt.title || '无标题')}</div>`;
    }

    return {
      type: 'prompt',
      className: `prompt-card ${prompt.isFavorite ? 'is-favorite' : ''} ${hasImages ? 'has-images' : 'no-images'}`,
      dataset: {
        id: prompt.id,
        firstImage: firstImageId,
        dropTarget: 'prompt'
      },
      favoriteIcon,
      tagsHtml,
      dynamicInfo,
      leftButtons: [
        {
          className: `favorite-btn ${prompt.isFavorite ? 'active' : ''}`,
          dataset: { id: prompt.id },
          title: prompt.isFavorite ? '取消收藏' : '收藏',
          icon: favoriteIcon
        }
      ],
      rightButtons: [
        {
          className: 'copy-btn',
          dataset: { id: prompt.id },
          title: '复制内容',
          icon: icons.copy
        },
        {
          className: 'delete-btn',
          dataset: { id: prompt.id },
          title: '删除',
          icon: icons.delete
        }
      ],
      content: TagUI.escapeHtml(prompt.content),
      footer: {
        tags: tagsHtml,
        dynamicInfo
      }
    };
  }

  /**
   * 构建图像配置
   * @param {Object} img - 图像对象
   * @param {Object} icons - 图标对象
   * @param {string} sortBy - 当前排序字段
   * @param {Object} app - 应用实例
   * @returns {PanelItemConfig}
   */
  static buildImageConfig(img, icons, sortBy, app) {
    const favoriteIcon = img.isFavorite ? icons.favorite.filled : icons.favorite.outline;
    const tagsHtml = TagUI.generateTagsHtml(img.tags, 'tag-display', 'tag-display-empty');

    // 动态信息
    let dynamicInfo = '';
    if (sortBy === 'updatedAt' && img.updatedAt) {
      const date = new Date(img.updatedAt);
      dynamicInfo = `<div class="image-card-dynamic-info">更新于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else if (sortBy === 'createdAt' && img.createdAt) {
      const date = new Date(img.createdAt);
      dynamicInfo = `<div class="image-card-dynamic-info">创建于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else {
      dynamicInfo = `<div class="image-card-file-name">${TagUI.escapeHtml(img.fileName)}</div>`;
    }

    return {
      type: 'image',
      className: `image-card ${img.isFavorite ? 'is-favorite' : ''}`,
      dataset: {
        id: img.id,
        imageId: img.id,
        dropTarget: 'image'
      },
      favoriteIcon,
      tagsHtml,
      dynamicInfo,
      leftButtons: [
        {
          className: `favorite-btn ${img.isFavorite ? 'active' : ''}`,
          dataset: { id: img.id },
          title: img.isFavorite ? '取消收藏' : '收藏',
          icon: favoriteIcon
        }
      ],
      rightButtons: [
        {
          className: 'delete-btn',
          dataset: { id: img.id },
          title: '删除',
          icon: icons.delete
        }
      ],
      content: null,
      footer: {
        tags: tagsHtml,
        dynamicInfo
      }
    };
  }

  /**
   * 生成网格项 HTML
   * @param {PanelItemConfig} config - 面板项配置
   * @returns {string} HTML 字符串
   */
  static generateGridHtml(config) {
    const { type, className, dataset, leftButtons, rightButtons, content, footer } = config;

    // 生成 dataset 属性字符串
    const datasetAttrs = Object.entries(dataset)
      .map(([key, value]) => `data-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${value}"`)
      .join(' ');

    // 生成按钮 HTML
    const leftButtonsHtml = leftButtons.map(btn => PanelItemRenderer.generateButtonHtml(btn)).join('');
    const rightButtonsHtml = rightButtons.map(btn => PanelItemRenderer.generateButtonHtml(btn)).join('');

    // 生成内容区域 HTML（如果有）
    const contentHtml = content
      ? `<div class="${type}-card-content">${content}</div>`
      : '';

    return `
      <div class="${className}" ${datasetAttrs}>
        <div class="${type}-card-bg card__bg"></div>
        <div class="${type}-card-overlay card__overlay">
          <div class="${type}-card-header card__header">
            <div class="${type}-card-actions-left">
              ${leftButtonsHtml}
            </div>
            <div class="${type}-card-actions-right">
              ${rightButtonsHtml}
            </div>
          </div>
          ${contentHtml}
          <div class="${type}-card-footer card__footer">
            <div class="${type}-card-tags">${footer.tags}</div>
            ${footer.dynamicInfo}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 生成按钮 HTML
   * @param {Object} btn - 按钮配置
   * @returns {string} HTML 字符串
   */
  static generateButtonHtml(btn) {
    const datasetAttrs = Object.entries(btn.dataset)
      .map(([key, value]) => `data-${key}="${value}"`)
      .join(' ');

    return `
      <button type="button" class="${btn.className}" ${datasetAttrs} title="${btn.title}">
        ${btn.icon}
      </button>
    `;
  }

  /**
   * 创建提示词网格项（便捷方法）
   * @param {Object} prompt - 提示词对象
   * @param {Object} icons - 图标对象
   * @param {string} sortBy - 当前排序字段
   * @param {Object} app - 应用实例
   * @returns {string} HTML 字符串
   */
  static createPromptGridItem(prompt, icons, sortBy, app) {
    const config = PanelItemRenderer.buildPromptConfig(prompt, icons, sortBy, app);
    return PanelItemRenderer.generateGridHtml(config);
  }

  /**
   * 创建图像网格项（便捷方法）
   * @param {Object} img - 图像对象
   * @param {Object} icons - 图标对象
   * @param {string} sortBy - 当前排序字段
   * @param {Object} app - 应用实例
   * @returns {string} HTML 字符串
   */
  static createImageGridItem(img, icons, sortBy, app) {
    const config = PanelItemRenderer.buildImageConfig(img, icons, sortBy, app);
    return PanelItemRenderer.generateGridHtml(config);
  }

  // ==================== 列表视图构建方法 ====================

  /**
   * 创建提示词列表项 HTML
   * @param {Object} options - 配置选项
   * @param {Object} options.prompt - 提示词对象
   * @param {Object} options.icons - 图标对象
   * @param {boolean} options.isCompact - 是否为紧凑视图
   * @param {boolean} options.isSelected - 是否选中
   * @param {number} options.index - 索引
   * @param {string} options.thumbnailHtml - 缩略图 HTML
   * @returns {string} HTML 字符串
   */
  static createPromptListItem(options) {
    const { prompt, icons, isCompact, isSelected, index, thumbnailHtml } = options;
    const tagsHtml = TagUI.generateTagsHtml(prompt.tags, 'tag-display', 'tag-display-empty');
    const favoriteIcon = prompt.isFavorite ? icons.favorite.filled : icons.favorite.outline;
    const hasImages = prompt.images && prompt.images.length > 0;
    const hasImagesClass = hasImages ? 'has-images' : '';
    const isCompactClass = isCompact ? 'is-compact' : '';
    const isSelectedClass = isSelected ? 'is-selected' : '';
    const isFavoriteClass = prompt.isFavorite ? 'is-favorite' : '';
    const firstImageId = hasImages ? (prompt.images[0].id || prompt.images[0]) : '';

    // 复选框
    const checkboxHtml = `<input type="checkbox" class="prompt-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${prompt.id}" data-index="${index}">`;

    // 按钮
    const favoriteBtnHtml = `<button type="button" class="favorite-btn ${prompt.isFavorite ? 'active' : ''}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}" data-id="${prompt.id}">${favoriteIcon}</button>`;
    const deleteBtnHtml = `<button type="button" class="delete-btn" title="删除" data-id="${prompt.id}">${icons.delete}</button>`;

    if (isCompact) {
      // 紧凑视图
      return `
        <div class="prompt-list-item ${isCompactClass} ${isFavoriteClass} ${isSelectedClass} ${hasImagesClass}"
             data-id="${prompt.id}"
             data-first-image="${firstImageId}"
             data-index="${index}"
             data-drop-target="prompt">
          ${checkboxHtml}
          ${thumbnailHtml}
          <div class="prompt-list-text-content">
            <div class="prompt-list-item-header">
              <div class="prompt-list-title">${TagUI.escapeHtml(prompt.title || '无标题')}</div>
              <div class="prompt-list-tags">${tagsHtml}</div>
            </div>
          </div>
          <div class="prompt-list-actions">
            ${favoriteBtnHtml}
            ${deleteBtnHtml}
          </div>
        </div>
      `;
    }

    // 完整列表视图
    const noteHtml = TagUI.generateNoteHtml(prompt.note, 'prompt-list-note');
    const copyBtnHtml = `<button type="button" class="copy-btn" title="复制内容" data-id="${prompt.id}">${icons.copy}</button>`;

    return `
      <div class="prompt-list-item ${isCompactClass} ${isFavoriteClass} ${isSelectedClass} ${hasImagesClass}"
           data-id="${prompt.id}"
           data-first-image="${firstImageId}"
           data-index="${index}"
           data-drop-target="prompt">
        ${checkboxHtml}
        ${thumbnailHtml}
        <div class="prompt-list-text-content">
          <div class="prompt-list-item-header">
            <div class="prompt-list-title">${TagUI.escapeHtml(prompt.title || '无标题')}</div>
            <div class="prompt-list-tags">${tagsHtml}</div>
          </div>
          <div class="prompt-list-content">${TagUI.escapeHtml(prompt.content)}</div>
          ${noteHtml}
        </div>
        <div class="prompt-list-actions">
          ${copyBtnHtml}
          ${favoriteBtnHtml}
          ${deleteBtnHtml}
        </div>
      </div>
    `;
  }

  /**
   * 创建图像列表项 HTML
   * @param {Object} options - 配置选项
   * @param {Object} options.img - 图像对象
   * @param {Object} options.icons - 图标对象
   * @param {boolean} options.isCompact - 是否为紧凑视图
   * @param {boolean} options.isSelected - 是否选中
   * @param {number} options.index - 索引
   * @returns {string} HTML 字符串
   */
  static createImageListItem(options) {
    const { img, icons, isCompact, isSelected, index } = options;
    const tagsHtml = TagUI.generateTagsHtml(img.tags, 'tag-display', 'tag-display-empty');
    const favoriteIcon = img.isFavorite ? icons.favorite.filled : icons.favorite.outline;
    const isCompactClass = isCompact ? 'is-compact' : '';
    const isSelectedClass = isSelected ? 'is-selected' : '';
    const isFavoriteClass = img.isFavorite ? 'is-favorite' : '';
    const imagePath = img.thumbnailPath || img.relativePath || '';

    // 复选框
    const checkboxHtml = `<input type="checkbox" class="image-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${img.id}" data-index="${index}">`;

    // 缩略图占位符
    const thumbnailPlaceholderHtml = `
      <div class="image-list-thumbnail-placeholder">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>
    `;

    // 按钮
    const favoriteBtnHtml = `<button type="button" class="favorite-btn ${img.isFavorite ? 'active' : ''}" title="${img.isFavorite ? '取消收藏' : '收藏'}" data-id="${img.id}">${favoriteIcon}</button>`;
    const deleteBtnHtml = `<button type="button" class="delete-btn" title="删除" data-id="${img.id}">${icons.delete}</button>`;

    if (isCompact) {
      // 紧凑视图
      return `
        <div class="image-list-item ${isCompactClass} ${isFavoriteClass} ${isSelectedClass}"
             data-id="${img.id}"
             data-index="${index}"
             data-image-path="${imagePath.replace(/"/g, '&quot;')}">
          ${checkboxHtml}
          <div class="image-list-thumbnail-wrapper">
            ${thumbnailPlaceholderHtml}
          </div>
          <div class="image-list-text-content">
            <div class="image-list-item-header">
              <div class="image-list-title">${TagUI.escapeHtml(img.name || '无标题')}</div>
              <div class="image-list-tags">${tagsHtml}</div>
            </div>
          </div>
          <div class="image-list-actions">
            ${favoriteBtnHtml}
            ${deleteBtnHtml}
          </div>
        </div>
      `;
    }

    // 完整列表视图
    const metaHtml = `<div class="image-list-meta"><span>${img.width || '?'} x ${img.height || '?'}</span><span>${PanelItemRenderer.formatFileSize(img.fileSize)}</span></div>`;

    return `
      <div class="image-list-item ${isCompactClass} ${isFavoriteClass} ${isSelectedClass}"
           data-id="${img.id}"
           data-index="${index}"
           data-image-path="${imagePath.replace(/"/g, '&quot;')}">
        ${checkboxHtml}
        <div class="image-list-thumbnail-wrapper">
          ${thumbnailPlaceholderHtml}
        </div>
        <div class="image-list-text-content">
          <div class="image-list-item-header">
            <div class="image-list-title">${TagUI.escapeHtml(img.name || '无标题')}</div>
            <div class="image-list-tags">${tagsHtml}</div>
          </div>
          ${metaHtml}
        </div>
        <div class="image-list-actions">
          ${favoriteBtnHtml}
          ${deleteBtnHtml}
        </div>
      </div>
    `;
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的文件大小
   */
  static formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default PanelItemRenderer;
