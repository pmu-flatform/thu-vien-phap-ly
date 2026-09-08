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
        // Tăng keywork query: thêm vào các từ khoá last nodes đã dùng (liên kết chéo)
        if (intent.hasFollowUpMarker && this.lastNodesUsed.length > 0) {
          const lastTitles = this.lastNodesUsed.slice(0, 2).map(n => n.title || n.fullRef).join(' ');
          expandedQuery += ` ${lastTitles}`;
        }
        // topK=5 (default 4) + thêm 2 nếu là chế độ liên kết
        const topK = (intent.mode === 'cross-reference' || intent.mode === 'specific-article') ? 6 : 4;
        const nodes = await LegalSearch.retrieveContextForRAG(expandedQuery, topK);
        if (nodes && nodes.length > 0) nodes.forEach(n => ragNodes.push(n));
      }
    } catch (e) { console.warn('RAG retrieve lỗi:', e); }

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
          // Nếu RAG đã trả lại đúng Điều này → bỏ qua
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
          } catch (e2) { /* có thể schema không có docCode trên document_nodes -> fallback */ }

          if (!candidates || candidates.length === 0) {
            // Fallback: quét nodesIndex của LegalSearch
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

    return {
      text: contexts.join('\n\n---\n\n'),
      usedNodes: ragNodes.slice(0, 10)
    };
  },

  // ============================================================
  // BƯỚC 3: XÂY DỰNG SYSTEM PROMPT ĐỘNG (THEO CHẾ ĐỘ)
  // ============================================================
  buildSystemPrompt(mode, contextText) {
    const ctx = contextText || '(Trống. Vui lòng trả lời "Không tìm thấy nội dung phù hợp trong kho dữ liệu, mô tả ngắn gọn nếu bạn biết thông tin này nhưng ghi rõ "Nguồn: kiến thức phổ thông - chưa có trong kho".)';

    const specificArticlePrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật. Nhiệm vụ hiện tại: TRẢ LỜI CHÍNH XÁC VỀ ĐIỀU / KHOẢN ĐƯỢC HỎI.
RULES BẮT BUỘC (VI PHẠM SẼ BỊ LOẠI BỎ):
1. **KHÔNG TÓM TẮT TOÀN BỘ VĂN BẢN**. Chỉ lấy đúng nội dung Điều được hỏi + các Khoản của nó + các Điều liên quan trực tiếp (nếu có trong ngữ cảnh).
2. **CẤM** cố tình liệt kê 8 Chương + 95 Điều khi người dùng chỉ hỏi 1 Điều.
3. Nếu người dùng hỏi theo dạng "X được quy định cụ thể ở đâu" (theo dõi câu hỏi trước), bạn PHẢI trả lời:
   - Trích dẫn chính xác **tên Điều, khoản, con, điểm** có nội dung đó (TỪ DỮ LIỆU BÊN DƯỚI).
   - Nêu rõ **văn bản nào** (số hiệu, năm)
   - Trích dẫn nguyên văn nội dung.
4. Định dạng câu trả lời ngắn gọn, khoa học theo Markdown:
   - Giới thiệu 1 dòng: "Điều X của [Văn bản] quy định về..."
   - **Nội dung trích dẫn Điều/Khoản:** dùng blockquote hoặc list theo khoản
   - **Liên kết chéo gợi ý (nếu có):** 1-3 liên kết tới các Điều/các văn bản khác có chủ đề tương tự nằm trong ngữ cảnh.
5. Nếu ngữ cảnh không có thông tin: nói rõ "Không tìm thấy Điều phù hợp trong kho dữ liệu nạp vào".

[NGỮ CẢNH ĐÃ TRUY XUẤT TỪ CSDL (CHỈ DỰA VÀO ĐÂY)]:
${ctx}
`.trim();

    const crossRefPrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật. Nhiệm vụ: TÌM LIÊN KẾT CHÉO GIỮA CÁC VĂN BẢN / CÁC ĐIỀU.
RULES:
1. Dựa TỐT ĐẾN ngữ cảnh bên dưới, xác định những điểm khớp với từ khóa câu hỏi.
2. Mỗi liên kết ghi rõ: **Văn bản số hiệu → Điều X → Tóm tắt 1-2 câu → Điểm chung/khác biệt.**
3. Sắp xếp theo mức độ liên quan (cao nhất lên trên).
4. Không tóm tắt toàn bộ văn bản. Mỗi điều liên kết CHỈ 1 block ngắn.
5. Nếu không tìm thấy liên kết, nói rõ.

[NGỮ CẢNH ĐÃ TRUY XUẤT TỪ CSDL]:
${ctx}
`.trim();

    const documentSummaryPrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật. Nhiệm vụ: TÓM TẮT VĂN BẢN PHÁP LUẬT.
RULES:
1. Bố cục 3 phần:
   - **Thông tin văn bản:** số hiệu, cơ quan ban hành, ngày ban hành, ngày hiệu lực, tổng số Chương/Điều (nếu biết).
   - **Nội dung quy định chính:** nhóm theo Chương, mỗi Chương tóm tắt 2-4 dòng (không quá chi tiết).
   - **Điểm mới & cần lưu ý:** 3-7 điểm then chốt ảnh hưởng trực tiếp đến thực thi.
2. Nếu ngữ cảnh có quá ít thông tin → nói rõ "Ngữ cảnh hạn chế, tóm tắt dựa trên phần đã nạp".

[NGỮ CẢNH ĐÃ TRUY XUẤT TỪ CSDL]:
${ctx}
`.trim();

    const generalPrompt = `
Bạn là Trợ lý Pháp lý & Kỹ thuật Xây dựng Việt Nam.
RULES:
1. Dựa TỐT ĐẾN dữ liệu bên dưới. Ưu tiên thông tin có trong [CTX*].
2. Nếu không có → nói rõ "Không tìm thấy trong kho dữ liệu nạp vào", tóm tắt ngắn bằng kiến thức phổ thông và ghi chú nguồn.
3. Trích dẫn chính xác **[Văn bản → Điều → Khoản]** đối với mỗi ý bạn nêu ra.
4. Câu trả lời ngắn gọn, cấu trúc từng ý, không lan man.

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

    // Parse ý định
    const intent = this.parseQueryIntention(safeMsg);
    console.log('[LegalAI] Intention:', intent);

    // Thu thập ngữ cảnh
    const ctx = await this.collectContext(safeMsg, intent);
    console.log(`[LegalAI] Context nodes=${ctx.usedNodes.length}, chars=${ctx.text.length}`);

    // Build system prompt động
    const systemPrompt = this.buildSystemPrompt(intent.mode, ctx.text);

    // Xây dựng messages (chat-history + user hiện tại)
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

    // Lưu lại lịch sử & last nodes
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
  // GỌI API CÁC PROVIDER (đã hỗ trợ chat history đúng format)
  // ============================================================
  async callGemini(systemPrompt, history, userMessage) {
    const apiKey = this.safeString(this.config.geminiApiKey);
    if (!apiKey) throw new Error('Chưa cấu hình Gemini API Key. Vào Cài đặt (bánh răng) → AI BYOK để nhập.');

    const model = this.safeString(this.config.geminiModel) || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Build contents[] theo lịch sử, và đặt system prompt vào đầu + cuối (Gemini không có role system)
    const contents = [];
    // Inject system vào đầu user prompt đầu tiên
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
    // Lượt hiện tại
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
  // Markdown Render + NÚT LINK TRỰC TÍNH (Điều 5 → click mở ngay)
  // ============================================================
  renderMarkdownWithCitations(markdownText) {
    const text = this.safeString(markdownText);
    if (!text) return '';

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

    // Regex thông minh hơn: [Điều 5], [Điều 10, Luật 135/2025], [Khoản 2 Điều 7, NĐ 33/2025]
    // => click navigate
    const docCodeRegex = /(?:(?:Luật|Nghị\s*định|Thông\s*tư|Quyết\s*định|Quy\s*chế|TCVN|QCVN|TCXDVN)\s+)?\d{2,4}[\/\-_]\d{2,4}(?:[\/\-_][A-Za-zĐđ\-]+)?/i;
    const citationRegex = /\[((?:Khoản\s+\d+\s+)?Điều\s+\d+[a-z]?|Điểm\s+[a-zđ]+(?:\.\d+)?|Khoản\s+\d+)(?:\s*,\s*([^\]]+))?\]/gi;

    const lastDocCode = this.lastDocFocus?.docCode || '';

    return html.replace(citationRegex, (match, entityPart, docPart) => {
      // Trích con số bài / điểm
      const parts = [];
      const artM = entityPart.match(/Điều\s+(\d+[a-z]?)/i);
      if (artM) parts.push({ type: 'art', value: artM[1].toUpperCase() });

      const khoanM = entityPart.match(/Khoản\s+(\d+)/i);
      if (khoanM) parts.push({ type: 'khoan', value: khoanM[1] });

      const diemM = entityPart.match(/Điểm\s+([a-zđ]+(?:\.\d+)?)/i);
      if (diemM) parts.push({ type: 'diem', value: diemM[1].toUpperCase() });

      const targetArtNum = (artM || [])[1] || '';

      // Ưu tiên docPart trong ngoặc, sau đó lastDocFocus
      let displayDoc = docPart || lastDocCode || '';
      if (docPart) {
        const m2 = docPart.match(docCodeRegex);
        if (m2) displayDoc = m2[0];
      }

      const docHint = displayDoc ? ` (${displayDoc})` : '';
      const safeArt = (targetArtNum || '').replace(/'/g, "\\'");
      const safeDoc = (displayDoc || lastDocCode || '').replace(/'/g, "\\'");
      const onclick = `try{window.LegalApp&&(window.LegalApp.state.selectedNodeTarget={docCode:'${safeDoc}',art:'${safeArt}'})&&window.LegalApp.openDocument&&window.LegalApp.selectArticleFromExternal&&window.LegalApp.selectArticleFromExternal('${safeDoc}','${safeArt}');}catch(e){}`;
      return `<button class="legal-ref inline-flex items-center gap-1 font-semibold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer bg-blue-500/5 px-1.5 rounded" onclick="${onclick}" title="Click để mở ${entityPart}${docHint} ngay trong xem">🔗 ${match}</button>`;
    });
  }
};

window.LegalAI = LegalAI;
