/**
 * 图像右键菜单管理器
 * 负责图像预览区域的右键菜单功能
 */
export class ImageContextMenuManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;
  }

  /**
   * 显示图像右键菜单
   * @param {number} x - 菜单 X 坐标
   * @param {number} y - 菜单 Y 坐标
   * @param {number} imageIndex - 图像索引
   */
  show(x, y, imageIndex) {
    // 移除已存在的菜单
    this.hide();

    // 创建菜单
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'imageContextMenu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.innerHTML = `
      <div class="context-menu-item" data-action="setFirst">Set as First Image</div>
    `;

    document.body.appendChild(menu);

    // 绑定菜单项点击事件
    menu.querySelector('.context-menu-item').addEventListener('click', async () => {
      // 将选中的图像移到数组第一位
      const [selectedImage] = this.app.currentImages.splice(imageIndex, 1);
      this.app.currentImages.unshift(selectedImage);

      // 重新渲染
      await this.app.renderImagePreviews();

      // 保存到数据库
      const promptId = document.getElementById('promptId').value;
      if (promptId) {
        await this.app.savePromptField('images', this.app.currentImages);
      }

      this.hide();
    });

    // 点击其他地方关闭菜单
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this.hide();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 0);
  }

  /**
   * 隐藏图像右键菜单
   */
  hide() {
    const menu = document.getElementById('imageContextMenu');
    if (menu) {
      menu.remove();
    }
  }
}
