/**
 * Popup页面交互逻辑
 * 负责UI渲染、用户交互处理、与Background Service Worker通信
 */

document.addEventListener('DOMContentLoaded', async () => {
  // ========== DOM元素引用 ==========
  const btnBackup = document.getElementById('btnBackup'); // 备份按钮
  const btnRestore = document.getElementById('btnRestore'); // 恢复按钮
  const btnTest = document.getElementById('btnTest'); // 测试连接按钮
  const btnSaveSettings = document.getElementById('btnSaveSettings'); // 保存设置按钮
  const settingsToggle = document.getElementById('settingsToggle'); // 设置折叠切换
  const settingsContent = document.getElementById('settingsContent'); // 设置内容区
  const toggleArrow = settingsToggle.querySelector('.toggle-arrow'); // 折叠箭头
  const messageBox = document.getElementById('messageBox'); // 消息提示框
  const encryptionEnabled = document.getElementById('encryptionEnabled'); // 加密开关
  const encryptionPasswordGroup = document.getElementById('encryptionPasswordGroup'); // 加密密码组

  // 表单输入元素
  const webdavUrl = document.getElementById('webdavUrl');
  const webdavUsername = document.getElementById('webdavUsername');
  const webdavPassword = document.getElementById('webdavPassword');
  const backupDir = document.getElementById('backupDir');
  const encryptionPassword = document.getElementById('encryptionPassword');

  // 状态显示元素
  const backupStatusEl = document.getElementById('backupStatus');
  const lastBackupTimeEl = document.getElementById('lastBackupTime');
  const lastRestoreTimeEl = document.getElementById('lastRestoreTime');

  // 确认弹窗元素
  const confirmDialog = document.getElementById('confirmDialog');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmOk = document.getElementById('confirmOk');
  const confirmCancel = document.getElementById('confirmCancel');

  // 确认弹窗的Promise回调引用
  let confirmResolve = null;

  // ========== 初始化 ==========

  /**
   * 页面加载时初始化
   * 1. 加载已保存的配置
   * 2. 获取备份状态
   * 3. 更新按钮可用状态
   */
  async function init() {
    // 加载已保存的WebDAV配置到表单
    await loadSettings();
    // 获取并显示备份状态
    await refreshStatus();
  }

  /**
   * 从存储加载配置并填充到表单
   */
  async function loadSettings() {
    // 获取WebDAV配置
    const webdavConfig = await getStorageData([
      'webdav_url', 'webdav_username', 'webdav_password', 'backup_dir'
    ]);
    webdavUrl.value = webdavConfig.webdav_url || '';
    webdavUsername.value = webdavConfig.webdav_username || '';
    webdavPassword.value = webdavConfig.webdav_password || '';
    backupDir.value = webdavConfig.backup_dir || '/bookmark-backup';

    // 获取加密配置
    const encryptionConfig = await getStorageData([
      'encryption_enabled', 'encryption_password'
    ]);
    encryptionEnabled.checked = encryptionConfig.encryption_enabled || false;
    encryptionPassword.value = encryptionConfig.encryption_password || '';

    // 根据加密开关状态显示/隐藏密码输入框
    toggleEncryptionPasswordVisibility();
  }

  /**
   * 刷新备份状态信息
   */
  async function refreshStatus() {
    // 向Background请求状态信息
    const response = await sendMessage({ type: 'GET_STATUS' });

    if (response.success) {
      const data = response.data;

      // 更新备份状态显示
      if (data.error) {
        // 配置不完整时显示提示
        backupStatusEl.innerHTML = '<span class="status-dot inactive"></span>未配置';
        updateButtonStates(false);
      } else if (data.v1Exists) {
        // v1存在表示有最新备份
        backupStatusEl.innerHTML = '<span class="status-dot active"></span>已备份' +
          (data.v2Exists ? '（含历史）' : '');
        updateButtonStates(true);
      } else {
        // 没有备份
        backupStatusEl.innerHTML = '<span class="status-dot inactive"></span>未备份';
        updateButtonStates(true);
      }

      // 更新上次操作时间显示
      lastBackupTimeEl.textContent = formatTime(data.lastBackup);
      lastRestoreTimeEl.textContent = formatTime(data.lastRestore);
    } else {
      // 获取状态失败
      backupStatusEl.innerHTML = '<span class="status-dot error"></span>获取失败';
      updateButtonStates(false);
    }
  }

  /**
   * 根据配置状态更新按钮可用性
   * @param {boolean} configured - WebDAV是否已配置
   */
  function updateButtonStates(configured) {
    btnBackup.disabled = !configured;
    btnRestore.disabled = !configured;
    btnTest.disabled = !configured;
  }

  // ========== 事件绑定 ==========

  /**
   * 备份按钮点击事件
   */
  btnBackup.addEventListener('click', async () => {
    // 显示加载状态
    showLoading('正在备份书签到WebDAV...');
    disableAllButtons(true);

    try {
      // 向Background发送备份请求
      const response = await sendMessage({ type: 'BACKUP' });

      if (response.success) {
        const data = response.data;
        // 显示备份成功信息
        showMessage(
          `备份成功！共备份 ${data.bookmarkCount} 个书签` +
          (data.isEncrypted ? '（已加密）' : '') +
          `\n时间：${formatTime(data.timestamp)}`,
          'success'
        );
        // 刷新状态显示
        await refreshStatus();
      } else {
        showMessage(`备份失败：${response.error}`, 'error');
      }
    } catch (error) {
      showMessage(`备份异常：${error.message}`, 'error');
    } finally {
      disableAllButtons(false);
    }
  });

  /**
   * 恢复按钮点击事件
   */
  btnRestore.addEventListener('click', async () => {
    // 获取用户选择的恢复版本
    const versionRadio = document.querySelector('input[name="restoreVersion"]:checked');
    const version = versionRadio ? versionRadio.value : 'v1';
    const versionLabel = version === 'v2' ? '历史备份(v2)' : '最新备份(v1)';

    // 使用自定义确认弹窗替代原生confirm
    const confirmed = await showConfirm(
      '确认恢复',
      `将从WebDAV恢复${versionLabel}到本地\n已存在的书签会跳过，不会重复创建。`
    );
    if (!confirmed) return;

    // 显示加载状态
    showLoading(`正在从WebDAV恢复${versionLabel}...`);
    disableAllButtons(true);

    try {
      // 向Background发送恢复请求，传递版本参数
      const response = await sendMessage({ type: 'RESTORE', version: version });

      if (response.success) {
        const stats = response.data.stats;
        // 显示恢复结果统计
        showMessage(
          `恢复完成！\n` +
          `总计：${stats.total} 项\n` +
          `新建书签：${stats.created} 个\n` +
          `新建文件夹：${stats.foldersCreated} 个\n` +
          `跳过书签（已存在）：${stats.skipped} 个\n` +
          `跳过文件夹（已存在）：${stats.foldersSkipped} 个`,
          'success'
        );
        // 刷新状态显示
        await refreshStatus();
      } else {
        showMessage(`恢复失败：${response.error}`, 'error');
      }
    } catch (error) {
      showMessage(`恢复异常：${error.message}`, 'error');
    } finally {
      disableAllButtons(false);
    }
  });

  /**
   * 测试连接按钮点击事件
   */
  btnTest.addEventListener('click', async () => {
    showLoading('正在测试WebDAV连接...');
    disableAllButtons(true);

    try {
      const response = await sendMessage({ type: 'TEST_CONNECTION' });

      if (response.success) {
        const data = response.data;
        showMessage(
          `连接成功！\n服务器：${data.url}\n` +
          `备份目录：${data.dirExists ? '已存在' : '不存在（备份时自动创建）'}`,
          'success'
        );
      } else {
        showMessage(`连接失败：${response.error}`, 'error');
      }
    } catch (error) {
      showMessage(`连接异常：${error.message}`, 'error');
    } finally {
      disableAllButtons(false);
    }
  });

  /**
   * 保存设置按钮点击事件
   */
  btnSaveSettings.addEventListener('click', async () => {
    // 校验必填字段
    if (!webdavUrl.value.trim()) {
      showMessage('请填写WebDAV地址', 'error');
      return;
    }
    if (!webdavUsername.value.trim()) {
      showMessage('请填写用户名', 'error');
      return;
    }
    if (!webdavPassword.value.trim()) {
      showMessage('请填写密码', 'error');
      return;
    }

    // 如果启用了加密，校验加密密码
    if (encryptionEnabled.checked && !encryptionPassword.value.trim()) {
      showMessage('启用加密时必须填写加密密码', 'error');
      return;
    }

    try {
      // 保存WebDAV配置
      await setStorageData({
        webdav_url: webdavUrl.value.trim(),
        webdav_username: webdavUsername.value.trim(),
        webdav_password: webdavPassword.value.trim(),
        backup_dir: backupDir.value.trim() || '/bookmark-backup',
        encryption_enabled: encryptionEnabled.checked,
        encryption_password: encryptionPassword.value.trim()
      });

      showMessage('设置已保存', 'success');
      // 保存后刷新按钮状态和备份状态
      await refreshStatus();
    } catch (error) {
      showMessage(`保存失败：${error.message}`, 'error');
    }
  });

  /**
   * 设置区域折叠/展开切换
   */
  settingsToggle.addEventListener('click', () => {
    const isOpen = settingsContent.classList.toggle('open');
    toggleArrow.classList.toggle('open', isOpen);
  });

  /**
   * 加密开关变化时，显示/隐藏加密密码输入框
   */
  encryptionEnabled.addEventListener('change', () => {
    toggleEncryptionPasswordVisibility();
  });

  // ========== 工具函数 ==========

  /**
   * 显示自定义确认弹窗（替代原生confirm）
   * @param {string} title - 弹窗标题
   * @param {string} message - 弹窗消息
   * @returns {Promise<boolean>} 用户点击确定返回true，取消返回false
   */
  function showConfirm(title, message) {
    return new Promise((resolve) => {
      // 设置弹窗内容
      confirmTitle.textContent = title;
      confirmMessage.textContent = message;
      // 显示弹窗
      confirmDialog.classList.remove('hidden');
      // 保存Promise的resolve引用
      confirmResolve = resolve;
    });
  }

  /**
   * 隐藏确认弹窗
   */
  function hideConfirm() {
    confirmDialog.classList.add('hidden');
    confirmResolve = null;
  }

  // 确认按钮点击：返回true并关闭弹窗
  confirmOk.addEventListener('click', () => {
    if (confirmResolve) confirmResolve(true);
    hideConfirm();
  });

  // 取消按钮点击：返回false并关闭弹窗
  confirmCancel.addEventListener('click', () => {
    if (confirmResolve) confirmResolve(false);
    hideConfirm();
  });

  // 点击遮罩层也可关闭弹窗（视为取消）
  confirmDialog.addEventListener('click', (e) => {
    if (e.target === confirmDialog) {
      if (confirmResolve) confirmResolve(false);
      hideConfirm();
    }
  });

  /**
   * 向Background Service Worker发送消息
   * @param {Object} message - 消息对象
   * @returns {Promise<Object>} Background的响应
   */
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response || { success: false, error: '无响应' });
      });
    });
  }

  /**
   * 从chrome.storage读取数据
   * @param {string|string[]} keys - 要读取的键名
   * @returns {Promise<Object>} 读取到的数据
   */
  function getStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * 向chrome.storage写入数据
   * @param {Object} data - 要写入的键值对
   * @returns {Promise<void>}
   */
  function setStorageData(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 显示消息提示
   * @param {string} text - 消息文本
   * @param {string} type - 消息类型（success/error/info/loading）
   */
  function showMessage(text, type = 'info') {
    messageBox.textContent = text;
    messageBox.className = `message-box ${type}`;
  }

  /**
   * 显示加载状态消息
   * @param {string} text - 加载提示文本
   */
  function showLoading(text) {
    messageBox.innerHTML = `<span class="loading-spinner"></span>${text}`;
    messageBox.className = 'message-box loading';
  }

  /**
   * 根据加密开关状态切换密码输入框的可见性
   */
  function toggleEncryptionPasswordVisibility() {
    encryptionPasswordGroup.style.display =
      encryptionEnabled.checked ? 'block' : 'none';
  }

  /**
   * 禁用/启用所有操作按钮
   * @param {boolean} disabled - 是否禁用
   */
  function disableAllButtons(disabled) {
    btnBackup.disabled = disabled;
    btnRestore.disabled = disabled;
    btnTest.disabled = disabled;
  }

  /**
   * 格式化ISO时间字符串为可读格式
   * @param {string|null} isoString - ISO 8601格式的时间字符串
   * @returns {string} 格式化后的时间文本
   */
  function formatTime(isoString) {
    if (!isoString) return '从未';

    try {
      const date = new Date(isoString);
      // 格式化为 "YYYY-MM-DD HH:mm"
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
      return isoString;
    }
  }

  // ========== 启动初始化 ==========

  // 检测当前打开模式（popup还是独立弹窗/标签页）
  // popup宽度固定360px，独立弹窗宽度420px，阈值取380区分
  if (window.innerWidth > 380) {
    document.body.classList.add('tab-mode');
  } else {
    document.body.classList.add('popup-mode');
  }
  // 监听窗口大小变化，动态切换模式
  window.addEventListener('resize', () => {
    if (window.innerWidth > 380) {
      document.body.classList.add('tab-mode');
      document.body.classList.remove('popup-mode');
    } else {
      document.body.classList.remove('tab-mode');
      document.body.classList.add('popup-mode');
    }
  });

  init();
});
