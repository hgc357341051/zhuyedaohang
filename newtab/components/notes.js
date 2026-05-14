/**
 * 备忘笔记组件（全屏编辑模式 + 分页 + 搜索）
 * 列表视图：分页显示笔记摘要卡片，支持搜索过滤
 * 编辑视图：点击笔记进入全屏编辑，支持多行长文本
 * 性能优化：每页只渲染固定条数，万级笔记也不卡顿
 */
class NotesComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   */
  constructor(config) {
    this.config = config;
    this.el = null;
    // 当前正在编辑的笔记索引（基于全量notes数组的索引），-1表示未编辑
    this.editingIndex = -1;
    // 自动保存的定时器
    this._autoSaveTimer = null;
    // 每页显示条数
    this._pageSize = 10;
    // 当前页码（从1开始）
    this._currentPage = 1;
    // 当前搜索关键词
    this._searchKeyword = '';
    // 搜索防抖定时器
    this._searchTimer = null;
  }

  /**
   * 渲染组件
   * @param {HTMLElement} container - 父容器
   */
  render(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'component-wrapper';
    wrapper.dataset.component = 'notes';

    const card = document.createElement('div');
    card.className = 'glass-card notes-component';

    // ====== 列表视图 ======
    const listView = document.createElement('div');
    listView.className = 'notes-list-view';

    // 列表头部
    const header = document.createElement('div');
    header.className = 'notes-header';

    const title = document.createElement('div');
    title.className = 'notes-title';
    title.textContent = '备忘笔记';

    const addBtn = document.createElement('button');
    addBtn.className = 'notes-add-btn';
    addBtn.textContent = '+ 新建';

    header.appendChild(title);
    header.appendChild(addBtn);

    // 搜索栏
    const searchBar = document.createElement('div');
    searchBar.className = 'notes-search-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'notes-search-input';
    searchInput.placeholder = '搜索笔记...';

    searchBar.appendChild(searchInput);

    // 笔记列表容器
    const list = document.createElement('div');
    list.className = 'notes-list';
    list.id = 'notes-list';

    // 分页控件
    const pagination = document.createElement('div');
    pagination.className = 'notes-pagination';

    listView.appendChild(header);
    listView.appendChild(searchBar);
    listView.appendChild(list);
    listView.appendChild(pagination);

    // ====== 全屏编辑视图 ======
    const editorView = document.createElement('div');
    editorView.className = 'notes-editor-view';

    // 编辑器头部
    const editorHeader = document.createElement('div');
    editorHeader.className = 'notes-editor-header';

    // 返回按钮
    const backBtn = document.createElement('button');
    backBtn.className = 'notes-back-btn';
    backBtn.innerHTML = '<span class="notes-back-icon">‹</span> 返回';

    // 编辑器操作区
    const editorActions = document.createElement('div');
    editorActions.className = 'notes-editor-actions';

    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'notes-editor-delete-btn';
    deleteBtn.textContent = '删除';

    editorActions.appendChild(deleteBtn);
    editorHeader.appendChild(backBtn);
    editorHeader.appendChild(editorActions);

    // 编辑器时间标签
    const editorTime = document.createElement('div');
    editorTime.className = 'notes-editor-time';

    // 编辑区域（使用textarea支持多行长文本）
    const textarea = document.createElement('textarea');
    textarea.className = 'notes-editor-textarea';
    textarea.placeholder = '输入笔记内容...';

    editorView.appendChild(editorHeader);
    editorView.appendChild(editorTime);
    editorView.appendChild(textarea);

    card.appendChild(listView);
    card.appendChild(editorView);
    wrapper.appendChild(card);
    container.appendChild(wrapper);

    // 保存DOM引用
    this.el = wrapper;
    this.listView = listView;
    this.editorView = editorView;
    this.list = list;
    this.pagination = pagination;
    this.searchInput = searchInput;
    this.addBtn = addBtn;
    this.backBtn = backBtn;
    this.deleteBtn = deleteBtn;
    this.textarea = textarea;
    this.editorTime = editorTime;

    // 渲染已有笔记列表
    this._renderNotes();
    // 绑定事件
    this._bindEvents();
  }

  /**
   * 获取经过搜索过滤后的笔记列表
   * 返回 { filtered: Array<{note, originalIndex}>, total: number }
   * @private
   */
  _getFilteredNotes() {
    const notes = this.config.notes || [];
    const keyword = this._searchKeyword.trim().toLowerCase();

    // 无搜索关键词时直接返回全量
    if (!keyword) {
      return {
        filtered: notes.map((note, i) => ({ note, originalIndex: i })),
        total: notes.length
      };
    }

    // 有关键词时过滤匹配项
    const filtered = [];
    notes.forEach((note, i) => {
      const text = (note.text || '').toLowerCase();
      if (text.includes(keyword)) {
        filtered.push({ note, originalIndex: i });
      }
    });

    return { filtered, total: filtered.length };
  }

  /**
   * 渲染笔记列表（带分页）
   * @private
   */
  _renderNotes() {
    this.list.innerHTML = '';
    this.pagination.innerHTML = '';

    const notes = this.config.notes || [];

    // 无笔记时显示空状态
    if (notes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty';
      empty.textContent = '暂无笔记，点击右上角新建';
      this.list.appendChild(empty);
      return;
    }

    const { filtered, total } = this._getFilteredNotes();

    // 搜索无结果
    if (total === 0) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty';
      empty.textContent = '没有匹配的笔记';
      this.list.appendChild(empty);
      return;
    }

    // 计算总页数
    const totalPages = Math.ceil(total / this._pageSize);
    // 确保当前页不超出范围
    if (this._currentPage > totalPages) this._currentPage = totalPages;
    if (this._currentPage < 1) this._currentPage = 1;

    // 计算当前页的起止索引
    const startIdx = (this._currentPage - 1) * this._pageSize;
    const endIdx = Math.min(startIdx + this._pageSize, total);

    // 使用DocumentFragment批量插入，减少DOM重排
    const fragment = document.createDocumentFragment();
    for (let i = startIdx; i < endIdx; i++) {
      const { note, originalIndex } = filtered[i];
      const item = this._createNoteCard(note, originalIndex);
      fragment.appendChild(item);
    }
    this.list.appendChild(fragment);

    // 渲染分页控件（只有1页时不显示）
    if (totalPages > 1) {
      this._renderPagination(totalPages, total);
    }
  }

  /**
   * 渲染分页控件
   * @param {number} totalPages - 总页数
   * @param {number} totalItems - 总条数
   * @private
   */
  _renderPagination(totalPages, totalItems) {
    this.pagination.innerHTML = '';

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'notes-page-btn';
    prevBtn.textContent = '‹';
    prevBtn.disabled = this._currentPage <= 1;
    prevBtn.addEventListener('click', () => {
      if (this._currentPage > 1) {
        this._currentPage--;
        this._renderNotes();
        // 滚动回列表顶部
        this.list.scrollTop = 0;
      }
    });

    // 页码信息
    const pageInfo = document.createElement('span');
    pageInfo.className = 'notes-page-info';
    pageInfo.textContent = `${this._currentPage}/${totalPages}`;

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.className = 'notes-page-btn';
    nextBtn.textContent = '›';
    nextBtn.disabled = this._currentPage >= totalPages;
    nextBtn.addEventListener('click', () => {
      if (this._currentPage < totalPages) {
        this._currentPage++;
        this._renderNotes();
        this.list.scrollTop = 0;
      }
    });

    // 总条数标签
    const totalLabel = document.createElement('span');
    totalLabel.className = 'notes-page-total';
    totalLabel.textContent = `共${totalItems}条`;

    this.pagination.appendChild(prevBtn);
    this.pagination.appendChild(pageInfo);
    this.pagination.appendChild(nextBtn);
    this.pagination.appendChild(totalLabel);
  }

  /**
   * 创建笔记摘要卡片
   * @param {Object} note - 笔记数据 {id, text, createdAt, updatedAt}
   * @param {number} originalIndex - 在全量notes数组中的原始索引
   * @returns {HTMLElement} 卡片DOM元素
   * @private
   */
  _createNoteCard(note, originalIndex) {
    const item = document.createElement('div');
    item.className = 'note-card';

    // 笔记摘要区域
    const previewEl = document.createElement('div');
    previewEl.className = 'note-card-preview';

    // 提取第一行作为标题
    const firstLine = (note.text || '').split('\n')[0].trim();
    if (firstLine) {
      // 标题行
      const titleEl = document.createElement('div');
      titleEl.className = 'note-card-title';
      titleEl.textContent = firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine;
      previewEl.appendChild(titleEl);

      // 如果有更多内容，显示第二行摘要
      const lines = (note.text || '').split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        const summaryEl = document.createElement('div');
        summaryEl.className = 'note-card-summary';
        const secondLine = lines.slice(1).join(' ').trim();
        summaryEl.textContent = secondLine.length > 50 ? secondLine.slice(0, 50) + '…' : secondLine;
        previewEl.appendChild(summaryEl);
      }
    } else {
      // 空笔记
      const emptyEl = document.createElement('div');
      emptyEl.className = 'note-card-title note-card-empty';
      emptyEl.textContent = '新笔记';
      previewEl.appendChild(emptyEl);
    }

    // 底部信息栏：时间 + 字数
    const metaEl = document.createElement('div');
    metaEl.className = 'note-card-meta';

    const timeEl = document.createElement('span');
    timeEl.className = 'note-card-time';
    timeEl.textContent = this._formatTime(note.updatedAt || note.createdAt);

    const countEl = document.createElement('span');
    countEl.className = 'note-card-count';
    const charCount = (note.text || '').length;
    countEl.textContent = charCount > 0 ? `${charCount}字` : '';

    metaEl.appendChild(timeEl);
    if (charCount > 0) metaEl.appendChild(countEl);

    item.appendChild(previewEl);
    item.appendChild(metaEl);

    // 点击进入全屏编辑（使用原始索引）
    item.addEventListener('click', () => this._openEditor(originalIndex));

    return item;
  }

  /**
   * 打开全屏编辑器
   * @param {number} index - 笔记在全量notes数组中的索引
   * @private
   */
  _openEditor(index) {
    const notes = this.config.notes || [];
    if (!notes[index]) return;

    this.editingIndex = index;
    const note = notes[index];

    // 填充编辑器内容
    this.textarea.value = note.text || '';
    // 更新时间标签
    this.editorTime.textContent = this._formatTimeFull(note.updatedAt || note.createdAt);

    // 切换视图：隐藏列表，显示编辑器
    this.listView.classList.add('hidden');
    this.editorView.classList.add('active');

    // 自动聚焦输入框
    setTimeout(() => this.textarea.focus(), 100);
  }

  /**
   * 关闭编辑器，返回列表视图
   * @private
   */
  _closeEditor() {
    // 保存当前编辑内容
    this._saveCurrentNote();

    // 切换视图：显示列表，隐藏编辑器
    this.listView.classList.remove('hidden');
    this.editorView.classList.remove('active');

    this.editingIndex = -1;

    // 刷新列表
    this._renderNotes();
  }

  /**
   * 保存当前正在编辑的笔记
   * @private
   */
  _saveCurrentNote() {
    if (this.editingIndex < 0) return;
    const notes = this.config.notes || [];
    if (!notes[this.editingIndex]) return;

    const newText = this.textarea.value;
    const oldText = notes[this.editingIndex].text || '';

    // 内容有变化才保存
    if (newText !== oldText) {
      notes[this.editingIndex].text = newText;
      notes[this.editingIndex].updatedAt = new Date().toISOString();
      this._saveConfig();
    }
  }

  /**
   * 添加新笔记并直接进入编辑器
   * @private
   */
  _addNote() {
    if (!this.config.notes) this.config.notes = [];
    const now = new Date().toISOString();
    // 创建空笔记并插入到最前面
    this.config.notes.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: '',
      createdAt: now,
      updatedAt: now
    });
    this._saveConfig();
    // 清空搜索，重置到第一页
    this._searchKeyword = '';
    this._currentPage = 1;
    if (this.searchInput) this.searchInput.value = '';
    // 直接进入编辑器
    this._openEditor(0);
  }

  /**
   * 删除当前正在编辑的笔记
   * @private
   */
  _deleteCurrentNote() {
    if (this.editingIndex < 0) return;
    const notes = this.config.notes || [];
    if (!notes[this.editingIndex]) return;

    // 使用自定义确认弹窗（showConfirm返回Promise）
    if (window.NewTabApp && window.NewTabApp.showConfirm) {
      window.NewTabApp.showConfirm('确定删除这条笔记吗？', {
        title: '删除笔记',
        confirmText: '删除',
        type: 'danger'
      }).then((confirmed) => {
        if (confirmed) {
          this._doDeleteNote();
        }
      });
    } else {
      this._doDeleteNote();
    }
  }

  /**
   * 执行删除笔记操作
   * @private
   */
  _doDeleteNote() {
    const notes = this.config.notes || [];
    notes.splice(this.editingIndex, 1);
    this.editingIndex = -1;
    this._saveConfig();
    // 返回列表
    this.listView.classList.remove('hidden');
    this.editorView.classList.remove('active');
    this._renderNotes();
  }

  /**
   * 格式化时间（简短格式，用于列表卡片）
   * @param {string} isoStr - ISO时间字符串
   * @returns {string} 格式化后的时间
   * @private
   */
  _formatTime(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    // 1分钟内
    if (diffMin < 1) return '刚刚';
    // 1小时内
    if (diffMin < 60) return `${diffMin}分钟前`;
    // 今天
    if (date.toDateString() === now.toDateString()) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    // 昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    }
    // 今年
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
    // 更早
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  /**
   * 格式化时间（完整格式，用于编辑器头部）
   * @param {string} isoStr - ISO时间字符串
   * @returns {string} 完整格式化时间
   * @private
   */
  _formatTimeFull(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
  }

  /**
   * 保存配置到存储
   * @private
   */
  _saveConfig() {
    if (window.NewTabApp) {
      window.NewTabApp.saveConfig();
    }
  }

  /**
   * 启动自动保存定时器
   * 编辑时每2秒自动保存一次
   * @private
   */
  _startAutoSave() {
    this._stopAutoSave();
    this._autoSaveTimer = setInterval(() => {
      this._saveCurrentNote();
    }, 2000);
  }

  /**
   * 停止自动保存定时器
   * @private
   */
  _stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  /**
   * 处理搜索输入（带防抖）
   * @private
   */
  _handleSearch() {
    // 清除上一次的防抖定时器
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
    }
    // 300ms防抖，避免频繁渲染
    this._searchTimer = setTimeout(() => {
      this._searchKeyword = this.searchInput.value;
      // 搜索时重置到第一页
      this._currentPage = 1;
      this._renderNotes();
    }, 300);
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 新建按钮
    this.addBtn.addEventListener('click', () => this._addNote());

    // 返回按钮
    this.backBtn.addEventListener('click', () => this._closeEditor());

    // 删除按钮
    this.deleteBtn.addEventListener('click', () => this._deleteCurrentNote());

    // 编辑器输入事件：启动自动保存
    this.textarea.addEventListener('input', () => {
      this._startAutoSave();
    });

    // 编辑器失焦时立即保存
    this.textarea.addEventListener('blur', () => {
      this._stopAutoSave();
      this._saveCurrentNote();
    });

    // 搜索输入事件（带防抖）
    this.searchInput.addEventListener('input', () => {
      this._handleSearch();
    });
  }

  /**
   * 销毁组件
   */
  destroy() {
    this._stopAutoSave();
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
