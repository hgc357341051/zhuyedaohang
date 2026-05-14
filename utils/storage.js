/**
 * 配置存储工具
 * 封装浏览器扩展存储API，提供配置的读写操作
 * 兼容Chrome（chrome.storage）和Firefox（browser.storage）
 */

// 统一获取storage API入口，兼容Chrome和Firefox
const storageApi = typeof browser !== 'undefined' ? browser.storage : chrome.storage;

const StorageUtil = {

  // 存储键名常量，避免硬编码
  KEYS: {
    WEBDAV_URL: 'webdav_url', // WebDAV服务器地址
    WEBDAV_USERNAME: 'webdav_username', // WebDAV用户名
    WEBDAV_PASSWORD: 'webdav_password', // WebDAV密码
    ENCRYPTION_ENABLED: 'encryption_enabled', // 是否启用加密
    ENCRYPTION_PASSWORD: 'encryption_password', // 加密密码
    BACKUP_DIR: 'backup_dir', // WebDAV上的备份目录路径
    LAST_BACKUP_TIME: 'last_backup_time', // 上次备份时间
    LAST_RESTORE_TIME: 'last_restore_time' // 上次恢复时间
  },

  // 默认备份目录名
  DEFAULT_BACKUP_DIR: '/bookmark-backup',

  /**
   * 获取所有WebDAV配置
   * @returns {Promise<Object>} WebDAV配置对象
   */
  async getWebDAVConfig() {
    const keys = [
      this.KEYS.WEBDAV_URL,
      this.KEYS.WEBDAV_USERNAME,
      this.KEYS.WEBDAV_PASSWORD,
      this.KEYS.BACKUP_DIR
    ];
    const result = await storageApi.local.get(keys);
    return {
      url: result[this.KEYS.WEBDAV_URL] || '',
      username: result[this.KEYS.WEBDAV_USERNAME] || '',
      password: result[this.KEYS.WEBDAV_PASSWORD] || '',
      backupDir: result[this.KEYS.BACKUP_DIR] || this.DEFAULT_BACKUP_DIR
    };
  },

  /**
   * 保存WebDAV配置
   * @param {Object} config - WebDAV配置对象
   */
  async saveWebDAVConfig(config) {
    await storageApi.local.set({
      [this.KEYS.WEBDAV_URL]: config.url || '',
      [this.KEYS.WEBDAV_USERNAME]: config.username || '',
      [this.KEYS.WEBDAV_PASSWORD]: config.password || '',
      [this.KEYS.BACKUP_DIR]: config.backupDir || this.DEFAULT_BACKUP_DIR
    });
  },

  /**
   * 获取加密配置
   * @returns {Promise<Object>} 加密配置对象
   */
  async getEncryptionConfig() {
    const keys = [
      this.KEYS.ENCRYPTION_ENABLED,
      this.KEYS.ENCRYPTION_PASSWORD
    ];
    const result = await storageApi.local.get(keys);
    return {
      enabled: result[this.KEYS.ENCRYPTION_ENABLED] || false,
      password: result[this.KEYS.ENCRYPTION_PASSWORD] || ''
    };
  },

  /**
   * 保存加密配置
   * @param {Object} config - 加密配置对象
   */
  async saveEncryptionConfig(config) {
    await storageApi.local.set({
      [this.KEYS.ENCRYPTION_ENABLED]: config.enabled || false,
      [this.KEYS.ENCRYPTION_PASSWORD]: config.password || ''
    });
  },

  /**
   * 更新上次备份时间
   */
  async updateLastBackupTime() {
    await storageApi.local.set({
      [this.KEYS.LAST_BACKUP_TIME]: new Date().toISOString()
    });
  },

  /**
   * 更新上次恢复时间
   */
  async updateLastRestoreTime() {
    await storageApi.local.set({
      [this.KEYS.LAST_RESTORE_TIME]: new Date().toISOString()
    });
  },

  /**
   * 获取上次操作时间信息
   * @returns {Promise<Object>} 包含上次备份和恢复时间的对象
   */
  async getLastOperationTime() {
    const keys = [
      this.KEYS.LAST_BACKUP_TIME,
      this.KEYS.LAST_RESTORE_TIME
    ];
    const result = await storageApi.local.get(keys);
    return {
      lastBackup: result[this.KEYS.LAST_BACKUP_TIME] || null,
      lastRestore: result[this.KEYS.LAST_RESTORE_TIME] || null
    };
  },

  /**
   * 检查WebDAV配置是否完整（必填项都已填写）
   * @returns {Promise<boolean>} 配置是否完整
   */
  async isWebDAVConfigured() {
    const config = await this.getWebDAVConfig();
    // URL和用户名密码都是必填项
    return !!(config.url && config.username && config.password);
  },

  /**
   * 清除所有配置（重置插件）
   */
  async clearAll() {
    await storageApi.local.clear();
  }
};

// 导出给其他模块使用
if (typeof globalThis !== 'undefined') {
  globalThis.StorageUtil = StorageUtil;
}
