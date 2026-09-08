/**
 * Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật
 * AI Copilot - Dynamic RAG + Chat History + Query Intention Parser
 *
 * Chế độ phản hồi (tự động nhận diện):
 *   - specific-article: Hỏi Điều X Khoản Y (chỉ trả lời nội dung đó, không tóm tắt cả VB)
 *   - cross-reference: Hỏi liên kết giữa các Điều/Văn bản (xem trước đó đã nói gì)
 *   - document-summary: Hỏi "Tóm tắt văn bản X" (toàn bộ cấu trúc)
 *   - general-question: Câu hỏi mở (tra cứu top 5 node liên quan)
 */

const LegalAI = {
  config: {
    provider: 'gemini',
    geminiApiKey: '',
    geminiModel: 'gemini-1.5-flash',
    openaiApiKey: '',
    openaiModel: 'gpt-4o-mini',
    customEndpoint: 'https://api.agnes.ai/v1',
    customModel: 'agnes-2.0-flash',
    temperature: 0.05
  },

  // ============================================================
  // LỊCH SỬ HỘI THOẠI (THEO SESSION) + LAST CONTEXT NODES
  // ============================================================
  chatHistory: [],        // [{ role: 'user'|'assistant', content }]  tối đa 6 cặp
  lastNodesUsed: [],      // [{ docCode, docTitle, fullRef, title, content }] các node đã dùng
  lastDocFocus: null,     // { docCode, docTitle }: văn bản người dùng đang tập trung (từ câu trước)
  MAX_HISTORY: 6,

  init() {
    this.loadConfig();
    this._resetSessionState();
  },

  _resetSessionState() {
    this.chatHistory = [];
    this.lastNodesUsed = [];
    this.lastDocFocus = null;
  },

  clearChat() {
    this._resetSessionState();
  },

  loadConfig() {
    try {
      const saved = localStorage.getItem('legal_ai_config');
      if (saved) this.config = Object.assign({}, this.config, JSON.parse(saved));
    } catch (e) { console.error('Load config AI lỗi:', e); }
  },

  saveConfig(newConfig) {
    this.config = Object.assign({}, this.config, newConfig);
    localStorage.setItem('legal_ai_config', JSON.stringify(this.config));
  },

  safeString(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  },

  // ============================================================
  // BƯỚC 1: PARSER - Nhận diện CHỦ ĐỀ & Ý ĐỊNH CÂU HỎI
  // ============================================================
  parseQueryIntention(userMessage) {
    const q = this.safeString(userMessage).toLowerCase();
    const intent = {
      mode: 'general-question',
      articleNumbers: [],
      chapterNumbers: [],
      docNumbers: [],
      keywords: [],
      hasFollowUpMarker: false,
      focusDocCode: null
    };

    // A) Theo dõi CONTEXT CÂU TRƯỚC (FOLLOW-UP MARKERS)
    const followUpPatterns = [
      /được\s*quy\s*định\s*cụ\s*thể\s*ở\s*đâu/,
      /quy\s*định\s*cụ\s*thể\s*ở\s*điều\s*nào/,
      /liên\s*quan\s*(đến|với|tới)/,
      /thì\s*(điều\s*\d+|khớp|nào|như\s*thế\s*nào)/,
      /cụ\s*thể\s*(ở|tại|là)/,
      /như\s*trên\s*(đã\s*nói|đề\s*cập)/,
      /điểm\s*nào\s*(cũng|cùng)/,
      /^\s*(vậy|thì|còn|tuy|nhưng|và|hoặc)/,
      /điều\s*(\d+)\s*(này|đó|trên|vừa\s*rồi)/
    ];
    intent.hasFollowUpMarker = followUpPatterns.some(p => p.test(q));

    // B) Trích xuất các "Điều X" (có dấu cách hoặc không: Điều5 / điều 5 / Điều 5a)
    const artMatches = q.match(/điề?u\s*(\d+[a-z]?)/gi) || [];
    artMatches.forEach(m => {
      const num = (m.match(/\d+[a-z]?/i) || [])[0];
      if (num && !intent.articleNumbers.includes(num.toUpperCase())) {
        intent.articleNumbers.push(num.toUpperCase());
      }
    });

    // C) "Chương X"
    const chMatches = q.match(/chươ?ng\s*([ivxlcdm]+|\d+)/gi) || [];
    chMatches.forEach(m => {
      const num = (m.match(/[ivxlcdm]+|\d+/i) || [])[0];
      if (num) intent.chapterNumbers.push(num.toUpperCase());
    });

    // D) Số hiệu văn bản: 135/2025/QH15, 33/2025/NĐ-CP, 07/2025/TT-BXD
    const vbMatches = q.match(/(\d{2,4})[\/\-_](\d{2,4})(?:[\/\-_]([a-zđ]{1,6}(?:-[a-zđ]{1,6})*))?/gi) || [];
    vbMatches.forEach(m => intent.docNumbers.push(m.toUpperCase().replace(/_/g, '/')));

    // E) Nếu không có doc số nhưng có lastDocFocus và là follow-up → kế thừa văn bản trước
    if (intent.docNumbers.length === 0 && intent.hasFollowUpMarker && this.lastDocFocus) {
      intent.focusDocCode = this.lastDocFocus.docCode;
      if (intent.docNumbers.length === 0 && this.lastDocFocus.docCode) {
        const soHieu = this.lastDocFocus.docCode.match(/\d{2,4}[\/\-_]\d{2,4}/i);
        if (soHieu) intent.docNumbers.push(soHieu[0].toUpperCase().replace(/_/g, '/'));
      }
    }

    // F) Extract keywords quan trọng (≥3 ký tự, bỏ các từ dừng)
    const stopWords = new Set(['và', 'hoặc', 'là', 'của', 'trong', 'với', 'cho', 'được', 'từ', 'đến',
      'đã', 'sẽ', 'không', 'có', 'nhưng', 'này', 'đó', 'về', 'ở', 'theo', 'tại', 'để',
      'một', 'các', 'những', 'nào', 'thì', 'cũng', 'còn', 'hay', 'rằng', 'lúc', 'khi',
      'vậy', 'do', 'vì', 'sau', 'trước', 'nếu', 'mà', 'thôi', 'nữa', 'tôi', 'bạn',
      'hỏi', 'giải', 'đáp', 'cho', 'hỏi', 'thuật', 'ngữ', 'điều', 'chương', 'văn', 'bản',
      'luật', 'nghị', 'định', 'thông', 'tư', 'quy', 'chuẩn', 'tcvn', 'qcvn']);
    const terms = q.split(/[\s,.!?;:()\[\]\/\-"']+/).filter(t => t.length >= 3);
    intent.keywords = terms.filter(t => !stopWords.has(t)).slice(0, 10);

    // G) XÁC ĐỊNH CHẾ ĐỘ CHÍNH
    if (intent.articleNumbers.length > 0 || (intent.hasFollowUpMarker && this.lastNodesUsed.length > 0)) {
      intent.mode = 'specific-article';
    } else if (intent.docNumbers.length > 0 && /(tóm\s*tắt|tổng\s*quan|toàn\s*bộ|nội\s*dung\s*chính|cấu\s*trúc|điểm\s*mới)/.test(q)) {
      intent.mode = 'document-summary';
    } else if (intent.hasFollowUpMarker || /(so\s*sánh|khác\s*biệt|liên\s*quan|suy\s*đảo|áp\s*dụng|tương\s*ứng|phù\s*hợp)/.test(q)) {
      intent.mode = 'cross-reference';
    } else if (intent.docNumbers.length > 0) {
      intent.mode = 'document-summary';
    }

    return intent;
  },

  // ============================================================
  // BƯỚC 2: COLLECT CONTEXT - Ưu tiên LegalSearch RAG
  // ============================================================
  async collectContext(userMessage, intent) {
    const contexts = [];
    const ragNodes = [];

    // --- 2A) Ưu tiên CAO NHẤT: LegalSearch RAG (truy vấn node-level chính xác)
    try {
      if (typeof LegalSearch !== 'undefined') {
        let expandedQuery = userMessage;
        if (intent.focusDocCode) expandedQuery += ` ${intent.focusDocCode}`;
        if (intent.hasFollowUpMarker && this.lastNodesUsed.length > 0) {
          const lastTitles = this.lastNodesUsed.slice(0, 2).map(n => n.title || n.fullRef).join(' ');
          expandedQuery += ` ${lastTitles}`;
        }
        const topK = (intent.mode === 'cross-reference' || intent.mode === 'specific-article') ? 6 : 4;
        const activeDocId = (typeof LegalApp !== 'undefined' && LegalApp.state?.activeDocId) || null;
        console.log(`[LegalAI] Bridge 2A: mode=${intent.mode} | activeDocId=${activeDocId} | focusDocCode=${intent.focusDocCode || '(none)'} | articleNumbers=[${intent.articleNumbers.join(',')}] | userAskedOtherVB=${/^(luật|nghị định|thông tư|qcvn|tcvn)\s+\d|(luật|nghị định|thông tư|qcvn|tcvn).*điều\s+\d/i.test(userMessage)}`);
        const nodes = await LegalSearch.retrieveContextForRAG(expandedQuery, topK, { activeDocId, singleDocOnlyWhenActive: intent.mode !== 'cross-reference' });
        if (nodes && nodes.length > 0) nodes.forEach(n => ragNodes.push(n));
      }
    } catch (e) { console.warn('[LegalAI] Step 2A RAG retrieve lỗi:', e); }

    // --- 2A-POST) DEFENSE-IN-DEPTH SINGLE-DOC FILTER (nếu search.js Layer4 rò rỉ):
    // specific-article VÀ activeDocId VÀ ragNodes có node của VB đang mở MATCH explicit Điều X → lọc CHỈ VB đang mở
    try {
      if (intent.mode === 'specific-article' && intent.articleNumbers.length > 0 && typeof LegalApp !== 'undefined' && LegalApp.state?.activeDocId && ragNodes.length > 1) {
        const activeId = String(LegalApp.state.activeDocId);
        const userAskedOtherVB = /(luật|nghị định|thông tư|qcvn|tcvn|tcxdvn|qbđ|quyết định)\s*(số)?\s*\d|điều\s+\d+.*(của|tại|trong)\s*(luật|nghị định|thông tư|qcvn|tcvn)/i.test(userMessage);
        if (!userAskedOtherVB) {
          const inActive = ragNodes.filter(n => String(n.docId) === activeId);
          const hasActiveMatch = inActive.some(n => {
            const x = ((n.fullRef || '') + ' ' + (n.title || '')).toUpperCase();
            return intent.articleNumbers.some(a => x.includes('ĐIỀU ' + a));
          });
          if (hasActiveMatch) {
            console.log(`[LegalAI] 2A-POST lock applied: previous ragNodes had ${ragNodes.length} docs (${[...new Set(ragNodes.map(n=>String(n.docId)))].join(',')}), filtered to in-active only.`);
            ragNodes.length = 0;
            inActive.forEach(n => ragNodes.push(n));
          }
        }
      }
    } catch (e) { console.warn('[LegalAI] 2A-POST defense lỗi:', e); }

    // --- 2B) Ưu tiên 2: LAST-CONTEXT NODES (follow-up)
    if (intent.hasFollowUpMarker && this.lastNodesUsed.length > 0) {
      const uniqueLastNodes = this.lastNodesUsed.filter(last =>
        !ragNodes.some(r => String(r.id) === String(last.id))
      ).slice(0, 3);
      uniqueLastNodes.forEach(n => ragNodes.unshift(n));
    }

    // --- 2C) Ưu tiên 3: NẾU CÓ ĐIỀU CỤ THỂ → ĐỌC TRỰC TIẾP TỪ DB (nếu chưa có trong ragNodes)
    try {
      if (intent.articleNumbers.length > 0 && typeof LegalDB !== 'undefined' && LegalDB.db) {
        const scopeDoc = intent.focusDocCode || (this.lastDocFocus ? this.lastDocFocus.docCode : null);
        for (const art of intent.articleNumbers) {
          const already = ragNodes.some(n => {
            const ref = (n.fullRef || '').toUpperCase();
            const title = (n.title || '').toUpperCase();
            return ref.includes(`ĐIỀU ${art}`) || title.includes(`ĐIỀU ${art}`);
          });
          if (already) continue;

          let candidates = [];
          try {
            candidates = await LegalDB.db.document_nodes
              .filter(n => {
                const ref = ((n.fullRef || '') + ' ' + (n.title || '')).toUpperCase();
                const matchArt = ref.includes(`ĐIỀU ${art}`);
                let matchDoc = true;
                if (scopeDoc && n.docCode) {
                  matchDoc = (n.docCode || '').toUpperCase().includes(scopeDoc.toUpperCase().slice(0, 4));
                }
                return matchArt && matchDoc;
              }).limit(3).toArray();
          } catch (e2) { console.warn('[LegalAI] Step 2C Dexie query (docCode filter) bị lỗi, fallback RAM nodesIndex tiếp theo:', e2?.message || e2); }

          if (!candidates || candidates.length === 0) {
            if (typeof LegalSearch !== 'undefined' && LegalSearch.nodesIndex.length > 0) {
              candidates = LegalSearch.nodesIndex.filter(n => {
                const ref = ((n.fullRef || '') + ' ' + (n.title || '')).toUpperCase();
                return ref.includes(`ĐIỀU ${art}`);
              }).slice(0, 3);
            }
          }
          if (candidates) candidates.forEach(c => {
            if (!ragNodes.some(r => String(r.id) === String(c.id))) ragNodes.push(c);
          });
        }
      }
    } catch (e) { console.warn('Direct node query lỗi:', e); }

    // --- 2D) LƯU LẠI LAST DOC FOCUS (từ top-1 rag node)
    if (ragNodes.length > 0) {
      const top = ragNodes[0];
      const dc = top.docCode || null;
      const dt = top.docTitle || null;
      if (dc) this.lastDocFocus = { docCode: dc, docTitle: dt };
    }

    // --- 2E) FORMAT RAG NODES THÀNH CONTEXT NGẮN GỌN, CÓ ĐẦU MỤC
    try {
      const docIds = [...new Set(ragNodes.map(n => `${n.docId}(${n.docCode||''} ${n.fullRef||''})`))];
      console.log(`[LegalAI] 2E ragNodes distribution (${ragNodes.length} nodes, ${docIds.length} docs): ${docIds.slice(0,8).join(' | ')}${docIds.length>8?' | ...('+docIds.length+' total)':''}`);
    } catch (_) {}
    ragNodes.forEach((n, idx) => {
      const docInfo = [n.docCode, n.docTitle].filter(Boolean).join(' - ');
      const header = `[CTX${idx + 1}] ${docInfo} | ${n.fullRef || n.title || ''}`;
      const title = n.title ? `Tiêu đề Điều: ${n.title}` : '';
      const content = this.safeString(n.content).slice(0, 1800);
      const block = [header, title, content].filter(Boolean).join('\n').trim();
      if (block.length > 20) contexts.push(block);
    });

    // --- 2F) VIEWPORT HIỂN THỊ (chỉ lấy 4000 ký tự, không đẩy 35.000 như cũ)
    try {
      const viewport = document.getElementById('document-viewport') ||
                       document.querySelector('main') ||
                       document.querySelector('#doc-content');
      const screenText = this.safeString(viewport?.innerText);
      if (screenText.length > 120) {
        contexts.push(`[NỘI DUNG MÀN HÌNH ĐANG HIỂN THỊ - NGẮN GỌN]:\n${screenText.slice(0, 4000)}`);
      }
    } catch (e) {}

    // --- 2G) LAST RESORT (ZERO-TOLERANCE): Quét RAM toàn bộ nodesIndex theo Điều + Ưu tiên activeDocId trước
    if (ragNodes.length === 0 && intent.articleNumbers.length > 0 && typeof LegalSearch !== 'undefined' && LegalSearch.nodesIndex.length > 0) {
      const activeId = (typeof LegalApp !== 'undefined') ? LegalApp.state?.activeDocId : null;
      let prioritize;
      if (activeId) {
        const inActive = LegalSearch.nodesIndex.filter(n => String(n.docId) === String(activeId));
        const others = LegalSearch.nodesIndex.filter(n => String(n.docId) !== String(activeId));
        prioritize = inActive.concat(others);
      } else {
        prioritize = LegalSearch.nodesIndex;
      }
      for (const n of prioritize) {
        const x = ((n.fullRef || '') + ' ' + (n.title || '')).toUpperCase();
        for (const art of intent.articleNumbers) {
          const pat = 'ĐIỀU ' + art;
          if (x === pat || x.startsWith(pat + ' ') || x.includes(pat + '.') || x.includes(pat + ':') || x.includes(pat + ' –') || x.includes(pat + '\n')) {
            if (!ragNodes.some(r => String(r.id) === String(n.id))) {
              ragNodes.push(n);
              if (!this.lastDocFocus && (n.docCode || n.docTitle)) {
                this.lastDocFocus = { docCode: n.docCode || '', docTitle: n.docTitle || '' };
              }
            }
            break;
          }
        }
        if (ragNodes.length >= intent.articleNumbers.length * 2) break;
      }
      if (ragNodes.length > 0) {
        ragNodes.forEach((n, idx) => {
          const docInfo = [n.docCode, n.docTitle].filter(Boolean).join(' - ');
          const header = `[CTX2G-${idx + 1}] ${docInfo} | ${n.fullRef || n.title || ''}`;
          const title = n.title ? `Tiêu đề Điều: ${n.title}` : '';
          const content = this.safeString(n.content).slice(0, 1800);
          const block = [header, title, content].filter(Boolean).join('\n').trim();
          if (block.length > 20) contexts.push(block);
        });
      }
    }

    // --- 2H) EXTREME DEFENSE (QUAN TRỌNG NHẤT):
    if (ragNodes.length === 0 && typeof LegalSearch !== 'undefined' && LegalSearch.nodesIndex.length > 0) {
      const activeId = (typeof LegalApp !== 'undefined') ? LegalApp.state?.activeDocId : null;
      let backupDocId = activeId;
      if (!backupDocId && this.lastDocFocus?.docCode) {
        const matchDoc = LegalSearch.docsIndex.find(d => (d.code || '').toUpperCase() === (this.lastDocFocus.docCode || '').toUpperCase());
        if (matchDoc) backupDocId = matchDoc.id;
      }
      if (!backupDocId && LegalSearch.docsIndex.length > 0) {
        backupDocId = LegalSearch.docsIndex[0].id;
      }
      if (backupDocId) {
        const topNodes = LegalSearch.nodesIndex
          .filter(n => String(n.docId) === String(backupDocId))
          .slice(0, 6);
        topNodes.forEach(n => {
          if (!ragNodes.some(r => String(r.id) === String(n.id))) ragNodes.push(n);
          const docInfo = [n.docCode, n.docTitle].filter(Boolean).join(' - ');
          const header = `[CTX2H] ${docInfo} | ${n.fullRef || n.title || ''}`;
          const title = n.title ? `Tiêu đề: ${n.title}` : '';
          const content = this.safeString(n.content).slice(0, 1800);
          const block = [header, title, content].filter(Boolean).join('\n').trim();
          if (block.length > 20) contexts.push(block);
        });
        if (ragNodes.length > 0) {
          console.warn('[LegalAI] Step 2H Extreme DEFENSE triggered: Layers 0-2G returned 0. Fallback top-nodes of active/related doc to prevent false "not found".');
        }
      }
    }

    return {
      text: contexts.join('\n\n---\n\n'),
      usedNodes: ragNodes.slice(0, 10)
    };
  },

  // ============================================================
  // BƯỚC 3: XÂY DỰNG SYSTEM PROMPT ĐỘNG (THEO CHẾ ĐỘ)
  // ============================================================
  buildSystemPrompt(mode, contextText) {
    const ctxChars = (contextText || '').length;
    const hasCtxBlocks = /\[(CTX\d*|CTX2G-\d+|CTX2H)\]/.test(contextText || '');
    const ctxEmpty = !hasCtxBlocks && ctxChars < 800;
    const ctx = contextText && hasCtxBlocks
      ? contextText
      : (contextText || '(Ngữ cảnh nạp vào chưa đủ. Vui lòng mở một văn bản cụ thể sau đó đặt lại câu hỏi, hoặc dùng thanh TÌM KIẾM để tìm Điều / Khoản mong muốn.)');

    const ctxGuardLine = (() => {
      if (!ctxEmpty) {
        return `[BẢO VỆ - CÓ NGỮ CẢNH (${ctxChars} ký tự, đã có [CTX*] blocks)]: TUYỆT ĐỐI CẤM SỬ DỤNG CỤM TƯƠNG TỰ "Không tìm thấy Điều phù hợp trong kho dữ liệu nạp vào" TRONG MỌI TRƯỜNG HỢP. BẮT BUỘC tổng hợp nội dung TỪ [CTX*] / [CTX2G-*] / [CTX2H] BÊN DƯỚI. NẾU CÓ "Điều X" trong CTX → TRẢ LỜI NGUYÊN VĂN NỘI DUNG ĐIỀU X, KHÔNG ĐƯỢC lảng tránh.`;
      }
      return `[BẢO VỆ - NGỮ CẢNH HẠN CHẾ (${ctxChars} ký tự, chưa có [CTX*] blocks)]: Hãy trả lời dựa trên dữ liệu sẵn có (nếu có); nếu không đủ, hãy nói "Vui lòng mở văn bản cần tra cứu rồi đặt lại câu hỏi, hoặc chỉ rõ số hiệu Điều / Khoản." (TUYỆT ĐỐI KHÔNG ĐƯỢC DÙNG CỤM "Không tìm thấy Điều phù hợp trong kho dữ liệu nạp vào").`;
    })();

    const specificArticlePrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật. Nhiệm vụ hiện tại: TRẢ LỜI CHÍNH XÁC VỀ ĐIỀU / KHOẢN ĐƯỢC HỎI KÈM NGUỒN GỐC.
RULES BẮT BUỘC (VI PHẠM SẼ BỊ LOẠI BỎ):
1. **KHÔNG TÓM TẮT TOÀN BỘ VĂN BẢN**. Chỉ lấy đúng nội dung Điều được hỏi + các Khoản của nó + các Điều liên quan trực tiếp (nếu có trong ngữ cảnh).
2. **CẤM TUYỆT ĐỐI** cố tình liệt kê 8 Chương + 95 Điều khi người dùng chỉ hỏi 1 Điều. Chỉ nói về Điều họ hỏi.
3. **BẮT BUỘC - TRÍCH DẪN NGUỒN GỐC + FOOTER THAM CHIẾU** (QUAN TRỌNG NHẤT):
   a. **MỖI KHOẢN / ĐIỂM bạn trả lời → BẮT BUỘC có blockquote (>) trích dẫn VERBATIM 1:1 nguyên văn nội dung gốc từ block [CTX*] bên dưới (KHÔNG được diễn giải, không tóm tắt, không đổi từ).**
   b. **NGAY SAU blockquote đó → BẮT BUỘC thêm dòng FOOTER THAM CHIẾU một dòng, đặt trong ngoặc vuông [ ] định dạng CHUẨN bằng dấu →:**
      \`[SỐ HIỆU VĂN BẢN ĐẦY ĐỦ → Điều X → Khoản Y → Điểm Z]\`
      - Ví dụ 1 (chỉ có Điều): \`[206/2026/NĐ-CP → Điều 7]\`
      - Ví dụ 2 (Điều + Khoản): \`[206/2026/NĐ-CP → Điều 2 → Khoản 2]\`
      - Ví dụ 3 (Điều + Khoản + Điểm): \`[135/2025/QH15 → Điều 51 → Khoản 3 → Điểm b]\`
      - Bắt buộc dùng **SỐ HIỆU VĂN BẢN ĐẦY ĐỦ** lấy từ block [CTX*] ví dụ: 206/2026/NĐ-CP, 135/2025/QH15, 33/2025/NĐ-CP, 16/2025/TT-BXD. **TUYỆT ĐỐI KHÔNG RÚT GỌN THÀNH MÃ 206/2026/N (không có loại VB).**
   c. **Nếu bạn tóm tắt 1 ý (ngoài blockquote) → BẮT BUỘC kèm footer [ ] ngay cuối câu ý đó, bám đúng [CTX*] chứa nội dung bạn trích dẫn.** Ví dụ: "Thẩm định chi phí đầu tư do đơn vị tư vấn thực hiện **[206/2026/NĐ-CP → Điều 2 → Khoản 2]**."
4. Nếu người dùng hỏi theo dạng "X được quy định cụ thể ở đâu" (theo dõi câu hỏi trước), bạn PHẢI trả lời:
   - Trích dẫn chính xác **tên Điều, khoản, con, điểm** có nội dung đó (TỪ DỮ LIỆU BÊN DƯỚI).
   - Nêu rõ **văn bản nào** (số hiệu, năm).
   - blockquote > nguyên văn nội dung đó.
   - Footer [SỐ HIỆU VB → Điều X → Khoản Y → Điểm Z] ngay sau blockquote.
5. Định dạng câu trả lời khoa học theo Markdown:
   - Giới thiệu 1 dòng: "Điều X của [Văn bản] quy định về..."
   - Từng khoản: Mục (1.), (2.)... → blockquote > nguyên văn → footer [ ] tham chiếu ngay sau.
   - **Liên kết chéo (NGUYÊN TẮC - CHỈ KHI ĐÃ CÓ ĐỦ NỘI DUNG CHÍNH):**
     - ✅ CHO PHÉP: CHỈ liên kết tới các Điều/Khoản **CÙNG MỘT VĂN BẢN** (đang mở) và **LIÊN QUAN TRỰC TIẾP CHỦ ĐỀ** với nội dung Điều được hỏi (ví dụ Điều 5 về Nguyên tắc → liên kết các Điều khác cũng về Nguyên tắc / Quản lý nhà nước / Chủ đầu tư, KHÔNG BAO GIỜ liên kết ngẫu nhiên Điều 1 hay Điều 3).
     - ❌ CẤM: Liên kết tới các văn bản KHÁC (ví dụ hỏi Luật Xây dựng 135 → đừng link Luật Đất đai 31, Luật Đầu tư 143...) khi người dùng KHÔNG yêu cầu so sánh chéo.
     - ❌ CẤM: Liên kết 3 điều ngẫu nhiên không liên quan chỉ để có link. 1-2 link là đủ, ưu tiên không.
6. (STRICT GUARD - KHÔNG THƯƠNG LƯỢNG)
   - TUYỆT ĐỐI CẤM trong mọi trường hợp câu trả lời BẮT ĐẦU BẰNG HOẶC CHỨA CỤM: "Không tìm thấy Điều phù hợp trong kho dữ liệu nạp vào"
   - Nếu bên dưới có [CTX*] / [CTX2G-*] / [CTX2H] (nghĩa là ĐÃ CÓ DỮ LIỆU ĐƯỢC NẠP) → BẮT BUỘC tổng hợp nội dung từ những block đó.
   - NẾU bên dưới có "Điều X" (người dùng hỏi) → TRẢ LỜI NGUYÊN VĂN ĐIỀU X + blockquote + footer [ ], KHÔNG ĐƯỢC lảng tránh.
   - Nếu ngữ cảnh không đủ → nói "Vui lòng mở văn bản cần tra cứu hoặc chỉ rõ SỐ HIỆU / TÊN Điều, Khoản."
7. (ACTIVE DOCUMENT LOCK - TUYỆT ĐỐI)
   - **NẾU NGƯỜI DÙNG ĐANG MỞ MỘT VĂN BẢN CỤ THỂ (active document) VÀ HỎI "ĐIỀU X" (không nêu rõ văn bản khác) → BẮT BUỘC CHỈ TRẢ LỜI VỀ ĐIỀU X CỦA VĂN BẢN ĐANG MỞ.**
   - ❌ **TUYỆT ĐỐI CẤM** liệt kê Điều X từ 3-6 văn bản khác nhau khi người dùng chỉ mở 1 văn bản VÀ KHÔNG yêu cầu so sánh.
   - Trường hợp đặc biệt: Nếu trong VB ĐANG MỞ thực sự KHÔNG có Điều X (không tìm thấy trong [CTX*]) → nói rõ 1 câu: "Văn bản [tên VB đang mở] hiện không chứa Điều X bạn hỏi; bạn có thể mở văn bản phù hợp khác trước khi truy vấn." (KHÔNG BAO GIỜ tự động liệt kê 5 văn bản khác có Điều X).
8. CẤM tự thêm các điểm không có trong [CTX*] vào câu trả lời (phân biệt với tóm tắt từ chính context).
9. **[BẢO VỆ MÃ (CTX)]**: Footer [ ] BẮT BUỘC dùng **SỐ HIỆU VB ĐẦY ĐỦ** từ block [CTX*]. Nếu [CTX*] có ghi "(CTX1)", "(CTX2)"... BẠN CÓ THỂ giữ lại CTX làm ghi chú PHÍA SAU SỐ HIỆU, ví dụ: \`[206/2026/NĐ-CP → Điều 2 → Khoản 2 (CTX1)]\`. MÃ (CTX1) KHÔNG BAO GIỜ thay thế số hiệu VB ĐẦY ĐỦ.

${ctxGuardLine}

[NGỮ CẢNH ĐÃ TRUY XUẤT TỪ CSDL (CHỈ DỰA VÀO ĐÂY)]:
${ctx}
`.trim();

    const crossRefPrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật. Nhiệm vụ: TÌM LIÊN KẾT CHÉO GIỮA CÁC VĂN BẢN / CÁC ĐIỀU, KÈM NGUỒN GỐC MỖI Ý.
RULES:
1. Dựa TỐT ĐẾN ngữ cảnh bên dưới, xác định những điểm khớp với từ khóa câu hỏi.
2. Mỗi liên kết ghi rõ: **Văn bản số hiệu → Điều X → Khoản Y → Điểm Z.**
3. **BẮT BUỘC TRÍCH DẪN + FOOTER:**
   a. Mỗi liên kết phải có **blockquote (>) trích dẫn nguyên văn 1-2 câu gốc** từ [CTX*] thể hiện sự liên quan đó.
   b. Sau blockquote → BẮT BUỘC một dòng footer định dạng chuẩn: \`[SỐ HIỆU VB ĐẦY ĐỦ → Điều X → Khoản Y → Điểm Z]\`. Số hiệu VB ĐẦY ĐỦ lấy từ [CTX*], không rút gọn.
4. Sắp xếp theo mức độ liên quan (cao nhất lên trên).
5. Không tóm tắt toàn bộ văn bản. Mỗi điều liên kết CHỈ 1 block ngắn + quote + footer.
6. Nếu không tìm thấy liên kết, nói rõ.

[NGỮ CẢNH ĐÃ TRUY XUẤT TỪ CSDL]:
${ctx}
`.trim();

    const documentSummaryPrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật. Nhiệm vụ: TÓM TẮT VĂN BẢN PHÁP LUẬT KÈM NGUỒN GỐC ĐIỀU KHÓA.
RULES:
1. Bố cục 3 phần:
   - **Thông tin văn bản:** số hiệu, cơ quan ban hành, ngày ban hành, ngày hiệu lực, tổng số Chương/Điều (nếu biết).
   - **Nội dung quy định chính:** nhóm theo Chương / nhóm Điều, mỗi điểm tóm tắt 2-4 dòng.
     > BẮT BUỘC: Từng điểm chính → KÈM footer [SỐ HIỆU VB → Điều X] ngay cuối câu bám Điều đó. Ví dụ: "Điều 5 quy định nguyên tắc xác định tổng mức đầu tư điều chỉnh [206/2026/NĐ-CP → Điều 5]."
   - **Điểm mới & cần lưu ý:** 3-7 điểm then chốt ảnh hưởng trực tiếp đến thực thi, mỗi điểm kèm footer [ ] tham chiếu Điều gốc.
2. Nếu ngữ cảnh có quá ít thông tin → nói rõ "Ngữ cảnh hạn chế, tóm tắt dựa trên phần đã nạp".
3. Đối với các Điều nổi bật / dễ hiểu lầm → thêm blockquote > nguyên văn câu gốc từ [CTX*] + footer [SỐ HIỆU VB → Điều X → Khoản Y].

[NGỮ CẢNH ĐÃ TRUY XUẤT TỪ CSDL]:
${ctx}
`.trim();

    const generalPrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật Xây dựng Việt Nam.
RULES:
1. Dựa TỐT ĐẾN dữ liệu bên dưới. Ưu tiên thông tin có trong [CTX*].
2. Nếu không có → nói rõ "Không tìm thấy trong kho dữ liệu nạp vào", tóm tắt ngắn bằng kiến thức phổ thông và ghi chú nguồn.
3. **BẮT BUỘC KÈM NGUỒN GỐC MỖI Ý:**
   - Mỗi ý bạn nêu ra → BẮT BUỘC kèm **blockquote (>) trích dẫn nguyên văn câu/đoạn chứa quy định đó từ [CTX*] (nếu có)**.
   - Sau blockquote → BẮT BUỘC footer \`[SỐ HIỆU VB ĐẦY ĐỦ → Điều X → Khoản Y → Điểm Z]\` (SỐ HIỆU VB lấy từ [CTX*], không rút gọn).
   - Nếu chỉ tóm tắt (không quote) → kèm footer [ ] ngay cuối câu.
4. Câu trả lời cấu trúc từng ý, không lan man.

[NGỮ CẢNH ĐÃ TRUY XUẤT TỪ CSDL]:
${ctx}
`.trim();

    switch (mode) {
      case 'specific-article': return specificArticlePrompt;
      case 'cross-reference':   return crossRefPrompt;
      case 'document-summary':  return documentSummaryPrompt;
      default:                  return generalPrompt;
    }
  },

  // ============================================================
  // BƯỚC 4: GỬI TIN NHẮN (có chat history)
  // ============================================================
  async sendMessage(userMessage) {
    const safeMsg = this.safeString(userMessage);
    if (!safeMsg) throw new Error('Câu hỏi trống.');

    const intent = this.parseQueryIntention(safeMsg);
    console.log('[LegalAI] Intention:', intent);

    const ctx = await this.collectContext(safeMsg, intent);
    console.log(`[LegalAI] Context nodes=${ctx.usedNodes.length}, chars=${ctx.text.length}`);

    const systemPrompt = this.buildSystemPrompt(intent.mode, ctx.text);

    const recentHistory = this.chatHistory.slice(-this.MAX_HISTORY);
    const provider = this.config.provider;
    let reply;

    if (provider === 'gemini') {
      reply = await this.callGemini(systemPrompt, recentHistory, safeMsg);
    } else if (provider === 'openai') {
      reply = await this.callOpenAI(systemPrompt, recentHistory, safeMsg);
    } else {
      reply = await this.callCustomOpenAI(systemPrompt, recentHistory, safeMsg);
    }

    this._pushHistory('user', safeMsg);
    this._pushHistory('assistant', reply);
    this.lastNodesUsed = ctx.usedNodes.length > 0 ? ctx.usedNodes : this.lastNodesUsed;

    return { reply, mode: intent.mode, usedNodes: ctx.usedNodes };
  },

  _pushHistory(role, content) {
    this.chatHistory.push({ role, content: this.safeString(content).slice(0, 8000) });
    if (this.chatHistory.length > this.MAX_HISTORY * 2) {
      this.chatHistory = this.chatHistory.slice(-this.MAX_HISTORY * 2);
    }
  },

  // ============================================================
  // GỌI API CÁC PROVIDER
  // ============================================================
  async callGemini(systemPrompt, history, userMessage) {
    const apiKey = this.safeString(this.config.geminiApiKey);
    if (!apiKey) throw new Error('Chưa cấu hình Gemini API Key. Vào Cài đặt (bánh răng) → AI BYOK để nhập.');

    const model = this.safeString(this.config.geminiModel) || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = [];
    let firstUserText = systemPrompt;
    history.forEach(h => {
      const role = h.role === 'assistant' ? 'model' : 'user';
      if (role === 'user' && firstUserText) {
        contents.push({ role: 'user', parts: [{ text: `${firstUserText}\n\n---\n[LỜI NGƯỜI DÙNG LƯỢT TRƯỚC]: ${h.content}` }] });
        firstUserText = '';
      } else {
        contents.push({ role, parts: [{ text: h.content }] });
      }
    });
    if (firstUserText) {
      contents.push({ role: 'user', parts: [{ text: `${firstUserText}\n\n---\n[CÂU HỎI HIỆN TẠI]: ${userMessage}` }] });
    } else {
      contents.push({ role: 'user', parts: [{ text: userMessage }] });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: this.config.temperature ?? 0.05,
          maxOutputTokens: 8192
        }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('')?.trim() || 'Không nhận được phản hồi từ Gemini.';
  },

  async callOpenAI(systemPrompt, history, userMessage) {
    const apiKey = this.safeString(this.config.openaiApiKey);
    if (!apiKey) throw new Error('Chưa cấu hình OpenAI API Key. Vào Cài đặt (bánh răng) → AI BYOK để nhập.');

    const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.safeString(this.config.openaiModel) || 'gpt-4o-mini',
        messages,
        temperature: this.config.temperature ?? 0.05,
        max_tokens: 8192
      })
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Không có phản hồi từ OpenAI.';
  },

  async callCustomOpenAI(systemPrompt, history, userMessage) {
    let endpoint = (this.safeString(this.config.customEndpoint) || 'https://api.agnes.ai/v1').replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) endpoint += '/chat/completions';

    const headers = { 'Content-Type': 'application/json' };
    if (this.config.openaiApiKey) headers['Authorization'] = `Bearer ${this.safeString(this.config.openaiApiKey)}`;
    const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }];
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.safeString(this.config.customModel) || 'agnes-2.0-flash',
        messages,
        temperature: this.config.temperature ?? 0.05,
        max_tokens: 8192
      })
    });
    if (!res.ok) throw new Error(`Custom API HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Không có phản hồi từ AI.';
  },

  // ============================================================
  // Markdown Render + CITATION LINK (tự tạo hyperlink click được)
  // ============================================================
  renderMarkdownWithCitations(markdownText) {
    const text = this.safeString(markdownText);
    if (!text) return '';

    // Helper escape inline để tạo onclick handler an toàn
    const _q = s => String(s || '').replace(/'/g, "\\'").replace(/\n/g, ' ').trim();

    // Trợ lý parse 1 block tham chiếu thành { docCode, art, clause, point }
    const _parseParts = (docStr, artStr, clauseStr, pointStr, fallbackDocCode) => {
      let docCode = '';
      if (docStr) {
        docStr = String(docStr).trim();
        // Thử tìm SỐ HIỆU VB chuẩn có dấu / ví dụ: 206/2026/NĐ-CP, 135/2025/QH15, 16/2025/TT-BXD
        const m1 = docStr.match(/(\d{2,4}[\/\-_]\d{2,4}(?:[\/\-_][A-Za-zĐđ0-9\-]+)?)/);
        if (m1) docCode = m1[1].replace(/_/g, '/').toUpperCase();
        else {
          // Loại bỏ phần loại VB dư thừa (chỉ giữ các ký tự số, /, -, A-Z)
          const m2 = docStr.match(/(\d{2,4}[\/\-_]\d{2,4}[\w\/\-]*)/);
          if (m2) docCode = m2[1].replace(/_/g, '/').toUpperCase();
        }
      }
      if (!docCode && fallbackDocCode) docCode = String(fallbackDocCode);
      const article = (artStr || '').replace(/[^0-9a-zA-ZĐđ]/g, '').toUpperCase();
      const clause  = (clauseStr || '').replace(/[^\d]/g, '');
      const point   = (pointStr || '').replace(/[^a-zA-ZĐđ0-9.]/g, '').toUpperCase();
      return { docCode, article, clause, point };
    };

    // Helper tạo onclick gọi navigateToNode
    const _mkOnclick = (docCode, article, clause, point, titleHint) => {
      const d = _q(docCode), a = _q(article), c = _q(clause), p = _q(point), t = _q(titleHint);
      return `try{window.LegalApp&&window.LegalApp.navigateToNode&&window.LegalApp.navigateToNode('${d}','${a}','${c}','${p}');}catch(e){}`;
    };

    const _safeLabel = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const lastDocCode = this.lastDocFocus?.docCode || '';

    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^###### (.*$)/gim, '<h6 class="font-bold text-xs mt-2 mb-1 text-blue-300">$1</h6>')
      .replace(/^##### (.*$)/gim, '<h5 class="font-bold text-xs mt-2 mb-1 text-blue-300">$1</h5>')
      .replace(/^#### (.*$)/gim, '<h4 class="font-bold text-sm mt-3 mb-1 text-blue-400">$1</h4>')
      .replace(/^### (.*$)/gim, '<h3 class="font-bold text-sm mt-3 mb-1 text-blue-300">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="font-bold text-base mt-4 mb-2 text-gray-100">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="font-bold text-lg mt-4 mb-2 text-white">$1</h1>')
      .replace(/^\s*>\s?(.*)$/gim, '<blockquote class="border-l-4 border-blue-500/60 bg-blue-900/20 pl-3 pr-2 py-1 my-1 rounded text-gray-300 italic">$1</blockquote>')
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-700/60 px-1.5 py-0.5 rounded text-yellow-300 text-xs">$1</code>')
      .replace(/^\s*[\-\*]\s+(.*)$/gim, '<li class="ml-4 list-disc text-gray-300 my-0.5">$1</li>')
      .replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li class="ml-4 list-decimal text-gray-300 my-0.5">$2</li>')
      .replace(/\n\n+/g, '</p><p class="mb-2">')
      .replace(/\n/g, '<br/>');

    html = `<p class="mb-2">${html}</p>`;

    // ====== PATTERN 1 (NEW): ARROW FOOTER [SỐ HIỆU VB → Điều X → Khoản Y → Điểm Z (CTX...)]
    // Group 1 = doc (optional), Group 2 = article, Group 3 = clause (optional), Group 4 = point (optional)
    // => Tương thích: [206/2026/N → Điều 2 → Khoản 2 (CTX4)], [206/2026/NĐ-CP → Điều 7], [135/2025/QH15 → Điều 51 → Khoản 3 → Điểm b]
    const arrowRegex = /\[((?:[^\]→\n]*?)\s*→\s*)?(?:Điều\s+(\d+[a-zđ]?))(?:\s*→\s*Khoản\s+(\d+))?(?:\s*→\s*Điểm\s+([a-zđ]+(?:\.\d+)?))?(?:\s*\([^)]*\))?\s*\]/gi;
    html = html.replace(arrowRegex, (match, docPart, artPart, clausePart, pointPart) => {
      // Trim "Nghị định 206/2026/NĐ-CP" → chỉ lấy số hiệu
      const docStrRaw = docPart ? docPart.replace(/→\s*$/, '') : '';
      const p = _parseParts(docStrRaw, artPart || '', clausePart || '', pointPart || '', lastDocCode);
      if (!p.article && !p.docCode) return match;
      const onclick = _mkOnclick(p.docCode, p.article, p.clause, p.point, match);
      const hint = [
        p.docCode ? `VB: ${p.docCode}` : '(cùng VB hiện tại)',
        p.article ? `Điều ${p.article}` : '',
        p.clause  ? `Khoản ${p.clause}` : '',
        p.point   ? `Điểm ${p.point}`   : ''
      ].filter(Boolean).join(' - ');
      return `<button class="ai-citation-link legal-ref inline-flex items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-200 hover:underline cursor-pointer bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/30" onclick="${onclick}" title="Click để đối chiếu trực tiếp: ${hint}">📜 ${_safeLabel(match)}</button>`;
    });

    // ====== PATTERN 2 (BACKWARD COMPATIBLE) CŨ: [Điều 5], [Khoản 2 Điều 7 NĐ 33/2025], [Điểm a khoản 1 Điều 6]
    const docCodeRegex2 = /(?:(?:Luật|Nghị\s*định|Thông\s*tư|Quyết\s*định|Quy\s*chế|TCVN|QCVN|TCXDVN)\s+)?\d{2,4}[\/\-_]\d{2,4}(?:[\/\-_][A-Za-zĐđ\-]+)?/i;
    const oldCitationRegex = /\[((?:Điểm\s+[a-zđ]+(?:\.\d+)?\s+)?(?:Khoản\s+\d+\s+)?Điều\s+\d+[a-zđ]?|Điểm\s+[a-zđ]+(?:\.\d+)?|Khoản\s+\d+)(?:\s*,\s*([^\]]+))?\]/gi;
    html = html.replace(oldCitationRegex, (match, entityPart, docPart) => {
      const artM  = entityPart.match(/Điều\s+(\d+[a-zđ]?)/i);
      const claM  = entityPart.match(/Khoản\s+(\d+)/i);
      const poiM  = entityPart.match(/Điểm\s+([a-zđ]+(?:\.\d+)?)/i);
      const artStr = (artM || [])[1] || '';
      const claStr = (claM || [])[1] || '';
      const poiStr = (poiM || [])[1] || '';

      let displayDoc = '';
      if (docPart) {
        const m2 = docPart.match(docCodeRegex2);
        if (m2) displayDoc = m2[0];
      }
      if (!displayDoc) displayDoc = lastDocCode || '';

      const p = _parseParts(displayDoc, artStr, claStr, poiStr, lastDocCode);
      if (!p.article && !p.clause && !p.point) return match;
      const onclick = _mkOnclick(p.docCode, p.article, p.clause, p.point, match);
      const hint = [
        p.docCode ? `VB: ${p.docCode}` : '(cùng VB hiện tại)',
        p.article ? `Điều ${p.article}` : '',
        p.clause  ? `Khoản ${p.clause}` : '',
        p.point   ? `Điểm ${p.point}`   : ''
      ].filter(Boolean).join(' - ');
      return `<button class="ai-citation-link legal-ref inline-flex items-center gap-1 font-semibold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30" onclick="${onclick}" title="Click để đối chiếu trực tiếp: ${hint}">🔗 ${_safeLabel(match)}</button>`;
    });

    return html;
  }
};

window.LegalAI = LegalAI;
