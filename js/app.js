/**
 * Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật
 * Main Application Controller & UI State Manager
 */

const LegalApp = {
  state: {
    activeCategoryId: null,
    activeDocId: null,
    activeTab: 'documents', // 'documents' | 'search' | 'bookmarks' | 'recent'
    statusFilter: 'all',
    docTypeFilter: 'all',
    searchQuery: '',
    fontSize: 16,
    isDarkMode: true,
    isChatOpen: false,
    selectedNodeTarget: null,
    recentDocIds: []
  },

  async init() {
    try {
      this.initTheme();

      // Tự động đếm và cập nhật số lượng văn bản nguồn thực tế lên nút bấm
      if (window.PRELOADED_DATA && Array.isArray(window.PRELOADED_DATA)) {
        const total = window.PRELOADED_DATA.length;
        const btnText = document.getElementById('btn-reload-data-text');
        if (btnText) btnText.textContent = `Kho DATA gốc (${total} VB)`;
        
        const modalTitle = document.getElementById('modal-data-count-title');
        if (modalTitle) modalTitle.textContent = `Kho dữ liệu ${total} văn bản nguồn (DATA)`;
      }

      if (typeof LegalDB !== 'undefined') await LegalDB.initDB();
      if (typeof LegalSearch !== 'undefined') await LegalSearch.buildIndex();
      if (typeof LegalAI !== 'undefined') LegalAI.init();

      try {
        const recent = localStorage.getItem('legal_recent_docs');
        if (recent) this.state.recentDocIds = JSON.parse(recent);
      } catch (e) {}

      await this.renderCategories();
      await this.renderDocumentList();

      if (typeof LegalDB !== 'undefined') {
        const docs = await LegalDB.getDocuments();
        if (docs && docs.length > 0) {
          await this.openDocument(docs[0].id);
        }
      }

      this.setupEventListeners();
      this.refreshIcons();
    } catch (err) {
      console.warn("Init warning:", err);
    }
  },

  refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  initTheme() {
    const savedTheme = localStorage.getItem('legal_theme');
    if (savedTheme === 'light') {
      this.state.isDarkMode = false;
      document.documentElement.classList.remove('dark');
    } else {
      this.state.isDarkMode = true;
      document.documentElement.classList.add('dark');
    }

    const savedFontSize = localStorage.getItem('legal_font_size');
    if (savedFontSize) {
      this.state.fontSize = parseInt(savedFontSize, 10);
      document.documentElement.style.setProperty('--doc-font-size', `${this.state.fontSize}px`);
    }
  },

  toggleTheme() {
    this.state.isDarkMode = !this.state.isDarkMode;
    if (this.state.isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('legal_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('legal_theme', 'light');
    }
    this.refreshIcons();
  },

  adjustFontSize(delta) {
    this.state.fontSize = Math.min(24, Math.max(13, this.state.fontSize + delta));
    document.documentElement.style.setProperty('--doc-font-size', `${this.state.fontSize}px`);
    const contentEl = document.getElementById('document-content-area');
    if (contentEl) {
      contentEl.style.fontSize = `${this.state.fontSize}px`;
    }
    localStorage.setItem('legal_font_size', this.state.fontSize);
  },

  /**
   * Render Column 1: Category Sidebar
   */
  async renderCategories() {
    const catListEl = document.getElementById('category-list');
    if (!catListEl || typeof LegalDB === 'undefined') return;

    const categories = await LegalDB.getCategoriesWithCounts();
    
    // Đếm chính xác số lượng văn bản duy nhất trong CSDL (tránh đếm trùng các văn bản đa danh mục)
    let totalDocs = 0;
    try {
      totalDocs = await LegalDB.db.documents.count();
    } catch (e) {
      totalDocs = categories.reduce((sum, c) => sum + (c.count || 0), 0);
    }

    let html = `
      <button onclick="LegalApp.selectCategory(null)" 
        class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${this.state.activeCategoryId === null ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}">
        <div class="flex items-center gap-2.5 truncate">
          <i data-lucide="layers" class="w-4 h-4 shrink-0"></i>
          <span class="truncate">Tất cả văn bản</span>
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full ${this.state.activeCategoryId === null ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}">${totalDocs}</span>
      </button>
    `;

    categories.forEach(cat => {
      const isSelected = this.state.activeCategoryId === cat.id;
      html += `
        <button onclick="LegalApp.selectCategory(${cat.id})" 
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isSelected ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}">
          <div class="flex items-center gap-2.5 truncate">
            <i data-lucide="${cat.icon || 'folder'}" class="w-4 h-4 shrink-0"></i>
            <span class="truncate">${cat.name}</span>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}">${cat.count || 0}</span>
        </button>
      `;
    });

    catListEl.innerHTML = html;
    this.refreshIcons();
  },

  async selectCategory(categoryId) {
    this.state.activeCategoryId = categoryId;
    await this.renderCategories();
    await this.renderDocumentList();
  },

  setActiveTab(tabName) {
    this.state.activeTab = tabName;

    ['documents', 'search', 'bookmarks', 'recent'].forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      if (btn) {
        if (t === tabName) {
          btn.className = 'flex-1 py-2.5 text-center border-b-2 border-amber-500 text-amber-500 font-semibold flex items-center justify-center gap-1';
        } else {
          btn.className = 'flex-1 py-2.5 text-center text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1';
        }
      }
    });

    if (tabName === 'search') {
      const input = document.getElementById('sidebar-search-input');
      if (input) input.focus();
    }

    this.renderDocumentList();
  },

  /**
   * Render Column 2: Document List
   */
  async renderDocumentList() {
    const listEl = document.getElementById('document-list');
    if (!listEl || typeof LegalDB === 'undefined') return;

    let docs = [];

    if (this.state.activeTab === 'bookmarks') {
      const bookmarked = await LegalDB.db.notes_bookmarks.where('type').equals('bookmark').toArray();
      const docIds = [...new Set(bookmarked.map(b => b.docId))];
      docs = await LegalDB.db.documents.where('id').anyOf(docIds).toArray();
    } else if (this.state.activeTab === 'recent') {
      const recentIds = (this.state.recentDocIds || []).map(id => isNaN(Number(id)) ? id : Number(id));
      docs = await LegalDB.db.documents.where('id').anyOf(recentIds).toArray();
    } else {
      docs = await LegalDB.getDocuments({
        categoryId: this.state.activeCategoryId,
        status: this.state.statusFilter,
        docType: this.state.docTypeFilter,
        search: this.state.searchQuery
      });
    }

    const countBadge = document.getElementById('doc-count-badge');
    if (countBadge) countBadge.textContent = `${docs.length} văn bản`;

    if (docs.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center text-gray-400 dark:text-gray-500 flex flex-col items-center justify-center">
          <i data-lucide="file-x" class="w-10 h-10 mb-2 opacity-50"></i>
          <p class="text-sm font-medium">Không tìm thấy văn bản nào</p>
          <p class="text-xs mt-1 text-gray-400">Hãy thử đổi bộ lọc hoặc bấm "Kho DATA"</p>
        </div>
      `;
      this.refreshIcons();
      return;
    }

    let html = '';
    for (const doc of docs) {
      const isSelected = String(this.state.activeDocId) === String(doc.id);
      const isExpired = doc.status === 'expired';

      let statusTag = '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800">Còn hiệu lực</span>';
      if (doc.status === 'amended') {
        statusTag = '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950/70 text-amber-300 border border-amber-800">Có SĐ/BS</span>';
      } else if (isExpired) {
        statusTag = '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/70 text-rose-300 border border-rose-800">Hết hiệu lực</span>';
      }

      html += `
        <div class="border-b border-gray-800/80 last:border-0 transition-colors ${isSelected ? 'bg-gray-900/90 border-l-2 border-l-amber-500 shadow-sm' : 'hover:bg-gray-900/40'}">
          <div onclick="LegalApp.openDocument('${doc.id}')" class="p-3 cursor-pointer">
            <div class="flex items-center justify-between gap-2 mb-1">
              <div class="flex items-center gap-1.5">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-900/50 text-blue-300 border border-blue-700/50 font-mono tracking-wider">${doc.docType || 'VB'}</span>
                <span class="font-bold text-xs font-mono tracking-wide text-gray-200 ${isExpired ? 'line-through opacity-60' : ''}">${doc.code}</span>
              </div>
              ${statusTag}
            </div>
            <h4 class="text-xs font-semibold text-gray-300 line-clamp-2 leading-snug mb-1">${doc.title}</h4>
            <div class="flex items-center gap-3 text-[10.5px] text-gray-500">
              <span class="flex items-center gap-1"><i data-lucide="building-2" class="w-3 h-3"></i> ${doc.issuer || 'Ban hành'}</span>
              <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> ${doc.issueDate ? new Date(doc.issueDate).getFullYear() : '—'}</span>
            </div>
          </div>
          ${isSelected ? `<div id="doc-toc-${doc.id}" class="px-3 pb-3 pt-1 border-t border-gray-800/80 bg-black/40"></div>` : ''}
        </div>
      `;
    }

    listEl.innerHTML = html;
    this.refreshIcons();

    if (this.state.activeDocId) {
      this.renderTOC(this.state.activeDocId);
    }
  },

  /**
   * Render Table of Contents (TOC)
   */
  async renderTOC(docId) {
    const tocContainer = document.getElementById(`doc-toc-${docId}`);
    if (!tocContainer || typeof LegalDB === 'undefined') return;

    let nodes = await LegalDB.db.document_nodes.where('docId').equals(docId).sortBy('order');
    if ((!nodes || nodes.length === 0) && !isNaN(Number(docId))) {
      nodes = await LegalDB.db.document_nodes.where('docId').equals(Number(docId)).sortBy('order');
    }

    if (!nodes || nodes.length === 0) {
      tocContainer.innerHTML = '<p class="text-[11px] text-gray-400 italic py-1">Chưa có mục lục chi tiết</p>';
      return;
    }

    let tocHtml = '<div class="space-y-1 max-h-64 overflow-y-auto pr-1 text-xs toc-tree">';
    nodes.forEach(node => {
      const displayRef = (node.fullRef || '').endsWith('.') ? node.fullRef : `${node.fullRef}.`;

      if (node.nodeType === 'chapter') {
        tocHtml += `
          <button onclick="LegalApp.scrollToNode('${node.fullRef}')" 
            class="w-full text-left font-bold text-[11px] text-amber-400 hover:text-amber-300 pt-2 pb-1 truncate flex items-center gap-1.5 uppercase tracking-wide">
            <i data-lucide="bookmark" class="w-3 h-3 text-amber-400 shrink-0"></i>
            <span class="truncate">${node.fullRef}: ${node.title}</span>
          </button>
        `;
      } else if (node.nodeType === 'article') {
        tocHtml += `
          <button onclick="LegalApp.scrollToNode('${node.fullRef}')" 
            class="w-full text-left text-amber-200/80 hover:text-amber-300 hover:bg-amber-500/10 px-2 py-1 rounded truncate flex items-center gap-1.5 text-[11.5px] transition">
            <span class="font-bold text-amber-400 shrink-0">${displayRef}</span>
            <span class="truncate text-gray-300">${node.title}</span>
          </button>
        `;
      }
    });

    tocHtml += '</div>';
    tocContainer.innerHTML = tocHtml;
    this.refreshIcons();
  },

  /**
   * Column 3: Open and Render Main Document Viewport
   */
  async openDocument(docId) {
    if (docId === null || docId === undefined) return;
    this.state.activeDocId = docId;

    this.state.recentDocIds = [docId, ...this.state.recentDocIds.filter(id => String(id) !== String(docId))].slice(0, 20);
    localStorage.setItem('legal_recent_docs', JSON.stringify(this.state.recentDocIds));

    await this.renderDocumentList();

    const contentArea = document.getElementById('document-viewport');
    if (!contentArea) return;

    let rawDoc = null;
    if (typeof LegalDB !== 'undefined' && LegalDB.db) {
      if (!isNaN(Number(docId))) {
        rawDoc = await LegalDB.db.documents.get(Number(docId));
      }
      if (!rawDoc) {
        rawDoc = await LegalDB.db.documents.get(String(docId));
      }
    }

    if (!rawDoc) {
      contentArea.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
          <i data-lucide="file-question" class="w-16 h-16 mb-4 opacity-40"></i>
          <h3 class="text-lg font-semibold">Không tìm thấy tài liệu (ID: ${docId})</h3>
        </div>
      `;
      this.refreshIcons();
      return;
    }

    let nodesList = [];
    if (typeof LegalDB !== 'undefined' && LegalDB.db.document_nodes) {
      nodesList = await LegalDB.db.document_nodes.where('docId').equals(rawDoc.id).sortBy('order');
      if (!nodesList || nodesList.length === 0) {
        nodesList = await LegalDB.db.document_nodes.where('docId').equals(String(rawDoc.id)).sortBy('order');
      }
    }

    let docNotes = [];
    try {
      if (LegalDB.db.notes_bookmarks) {
        docNotes = await LegalDB.db.notes_bookmarks.where('docId').equals(rawDoc.id).toArray();
      }
    } catch (e) {}

    const isBookmarked = docNotes.some(n => n.type === 'bookmark' && (!n.nodeNum || n.nodeNum === ''));
    const mainNote = docNotes.find(n => n.type === 'note' && (n.nodeNum === 'main' || n.nodeNum === '0' || !n.nodeNum));
    const mainNoteContent = mainNote ? mainNote.content : '';

    let topBarHtml = `
      <div class="bg-gray-900 border-b border-gray-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 shadow-md">
        <div class="flex items-center gap-2.5 truncate max-w-[70%]">
          <button onclick="LegalApp.scrollToNode('Căn cứ')" class="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 flex items-center gap-1.5 font-semibold shrink-0">
            <i data-lucide="book-open" class="w-3.5 h-3.5 text-amber-400"></i> Mục lục
          </button>
          <span class="text-xs font-bold text-amber-400 font-mono tracking-wide truncate">
            ${(rawDoc.docType || '').toUpperCase()} ${rawDoc.code} — ${rawDoc.title}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="LegalApp.toggleNoteBox('main')" class="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition" title="Viết ghi chú riêng">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="LegalApp.toggleDocBookmark('${rawDoc.id}')" class="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition" title="Đánh dấu văn bản">
            <i data-lucide="bookmark" class="w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}"></i>
          </button>
          <button onclick="LegalApp.askAIAboutDoc('${rawDoc.code}')" class="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-sm transition">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Hỏi AI
          </button>
          <button onclick="window.print()" class="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs font-medium flex items-center gap-1 transition">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i> Bản in
          </button>
        </div>
      </div>
    `;

    let summaryHtml = `
      <div class="px-8 pt-6 pb-4 max-w-5xl mx-auto">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-300 bg-gray-900/60 p-3 rounded-lg border border-gray-800/80">
          <div><span class="font-semibold block text-gray-500">Cơ quan ban hành:</span> ${rawDoc.issuer || 'Đang cập nhật'}</div>
          <div><span class="font-semibold block text-gray-500">Ngày ban hành:</span> ${rawDoc.issueDate || '—'}</div>
          <div><span class="font-semibold block text-gray-500">Ngày hiệu lực:</span> ${rawDoc.effectiveDate || '—'}</div>
          <div><span class="font-semibold block text-gray-500">Quy mô:</span> ${nodesList.filter(n => n.nodeType === 'article').length || nodesList.length} Điều / Mục</div>
        </div>
      </div>
    `;

    let nodesHtml = '<div class="px-8 pb-16 space-y-6 max-w-5xl mx-auto legal-content" id="document-content-area" style="font-size: ' + this.state.fontSize + 'px;">';

    nodesHtml += `
      <div class="note-box-dashed">
        <div class="note-box-title" onclick="LegalApp.toggleNoteBox('main')">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          <span>GHI CHÚ RIÊNG (BẤM ĐỂ VIẾT)</span>
        </div>
        <div id="note-box-main" class="note-box-content ${mainNoteContent ? '' : 'hidden'}">
          <textarea 
            oninput="LegalApp.handleNoteChange('${rawDoc.id}', 'main', this.value)" 
            class="note-textarea w-full p-2 bg-transparent text-amber-100 text-xs focus:outline-none placeholder-amber-700" 
            rows="2" 
            placeholder="Ghi chú nghiệp vụ, rủi ro...">${mainNoteContent}</textarea>
        </div>
      </div>
    `;

    if (nodesList.length > 0) {
      for (const node of nodesList) {
        const cleanNodeNum = (node.num || '').replace(/[^0-9]/g, '');
        const nodeRefId = `node-${cleanNodeNum || (node.fullRef || 'ref').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')}`;

        if (node.nodeType === 'chapter' || node.nodeType === 'section') {
          nodesHtml += `
            <div id="${nodeRefId}" class="pt-6 pb-2 border-b border-amber-500/20 text-center">
              <h3 class="text-xs font-extrabold text-amber-400 uppercase tracking-wider">${node.fullRef}</h3>
              <h2 class="text-base font-bold text-white mt-1 uppercase">${node.title}</h2>
            </div>
          `;
        } else {
          const articleNote = docNotes.find(n => n.type === 'note' && n.nodeNum === node.num);
          const noteContent = articleNote ? articleNote.content : '';

          // Khôi phục bộ phân tích liên kết pháp lý thông minh
          let contentHtml = '';
          if (typeof LegalParser !== 'undefined' && typeof LegalParser.autoLinkLegalText === 'function') {
            contentHtml = LegalParser.autoLinkLegalText(node.content || '', rawDoc.code);
          } else {
            contentHtml = (node.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }

          const displayRef = (node.fullRef || '').endsWith('.') ? node.fullRef : `${node.fullRef}.`;

          nodesHtml += `
            <div id="${nodeRefId}" data-article-num="${cleanNodeNum}" class="article-node py-1 relative transition-colors duration-200">
              <div class="text-[15px] font-bold text-amber-400 mt-6 mb-2 flex items-center justify-between group">
                <span>${displayRef} ${node.title}</span>
                <button onclick="LegalApp.toggleNoteBox('${node.num}')" class="opacity-0 group-hover:opacity-100 text-xs font-normal text-amber-400/80 hover:text-amber-300 transition flex items-center gap-1">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> ${noteContent ? 'Xem ghi chú' : 'Ghi chú'}
                </button>
              </div>
              <div class="text-gray-200 whitespace-pre-line leading-relaxed text-[14px]">${contentHtml}</div>

              <div id="note-box-${node.num}" class="${noteContent ? 'block' : 'hidden'} mt-3 p-3 rounded-lg bg-amber-950/30 border border-amber-900/50">
                <textarea 
                  oninput="LegalApp.handleNoteChange('${rawDoc.id}', '${node.num}', this.value)" 
                  class="w-full text-xs p-2 rounded bg-gray-900 border border-amber-800/60 text-amber-100 placeholder-gray-500 focus:outline-none" 
                  rows="2" 
                  placeholder="Ghi chú nghiệp vụ cho ${node.fullRef}...">${noteContent}</textarea>
              </div>
            </div>
          `;
        }
      }
    } else if (rawDoc.rawContent) {
      nodesHtml += `<div class="text-gray-200 whitespace-pre-line leading-relaxed text-[14px] p-4">${rawDoc.rawContent}</div>`;
    }

    nodesHtml += '</div>';
    contentArea.innerHTML = topBarHtml + summaryHtml + nodesHtml;
    this.refreshIcons();
  },

  /**
   * Reload Full Documents from window.PRELOADED_DATA
   */
  async reloadFullDATA() {
    try {
      const data = window.PRELOADED_DATA;

      if (!data || !Array.isArray(data) || data.length === 0) {
        alert("Không tìm thấy dữ liệu trong window.PRELOADED_DATA. Hãy kiểm tra file data/preloaded_data.js!");
        return;
      }

      console.log(`Bắt đầu nạp ${data.length} văn bản vào IndexedDB...`);

      const allCategories = await LegalDB.db.categories.toArray();

      const resolveCategoryIds = (item) => {
        const catIds = [];
        const rawCheck = (
          (item.docType || '') + ' ' +
          (item.title || '') + ' ' +
          (item.code || '') + ' ' +
          (Array.isArray(item.categories) ? item.categories.join(' ') : '')
        ).toLowerCase();

        allCategories.forEach(cat => {
          const cName = cat.name.toLowerCase();
          if (cName.includes('luật') && (item.docType === 'Luật' || rawCheck.includes('luật'))) catIds.push(cat.id);
          else if (cName.includes('nghị định') && (item.docType === 'Nghị định' || rawCheck.includes('nghị định'))) catIds.push(cat.id);
          else if (cName.includes('thông tư') && (item.docType === 'Thông tư' || rawCheck.includes('thông tư'))) catIds.push(cat.id);
          else if (cName.includes('qcvn') && (item.docType === 'QCVN' || rawCheck.includes('qcvn'))) catIds.push(cat.id);
          else if (cName.includes('tcvn') && (item.docType === 'TCVN' || rawCheck.includes('tcvn'))) catIds.push(cat.id);
          else if ((cName.includes('an toàn') || cName.includes('môi trường')) && (rawCheck.includes('an toàn') || rawCheck.includes('môi trường'))) catIds.push(cat.id);
          else if ((cName.includes('pccc') || cName.includes('cháy')) && (rawCheck.includes('pccc') || rawCheck.includes('cháy'))) catIds.push(cat.id);
          else if (cName.includes('thi công') && rawCheck.includes('thi công')) catIds.push(cat.id);
          else if (cName.includes('thiết kế') && rawCheck.includes('thiết kế')) catIds.push(cat.id);
        });

        if (catIds.length === 0 && allCategories.length > 0) {
          catIds.push(allCategories[0].id);
        }
        return [...new Set(catIds)];
      };

      // 1. Dọn dẹp dữ liệu cũ ở cả 3 bảng
      await LegalDB.db.documents.clear();
      await LegalDB.db.document_nodes.clear();
      if (LegalDB.db.document_relations) {
        await LegalDB.db.document_relations.clear();
      }

      const docRecords = [];
      const nodeRecords = [];
      const relationRecords = [];

      // Biểu thức Regex quét số hiệu pháp quy dẫn chiếu chéo
      const refRegex = /(Luật|Nghị định|Thông tư|Nghị quyết|Quyết định|QCVN|TCVN)\s+(?:số\s+)?([0-9]+(?:\/[0-9]+)?\/[A-Z0-9\-]+|[\d\:\/A-Z\-]+)/gi;

      data.forEach((item, docIdx) => {
        const docNumericId = typeof item.id === 'number' ? item.id : (docIdx + 1);

        docRecords.push({
          id: docNumericId,
          code: item.code || 'Chưa rõ',
          title: item.title || 'Văn bản không tên',
          docType: item.docType || 'Văn bản khác',
          issuer: item.issuer || 'Ban hành',
          issueDate: item.issueDate || '2024-01-01',
          effectiveDate: item.effectiveDate || '2024-01-01',
          status: item.status || 'active',
          categoryIds: resolveCategoryIds(item),
          rawContent: item.markdown || item.contentHtml || '',
          metadata: { totalArticles: (item.nodes || []).length }
        });

        if (Array.isArray(item.nodes)) {
          item.nodes.forEach((node, nodeIdx) => {
            const cleanNum = (node.number || '').replace(/[^0-9]/g, '') || String(nodeIdx + 1);

            nodeRecords.push({
              docId: docNumericId,
              nodeType: node.level === 'chuong' ? 'chapter' : 'article',
              fullRef: node.number || `Điều ${nodeIdx + 1}`,
              num: cleanNum,
              title: node.title || '',
              content: node.content || '',
              order: nodeIdx + 1
            });

            // Tự động phân tích và trích xuất dẫn chiếu chéo
            const content = node.content || '';
            let match;
            while ((match = refRegex.exec(content)) !== null) {
              const targetCode = match[2].trim();
              if (targetCode && targetCode !== item.code) {
                relationRecords.push({
                  sourceDocId: docNumericId,
                  sourceDocCode: item.code,
                  sourceNodeNum: cleanNum,
                  targetDocCode: targetCode,
                  relationType: 'references',
                  rawSnippet: match[0]
                });
              }
            }
          });
        }
      });

      // 2. Lưu đồng bộ cả 3 bảng vào IndexedDB
      await LegalDB.db.documents.bulkPut(docRecords);
      if (nodeRecords.length > 0) {
        await LegalDB.db.document_nodes.bulkPut(nodeRecords);
      }
      if (relationRecords.length > 0 && LegalDB.db.document_relations) {
        await LegalDB.db.document_relations.bulkPut(relationRecords);
      }

      this.state.activeCategoryId = null;
      this.state.docTypeFilter = 'all';
      this.state.statusFilter = 'all';
      this.state.searchQuery = '';

      await LegalSearch.buildIndex();
      await this.renderCategories();
      await this.renderDocumentList();

      if (docRecords.length > 0) {
        await this.openDocument(docRecords[0].id);
      }

      alert(`Đã nạp thành công ${docRecords.length} văn bản và ${relationRecords.length} dẫn chiếu chéo vào Thư viện!`);
    } catch (error) {
      console.error("Lỗi khi nạp dữ liệu:", error);
      alert("Lỗi khi nạp kho DATA: " + error.message);
    }
  },

  toggleNoteBox(nodeNum) {
    const box = document.getElementById(`note-box-${nodeNum}`);
    if (box) {
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) {
        const textarea = box.querySelector('textarea');
        if (textarea) textarea.focus();
      }
    }
  },

  async handleNoteChange(docId, nodeNum, content) {
    if (typeof LegalDB !== 'undefined') await LegalDB.saveNote(docId, nodeNum, content);
  },

  async toggleDocBookmark(docId) {
    if (typeof LegalDB !== 'undefined') {
      await LegalDB.toggleBookmark(docId, '');
      await this.openDocument(docId);
    }
  },

  /**
   * Navigation Helper: Scroll to specific Article / Chapter inside Main Viewport
   */
  scrollToNode(fullRef) {
    if (!fullRef) return;

    // Chuẩn hóa chuỗi tìm kiếm, vd: "Điều 54", "54", "khoản 1 Điều 54"
    const cleanRef = fullRef.trim();
    const articleMatch = cleanRef.match(/Điều\s+(\d+)/i) || cleanRef.match(/(\d+)/);
    const numOnly = articleMatch ? articleMatch[1] : '';

    // 1. Thử tìm qua các dạng ID phổ biến hoặc data-article-num
    let targetEl = document.getElementById(`node-${numOnly}`)
                || document.querySelector(`[data-article-num="${numOnly}"]`)
                || document.getElementById(`node-${cleanRef.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')}`)
                || document.getElementById(`node-Điều-${numOnly}`);

    // 2. Nếu chưa thấy, quét trực tiếp thẻ chứa Điều trong viewport
    if (!targetEl && numOnly) {
      const allArticleNodes = document.querySelectorAll('.article-node');
      for (const el of allArticleNodes) {
        const text = el.textContent || '';
        if (new RegExp(`^\\s*\\**\\s*Điều\\s+${numOnly}\\b`, 'i').test(text) || el.id.includes(`_${numOnly}_`) || el.id.endsWith(`_${numOnly}`)) {
          targetEl = el;
          break;
        }
      }
    }

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      targetEl.classList.add('highlight-target');
      
      // Hiệu ứng nhấp nháy màu vàng làm nổi bật Điều được trỏ đến
      targetEl.style.transition = 'background-color 0.4s ease';
      targetEl.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
      setTimeout(() => {
        targetEl.style.backgroundColor = '';
      }, 2000);
    } else {
      console.warn(`Không tìm thấy vị trí của: ${fullRef}`);
    }
  },

  /**
   * Navigate to target Document and Article
   */
  async navigateToNode(docCode, articleNum) {
    const currentDoc = await LegalDB.db.documents.get(this.state.activeDocId);
    const cleanTargetCode = (docCode || '').trim();

    // 1. Nếu dẫn chiếu chính văn bản hiện tại (hoặc không truyền mã VB đích)
    if (!cleanTargetCode || (currentDoc && currentDoc.code.toLowerCase() === cleanTargetCode.toLowerCase())) {
      if (articleNum) {
        this.scrollToNode(`Điều ${articleNum}`);
      }
      return;
    }

    // 2. Nếu dẫn chiếu sang một văn bản khác trong thư viện
    let doc = await LegalDB.db.documents.where('code').equalsIgnoreCase(cleanTargetCode).first();
    if (!doc) {
      doc = await LegalDB.db.documents.filter(d => 
        d.code.toLowerCase().includes(cleanTargetCode.toLowerCase()) || 
        cleanTargetCode.toLowerCase().includes(d.code.toLowerCase())
      ).first();
    }

    if (doc) {
      if (String(this.state.activeDocId) !== String(doc.id)) {
        await this.openDocument(doc.id);
      }
      if (articleNum) {
        setTimeout(() => {
          this.scrollToNode(`Điều ${articleNum}`);
        }, 300);
      }
    } else {
      // Văn bản ngoại viện chưa có trong 160 file
      alert(`Văn bản "${cleanTargetCode}" chưa có trong kho văn bản nguồn hiện tại.`);
    }
  },

  openSearchDialog() {
    const dialog = document.getElementById('global-search-dialog');
    if (dialog) {
      dialog.classList.remove('hidden');
      const input = document.getElementById('global-search-input');
      if (input) {
        input.value = '';
        input.focus();
        this.performGlobalSearch('');
      }
    }
    this.refreshIcons();
  },

  closeSearchDialog() {
    const dialog = document.getElementById('global-search-dialog');
    if (dialog) dialog.classList.add('hidden');
  },

  async performGlobalSearch(query) {
    const resultsContainer = document.getElementById('global-search-results');
    if (!resultsContainer || typeof LegalSearch === 'undefined') return;

    if (!query || !query.trim()) {
      resultsContainer.innerHTML = '<p class="text-xs text-gray-400 p-4 text-center">Nhập từ khóa, số hiệu văn bản hoặc nội dung Điều để tra cứu tức thời...</p>';
      return;
    }

    const { docResults, nodeResults } = await LegalSearch.search(query);

    if (docResults.length === 0 && nodeResults.length === 0) {
      resultsContainer.innerHTML = '<p class="text-xs text-gray-400 p-6 text-center">Không tìm thấy kết quả phù hợp</p>';
      return;
    }

    let html = '';
    if (docResults.length > 0) {
      html += '<div class="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Văn bản</div>';
      docResults.forEach(d => {
        html += `
          <div onclick="LegalApp.handleSearchDocClick('${d.id}')" class="p-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer flex items-center justify-between transition">
            <div>
              <span class="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">${d.code}</span>
              <p class="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-1">${d.title}</p>
            </div>
            <span class="text-[10px] text-gray-400">${d.docType}</span>
          </div>
        `;
      });
    }

    if (nodeResults.length > 0) {
      html += '<div class="px-3 py-1.5 mt-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Điều khoản chi tiết</div>';
      nodeResults.forEach(n => {
        html += `
          <div onclick="LegalApp.handleSearchNodeClick('${n.docId}', '${n.fullRef}')" class="p-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer transition">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">${n.fullRef}</span>
              <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">— ${n.title}</span>
              <span class="text-[10px] text-gray-400 ml-auto font-mono">(${n.docCode})</span>
            </div>
            <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">${n.snippet}</p>
          </div>
        `;
      });
    }

    resultsContainer.innerHTML = html;
  },

  async handleSearchDocClick(docId) {
    this.closeSearchDialog();
    await this.openDocument(docId);
  },

  async handleSearchNodeClick(docId, fullRef) {
    this.closeSearchDialog();
    await this.openDocument(docId);
    setTimeout(() => {
      this.scrollToNode(fullRef);
    }, 200);
  },

  toggleChatDrawer() {
    this.state.isChatOpen = !this.state.isChatOpen;
    const drawer = document.getElementById('ai-chat-drawer');
    if (drawer) {
      if (this.state.isChatOpen) {
        drawer.classList.remove('closed');
        drawer.classList.add('open');
        const input = document.getElementById('chat-input');
        if (input) input.focus();
      } else {
        drawer.classList.remove('open');
        drawer.classList.add('closed');
      }
    }
    this.refreshIcons();
  },

  async sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg || typeof LegalAI === 'undefined') return;

    input.value = '';
    const messagesContainer = document.getElementById('chat-messages');

    messagesContainer.innerHTML += `
      <div class="flex justify-end mb-4">
        <div class="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-none text-sm max-w-[85%] shadow-sm">
          ${msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </div>
      </div>
    `;

    const loadingId = 'ai-loading-' + Date.now();
    messagesContainer.innerHTML += `
      <div id="${loadingId}" class="flex gap-2.5 mb-4">
        <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
          <i data-lucide="bot" class="w-4 h-4"></i>
        </div>
        <div class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-2xl rounded-tl-none text-sm max-w-[85%] flex items-center gap-2">
          <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-blue-600"></i>
          <span class="text-xs text-gray-500">Đang tra cứu cơ sở dữ liệu và phân tích...</span>
        </div>
      </div>
    `;
    this.refreshIcons();
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      const response = await LegalAI.sendMessage(msg);
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      const renderedHtml = LegalAI.renderMarkdownWithCitations(response.reply);
      messagesContainer.innerHTML += `
        <div class="flex gap-2.5 mb-4">
          <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
            <i data-lucide="bot" class="w-4 h-4"></i>
          </div>
          <div class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-2xl rounded-tl-none text-sm max-w-[85%] shadow-sm markdown-body">
            ${renderedHtml}
          </div>
        </div>
      `;
    } catch (e) {
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();
      messagesContainer.innerHTML += `
        <div class="flex gap-2.5 mb-4">
          <div class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/60 flex items-center justify-center text-red-600 shrink-0">
            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
          </div>
          <div class="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 rounded-2xl rounded-tl-none text-xs max-w-[85%]">
            <p class="font-semibold mb-1">Không thể kết nối AI Copilot:</p>
            <p>${e.message}</p>
          </div>
        </div>
      `;
    }
    this.refreshIcons();
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  askAIAboutDoc(docCode) {
    if (!this.state.isChatOpen) this.toggleChatDrawer();
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = `Tóm tắt các quy định chính và điểm cần lưu ý của văn bản số ${docCode}`;
      this.sendChatMessage();
    }
  },

  openIngestModal() {
    const modal = document.getElementById('ingest-modal');
    if (modal) modal.classList.remove('hidden');
    this.refreshIcons();
  },

  closeIngestModal() {
    const modal = document.getElementById('ingest-modal');
    if (modal) modal.classList.add('hidden');
  },

  async openStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    try {
      if (typeof LegalDB !== 'undefined' && LegalDB.db) {
        const totalDocs = LegalDB.db.documents ? await LegalDB.db.documents.count() : 0;
        const totalArticles = LegalDB.db.document_nodes ? await LegalDB.db.document_nodes.count() : 0;
        const totalRelations = LegalDB.db.document_relations ? await LegalDB.db.document_relations.count() : 0;
        const totalNotes = LegalDB.db.notes_bookmarks ? await LegalDB.db.notes_bookmarks.count() : 0;

        const elDocs = document.getElementById('stat-total-docs');
        const elArticles = document.getElementById('stat-total-articles');
        const elRelations = document.getElementById('stat-total-relations');
        const elNotes = document.getElementById('stat-total-notes');

        if (elDocs) elDocs.textContent = totalDocs.toLocaleString('vi-VN');
        if (elArticles) elArticles.textContent = totalArticles.toLocaleString('vi-VN');
        if (elRelations) elRelations.textContent = totalRelations.toLocaleString('vi-VN');
        if (elNotes) elNotes.textContent = totalNotes.toLocaleString('vi-VN');
      }
    } catch (err) {
      console.warn("Lỗi tính thống kê:", err);
    }

    this.refreshIcons();
  },

  closeStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.add('hidden');
  },

  openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    const conf = LegalAI.config;
    document.getElementById('setting-provider').value = conf.provider;
    document.getElementById('setting-gemini-key').value = conf.geminiApiKey || '';
    document.getElementById('setting-gemini-model').value = conf.geminiModel || 'gemini-1.5-flash';
    document.getElementById('setting-openai-key').value = conf.openaiApiKey || '';
    document.getElementById('setting-openai-model').value = conf.openaiModel || 'gpt-4o-mini';
    document.getElementById('setting-custom-endpoint').value = conf.customEndpoint || 'http://localhost:11434/v1';
    document.getElementById('setting-custom-model').value = conf.customModel || 'qwen2.5:7b';

    this.updateSettingsVisibility(conf.provider);
    this.refreshIcons();
  },

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
  },

  updateSettingsVisibility(provider) {
    document.getElementById('section-gemini').classList.toggle('hidden', provider !== 'gemini');
    document.getElementById('section-openai').classList.toggle('hidden', provider !== 'openai');
    document.getElementById('section-custom').classList.toggle('hidden', provider !== 'ollama' && provider !== 'custom');
  },

  saveSettings() {
    const provider = document.getElementById('setting-provider').value;
    const newConfig = {
      provider,
      geminiApiKey: document.getElementById('setting-gemini-key').value.trim(),
      geminiModel: document.getElementById('setting-gemini-model').value.trim(),
      openaiApiKey: document.getElementById('setting-openai-key').value.trim(),
      openaiModel: document.getElementById('setting-openai-model').value.trim(),
      customEndpoint: document.getElementById('setting-custom-endpoint').value.trim(),
      customModel: document.getElementById('setting-custom-model').value.trim()
    };

    LegalAI.saveConfig(newConfig);
    this.closeSettingsModal();
    alert('Đã lưu cài đặt thành công!');
  },

  setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openSearchDialog();
      }
      if (e.key === 'Escape') {
        this.closeSearchDialog();
        this.closeIngestModal();
        this.closeSettingsModal();
        this.closeStatsModal();
      }
    });

    // Bắt sự kiện Click vào các liên kết dẫn chiếu chéo (khoản, điều, văn bản khác)
    document.addEventListener('click', (e) => {
      const refTarget = e.target.closest('.legal-ref');
      if (refTarget) {
        e.preventDefault();
        const targetDoc = refTarget.getAttribute('data-target-doc') || '';
        let article = refTarget.getAttribute('data-article') || '';

        // Nếu data-article rỗng, tự động bóc tách số từ nội dung click (vd: "Điều 54" -> "54")
        if (!article) {
          const text = refTarget.textContent || '';
          const match = text.match(/Điều\s+(\d+)/i) || text.match(/(\d+)/);
          if (match) article = match[1];
        }

        this.navigateToNode(targetDoc, article);
      }
    });
  }
};

window.LegalApp = LegalApp;