/**
 * Background Service Worker
 * 浏览器扩展后台服务，处理书签备份和恢复的核心逻辑
 * 通过消息机制与Popup通信
 */

// 导入工具脚本（Service Worker中使用importScripts）
importScripts(
  '../lib/webdav.js',
  '../utils/crypto.js',
  '../utils/bookmark.js',
  '../utils/storage.js'
);

// 备份文件名常量（轮转槽位策略）
const BACKUP_V1 = 'bookmarks_v1.json'; // 最新备份
const BACKUP_V2 = 'bookmarks_v2.json'; // 上一次备份

// 主页配置备份文件名
const NEWTAB_V1 = 'newtab_config_v1.json'; // 最新主页配置备份
const NEWTAB_V2 = 'newtab_config_v2.json'; // 上一次主页配置备份

// 加密数据标识前缀，用于可靠判断数据是否加密
// 加密后的Base64字符串以"ENC1:"开头，避免依赖try-catch判断
const ENCRYPTION_PREFIX = 'ENC1:';

// 操作锁：防止备份/恢复操作并发执行
let isOperationRunning = false;

/**
 * 注册右键菜单
 * 在扩展安装或更新时调用
 */
function registerContextMenus() {
  // 创建父菜单
  chrome.contextMenus.create({
    id: 'bookmark-backup-parent',
    title: '我的书签同步',
    contexts: ['page'] // 在页面右键时显示（Chrome不支持'bookmark'上下文）
  });

  // 备份到WebDAV
  chrome.contextMenus.create({
    id: 'context-backup',
    parentId: 'bookmark-backup-parent',
    title: '⬆️ 备份到WebDAV',
    contexts: ['page']
  });

  // 从WebDAV恢复（最新v1）
  chrome.contextMenus.create({
    id: 'context-restore-v1',
    parentId: 'bookmark-backup-parent',
    title: '⬇️ 恢复最新备份(v1)',
    contexts: ['page']
  });

  // 从WebDAV恢复（历史v2）
  chrome.contextMenus.create({
    id: 'context-restore-v2',
    parentId: 'bookmark-backup-parent',
    title: '⬇️ 恢复历史备份(v2)',
    contexts: ['page']
  });

  // 分隔线
  chrome.contextMenus.create({
    id: 'context-separator',
    parentId: 'bookmark-backup-parent',
    type: 'separator',
    contexts: ['page']
  });

  // 打开设置
  chrome.contextMenus.create({
    id: 'context-settings',
    parentId: 'bookmark-backup-parent',
    title: '⚙️ 设置',
    contexts: ['page']
  });

  // 分隔线（newtab区域分隔）
  chrome.contextMenus.create({
    id: 'context-newtab-separator',
    parentId: 'bookmark-backup-parent',
    type: 'separator',
    contexts: ['page']
  });

  // 主页导航开关（标题动态更新，显示当前状态）
  chrome.contextMenus.create({
    id: 'context-newtab-toggle',
    parentId: 'bookmark-backup-parent',
    title: '🏠 主页导航：加载中...',
    contexts: ['page']
  });

  // 初始化菜单标题为当前状态
  updateNewtabMenuTitle();
}

// 扩展安装或更新时注册右键菜单
chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
});

// 扩展启动时也注册（Service Worker可能被重启）
chrome.runtime.onStartup.addListener(() => {
  registerContextMenus();
});

/**
 * 更新右键菜单中"主页导航开关"的标题
 * 根据当前启用状态显示不同的文字和图标
 */
function updateNewtabMenuTitle() {
  chrome.storage.local.get('newtab_enabled', (result) => {
    // 默认启用（undefined时视为true）
    const enabled = result.newtab_enabled !== false;
    const title = enabled
      ? '🏠 主页导航：✅ 已开启'
      : '🏠 主页导航：❌ 已关闭';
    // 动态更新菜单项标题
    chrome.contextMenus.update('context-newtab-toggle', { title: title });
  });
}

/**
 * 切换主页导航开关
 * 修改chrome.storage中的标志，newtab页面初始化时会检查此标志
 */
function toggleNewtab() {
  chrome.storage.local.get('newtab_enabled', (result) => {
    const currentEnabled = result.newtab_enabled !== false;
    const newEnabled = !currentEnabled;
    // 保存新状态
    chrome.storage.local.set({ newtab_enabled: newEnabled }, () => {
      // 更新菜单标题
      updateNewtabMenuTitle();
      // 通知用户
      showNotification(
        '主页导航',
        newEnabled ? '已开启主页导航，新标签页将显示导航主页' : '已关闭主页导航，新标签页将显示空白页'
      );
    });
  });
}

/**
 * 显示系统通知
 * 右键菜单操作后通过通知反馈结果
 * @param {string} title - 通知标题
 * @param {string} message - 通知内容
 * @param {string} type - 通知类型图标（success/error）
 */
function showNotification(title, message, type = 'success') {
  // 使用Chrome通知API显示系统通知
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: title,
    message: message
  });
}

/**
 * 右键菜单点击处理
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'context-backup':
      // 右键菜单触发备份
      if (isOperationRunning) {
        showNotification('书签备份', '操作进行中，请稍后再试', 'error');
        return;
      }
      isOperationRunning = true;
      try {
        const result = await performBackup();
        showNotification(
          '备份成功',
          `共备份 ${result.bookmarkCount} 个书签${result.isEncrypted ? '（已加密）' : ''}`
        );
      } catch (error) {
        showNotification('备份失败', error.message, 'error');
      } finally {
        isOperationRunning = false;
      }
      break;

    case 'context-restore-v1':
    case 'context-restore-v2':
      // 右键菜单触发恢复
      if (isOperationRunning) {
        showNotification('书签备份', '操作进行中，请稍后再试', 'error');
        return;
      }
      // 从菜单ID提取版本号
      const version = info.menuItemId === 'context-restore-v2' ? 'v2' : 'v1';
      const versionLabel = version === 'v2' ? '历史备份(v2)' : '最新备份(v1)';
      isOperationRunning = true;
      try {
        const result = await performRestore(version);
        const stats = result.stats;
        showNotification(
          '恢复成功',
          `从${versionLabel}恢复：新建${stats.created}个书签、` +
          `${stats.foldersCreated}个文件夹，跳过${stats.skipped + stats.foldersSkipped}项`
        );
      } catch (error) {
        showNotification('恢复失败', error.message, 'error');
      } finally {
        isOperationRunning = false;
      }
      break;

    case 'context-settings':
      // 打开Popup页面（使用独立弹窗窗口，避免新标签页中360px宽度留白）
      chrome.windows.create({
        url: chrome.runtime.getURL('popup/popup.html'),
        type: 'popup', // 弹窗类型：无标签栏、无地址栏，干净整洁
        width: 420, // 弹窗宽度
        height: 680 // 弹窗高度
      });
      break;

    case 'context-newtab-toggle':
      // 切换主页导航开关
      toggleNewtab();
      break;
  }
});

/**
 * 创建WebDAV客户端实例
 * @returns {Promise<WebDAVClient>} 已配置的WebDAV客户端
 */
async function createWebDAVClient() {
  // 从存储中读取WebDAV配置
  const config = await StorageUtil.getWebDAVConfig();
  // 校验配置完整性
  if (!config.url || !config.username || !config.password) {
    throw new Error('WebDAV配置不完整，请先在设置中填写服务器地址、用户名和密码');
  }
  return new WebDAVClient(config);
}

/**
 * 执行备份操作（轮转槽位策略）
 * 流程：
 * 1. 确保WebDAV备份目录存在
 * 2. 如果v1存在，将v1移动到v2（覆盖旧v2）
 * 3. 将当前书签导出并上传为v1
 * @returns {Promise<Object>} 备份结果
 */
async function performBackup() {
  // 创建WebDAV客户端
  const client = await createWebDAVClient();
  // 获取备份目录路径
  const config = await StorageUtil.getWebDAVConfig();
  const backupDir = config.backupDir;

  // 第一步：确保备份目录存在
  await client.createDirectory(backupDir, { recursive: true });

  // 构建v1和v2的完整路径
  const v1Path = `${backupDir}/${BACKUP_V1}`;
  const v2Path = `${backupDir}/${BACKUP_V2}`;

  // 第二步：轮转备份文件
  // 如果v1已存在，将其移动到v2（覆盖旧的v2）
  const v1Exists = await client.exists(v1Path);
  if (v1Exists) {
    // 使用MOVE操作将v1覆盖为v2，这是原子操作
    await client.moveFile(v1Path, v2Path, { overwrite: true });
  }

  // 第三步：导出当前书签数据
  const bookmarkData = await BookmarkUtil.exportBookmarks();

  // 第四步：根据配置决定是否加密
  const encryptionConfig = await StorageUtil.getEncryptionConfig();
  let finalData = bookmarkData;
  let isEncrypted = false;

  if (encryptionConfig.enabled && encryptionConfig.password) {
    // 启用加密：使用AES-256-GCM加密书签数据
    const encrypted = await CryptoUtil.encrypt(bookmarkData, encryptionConfig.password);
    // 添加加密标识前缀，便于恢复时可靠判断数据是否加密
    finalData = ENCRYPTION_PREFIX + encrypted;
    isEncrypted = true;
  }

  // 第五步：上传新的v1备份
  // 加密数据是Base64字符串，未加密数据是JSON字符串
  const contentType = isEncrypted
    ? 'application/octet-stream' // 加密数据使用二进制内容类型
    : 'application/json'; // 未加密数据使用JSON内容类型

  await client.putFileContents(v1Path, finalData, {
    overwrite: true,
    contentType: contentType
  });

  // 更新上次备份时间
  await StorageUtil.updateLastBackupTime();

  // 返回备份结果统计
  const bookmarkCount = JSON.parse(bookmarkData).bookmarks.length;
  return {
    success: true,
    bookmarkCount: bookmarkCount, // 备份的书签数量
    isEncrypted: isEncrypted, // 是否加密
    timestamp: new Date().toISOString() // 备份时间
  };
}

/**
 * 执行恢复操作（从WebDAV拉取书签并合并到本地）
 * 流程：
 * 1. 从WebDAV下载指定版本的备份文件
 * 2. 如果启用了加密，先解密
 * 3. 将书签合并到本地（已存在则跳过，不存在则创建）
 * @param {string} version - 恢复版本：'v1'（最新）或'v2'（历史）
 * @returns {Promise<Object>} 恢复结果统计
 */
async function performRestore(version = 'v1') {
  // 创建WebDAV客户端
  const client = await createWebDAVClient();
  // 获取备份目录路径
  const config = await StorageUtil.getWebDAVConfig();
  const backupDir = config.backupDir;

  // 根据用户选择的版本构建路径
  const backupFile = version === 'v2' ? BACKUP_V2 : BACKUP_V1;
  const backupPath = `${backupDir}/${backupFile}`;

  // 第一步：下载指定版本的备份文件
  const rawContent = await client.getFileContents(backupPath, { format: 'text' });

  // 第二步：判断是否需要解密（通过前缀标识可靠判断）
  let bookmarkData;
  if (rawContent.startsWith(ENCRYPTION_PREFIX)) {
    // 数据以加密前缀开头，需要解密
    // 去除前缀，获取纯Base64密文
    const encryptedData = rawContent.slice(ENCRYPTION_PREFIX.length);
    const encryptionConfig = await StorageUtil.getEncryptionConfig();
    if (encryptionConfig.password) {
      // 使用密码解密
      try {
        bookmarkData = await CryptoUtil.decrypt(encryptedData, encryptionConfig.password);
      } catch (decryptError) {
        throw new Error('解密失败，请检查加密密码是否正确');
      }
    } else {
      // 数据已加密但未配置密码
      throw new Error('备份数据已加密，请先在设置中配置加密密码');
    }
  } else {
    // 无加密前缀，尝试直接解析为JSON（未加密的情况）
    try {
      JSON.parse(rawContent);
      bookmarkData = rawContent;
    } catch (e) {
      // JSON解析失败且无加密前缀，可能是旧版加密数据或损坏文件
      // 尝试用密码解密作为兜底
      const encryptionConfig = await StorageUtil.getEncryptionConfig();
      if (encryptionConfig.password) {
        try {
          bookmarkData = await CryptoUtil.decrypt(rawContent, encryptionConfig.password);
        } catch (decryptError) {
          throw new Error('备份数据格式无效，可能密码错误或文件已损坏');
        }
      } else {
        throw new Error('备份数据格式无效，文件可能已损坏');
      }
    }
  }

  // 第三步：验证解密后的数据格式
  let parsedData;
  try {
    parsedData = JSON.parse(bookmarkData);
  } catch (e) {
    throw new Error('备份数据格式无效，可能密码错误或文件已损坏');
  }

  // 校验数据版本
  if (!parsedData.version) {
    throw new Error('不支持的备份数据格式');
  }

  // 第四步：合并书签到本地
  const stats = await BookmarkUtil.importBookmarks(bookmarkData);

  // 更新上次恢复时间
  await StorageUtil.updateLastRestoreTime();

  return {
    success: true,
    stats: stats // 恢复统计（总数/跳过/创建/新建文件夹）
  };
}

/**
 * 测试WebDAV连接
 * 使用PROPFIND验证连接是否真正可用，而不是仅检查客户端能否创建
 * @returns {Promise<Object>} 连接测试结果
 */
async function testConnection() {
  const client = await createWebDAVClient();
  const config = await StorageUtil.getWebDAVConfig();

  // 第一步：使用PROPFIND Depth:0验证基础URL是否可访问
  // 这是真正验证连接+认证是否正确的方式
  try {
    const response = await client._request('PROPFIND', '', {
      headers: { 'Depth': '0' }
    });
    // 200/207表示连接成功且认证通过
    if (!response.ok && response.status !== 207) {
      // 401=认证失败，403=无权限，其他=连接问题
      if (response.status === 401) {
        throw new Error('认证失败，请检查用户名和密码');
      }
      if (response.status === 403) {
        throw new Error('无权限访问该路径，请检查WebDAV地址是否正确');
      }
      throw new Error(`连接失败: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // 如果是已知的业务错误，直接抛出
    if (error.message.includes('认证失败') ||
        error.message.includes('无权限') ||
        error.message.includes('连接失败')) {
      throw error;
    }
    // 网络错误
    throw new Error(`无法连接到WebDAV服务器: ${error.message}`);
  }

  // 第二步：检查备份目录是否存在
  const dirExists = await client.exists(config.backupDir);

  return {
    success: true,
    dirExists: dirExists, // 备份目录是否已存在
    url: config.url // 服务器地址
  };
}

/**
 * 获取备份状态信息
 * @returns {Promise<Object>} 备份状态
 */
async function getBackupStatus() {
  try {
    const client = await createWebDAVClient();
    const config = await StorageUtil.getWebDAVConfig();
    const backupDir = config.backupDir;

    const v1Path = `${backupDir}/${BACKUP_V1}`;
    const v2Path = `${backupDir}/${BACKUP_V2}`;

    // 检查v1和v2是否存在
    const v1Exists = await client.exists(v1Path);
    const v2Exists = await client.exists(v2Path);

    // 获取上次操作时间
    const lastOps = await StorageUtil.getLastOperationTime();

    return {
      v1Exists: v1Exists, // 最新备份是否存在
      v2Exists: v2Exists, // 历史备份是否存在
      lastBackup: lastOps.lastBackup, // 上次备份时间
      lastRestore: lastOps.lastRestore // 上次恢复时间
    };
  } catch (error) {
    // 配置不完整时返回默认状态
    return {
      v1Exists: false,
      v2Exists: false,
      lastBackup: null,
      lastRestore: null,
      error: error.message
    };
  }
}

/**
 * 消息监听器
 * 处理来自Popup的各种操作请求
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 根据消息类型分发到对应的处理函数
  switch (message.type) {
    case 'BACKUP':
      // 执行备份操作（加操作锁防止并发）
      if (isOperationRunning) {
        sendResponse({ success: false, error: '操作进行中，请稍后再试' });
        return false;
      }
      isOperationRunning = true;
      performBackup()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }))
        .finally(() => { isOperationRunning = false; });
      return true; // 保持消息通道开启，等待异步响应

    case 'RESTORE':
      // 执行恢复操作，传递版本选择参数（加操作锁防止并发）
      if (isOperationRunning) {
        sendResponse({ success: false, error: '操作进行中，请稍后再试' });
        return false;
      }
      isOperationRunning = true;
      performRestore(message.version || 'v1')
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }))
        .finally(() => { isOperationRunning = false; });
      return true;

    case 'TEST_CONNECTION':
      // 测试WebDAV连接
      testConnection()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_STATUS':
      // 获取备份状态
      getBackupStatus()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'BACKUP_NEWTAB':
      // 备份主页配置到WebDAV
      if (isOperationRunning) {
        sendResponse({ success: false, error: '操作进行中，请稍后再试' });
        return false;
      }
      isOperationRunning = true;
      performNewtabBackup()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }))
        .finally(() => { isOperationRunning = false; });
      return true;

    case 'RESTORE_NEWTAB':
      // 从WebDAV恢复主页配置
      if (isOperationRunning) {
        sendResponse({ success: false, error: '操作进行中，请稍后再试' });
        return false;
      }
      isOperationRunning = true;
      performNewtabRestore()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }))
        .finally(() => { isOperationRunning = false; });
      return true;

    default:
      // 未知消息类型
      sendResponse({ success: false, error: '未知的消息类型' });
      return false;
  }
});

/**
 * 执行主页配置备份到WebDAV（轮转槽位策略）
 * 流程与书签备份类似：
 * 1. 确保备份目录存在
 * 2. 如果v1存在，将v1移动到v2
 * 3. 将当前主页配置上传为v1
 * @returns {Promise<Object>} 备份结果
 */
async function performNewtabBackup() {
  // 创建WebDAV客户端
  const client = await createWebDAVClient();
  // 获取备份目录路径
  const config = await StorageUtil.getWebDAVConfig();
  const backupDir = config.backupDir;

  // 确保备份目录存在
  await client.createDirectory(backupDir, { recursive: true });

  // 构建v1和v2的完整路径
  const v1Path = `${backupDir}/${NEWTAB_V1}`;
  const v2Path = `${backupDir}/${NEWTAB_V2}`;

  // 轮转：如果v1已存在，移动到v2
  const v1Exists = await client.exists(v1Path);
  if (v1Exists) {
    await client.moveFile(v1Path, v2Path, { overwrite: true });
  }

  // 从chrome.storage读取主页配置
  const newtabConfig = await new Promise((resolve) => {
    chrome.storage.local.get('newtab_config', (result) => {
      resolve(result.newtab_config || {});
    });
  });

  // 构建备份数据（添加版本标识和时间戳）
  const backupData = JSON.stringify({
    version: '1.0',
    type: 'newtab_config', // 数据类型标识，便于恢复时区分
    timestamp: new Date().toISOString(),
    config: newtabConfig
  });

  // 根据加密配置决定是否加密
  const encryptionConfig = await StorageUtil.getEncryptionConfig();
  let finalData = backupData;
  let isEncrypted = false;

  if (encryptionConfig.enabled && encryptionConfig.password) {
    // 加密主页配置
    const encrypted = await CryptoUtil.encrypt(backupData, encryptionConfig.password);
    finalData = ENCRYPTION_PREFIX + encrypted;
    isEncrypted = true;
  }

  // 上传到WebDAV
  const contentType = isEncrypted ? 'application/octet-stream' : 'application/json';
  await client.putFileContents(v1Path, finalData, {
    overwrite: true,
    contentType: contentType
  });

  return {
    success: true,
    isEncrypted: isEncrypted,
    timestamp: new Date().toISOString()
  };
}

/**
 * 从WebDAV恢复主页配置
 * 流程：
 * 1. 从WebDAV下载最新配置备份
 * 2. 如果加密则解密
 * 3. 写入chrome.storage
 * @returns {Promise<Object>} 恢复结果
 */
async function performNewtabRestore() {
  // 创建WebDAV客户端
  const client = await createWebDAVClient();
  // 获取备份目录路径
  const config = await StorageUtil.getWebDAVConfig();
  const backupDir = config.backupDir;

  // 下载v1（最新配置）
  const v1Path = `${backupDir}/${NEWTAB_V1}`;
  const rawContent = await client.getFileContents(v1Path, { format: 'text' });

  // 判断是否需要解密
  let configData;
  if (rawContent.startsWith(ENCRYPTION_PREFIX)) {
    // 加密数据，需要解密
    const encryptedData = rawContent.slice(ENCRYPTION_PREFIX.length);
    const encryptionConfig = await StorageUtil.getEncryptionConfig();
    if (encryptionConfig.password) {
      try {
        configData = await CryptoUtil.decrypt(encryptedData, encryptionConfig.password);
      } catch (decryptError) {
        throw new Error('解密失败，请检查加密密码是否正确');
      }
    } else {
      throw new Error('主页配置已加密，请先在设置中配置加密密码');
    }
  } else {
    // 未加密，直接使用
    configData = rawContent;
  }

  // 解析配置数据
  let parsedData;
  try {
    parsedData = JSON.parse(configData);
  } catch (e) {
    throw new Error('主页配置数据格式无效，可能密码错误或文件已损坏');
  }

  // 校验数据类型
  if (parsedData.type !== 'newtab_config') {
    throw new Error('该备份文件不是主页配置，无法恢复');
  }

  // 写入chrome.storage
  const newtabConfig = parsedData.config || {};
  await new Promise((resolve) => {
    chrome.storage.local.set({ newtab_config: newtabConfig }, resolve);
  });

  return {
    success: true,
    timestamp: parsedData.timestamp
  };
}
