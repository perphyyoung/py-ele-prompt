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

  // 所有特殊标签集合
  static ALL_SPECIAL_TAGS = [
    Constants.FAVORITE_TAG,
    Constants.UNREFERENCED_TAG,
    Constants.MULTI_REF_TAG,
    Constants.SAFE_TAG,
    Constants.UNSAFE_TAG,
    Constants.MULTI_IMAGE_TAG,
    Constants.NO_IMAGE_TAG,
    Constants.VIOLATING_TAG
  ];

  // 提示词特殊标签列表（用于标签管理界面）
  static PROMPT_SPECIAL_TAGS = [
    Constants.FAVORITE_TAG,
    Constants.MULTI_IMAGE_TAG,
    Constants.NO_IMAGE_TAG,
    Constants.VIOLATING_TAG
  ];

  // 图像特殊标签列表（用于标签管理界面）
  static IMAGE_SPECIAL_TAGS = [
    Constants.FAVORITE_TAG,
    Constants.UNREFERENCED_TAG,
    Constants.MULTI_REF_TAG,
    Constants.VIOLATING_TAG
  ];

  // 提示消息
  static MSG_SECONDARY_JUMP_DISABLED = '禁止二级跳转';

  // 保存状态提示
  static STATUS_SAVED = '已保存';
  static STATUS_SAVE_FAILED = '保存失败';
}
