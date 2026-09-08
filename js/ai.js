/**
 * Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật
 * AI Copilot - Safe Robust DOM & Full Context Engine (Zero Trim Crash)
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
    temperature: 0.1
  },

  init() {
    this.loadConfig();
  },

  loadConfig() {
    try {
      const saved = localStorage.getItem('legal_ai_config');
      if (saved) {
        this.config = Object.assign({}, this.config, JSON.parse(saved));
      }
    } catch (e) {
      console.error('Lỗi khi nạp cấu hình AI:', e);
    }
  },

  saveConfig(newConfig) {
    this.config = Object.assign({}, this.config, newConfig);
    localStorage.setItem('legal_ai_config', JSON.stringify(this.config));
  },

  // Hàm chuỗi an toàn tuyệt đối
  safeString(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  },

  extractNumbers(text) {
    const s = this.safeString(text);
    if (!s) return [];
    const matches = s.match(/\d+/g) || [];
    return matches.filter(n => n.length >= 2);
  },

  /**
   * Thu thập ngữ cảnh an toàn 100% không lo lỗi trim()
   */
  async collectContext(userMessage) {
    const contextParts = [];
    const safeMsg = this.safeString(userMessage);
    const queryNumbers = this.extractNumbers(safeMsg);

    // 1. LẤY TRỰC TIẾP TỪ MÀN HÌNH ĐANG HIỂN THỊ
    try {
      const viewport = document.getElementById('document-viewport') || 
                       document.querySelector('main') || 
                       document.querySelector('#doc-content') ||
                       document.querySelector('.overflow-y-auto');
      
      const screenText = this.safeString(viewport?.innerText);
      if (screenText.length > 50) {
        contextParts.push(`[NỘI DUNG VĂN BẢN TRÊN MÀN HÌNH]:\n${screenText.slice(0, 35000)}`);
      }
    } catch (err) {
      console.warn('Lỗi đọc viewport:', err);
    }

    // 2. LẤY CÂY MỤC LỤC TRÊN GIAO DIỆN
    try {
      const tocNodes = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const txt = this.safeString(el?.innerText);
          return el.children.length === 0 && /^(Điều\s+\d+|CHƯƠNG\s+[IVXLCDM]+)/i.test(txt);
        })
        .map(el => this.safeString(el?.innerText))
        .filter(Boolean);

      if (tocNodes.length > 0) {
        const uniqueToc = [...new Set(tocNodes)];
        contextParts.push(`[CẤU TRÚC MỤC LỤC CÁC ĐIỀU]:\n${uniqueToc.join('\n')}`);
      }
    } catch (err) {
      console.warn('Lỗi đọc TOC DOM:', err);
    }

    // 3. TÌM KIẾM TRONG MẢNG PRELOADED_DOCS
    try {
      if (typeof PRELOADED_DOCS !== 'undefined' && Array.isArray(PRELOADED_DOCS)) {
        for (const num of queryNumbers) {
          const matched = PRELOADED_DOCS.find(d => {
            const code = this.safeString(d?.docCode);
            const title = this.safeString(d?.docTitle);
            return code.includes(num) || title.includes(num);
          });
          if (matched && matched.content) {
            contextParts.push(`[DỮ LIỆU KHO VB ${this.safeString(matched.docCode)}]:\n${this.safeString(matched.content).slice(0, 20000)}`);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('Lỗi đọc PRELOADED_DOCS:', err);
    }

    // 4. TÌM KIẾM TRONG INDEXEDDB
    try {
      if (typeof LegalDB !== 'undefined' && LegalDB.db && queryNumbers.length > 0) {
        const allDocs = await LegalDB.db.documents.toArray();
        for (const num of queryNumbers) {
          const doc = allDocs.find(d => {
            const code = this.safeString(d?.docCode);
            const title = this.safeString(d?.docTitle);
            return code.includes(num) || title.includes(num);
          });
          if (doc) {
            const nodes = await LegalDB.db.nodes.where('docId').equals(doc.id).toArray();
            if (nodes && nodes.length > 0) {
              const fullText = nodes.map(n => `[${this.safeString(n.fullRef)} - ${this.safeString(n.title)}]:\n${this.safeString(n.content)}`).join('\n\n');
              contextParts.push(`[DỮ LIỆU CƠ SỞ DỮ LIỆU ${this.safeString(doc.docCode)}]:\n${fullText.slice(0, 30000)}`);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Lỗi đọc IndexedDB:', err);
    }

    return contextParts.join('\n\n========================================\n\n');
  },

  async sendMessage(userMessage) {
    const safeMsg = this.safeString(userMessage);
    const contextData = await this.collectContext(safeMsg);

    const systemPrompt = `Bạn là Trợ lý Cố vấn Pháp lý & Tiêu chuẩn Kỹ thuật Xây dựng (Legal Copilot).
Tất cả các văn bản được cung cấp dưới đây là văn bản pháp luật THỰC TẾ ĐÃ NẠP VÀO HỆ THỐNG.

QUY TẮC PHẢN HỒI (BẮT BUỘC):
1. KHÔNG gửi lời chào hay tự giới thiệu. Đi thẳng vào nội dung phân tích từ câu đầu tiên.
2. TUYỆT ĐỐI KHÔNG từ chối trả lời, hãy đọc trực tiếp dữ liệu được cung cấp dưới đây.
3. Bố cục câu trả lời:
   - **Tên & Cấu trúc tổng thể**: Nêu rõ số hiệu, tổng số Chương và tổng số Điều (từ Điều 1 đến Điều bao nhiêu).
   - **Nội dung quy định trọng tâm**: Tóm tắt lần lượt các nhóm Điều từ đầu đến cuối có trong dữ liệu.
   - **Các điểm mới & Điểm cần lưu ý**: Nêu rõ quy định then chốt, thời hạn, trách nhiệm thực thi.
4. Trình bày bằng Markdown khoa học, rõ ràng.

[DỮ LIỆU NỘI DUNG VĂN BẢN PHÁP LUẬT ĐÃ NẠP]:
${contextData || '(Không tìm thấy ngữ cảnh cục bộ, hãy phân tích dựa trên kiến thức pháp lý chung).'}`;

    let reply = '';
    const provider = this.config.provider;

    if (provider === 'gemini') {
      reply = await this.callGemini(systemPrompt, safeMsg);
    } else if (provider === 'openai') {
      reply = await this.callOpenAI(systemPrompt, safeMsg);
    } else {
      reply = await this.callCustomOpenAI(systemPrompt, safeMsg);
    }

    return { reply };
  },

  async callGemini(systemPrompt, userMessage) {
    const apiKey = this.safeString(this.config.geminiApiKey);
    if (!apiKey) throw new Error('Chưa cấu hình Gemini API Key! Vui lòng vào Cài đặt để nhập API Key.');

    const model = this.safeString(this.config.geminiModel) || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nYÊU CẦU: ${userMessage}` }] }],
        generationConfig: { 
          temperature: this.config.temperature || 0.1, 
          maxOutputTokens: 4096 
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Lỗi Gemini API: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không nhận được phản hồi từ Gemini.';
  },

  async callOpenAI(systemPrompt, userMessage) {
    const apiKey = this.safeString(this.config.openaiApiKey);
    if (!apiKey) throw new Error('Chưa cấu hình OpenAI API Key!');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.safeString(this.config.openaiModel) || 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        temperature: this.config.temperature || 0.1,
        max_tokens: 4096
      })
    });

    if (!response.ok) throw new Error(`Lỗi OpenAI API: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Không có phản hồi từ OpenAI.';
  },

  async callCustomOpenAI(systemPrompt, userMessage) {
    let endpoint = (this.safeString(this.config.customEndpoint) || 'https://api.agnes.ai/v1').replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) endpoint += '/chat/completions';

    const headers = { 'Content-Type': 'application/json' };
    if (this.config.openaiApiKey) headers['Authorization'] = `Bearer ${this.safeString(this.config.openaiApiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: this.safeString(this.config.customModel) || 'agnes-2.0-flash',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        temperature: this.config.temperature || 0.1,
        max_tokens: 4096
      })
    });

    if (!response.ok) throw new Error(`Lỗi Custom API: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Không có phản hồi từ AI.';
  },

  renderMarkdownWithCitations(markdownText) {
    const text = this.safeString(markdownText);
    if (!text) return '';
    
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.*$)/gim, '<h4 class="font-bold text-sm mt-3 mb-1 text-blue-400">$1</h4>')
      .replace(/^## (.*$)/gim, '<h3 class="font-bold text-base mt-4 mb-2 text-gray-100">$1</h3>')
      .replace(/^# (.*$)/gim, '<h2 class="font-bold text-lg mt-4 mb-2 text-white">$1</h2>')
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^\s*[\-\*]\s+(.*)$/gim, '<li class="ml-4 list-disc text-gray-300 my-0.5">$1</li>')
      .replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li class="ml-4 list-decimal text-gray-300 my-0.5">$2</li>')
      .replace(/\n\n+/g, '</p><p class="mb-2">')
      .replace(/\n/g, '<br/>');

    html = `<p class="mb-2">${html}</p>`;
    const citationRegex = /\[(Điều\s+\d+[a-z]?)(?:,\s*([^\]]+))?\]/gi;
    return html.replace(citationRegex, (match, article, docCode) => {
      const artNum = this.safeString(article).replace(/^Điều\s+/i, '');
      const targetDoc = this.safeString(docCode);
      return `<button class="legal-ref inline-flex items-center gap-1 font-semibold text-blue-400 hover:underline cursor-pointer" onclick="window.LegalApp?.navigateToNode?.('${targetDoc}', '${artNum}')" title="Bấm để xem ${article}">🔗 ${match}</button>`;
    });
  }
};

window.LegalAI = LegalAI;