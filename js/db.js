/**
 * Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật
 * Database Layer using Dexie.js (IndexedDB wrapper)
 */

const db = new Dexie('LegalLibraryDB');

db.version(1).stores({
  categories: '++id, &name, icon, order',
  documents: '++id, &code, title, docType, issuer, issueDate, effectiveDate, status, *categoryIds, createdAt',
  document_nodes: '++id, docId, nodeType, num, title, order, fullRef, [docId+order]',
  legal_relations: '++id, sourceDocId, targetDocCode, targetArticle, relationType',
  notes_bookmarks: '++id, docId, nodeNum, type, updatedAt, [docId+nodeNum+type]'
});

// Version 2: Relax unique constraint on code to support multi-part documents and amendments
db.version(2).stores({
  categories: '++id, name, icon, order',
  documents: '++id, code, title, docType, issuer, issueDate, effectiveDate, status, *categoryIds, createdAt',
  document_nodes: '++id, docId, nodeType, num, title, order, fullRef, [docId+order]',
  legal_relations: '++id, sourceDocId, targetDocCode, targetArticle, relationType',
  notes_bookmarks: '++id, docId, nodeNum, type, updatedAt, [docId+nodeNum+type]'
});

// Default Categories (Đã tạm gỡ nhóm Định mức - Dự toán để xây dựng module riêng)
const PRE_SEEDED_CATEGORIES = [
  { id: 1, name: 'Luật - Bộ Luật', icon: 'scale', order: 1 },
  { id: 2, name: 'Nghị định Chính phủ', icon: 'file-text', order: 2 },
  { id: 3, name: 'Thông tư các Bộ', icon: 'book-open', order: 3 },
  { id: 4, name: 'Văn bản Bộ / Địa phương', icon: 'landmark', order: 4 },
  { id: 5, name: 'QCVN - Quy chuẩn kỹ thuật', icon: 'shield-check', order: 5 },
  { id: 6, name: 'TCVN - Tiêu chuẩn quốc gia', icon: 'award', order: 6 },
  { id: 8, name: 'An toàn - Môi trường', icon: 'leaf', order: 7 },
  { id: 9, name: 'Phòng cháy chữa cháy (PCCC)', icon: 'flame', order: 8 },
  { id: 10, name: 'Quản lý Dự án & Đấu thầu', icon: 'briefcase', order: 9 }
];

/**
 * Seed initial sample documents to demonstrate cross-reference, hierarchy & search
 */
const SAMPLE_DOCUMENTS = [
  {
    doc: {
      code: '50/2014/QH13',
      title: 'Luật Xây dựng năm 2014 (được sửa đổi, bổ sung bởi Luật số 62/2020/QH14)',
      docType: 'Luật',
      issuer: 'Quốc hội',
      issueDate: '2014-06-18',
      effectiveDate: '2015-01-01',
      status: 'active',
      categoryIds: [1, 10],
      metadata: { signer: 'Nguyễn Sinh Hùng', totalArticles: 5, totalClauses: 12 }
    },
    nodes: [
      {
        nodeType: 'preamble',
        num: '',
        title: 'Căn cứ ban hành',
        content: 'Căn cứ Hiến pháp nước Cộng hòa xã hội chủ nghĩa Việt Nam;\nQuốc hội ban hành Luật Xây dựng.',
        order: 1,
        fullRef: 'Căn cứ'
      },
      {
        nodeType: 'chapter',
        num: 'I',
        title: 'NHỮNG QUY ĐỊNH CHUNG',
        content: 'Chương I: Những quy định chung về hoạt động đầu tư xây dựng.',
        order: 2,
        fullRef: 'Chương I'
      },
      {
        nodeType: 'article',
        num: '1',
        title: 'Phạm vi điều chỉnh',
        content: 'Luật này quy định về quyền, nghĩa vụ, trách nhiệm của cơ quan, tổ chức, cá nhân và quản lý nhà nước trong hoạt động đầu tư xây dựng.',
        order: 3,
        fullRef: 'Điều 1'
      },
      {
        nodeType: 'article',
        num: '4',
        title: 'Nguyên tắc cơ bản trong hoạt động đầu tư xây dựng',
        content: '1. Bảo đảm đầu tư xây dựng công trình theo quy hoạch, thiết kế, bảo vệ cảnh quan, môi trường; phù hợp với điều kiện tự nhiên, xã hội, đặc điểm văn hóa của từng địa phương; kết hợp phát triển kinh tế - xã hội với quốc phòng, an ninh.\n2. Tuân thủ tiêu chuẩn, quy chuẩn kỹ thuật theo quy định tại Luật số 68/2006/QH11 về Tiêu chuẩn và Quy chuẩn kỹ thuật.\n3. Bảo đảm chất lượng, tiến độ, an toàn công trình, tính mạng, sức khỏe con người và tài sản; phòng, chống cháy, nổ, bảo vệ môi trường theo quy định tại Nghị định số 15/2021/NĐ-CP.',
        order: 4,
        fullRef: 'Điều 4'
      },
      {
        nodeType: 'article',
        num: '12',
        title: 'Các hành vi bị nghiêm cấm',
        content: '1. Quyết định đầu tư xây dựng không đúng với quy định của Luật này.\n2. Khởi công xây dựng công trình khi chưa đủ điều kiện khởi công theo quy định tại Điều 107 của Luật này.\n3. Xây dựng công trình trong khu vực cấm xây dựng; xây dựng công trình lấn chiếm hành lang bảo vệ công trình quốc phòng, an ninh, giao thông, thủy lợi, đê điều, năng lượng, khu di tích lịch sử - văn hóa.\n4. Áp dụng sai định mức, đơn giá xây dựng không theo Thông tư số 12/2021/TT-BXD.',
        order: 5,
        fullRef: 'Điều 12'
      },
      {
        nodeType: 'chapter',
        num: 'VII',
        title: 'THI CÔNG XÂY DỰNG CÔNG TRÌNH',
        content: 'Chương VII: Quy định về điều kiện khởi công, thi công, quản lý an toàn và nghiệm thu.',
        order: 6,
        fullRef: 'Chương VII'
      },
      {
        nodeType: 'article',
        num: '107',
        title: 'Điều kiện khởi công xây dựng công trình',
        content: '1. Việc khởi công xây dựng công trình phải bảo đảm các điều kiện sau đây:\na) Có mặt bằng xây dựng để bàn giao toàn bộ hoặc từng phần theo tiến độ xây dựng;\nb) Có giấy phép xây dựng đối với công trình phải có giấy phép xây dựng theo quy định tại Điều 89 của Luật này;\nc) Có thiết kế bản vẽ thi công của hạng mục công trình, công trình khởi công đã được phê duyệt;\nd) Có hợp đồng thi công xây dựng được ký kết giữa chủ đầu tư và nhà thầu được lựa chọn theo Luật số 22/2023/QH15;\nđ) Có biện pháp bảo đảm an toàn, bảo vệ môi trường trong quá trình thi công xây dựng theo QCVN 18:2021/BXD.\n2. Việc khởi công xây dựng nhà ở riêng lẻ chỉ cần đáp ứng điều kiện quy định tại Điểm b Khoản 1 Điều này.',
        order: 7,
        fullRef: 'Điều 107'
      }
    ],
    relations: [
      { targetDocCode: '15/2021/NĐ-CP', targetArticle: '', relationType: 'details' },
      { targetDocCode: '22/2023/QH15', targetArticle: '', relationType: 'references' },
      { targetDocCode: '12/2021/TT-BXD', targetArticle: '', relationType: 'references' },
      { targetDocCode: '68/2006/QH11', targetArticle: '', relationType: 'references' }
    ]
  },
  {
    doc: {
      code: '15/2021/NĐ-CP',
      title: 'Nghị định số 15/2021/NĐ-CP quy định chi tiết một số nội dung về quản lý dự án đầu tư xây dựng',
      docType: 'Nghị định',
      issuer: 'Chính phủ',
      issueDate: '2021-03-03',
      effectiveDate: '2021-03-03',
      status: 'active',
      categoryIds: [2, 10],
      metadata: { signer: 'Nguyễn Xuân Phúc', totalArticles: 4, totalClauses: 8 }
    },
    nodes: [
      {
        nodeType: 'preamble',
        num: '',
        title: 'Căn cứ ban hành',
        content: 'Căn cứ Luật Tổ chức Chính phủ ngày 19 tháng 6 năm 2015;\nCăn cứ Luật Xây dựng số 50/2014/QH13 đã được sửa đổi, bổ sung một số điều theo Luật số 62/2020/QH14;\nTheo đề nghị của Bộ trưởng Bộ Xây dựng;\nChính phủ ban hành Nghị định quy định chi tiết một số nội dung về quản lý dự án đầu tư xây dựng.',
        order: 1,
        fullRef: 'Căn cứ'
      },
      {
        nodeType: 'article',
        num: '1',
        title: 'Phạm vi điều chỉnh và đối tượng áp dụng',
        content: '1. Nghị định này quy định chi tiết thi hành một số nội dung của Luật số 50/2014/QH13 về lập, thẩm định, phê duyệt dự án đầu tư xây dựng; quản lý thực hiện dự án; điều kiện năng lực hoạt động xây dựng.\n2. Nghị định này áp dụng đối với cơ quan, tổ chức, cá nhân trong nước; tổ chức, cá nhân nước ngoài hoạt động đầu tư xây dựng trên lãnh thổ Việt Nam.',
        order: 2,
        fullRef: 'Điều 1'
      },
      {
        nodeType: 'article',
        num: '12',
        title: 'Lập Báo cáo nghiên cứu khả thi đầu tư xây dựng',
        content: '1. Chủ đầu tư hoặc cơ quan, tổ chức được giao nhiệm vụ chuẩn bị dự án có trách nhiệm lập Báo cáo nghiên cứu khả thi đầu tư xây dựng theo quy định tại Điều 52 Luật số 50/2014/QH13.\n2. Đối với dự án nhóm A, việc thẩm định phải tuân thủ nghiêm ngặt các yêu cầu an toàn PCCC theo quy định của Luật số 27/2001/QH10.',
        order: 3,
        fullRef: 'Điều 12'
      },
      {
        nodeType: 'article',
        num: '35',
        title: 'Sửa đổi, bổ sung một số điều của quy định về cấp phép xây dựng',
        content: '1. Điều này sửa đổi, bổ sung quy định chi tiết về hồ sơ đề nghị cấp giấy phép xây dựng quy định tại Nghị định số 59/2015/NĐ-CP.\n2. Việc cấp phép xây dựng phải đối chiếu phù hợp với quy hoạch chi tiết xây dựng theo quy định tại Điều 107 Luật số 50/2014/QH13.',
        order: 4,
        fullRef: 'Điều 35'
      }
    ],
    relations: [
      { targetDocCode: '50/2014/QH13', targetArticle: '107', relationType: 'details' },
      { targetDocCode: '59/2015/NĐ-CP', targetArticle: '', relationType: 'amends' }
    ]
  },
  {
    doc: {
      code: '22/2023/QH15',
      title: 'Luật Đấu thầu năm 2023',
      docType: 'Luật',
      issuer: 'Quốc hội',
      issueDate: '2023-06-23',
      effectiveDate: '2024-01-01',
      status: 'active',
      categoryIds: [1, 10],
      metadata: { signer: 'Vương Đình Huệ', totalArticles: 3, totalClauses: 6 }
    },
    nodes: [
      {
        nodeType: 'preamble',
        num: '',
        title: 'Căn cứ ban hành',
        content: 'Căn cứ Hiến pháp nước Cộng hòa xã hội chủ nghĩa Việt Nam;\nQuốc hội ban hành Luật Đấu thầu.',
        order: 1,
        fullRef: 'Căn cứ'
      },
      {
        nodeType: 'article',
        num: '1',
        title: 'Phạm vi điều chỉnh',
        content: 'Luật này quy định về quản lý nhà nước đối với hoạt động đấu thầu; thẩm quyền và trách nhiệm của các cơ quan, tổ chức, cá nhân trong hoạt động đấu thầu; hoạt động lựa chọn nhà thầu thực hiện gói thầu, hoạt động lựa chọn nhà đầu tư thực hiện dự án đầu tư kinh doanh.',
        order: 2,
        fullRef: 'Điều 1'
      },
      {
        nodeType: 'article',
        num: '16',
        title: 'Các hành vi bị cấm trong hoạt động đấu thầu',
        content: '1. Đưa, nhận, môi giới hối lộ.\n2. Lợi dụng chức vụ, quyền hạn để gây ảnh hưởng, can thiệp trái pháp luật vào hoạt động đấu thầu dưới mọi hình thức.\n3. Thông thầu bao gồm các hành vi thỏa thuận về việc rút khỏi việc dự thầu hoặc nộp hồ sơ dự thầu có giá cao bất thường.\n4. Cản trở hoạt động đấu thầu theo quy định tại Khoản 2 Điều 12 Luật số 50/2014/QH13.',
        order: 3,
        fullRef: 'Điều 16'
      }
    ],
    relations: [
      { targetDocCode: '50/2014/QH13', targetArticle: '12', relationType: 'references' }
    ]
  }
];

/**
 * Initialize Database and Pre-seed Data
 */
async function initDB() {
  try {
    // 1. Seed Categories if empty
    const catCount = await db.categories.count();
    if (catCount === 0) {
      await db.categories.bulkAdd(PRE_SEEDED_CATEGORIES);
      console.log('Seeded 10 default categories');
    }

    // 2. Check if full preloaded dataset exists in window.PRELOADED_LEGAL_DATA or /data/preloaded_data.json
    const docCount = await db.documents.count();
    if (docCount <= 3) {
      if (typeof window !== 'undefined' && window.PRELOADED_LEGAL_DATA && window.PRELOADED_LEGAL_DATA.data) {
        await importFullDatabase(window.PRELOADED_LEGAL_DATA);
        console.log(`Successfully loaded ${window.PRELOADED_LEGAL_DATA.data.documents.length} preloaded documents from window.PRELOADED_LEGAL_DATA!`);
        return;
      }

      try {
        const res = await fetch('data/preloaded_data.json');
        if (res.ok) {
          const fullDataset = await res.json();
          if (fullDataset && fullDataset.data && fullDataset.data.documents.length > 0) {
            await importFullDatabase(fullDataset);
            console.log(`Successfully loaded ${fullDataset.data.documents.length} preloaded documents from DATA!`);
            return;
          }
        }
      } catch (fetchErr) {
        console.log('No preloaded data found, falling back to sample docs.');
      }
    }

    // 3. Fallback Seed Sample Documents if empty
    if (docCount === 0) {
      for (const item of SAMPLE_DOCUMENTS) {
        const docId = await db.documents.add({
          ...item.doc,
          createdAt: new Date().toISOString()
        });

        if (item.nodes && item.nodes.length > 0) {
          const nodesWithDocId = item.nodes.map(n => ({ ...n, docId }));
          await db.document_nodes.bulkAdd(nodesWithDocId);
        }

        if (item.relations && item.relations.length > 0) {
          const relsWithDocId = item.relations.map(r => ({ ...r, sourceDocId: docId }));
          await db.legal_relations.bulkAdd(relsWithDocId);
        }
      }

      // Add a sample note
      const firstDoc = await db.documents.where('code').equals('50/2014/QH13').first();
      if (firstDoc) {
        await db.notes_bookmarks.add({
          docId: firstDoc.id,
          nodeNum: '107',
          type: 'note',
          content: 'Lưu ý khi lập biên bản khởi công: Phải kiểm tra đầy đủ giấy phép xây dựng và mặt bằng thực tế.',
          updatedAt: new Date().toISOString()
        });
      }
      console.log('Seeded sample documents');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

/**
 * Get all categories with dynamic document count
 */
async function getCategoriesWithCounts() {
  const categories = await db.categories.orderBy('order').toArray();
  const allDocs = await db.documents.toArray();
  
  return categories.map(cat => {
    const count = allDocs.filter(doc => doc.categoryIds && doc.categoryIds.includes(cat.id)).length;
    return { ...cat, count };
  });
}

/**
 * Get documents based on active category, search query, status or type
 */
async function getDocuments(filters = {}) {
  let collection = db.documents.toCollection();

  let docs = await collection.toArray();

  if (filters.categoryId) {
    docs = docs.filter(d => d.categoryIds && d.categoryIds.includes(Number(filters.categoryId)));
  }

  if (filters.status && filters.status !== 'all') {
    docs = docs.filter(d => d.status === filters.status);
  }

  if (filters.docType && filters.docType !== 'all') {
    docs = docs.filter(d => d.docType === filters.docType);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    docs = docs.filter(d => 
      (d.code && d.code.toLowerCase().includes(q)) || 
      (d.title && d.title.toLowerCase().includes(q))
    );
  }

  return docs.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
}

/**
 * Get full document details including its nodes, relations, and notes
 */
async function getDocumentFull(docId) {
  const doc = await db.documents.get(Number(docId));
  if (!doc) return null;

  const nodes = await db.document_nodes
    .where('docId')
    .equals(doc.id)
    .sortBy('order');

  const relations = await db.legal_relations
    .where('sourceDocId')
    .equals(doc.id)
    .toArray();

  // Also check incoming relations from other documents targeting this document
  const incomingRelations = await db.legal_relations
    .where('targetDocCode')
    .equals(doc.code)
    .toArray();

  const notes = await db.notes_bookmarks
    .where('docId')
    .equals(doc.id)
    .toArray();

  return {
    ...doc,
    nodes,
    relations,
    incomingRelations,
    notes
  };
}

/**
 * Save / Ingest a new document into DB
 */
async function saveDocument(docData, nodes = [], relations = []) {
  return await db.transaction('rw', db.documents, db.document_nodes, db.legal_relations, async () => {
    // Check if document code already exists
    const existing = await db.documents.where('code').equals(docData.code).first();
    let docId;

    if (existing) {
      docId = existing.id;
      await db.documents.update(docId, {
        ...docData,
        updatedAt: new Date().toISOString()
      });
      // Clear old nodes and relations
      await db.document_nodes.where('docId').equals(docId).delete();
      await db.legal_relations.where('sourceDocId').equals(docId).delete();
    } else {
      docId = await db.documents.add({
        ...docData,
        createdAt: new Date().toISOString()
      });
    }

    if (nodes.length > 0) {
      const nodesWithDocId = nodes.map(n => ({ ...n, docId }));
      await db.document_nodes.bulkAdd(nodesWithDocId);
    }

    if (relations.length > 0) {
      const relsWithDocId = relations.map(r => ({ ...r, sourceDocId: docId }));
      await db.legal_relations.bulkAdd(relsWithDocId);
    }

    return docId;
  });
}

/**
 * Delete a document and its dependent data
 */
async function deleteDocument(docId) {
  docId = Number(docId);
  return await db.transaction('rw', db.documents, db.document_nodes, db.legal_relations, db.notes_bookmarks, async () => {
    await db.documents.delete(docId);
    await db.document_nodes.where('docId').equals(docId).delete();
    await db.legal_relations.where('sourceDocId').equals(docId).delete();
    await db.notes_bookmarks.where('docId').equals(docId).delete();
  });
}

/**
 * Save user note or toggle bookmark
 */
async function saveNote(docId, nodeNum, content) {
  docId = Number(docId);
  nodeNum = String(nodeNum);
  const existing = await db.notes_bookmarks
    .where(['docId', 'nodeNum', 'type'])
    .equals([docId, nodeNum, 'note'])
    .first();

  if (existing) {
    if (!content || !content.trim()) {
      await db.notes_bookmarks.delete(existing.id);
      return null;
    } else {
      await db.notes_bookmarks.update(existing.id, {
        content,
        updatedAt: new Date().toISOString()
      });
      return existing.id;
    }
  } else if (content && content.trim()) {
    return await db.notes_bookmarks.add({
      docId,
      nodeNum,
      type: 'note',
      content,
      updatedAt: new Date().toISOString()
    });
  }
}

/**
 * Toggle bookmark for a document or article
 */
async function toggleBookmark(docId, nodeNum = '') {
  docId = Number(docId);
  nodeNum = String(nodeNum);
  const existing = await db.notes_bookmarks
    .where(['docId', 'nodeNum', 'type'])
    .equals([docId, nodeNum, 'bookmark'])
    .first();

  if (existing) {
    await db.notes_bookmarks.delete(existing.id);
    return false;
  } else {
    await db.notes_bookmarks.add({
      docId,
      nodeNum,
      type: 'bookmark',
      content: '',
      updatedAt: new Date().toISOString()
    });
    return true;
  }
}

/**
 * Export complete database to a single JSON object for backup
 */
async function exportFullDatabase() {
  const categories = await db.categories.toArray();
  const documents = await db.documents.toArray();
  const document_nodes = await db.document_nodes.toArray();
  const legal_relations = await db.legal_relations.toArray();
  const notes_bookmarks = await db.notes_bookmarks.toArray();

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appName: 'LegalLibraryApp',
    data: {
      categories,
      documents,
      document_nodes,
      legal_relations,
      notes_bookmarks
    }
  };
}

/**
 * Import and restore database from a JSON backup file
 */
async function importFullDatabase(backupData) {
  if (!backupData || !backupData.data) {
    throw new Error('Dữ liệu sao lưu không hợp lệ!');
  }

  const { categories, documents, document_nodes, legal_relations, notes_bookmarks } = backupData.data;

  return await db.transaction('rw', db.categories, db.documents, db.document_nodes, db.legal_relations, db.notes_bookmarks, async () => {
    await db.categories.clear();
    await db.documents.clear();
    await db.document_nodes.clear();
    await db.legal_relations.clear();
    await db.notes_bookmarks.clear();

    if (categories && categories.length > 0) await db.categories.bulkPut(categories);
    if (documents && documents.length > 0) await db.documents.bulkPut(documents);
    if (document_nodes && document_nodes.length > 0) await db.document_nodes.bulkPut(document_nodes);
    if (legal_relations && legal_relations.length > 0) await db.legal_relations.bulkPut(legal_relations);
    if (notes_bookmarks && notes_bookmarks.length > 0) await db.notes_bookmarks.bulkPut(notes_bookmarks);
  });
}

/**
 * Get full system statistics
 */
async function getStatistics() {
  const totalCategories = await db.categories.count();
  const totalDocs = await db.documents.count();
  const totalNodes = await db.document_nodes.count();
  const totalArticles = await db.document_nodes.where('nodeType').equals('article').count();
  const totalRelations = await db.legal_relations.count();
  const totalNotes = await db.notes_bookmarks.where('type').equals('note').count();
  const totalBookmarks = await db.notes_bookmarks.where('type').equals('bookmark').count();

  return {
    totalCategories,
    totalDocs,
    totalNodes,
    totalArticles,
    totalRelations,
    totalNotes,
    totalBookmarks
  };
}

window.LegalDB = {
  db,
  initDB,
  getCategoriesWithCounts,
  getDocuments,
  getDocumentFull,
  saveDocument,
  deleteDocument,
  saveNote,
  toggleBookmark,
  exportFullDatabase,
  importFullDatabase,
  getStatistics
};
