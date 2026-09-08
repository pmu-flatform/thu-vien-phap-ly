/**
 * Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật
 * Full-Text Search Engine & RAG Context Retriever
 */

const LegalSearch = {
  docsIndex: [],
  nodesIndex: [],
  isIndexed: false,

  /**
   * Rebuild the in-memory search index from IndexedDB
   */
  async buildIndex() {
    try {
      const docs = await (LegalDB?.db?.documents || db.documents).toArray();
      const nodes = await (LegalDB?.db?.document_nodes || db.document_nodes).toArray();

      // Create a doc lookup map
      const docMap = new Map();
      docs.forEach(d => docMap.set(d.id, d));

      this.docsIndex = docs.map(d => ({
        id: d.id,
        code: d.code,
        title: d.title,
        docType: d.docType,
        issuer: d.issuer,
        searchStr: `${d.code} ${d.title} ${d.issuer} ${d.docType}`.toLowerCase()
      }));

      let legacyCount = 0;
      this.nodesIndex = nodes.map(n => {
        const parentDoc = docMap.get(n.docId) || {};
        // === DUAL-FORMAT FALLBACK (new schema vs legacy rebuild script): ===
        // New schema fields: n.nodeType (article/chapter/section), n.num (số không prefix), n.fullRef ("Điều 5"/"Chương I"), n.order
        // Legacy fields      : n.level (dieu/chuong/muc),              n.number ("Điều 5"/"Chương I"),    (no num, no order)
        const rawNodeType = n.nodeType || n.level;
        let effNodeType = rawNodeType;
        if (effNodeType === 'dieu') effNodeType = 'article';
        else if (effNodeType === 'chuong') effNodeType = 'chapter';
        else if (effNodeType === 'muc') effNodeType = 'section';
        else if (!effNodeType) effNodeType = 'article';

        // num: số (sau khi bỏ prefix)
        let effNum = n.num;
        if (!effNum && n.number) {
          const mLegacy = String(n.number).match(/^(Chương|Điều|Mục|Phần|PHẦN)\s*([\w\.\-]+)/i);
          effNum = mLegacy ? mLegacy[2].toUpperCase() : String(n.number).trim();
        }
        if (!effNum) effNum = '';

        // fullRef: "Điều 5" / "Chương I" ...
        let effFullRef = n.fullRef;
        if (!effFullRef && n.number) {
          effFullRef = String(n.number).trim();
        } else if (!effFullRef && effNum) {
          if (effNodeType === 'chapter') effFullRef = `Chương ${effNum}`;
          else if (effNodeType === 'section') effFullRef = `Mục ${effNum}`;
          else effFullRef = `Điều ${effNum}`;
        }
        if (!effFullRef) effFullRef = '';

        if (n.level || n.number || !n.nodeType) legacyCount++;  // stats only

        const effContent = n.content || '';
        const effTitle = n.title || '';
        const docCode = parentDoc.code || '';
        const docTitle = parentDoc.title || '';
        return {
          id: n.id,
          docId: n.docId,
          docCode: docCode,
          docTitle: docTitle,
          nodeType: effNodeType,
          num: String(effNum),
          title: effTitle,
          content: effContent,
          fullRef: effFullRef,
          searchStr: `${docCode} ${docTitle} ${effFullRef} ${effTitle} ${effContent}`.toLowerCase()
        };
      });

      this.isIndexed = true;
      console.log(`[LegalSearch] Indexed ${this.docsIndex.length} documents and ${this.nodesIndex.length} nodes. Legacy-schema nodes normalized: ${legacyCount}. Sample[0].fullRef=${this.nodesIndex[0]?.fullRef || '(none)'}. Sample Điều 5: ${(this.nodesIndex.find(n => (n.fullRef || '').toUpperCase() === 'ĐIỀU 5') || {}).fullRef || '(not found - check fallback)'}.`);
    } catch (e) {
      console.error('Error building search index:', e);
    }
  },

  /**
   * Global Search (used for Ctrl + K Search Modal)
   */
  async search(query, maxResults = 20) {
    if (!this.isIndexed) {
      await this.buildIndex();
    }

    if (!query || !query.trim()) {
      return { docResults: [], nodeResults: [] };
    }

    const q = query.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(t => t.length > 0);

    // 1. Search in documents
    const docResults = this.docsIndex.filter(d => {
      return terms.every(term => d.searchStr.includes(term));
    }).slice(0, 10);

    // 2. Search in document nodes (Articles, Chapters, Preamble)
    const nodeResults = this.nodesIndex.filter(n => {
      return terms.every(term => n.searchStr.includes(term));
    }).map(n => {
      // Create a snippet with highlighted context
      let snippet = n.content || n.title || '';
      if (snippet.length > 180) {
        const firstTerm = terms[0];
        const matchIdx = snippet.toLowerCase().indexOf(firstTerm);
        if (matchIdx > -1) {
          const start = Math.max(0, matchIdx - 40);
          const end = Math.min(snippet.length, matchIdx + 120);
          snippet = (start > 0 ? '...' : '') + snippet.substring(start, end) + (end < snippet.length ? '...' : '');
        } else {
          snippet = snippet.substring(0, 160) + '...';
        }
      }
      return {
        ...n,
        snippet
      };
    }).slice(0, maxResults);

    return { docResults, nodeResults };
  },

  /**
   * Retrieve Top N Relevant Nodes for Client-Side RAG AI Copilot
   *
   * Cascade 4-layer retrieval:
   *   1. Explicit "Điều X / Khoản Y" extraction (regex) - 100% match, BYPASS scoring
   *   2. Scoring algorithm on remaining terms
   *   3. Fuzzy prefix-match on article numbers if still empty
   *   4. Active-document nodes (if user already has 1 VB open)
   */
  async retrieveContextForRAG(query, topK = 4, opts = {}) {
    if (!this.isIndexed) await this.buildIndex();
    const activeDocId = opts.activeDocId || null;
    const q = query.toLowerCase().trim();
    if (!q) return [];

    // Layer 0: Extract EXPLICIT target references (regex, highest priority - no scoring needed)
    // Matches: điều 5 / điều 10a / khoản 2 điều 7 / điểm a.3 / chương iv / luat 135/2025 / ND 33/2025
    const explicitRefs = [];
    const regexes = [
      { re: /điề?u\s*(\d+[a-z]?)/gi, prefix: 'ĐIỀU ' },
      { re: /khoả?n\s*(\d+)/gi, prefix: 'KHOẢN ' },
      { re: /điểm\s*([a-zđ]+(?:\.\d+)?)/gi, prefix: 'ĐIỂM ' },
      { re: /chươ?ng\s*([ivxlcdm]+|\d+)/gi, prefix: 'CHƯƠNG ' }
    ];
    for (const { re, prefix } of regexes) {
      const matches = [...q.matchAll(re)];
      for (const m of matches) {
        const val = (m[1] || '').toUpperCase();
        if (val) explicitRefs.push(prefix + val);
      }
    }

    // Collect exact-ref matches first (if any explicit target was requested)
    const exactMatchNodes = [];
    if (explicitRefs.length > 0) {
      this.nodesIndex.forEach(n => {
        const refArea = `${n.fullRef || ''} ${n.title || ''}`.toUpperCase();
        for (const r of explicitRefs) {
          // End boundary to avoid 10 matches 15
          if (refArea.includes(r + ' ') || refArea.includes(r + '.') || refArea.endsWith(r) || refArea.includes(r + ':')) {
            exactMatchNodes.push(n);
            break;
          }
        }
      });
      // Boost: if only 1 doc is active, prefer exact matches from that doc FIRST
      if (activeDocId) {
        const inActive = exactMatchNodes.filter(n => String(n.docId) === String(activeDocId));
        const others = exactMatchNodes.filter(n => String(n.docId) !== String(activeDocId));
        exactMatchNodes.length = 0;  // clear, replace ordered
        exactMatchNodes.push(...inActive, ...others);
      }
    }

    // Layer 1: Scoring for fuzzy matches (always computed)
    let terms = q.split(/[\s,.!?;:()\[\]\/\-"'“”‘’]+/).filter(t => t.length > 0);
    // Remove Vietnamese stopwords but KEEP numbers & single-digit (e.g. "5") for article context
    const stopWords = new Set([
      'và','hoặc','là','của','trong','với','cho','được','từ','đến','đã','sẽ','không','có','nhưng',
      'này','đó','về','ở','theo','tại','để','một','các','những','nào','thì','cũng','còn','hay',
      'rằng','lúc','khi','vậy','do','vì','sau','trước','nếu','mà','thôi','nữa','tôi','bạn','hỏi',
      'giải','đáp','thuật','ngữ','văn','bản','luật','nghị','định','thông','tư','quy','chuẩn','tcvn',
      'qcvn','tcxdvn','cái','gì','điều'  // last 4 keep terms below, but removed as stopwords
    ]);
    const filteredTerms = terms.filter(t => !stopWords.has(t));
    const scoreTerms = filteredTerms.length > 0 ? filteredTerms : terms; // fallback keep all if no keywords left

    const scoredNodes = this.nodesIndex.map(node => {
      let score = 0;
      const text = node.searchStr;

      // Phrase substring (not exact full q): check q without punctuation substrings
      const qNoPunct = q.replace(/[,.!?;:()\[\]\/\-"'“”‘’]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.includes(qNoPunct)) score += 20;

      // Partial phrase: remove top 2 stopwords phrase tail
      if (score === 0) {
        const corePhrase = terms.slice(0, Math.min(3, terms.length)).join(' ');
        if (corePhrase && text.includes(corePhrase)) score += 12;
      }

      scoreTerms.forEach(term => {
        if (term.length === 0) return;
        if (node.docCode.toLowerCase().includes(term)) score += 8;
        const fullRef = (node.fullRef || '').toLowerCase();
        if (fullRef.includes(term)) score += 10;
        const title = (node.title || '').toLowerCase();
        if (title.includes(term)) score += 6;
        // Boost: term is an article number + found as "điều {term}" in fullRef
        if (/^\d+[a-z]?$/i.test(term) && fullRef.includes(`điều ${term}`)) score += 15;
        const occurrences = text.split(term).length - 1;
        score += Math.min(occurrences * 2, 10);
      });

      // Weight active document +2 if user is viewing it (context priority)
      if (activeDocId && String(node.docId) === String(activeDocId) && score > 0) score += 4;

      return { node, score };
    });

    const scoredTop = scoredNodes
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK + 6)
      .map(item => item.node);

    // Merge (dedup): exact matches FIRST, then scored top remainder
    const merged = [];
    const seenIds = new Set();
    const addUnique = (n) => {
      if (!n || !n.id) return;
      const k = String(n.id);
      if (seenIds.has(k)) return;
      seenIds.add(k);
      merged.push(n);
    };
    exactMatchNodes.forEach(addUnique);
    scoredTop.forEach(addUnique);

    // Layer 3: still empty + have activeDocId + explicitRefs -> fallback scan active doc nodes directly by fullRef text (avoid Dexie filter issues)
    if (merged.length === 0 && activeDocId && explicitRefs.length > 0) {
      const activeNodes = this.nodesIndex.filter(n => String(n.docId) === String(activeDocId));
      activeNodes.forEach(n => {
        const refArea = `${n.fullRef || ''} ${n.title || ''}`.toUpperCase();
        if (explicitRefs.some(r => refArea.includes(r) || refArea.includes(r.split(' ')[0] + ' ' + r.split(' ')[1]))) {
          addUnique(n);
        }
      });
    }

    return merged.slice(0, topK + 2);
  }
};

window.LegalSearch = LegalSearch;
