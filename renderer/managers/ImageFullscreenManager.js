import { Constants } from '../constants.js';
import { ListNavigator } from '../../utils/ListNavigator.js';

/**
 * 图像全屏查看器管理器
 * 负责管理图像全屏查看器的所有功能
 */
export class ImageFullscreenManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options) {
    this.app = options.app;

    // 查看器状态
    this.viewerImages = [];
    this.viewerCurrentIndex = 0;
    this.viewerZoom = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;

    // 是否已绑定事件
    this.eventsBound = false;

    // 导航器
    this.navigator = null;
  }

  /**
   * 初始化
   */
  init() {
    this.bindFullscreenEvents();
  }

  /**
   * 打开全屏图像查看器
   * @param {Array} images - 图像数组
   * @param {number} startIndex - 起始图像索引
   */
  async open(images, startIndex) {
    const viewer = document.getElementById('imageFullscreenViewer');
    if (!viewer) return;

    this.viewerImages = this.buildViewerImages(images.filter(img => img.id));
    this.viewerCurrentIndex = startIndex || 0;

    if (this.viewerImages.length === 0) return;

    // 重置缩放和位置
    this.viewerZoom = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;
    this.updateImageTransform();

    // 填充导航按钮 SVG
    this.fillNavButtonSVGs();

    // 初始化导航器
    this.initNavigator();

    await this.updateViewer();

    // 显示查看器
    viewer.classList.add('active');

    // 聚焦以接收键盘事件
    viewer.focus();

    // 进入系统全屏模式（隐藏标题栏）
    try {
      if (window.electronAPI.setFullscreen) {
        await window.electronAPI.setFullscreen(true);
      }
    } catch (error) {
      window.electronAPI.logError('ImageFullscreenManager.js', 'Failed to enter fullscreen:', error);
    }

    // 重置提示文字动画
    const hint = document.getElementById('imageFullscreenViewerHint');
    if (hint) {
      hint.classList.remove('fade-out');
      setTimeout(() => {
        hint.classList.add('fade-out');
      }, 2000);
    }
  }

  /**
   * 构建查看器图像数据
   * @param {Array} images - 原始图像数组
   * @returns {Array} 格式化后的图像数组
   */
  buildViewerImages(images) {
    return images.map(img => ({
      path: img.relativePath,
      relativePath: img.relativePath,
      fileName: img.fileName
    }));
  }

  /**
   * 更新查看器显示
   */
  async updateViewer() {
    const img = document.getElementById('imageFullscreenViewerImg');
    const counter = document.getElementById('imageFullscreenViewerCounter');

    if (this.viewerImages.length === 0) return;

    const currentImage = this.viewerImages[this.viewerCurrentIndex];

    // 检查是否有 relativePath
    if (!currentImage.relativePath) {
      window.electronAPI.logError('ImageFullscreenManager.js', 'Image missing relativePath:', currentImage);
      img.src = '';
      img.alt = 'Image not found';
      return;
    }

    // 获取图像完整路径
    const imagePath = await window.electronAPI.getImagePath(currentImage.relativePath);
    img.src = `file://${imagePath}`;
    img.alt = currentImage.fileName || '';

    // 更新文件名和索引
    const fileNameEl = document.getElementById('imageFullscreenViewerFileName');
    if (fileNameEl) {
      fileNameEl.textContent = currentImage.fileName || '';
    }
    if (counter) {
      counter.textContent = `${this.viewerCurrentIndex + 1} / ${this.viewerImages.length}`;
    }
  }

  /**
   * 处理图像缩放
   * @param {Event} e - 滚轮事件
   */
  handleZoom(e) {
    e.preventDefault();
    const img = document.getElementById('imageFullscreenViewerImg');
    if (!img) return;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.viewerZoom = (this.viewerZoom || 1) * delta;

    // 限制缩放范围（0.5 - 5 倍）
    this.viewerZoom = Math.max(0.5, Math.min(5, this.viewerZoom));

    this.updateImageTransform();
  }

  /**
   * 更新图像变换
   */
  updateImageTransform() {
    const img = document.getElementById('imageFullscreenViewerImg');
    if (!img) return;

    const zoom = this.viewerZoom || 1;
    const translateX = this.viewerTranslateX || 0;
    const translateY = this.viewerTranslateY || 0;

    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoom})`;
  }

  /**
   * 绑定图像拖拽
   */
  bindImageDrag() {
    const wrapper = document.getElementById('imageFullscreenViewerWrapper');
    if (!wrapper) return;

    let isDragging = false;
    let startX, startY;
    let initialTranslateX = 0, initialTranslateY = 0;

    wrapper.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 只响应左键
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialTranslateX = this.viewerTranslateX || 0;
      initialTranslateY = this.viewerTranslateY || 0;
      wrapper.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.viewerTranslateX = initialTranslateX + dx;
      this.viewerTranslateY = initialTranslateY + dy;

      this.updateImageTransform();
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        wrapper.style.cursor = 'grab';
      }
    });

    // 双击重置
    wrapper.addEventListener('dblclick', () => {
      this.viewerZoom = 1;
      this.viewerTranslateX = 0;
      this.viewerTranslateY = 0;
      this.updateImageTransform();
    });
  }

  /**
   * 初始化导航器
   */
  initNavigator() {
    const viewer = document.getElementById('imageFullscreenViewer');
    if (!viewer) return;

    this.navigator = new ListNavigator({
      items: this.viewerImages,
      currentIndex: this.viewerCurrentIndex,
      onSave: null, // 全屏查看器不需要保存
      onNavigate: async (targetItem, currentIndex) => {
        this.viewerCurrentIndex = currentIndex;

        // 重置缩放和位置
        this.viewerZoom = 1;
        this.viewerTranslateX = 0;
        this.viewerTranslateY = 0;
        this.updateImageTransform();

        await this.updateViewer();
      },
      onClose: () => this.close(),
      navButtons: {
        first: document.getElementById('imageFullscreenViewerFirstNavBtn'),
        prev: document.getElementById('imageFullscreenViewerPrevNavBtn'),
        next: document.getElementById('imageFullscreenViewerNextNavBtn'),
        last: document.getElementById('imageFullscreenViewerLastNavBtn')
      },
      targetElement: document,
      shouldHandleKeyboard: (e) => {
        // 只在查看器打开时响应
        if (!viewer.classList.contains('active')) return false;
        // 如果正在编辑输入框，不响应导航键
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return false;
        return true;
      }
    });
  }

  /**
   * 绑定全屏查看器事件（只绑定一次）
   */
  bindFullscreenEvents() {
    if (this.eventsBound) return;

    const viewer = document.getElementById('imageFullscreenViewer');

    // 关闭按钮
    const closeBtn = document.getElementById('imageFullscreenViewerClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // 点击遮罩关闭
    if (viewer) {
      viewer.addEventListener('click', (e) => {
        if (e.target.classList.contains('fullscreen-viewer-overlay')) {
          this.close();
        }
      });
    }

    // 滚轮缩放
    const wrapper = document.getElementById('imageFullscreenViewerWrapper');
    if (wrapper) {
      wrapper.addEventListener('wheel', (e) => this.handleZoom(e), { passive: false });
    }

    // 拖拽移动
    this.bindImageDrag();

    this.eventsBound = true;
  }

  /**
   * 关闭全屏查看器
   */
  async close() {
    const viewer = document.getElementById('imageFullscreenViewer');
    if (viewer) {
      viewer.classList.remove('active');
    }

    this.viewerImages = [];
    this.viewerCurrentIndex = 0;
    this.viewerZoom = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;

    // 销毁导航器
    if (this.navigator) {
      this.navigator.destroy();
      this.navigator = null;
    }

    // 退出系统全屏模式（恢复标题栏）
    try {
      if (window.electronAPI.setFullscreen) {
        await window.electronAPI.setFullscreen(false);
      }
    } catch (error) {
      window.electronAPI.logError('ImageFullscreenManager.js', 'Failed to exit fullscreen:', error);
    }
  }

  /**
   * 填充导航按钮 SVG
   */
  fillNavButtonSVGs() {
    const navButtons = [
      { id: 'imageFullscreenViewerFirstNavBtn', type: 'first' },
      { id: 'imageFullscreenViewerPrevNavBtn', type: 'prev' },
      { id: 'imageFullscreenViewerNextNavBtn', type: 'next' },
      { id: 'imageFullscreenViewerLastNavBtn', type: 'last' }
    ];

    navButtons.forEach(({ id, type }) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.innerHTML = Constants.ICONS.nav[type];
      }
    });
  }
}
