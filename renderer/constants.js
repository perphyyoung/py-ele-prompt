/**
 * 常量定义类
 * 集中管理应用中的所有常量
 */
export class Constants {
  // 导航按钮 SVG
  static NAV_SVGS = {
    first: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="11 18 5 12 11 6"></polyline>
      <polyline points="18 18 12 12 18 6"></polyline>
    </svg>`,
    prev: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>`,
    next: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>`,
    last: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="13 18 19 12 13 6"></polyline>
      <polyline points="6 18 12 12 6 6"></polyline>
    </svg>`
  };

  // 特殊标签
  static FAVORITE_TAG = '收藏';
  static UNREFERENCED_TAG = '未引';
  static MULTI_REF_TAG = '多引';
  static NO_IMAGE_TAG = '无图';
  static MULTI_IMAGE_TAG = '多图';
  static SAFE_TAG = '安全';
  static UNSAFE_TAG = '敏感';
  static VIOLATING_TAG = '违单';
  static NO_TAG_TAG = '无标';

  // 所有特殊标签集合
  static ALL_SPECIAL_TAGS = [
    Constants.FAVORITE_TAG,
    Constants.UNREFERENCED_TAG,
    Constants.MULTI_REF_TAG,
    Constants.SAFE_TAG,
    Constants.UNSAFE_TAG,
    Constants.MULTI_IMAGE_TAG,
    Constants.NO_IMAGE_TAG,
    Constants.VIOLATING_TAG,
    Constants.NO_TAG_TAG
  ];

  // 提示词特殊标签列表（用于标签管理界面）
  static PROMPT_SPECIAL_TAGS = [
    Constants.FAVORITE_TAG,
    Constants.MULTI_IMAGE_TAG,
    Constants.NO_IMAGE_TAG,
    Constants.VIOLATING_TAG,
    Constants.NO_TAG_TAG
  ];

  // 图像特殊标签列表（用于标签管理界面）
  static IMAGE_SPECIAL_TAGS = [
    Constants.FAVORITE_TAG,
    Constants.UNREFERENCED_TAG,
    Constants.MULTI_REF_TAG,
    Constants.VIOLATING_TAG,
    Constants.NO_TAG_TAG
  ];

  // 提示消息
  static MSG_SECONDARY_JUMP_DISABLED = '禁止二级跳转';

  // 保存状态提示
  static STATUS_SAVED = '已保存';
  static STATUS_SAVE_FAILED = '保存失败';

  // 图标定义
  static ICONS = Object.freeze({
    favorite: {
      outline: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
      filled: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'
    },
    delete: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    nav: {
      first: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>',
      prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>',
      next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>',
      last: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>'
    }
  });

  // LocalStorage 键名枚举
  static LocalStorageKey = Object.freeze({
    // 主题
    THEME: 'theme',

    // 视图
    VIEW_MODE: 'viewMode',
    CURRENT_PANEL: 'currentPanel',
    SIDEBAR_COLLAPSED: 'sidebarCollapsed',

    // 提示词排序
    PROMPT_SORT_BY: 'promptSortBy',
    PROMPT_SORT_ORDER: 'promptSortOrder',

    // 图像排序
    IMAGE_SORT_BY: 'imageSortBy',
    IMAGE_SORT_ORDER: 'imageSortOrder',

    // 标签筛选排序
    PROMPT_TAG_FILTER_SORT_BY: 'promptTagFilterSortBy',
    PROMPT_TAG_FILTER_SORT_ORDER: 'promptTagFilterSortOrder',
    IMAGE_TAG_FILTER_SORT_BY: 'imageTagFilterSortBy',
    IMAGE_TAG_FILTER_SORT_ORDER: 'imageTagFilterSortOrder',

    // 标签管理排序
    PROMPT_TAG_SORT_BY: 'promptTagSortBy',
    PROMPT_TAG_SORT_ORDER: 'promptTagSortOrder',
    IMAGE_TAG_SORT_BY: 'imageTagSortBy',
    IMAGE_TAG_SORT_ORDER: 'imageTagSortOrder',

    // 图像选择器
    IMAGE_SELECTOR_SORT_BY: 'imageSelectorSortBy',
    IMAGE_SELECTOR_SORT_ORDER: 'imageSelectorSortOrder',

    // 卡片大小
    PROMPT_CARD_SIZE: 'promptCardSize',
    IMAGE_CARD_SIZE: 'imageCardSize',

    // 标签筛选收起状态
    PROMPT_TAG_FILTER_COLLAPSED: 'promptTagFilterCollapsed',
    IMAGE_TAG_FILTER_COLLAPSED: 'imageTagFilterCollapsed'
  });
}
