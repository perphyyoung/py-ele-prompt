/**
 * 对话框配置
 */
export const DialogConfig = {
  // ==================== 删除类 ====================
  /** 删除提示词 */
  DELETE_PROMPT: {
    title: '确认删除',
    message: (data) => `确定要删除提示词 "${data.name}" 吗？\n已删除的提示词会进入回收站，可以从回收站恢复。`
  },
  /** 删除图像到回收站 */
  DELETE_IMAGE_TO_TRASH: {
    title: '确认删除',
    message: '确定要删除这张图像吗？已删除的图像会进入回收站，可以从回收站恢复。'
  },
  /** 删除标签 */
  DELETE_TAG: {
    title: '确认删除标签',
    message: (data) => `确定要删除标签 "${data.name}" 吗？`
  },
  /** 删除标签组 */
  DELETE_TAG_GROUP: {
    title: '确认删除',
    message: '删除标签组不会删除标签，标签将变为未分组状态。确定要删除吗？'
  },
  /** 永久删除 */
  PERMANENT_DELETE: {
    title: '确认永久删除',
    message: (data) => `确定要永久删除此${data.type === 'prompt' ? '提示词' : '图像'}吗？此操作不可恢复。`
  },
  /** 批量删除 */
  BATCH_DELETE: {
    title: '确认批量删除',
    message: (data) => `确定要删除选中的 ${data.count} 个项目吗？\n删除后可在回收站恢复。`
  },

  // ==================== 移动/恢复类 ====================
  /** 恢复 */
  RESTORE_FROM_TRASH: {
    title: '确认恢复',
    message: (data) => `确定要恢复此${data.type === 'prompt' ? '提示词' : '图像'}吗？`
  },
  /** 从提示词移除图像关联 */
  REMOVE_IMAGE_FROM_PROMPT: {
    title: '确认移除',
    message: '确定要从当前提示词中移除此图像吗？\n图像本身不会被删除。'
  },
  /** 移除新建提示词中的图像 */
  REMOVE_NEW_IMAGE: {
    title: '确认移除',
    message: '确定要移除此图像吗？'
  },
  /** 解除关联 */
  UNLINK_FROM_PROMPT: {
    title: '解除关联',
    message: (data) => `确定要解除与提示词 "${data.promptTitle || '未命名'}" 的关联吗？`
  },

  // ==================== 清空/重置类 ====================
  /** 清空回收站 */
  EMPTY_TRASH: {
    title: '确认清空',
    message: (data) => `确定要清空${data.type === 'prompt' ? '提示词' : '图像'}回收站吗？此操作不可恢复。`
  },
  /** 清空所有数据 */
  CLEAR_ALL_DATA: {
    title: '⚠️ 危险操作',
    message: '确定要清空所有数据吗？\n\n此操作将重命名当前数据目录并创建新的空数据目录，应用将重启。\n\n旧数据目录可在重启后查看。'
  },
  /** 数据已重置 */
  DATA_RESET: {
    title: '数据已重置',
    message: (data) => `旧数据目录已重命名为:\n${data.oldDataDir}\n\n您可以手动备份或删除此目录。`,
    singleButton: true
  },

  // ==================== 其他 ====================
  /** 重启应用 */
  RELAUNCH_APP: {
    title: '确认重启',
    message: '确定要重启应用吗？\n\n未保存的修改可能会丢失。'
  },
  /** 标签已存在 */
  TAG_EXISTS: {
    title: '标签已存在',
    message: (data) => `标签 "${data.tagName}" 已存在，当前所属组：${data.currentGroupName}\n\n是否覆盖并移动到：${data.newGroupName}？`
  }
};

// ==================== 静态变量 ====================
let _confirmCallback = null;
let _previousFocus = null;
let _activeModals = new Set();
let _buttonsBound = false;

// ==================== 对话框服务 ====================
export class DialogService {
  static _bindButtonEvents() {
    if (_buttonsBound) return;
    document.getElementById('confirmOkBtn')?.addEventListener('click', () => {
      DialogService._closeConfirm(true);
    });
    document.getElementById('confirmCancelBtn')?.addEventListener('click', () => {
      DialogService._closeConfirm(false);
    });
    document.getElementById('closeConfirmModal')?.addEventListener('click', () => {
      DialogService._closeConfirm(false);
    });
    _buttonsBound = true;
  }

  static async showConfirmDialogByConfig(config) {
    DialogService._bindButtonEvents();

    if (_confirmCallback) {
      console.warn('Confirm dialog already open, rejecting new call');
      return false;
    }

    const title = typeof config.title === 'function' ? config.title(config.data) : config.title;
    const msg = typeof config.message === 'function' ? config.message(config.data) : config.message;

    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const modalTitle = document.getElementById('confirmModalTitle');
      const modalMessage = document.getElementById('confirmModalMessage');

      if (!modal) {
        resolve(window.confirm(msg));
        return;
      }

      if (modalTitle) modalTitle.textContent = title;
      if (modalMessage) modalMessage.innerHTML = msg.replace(/\n/g, '<br>');

      const cancelBtn = document.getElementById('confirmCancelBtn');
      const okBtn = document.getElementById('confirmOkBtn');
      if (config.singleButton) {
        cancelBtn.style.display = 'none';
        okBtn.style.margin = '0 auto';
      } else {
        cancelBtn.style.display = '';
        okBtn.style.margin = '';
      }

      _previousFocus = document.activeElement;

      modal.style.display = 'flex';
      _activeModals.add('confirmModal');

      setTimeout(() => {
        document.getElementById('confirmOkBtn')?.focus();
      }, 0);

      _confirmCallback = (result) => {
        _confirmCallback = null;
        resolve(result);
      };
      DialogService._bindConfirmKeyboardEvents();
    });
  }

  static _bindConfirmKeyboardEvents() {
    const handleKeyDown = (e) => {
      if (!_activeModals.has('confirmModal')) {
        document.removeEventListener('keydown', handleKeyDown);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        DialogService._closeConfirm(true);
        document.removeEventListener('keydown', handleKeyDown);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        DialogService._closeConfirm(false);
        document.removeEventListener('keydown', handleKeyDown);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
  }

  static _closeConfirm(result = false) {
    const modal = document.getElementById('confirmModal');
    if (modal) {
      modal.style.display = 'none';
    }

    const cancelBtn = document.getElementById('confirmCancelBtn');
    const okBtn = document.getElementById('confirmOkBtn');
    if (cancelBtn) cancelBtn.style.display = '';
    if (okBtn) okBtn.style.margin = '';

    if (_confirmCallback) {
      _confirmCallback(result);
      _confirmCallback = null;
    }

    _activeModals.delete('confirmModal');

    if (_previousFocus) {
      _previousFocus.focus();
      _previousFocus = null;
    }
  }
}

export default DialogService;
