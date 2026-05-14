/**
 * AES-256-GCM 加密工具
 * 使用浏览器原生 Web Crypto API 实现
 * 密钥派生：PBKDF2（用户密码 + 随机Salt，100000次迭代）
 * 加密模式：AES-GCM（认证加密，防篡改）
 * 存储格式：Base64(salt[16字节] + iv[12字节] + 密文+认证标签)
 */
const CryptoUtil = {

  // PBKDF2迭代次数，100000次是当前推荐的安全下限
  PBKDF2_ITERATIONS: 100000,
  // Salt长度（16字节 = 128位）
  SALT_LENGTH: 16,
  // AES-GCM的IV长度（12字节 = 96位，NIST推荐）
  IV_LENGTH: 12,
  // AES密钥长度（256位）
  KEY_LENGTH: 256,

  /**
   * 从用户密码派生AES密钥
   * @param {string} password - 用户输入的密码
   * @param {Uint8Array} salt - 随机盐值
   * @returns {Promise<CryptoKey>} 派生出的AES-GCM密钥
   */
  async deriveKey(password, salt) {
    // 将密码字符串编码为UTF-8字节数组，作为PBKDF2的输入
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // 导入密码为原始密钥素材
    const keyMaterial = await crypto.subtle.importKey(
      'raw', // 密码以原始字节形式导入
      passwordBuffer,
      'PBKDF2', // 使用PBKDF2算法
      false, // 密钥素材不可导出
      ['deriveKey'] // 仅用于派生密钥
    );

    // 使用PBKDF2从密码+盐派生AES-GCM密钥
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt, // 随机盐值，防止彩虹表攻击
        iterations: this.PBKDF2_ITERATIONS, // 迭代次数，增加暴力破解成本
        hash: 'SHA-256' // 使用的哈希算法
      },
      keyMaterial,
      {
        name: 'AES-GCM', // 派生出的密钥用于AES-GCM
        length: this.KEY_LENGTH // 256位密钥
      },
      false, // 派生密钥不可导出
      ['encrypt', 'decrypt'] // 密钥用途：加密和解密
    );

    return key;
  },

  /**
   * 加密数据
   * @param {string} plaintext - 明文字符串
   * @param {string} password - 加密密码
   * @returns {Promise<string>} Base64编码的密文（salt+iv+密文+认证标签）
   */
  async encrypt(plaintext, password) {
    // 生成随机盐值，每次加密使用不同的盐
    const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
    // 生成随机IV（初始化向量），GCM模式下IV不能重复
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    // 从密码和盐派生AES密钥
    const key = await this.deriveKey(password, salt);

    // 将明文编码为UTF-8字节数组
    const encoder = new TextEncoder();
    const plaintextBuffer = encoder.encode(plaintext);

    // 使用AES-GCM加密，GCM模式自带认证标签
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv // GCM要求IV唯一但不要求保密
      },
      key,
      plaintextBuffer
    );

    // 将salt + iv + 密文(含认证标签)拼接为一个完整的数据包
    // 认证标签由GCM模式自动附加在密文末尾（16字节）
    const result = new Uint8Array(
      salt.length + iv.length + ciphertext.byteLength
    );
    result.set(salt, 0); // 前16字节：salt
    result.set(iv, salt.length); // 中间12字节：iv
    result.set(new Uint8Array(ciphertext), salt.length + iv.length); // 剩余：密文+认证标签

    // 将二进制数据转为Base64字符串，便于文本传输和存储
    return this.arrayBufferToBase64(result);
  },

  /**
   * 解密数据
   * @param {string} encryptedBase64 - Base64编码的密文
   * @param {string} password - 解密密码
   * @returns {Promise<string>} 解密后的明文字符串
   */
  async decrypt(encryptedBase64, password) {
    // 将Base64字符串解码为二进制数据
    const encryptedData = this.base64ToArrayBuffer(encryptedBase64);

    // 从密文中提取salt（前16字节）
    const salt = encryptedData.slice(0, this.SALT_LENGTH);
    // 从密文中提取iv（第17-28字节）
    const iv = encryptedData.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
    // 从密文中提取密文+认证标签（第29字节到末尾）
    const ciphertext = encryptedData.slice(this.SALT_LENGTH + this.IV_LENGTH);

    // 使用相同的密码和salt重新派生密钥
    const key = await this.deriveKey(password, salt);

    // 使用AES-GCM解密，GCM会自动验证认证标签
    // 如果密码错误或数据被篡改，会抛出异常
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertext
    );

    // 将解密后的字节流解码为UTF-8字符串
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  },

  /**
   * Uint8Array转Base64字符串
   * @param {Uint8Array} buffer - 二进制数据
   * @returns {string} Base64编码字符串
   */
  arrayBufferToBase64(buffer) {
    // 将每个字节转为字符，然后用btoa编码为Base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  /**
   * Base64字符串转Uint8Array
   * @param {string} base64 - Base64编码字符串
   * @returns {Uint8Array} 二进制数据
   */
  base64ToArrayBuffer(base64) {
    // 先用atob解码Base64为二进制字符串
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
};

// 导出给其他模块使用
if (typeof globalThis !== 'undefined') {
  globalThis.CryptoUtil = CryptoUtil;
}
