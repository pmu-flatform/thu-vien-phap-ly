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

      this.nodesIndex = nodes.map(n => {
        const parentDoc = docMap.get(n.docId) || {};
        return {
          id: n.id,
          docId: n.docId,
          docCode: parentDoc.code || '',
          docTitle: parentDoc.title || '',
          nodeType: n.nodeType,
          num: n.num,
          title: n.title,
          content: n.content,
          fullRef: n.fullRef,
          searchStr: `${parentDoc.code || ''} ${parentDoc.title || ''} ${n.fullRef || ''} ${n.title || ''} ${n.content || ''}`.toLowerCase()
        };
      });

      this.isIndexed = true;
      console.log(`Indexed ${this.docsIndex.length} documents and ${this.nodesIndex.length} nodes for search.`);
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
   * Retrieve Top 3-5 Relevant Nodes for Client-Side RAG AI Copilot
   */
  async retrieveContextForRAG(query, topK = 4) {
    if (!this.isIndexed) {
      await this.buildIndex();
    }

    const q = query.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(t => t.length > 1);

    if (terms.length === 0) {
      return [];
    }

    // Score nodes based on match counts and relevance
    const scoredNodes = this.nodesIndex.map(node => {
      let score = 0;
      const text = node.searchStr;

      // Exact phrase match bonus
      if (text.includes(q)) score += 20;

      // Match in fullRef or title bonus
      terms.forEach(term => {
        if (node.docCode.toLowerCase().includes(term)) score += 8;
        if ((node.fullRef || '').toLowerCase().includes(term)) score += 10;
        if ((node.title || '').toLowerCase().includes(term)) score += 6;

        // Content occurrence count
        const occurrences = text.split(term).length - 1;
        score += Math.min(occurrences * 2, 10);
      });

      return { node, score };
    });

    // Filter nodes with score > 0, sort by highest score, take topK
    const relevant = scoredNodes
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.node);

    return relevant;
  }
};

window.LegalSearch = LegalSearch;
