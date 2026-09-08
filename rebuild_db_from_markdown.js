const fs = require('fs');
const path = require('path');

const MD_DIR = path.resolve(__dirname, 'DATA_MARKDOWN');
const OUTPUT_FILE = path.resolve(__dirname, 'data', 'preloaded_data.js');

// Quét đệ quy toàn bộ file .md trong thư mục DATA_MARKDOWN
function scanAllMarkdown(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(scanAllMarkdown(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Bóc tách các Điều / Mục / Chương từ nội dung Markdown
// OUTPUT FORMAT: tuân thủ schema Dexie document_nodes:
//   {docId, nodeType (article|chapter|preamble|section), num (số không prefix), fullRef (Điều 5 / Chương I), order (1-based), title, content}
function parseNodesFromMarkdown(mdText, docNumericId) {
  const lines = mdText.split('\n');
  const rawNodes = [];
  let currentNode = null;

  const chuongRegex = /^(#{1,3}\s+|\*\*)?(Chương\s+[IVXLCDM\d]+|PHẦN\s+[IVXLCDM\d]+[\.\:]?)\s*([^\*\n]*)(?:\*\*)?/i;
  const dieuRegex = /^(#{1,4}\s+|\*\*)?(Điều\s+\d+[a-zđ]?[\.\:]?|Mục\s+\d+[\.\:]?|\d+\.)\s*([^\*\n]+)(?:\*\*)?/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const chuongMatch = line.match(chuongRegex);
    const dieuMatch = line.match(dieuRegex);

    if (chuongMatch) {
      if (currentNode) rawNodes.push(currentNode);
      const rawNum = chuongMatch[2].trim().replace(/[\.\:]$/, '');
      currentNode = {
        _rawType: 'chuong',
        _rawNumber: rawNum,
        _rawFullRef: rawNum.startsWith('Chương') || rawNum.startsWith('Phần') || rawNum.startsWith('PHẦN')
          ? rawNum
          : (rawNum.match(/^[IVXLCDM]+$/) ? `Chương ${rawNum}` : `Chương ${rawNum}`),
        title: chuongMatch[3] ? chuongMatch[3].trim() : '',
        content: ''
      };
    } else if (dieuMatch) {
      if (currentNode) rawNodes.push(currentNode);
      const rawNum = dieuMatch[2].trim().replace(/[\.\:]$/, '');
      let nodeType = 'dieu';
      if (rawNum.startsWith('Mục')) nodeType = 'muc';
      if (/^\d+\.$/.test(dieuMatch[2].trim())) nodeType = 'diem_list';
      // Extract "num" = con số, bỏ prefix "Điều " / "Mục "
      let numOnly = rawNum;
      if (nodeType === 'dieu') {
        const m = rawNum.match(/^Điều\s*(\d+[a-zđ]?)$/i);
        if (m) numOnly = m[1].toUpperCase();
      } else if (nodeType === 'muc') {
        const m = rawNum.match(/^Mục\s*(\d+)$/i);
        if (m) numOnly = m[1];
      }
      const fullRef = rawNum.startsWith('Điều') || rawNum.startsWith('Mục')
        ? rawNum
        : (nodeType === 'dieu' ? `Điều ${numOnly}` : `Mục ${numOnly}`);
      currentNode = {
        _rawType: nodeType,
        _rawNumber: numOnly,
        _rawFullRef: fullRef,
        title: (dieuMatch[3] || '').trim(),
        content: rawLine + '\n'
      };
    } else if (currentNode) {
      currentNode.content += rawLine + '\n';
    }
  }
  if (currentNode) rawNodes.push(currentNode);

  // Thêm 1 node preamble ở đầu (trước Chương I, nội dung từ Căn cứ đến đầu Chương I) — chỉ làm nếu lines đầu có thông tin loại văn bản
  // Map loại -> Dexie nodeType
  const typeMap = { chuong: 'chapter', dieu: 'article', muc: 'section', diem_list: 'article', preamble: 'preamble' };

  return rawNodes.map((rn, i) => ({
    docId: docNumericId,
    nodeType: typeMap[rn._rawType] || 'article',
    num: String(rn._rawNumber),
    fullRef: rn._rawFullRef,
    order: i + 1,
    title: rn.title || '',
    content: (rn.content || '').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  }));
}

// Trích xuất "Tên tựa đề" chính xác từ nội dung markdown (bỏ qua bảng md header)
function extractDocTitleFromMarkdown(markdown, fallbackFromFileName) {
  const lines = markdown.split('\n').map(l => l.trim());
  const skipPatterns = [/^\|/, /^[\-\:\s]+\|/, /^\s*\-{3,}\s*$/];

  // Tìm TẤT CẢ các dòng **...** trong 50 dòng đầu sau bảng md, ghép lại, ưu tiên những dòng bắt đầu bằng keyword
  const boldLines = [];
  let afterTableSkip = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    if (skipPatterns.some(p => p.test(line))) { afterTableSkip++; continue; }
    const m = line.match(/^\*\*(.+?)\*\*$/);
    if (m) boldLines.push({ idx: i, text: m[1].trim() });
    if (afterTableSkip > 40 || boldLines.length >= 10) break;
    afterTableSkip++;
  }

  // 1. Ưu tiên 1: Dòng **LUẬT XYZ** (có cả tên loại + tên nội dung trên 1 dòng)
  const singleLinePatterns = [
    /^(LUẬT\s+.+)$/i,
    /^(NGHỊ\s*ĐỊNH\s+.+)$/i,
    /^(THÔNG\s*TƯ\s+.+)$/i,
    /^(QUYẾT\s*ĐỊNH\s+.+)$/i,
    /^(QUY\s*CHẾ\s+.+)$/i,
    /^(QCVN\s*.+)$/i,
    /^(TCVN\s*.+)$/i,
    /^(TCXDVN\s*.+)$/i
  ];
  for (const bl of boldLines) {
    for (const pat of singleLinePatterns) {
      const m = bl.text.match(pat);
      if (m) return m[1].replace(/\s+/g, ' ').trim();
    }
  }

  // 2. Ưu tiên 2: Dòng tách biệt **LUẬT** rồi **XÂY DỰNG** trên dòng kế tiếp (có thể có dòng trống xen kẽ)
  const findNextNonEmptyBold = (startIdx) => {
    for (let j = startIdx + 1; j < Math.min(startIdx + 6, boldLines.length); j++) {
      if (boldLines[j] && boldLines[j].text.length > 0) return boldLines[j].text;
    }
    return null;
  };
  for (const bl of boldLines) {
    if (/^(LUẬT|NGHỊ\s*ĐỊNH|THÔNG\s*TƯ|QUYẾT\s*ĐỊNH|QUY\s*CHẾ)$/i.test(bl.text)) {
      const rest = findNextNonEmptyBold(boldLines.indexOf(bl));
      if (rest) return `${bl.text} ${rest}`.replace(/\s+/g, ' ').trim();
    }
  }

  // 3. Ưu tiên 3: Ghép 2-3 dòng đầu tiên trong danh sách boldLines (nếu chúng bắt đầu = keyword loại VB)
  if (boldLines.length > 0) {
    const combined = boldLines.slice(0, 3).map(b => b.text).join(' ').replace(/\s+/g, ' ').trim();
    if (combined.length > 4) return combined;
  }

  // 4. Fallback cuối: fileName
  return fallbackFromFileName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

// Map từ tên category (string) -> ID khớp PRE_SEEDED_CATEGORIES trong db.js (1..10)
function mapCategoryIds(docType, subFolder) {
  const ids = [];
  const nameMap = {
    'Luật - Bộ Luật': 1,
    'Nghị định Chính phủ': 2,
    'Thông tư các Bộ': 3,
    'Văn bản Bộ / Địa phương': 4,
    'QCVN - Quy chuẩn kỹ thuật': 5,
    'TCVN - Tiêu chuẩn quốc gia': 6,
    'An toàn - Môi trường': 8,
    'Phòng cháy chữa cháy (PCCC)': 9,
    'Quản lý Dự án & Đấu thầu': 10
  };
  const upperDocType = String(docType || '').toUpperCase();
  const upperFolder = String(subFolder || '').toUpperCase();
  const upperAll = `${upperDocType} ${upperFolder}`;
  if (upperDocType.includes('LUẬT') || upperDocType === 'LUẬT') ids.push(1);
  else if (upperDocType.includes('NGHỊ ĐỊNH') || upperDocType.includes('NGHI DINH') || upperDocType === 'NGHỊ ĐỊNH') ids.push(2);
  else if (upperDocType.includes('THÔNG TƯ') || upperDocType.includes('THONG TU') || upperDocType === 'THÔNG TƯ') ids.push(3);
  else if (upperDocType === 'VĂN BẢN KHÁC') ids.push(4);
  if (upperAll.includes('QCVN')) ids.push(5);
  if (upperAll.includes('TCVN') || upperAll.includes('TCXDVN') || upperAll.includes('TCXD')) ids.push(6);
  if (upperAll.includes('AN TOÀN') || upperAll.includes('MÔI TRƯỜNG')) ids.push(8);
  if (upperAll.includes('PCCC') || upperAll.includes('CHỮA CHÁY') || upperAll.includes('PHÒNG CHÁY')) ids.push(9);
  if (upperAll.includes('ĐẤU THẦU') || upperAll.includes('DỰ ÁN') || upperAll.includes('QUẢN LÝ DỰ ÁN')) ids.push(10);
  // Luôn có Quản lý dự án nếu danh mục rỗng
  if (ids.length === 0) ids.push(10);
  return Array.from(new Set(ids));
}

// Danh mục categories chuẩn (khớp db.js PRE_SEEDED_CATEGORIES id)
const STANDARD_CATEGORIES = [
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

function run() {
  console.log(`Đang quét thư mục: ${MD_DIR}...`);
  const mdFiles = scanAllMarkdown(MD_DIR);
  console.log(`Tổng số file .md tìm thấy: ${mdFiles.length}\n`);

  if (mdFiles.length === 0) {
    console.error(`Không tìm thấy file .md nào trong ${MD_DIR}`);
    return;
  }

  const documents = [];
  const documentNodesFlat = [];   // Flatten tách riêng, khớp importFullDatabase

  for (let i = 0; i < mdFiles.length; i++) {
    const filePath = mdFiles[i];
    const fileName = path.basename(filePath, '.md');
    const relPath = path.relative(MD_DIR, filePath);
    const pathParts = relPath.split(path.sep);

    let docType = 'Văn bản khác';
    const upperCheck = (relPath + ' ' + fileName).toUpperCase();
    if (upperCheck.includes('LUAT')) docType = 'Luật';
    else if (upperCheck.includes('NGHI_DINH') || upperCheck.includes('NGHI-DINH')) docType = 'Nghị định';
    else if (upperCheck.includes('THONG_TU') || upperCheck.includes('THONG-TU')) docType = 'Thông tư';
    else if (upperCheck.includes('QCVN')) docType = 'QCVN';
    else if (upperCheck.includes('TCVN')) docType = 'TCVN';

    const subFolder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Chung';
    const categoryIds = mapCategoryIds(docType, subFolder);

    try {
      const markdown = fs.readFileSync(filePath, 'utf-8');

      const docNumericId = i + 1;
      const docSlug = 'doc_' + fileName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const codeMatch = (markdown.slice(0, 2000) + ' ' + fileName).match(/([0-9]+\/[0-9]+(?:\/[^ \)\]\s"']+)?|(?:QCVN|TCVN|TCXDVN|TCXD)[^ \)\]\s"']{0,60})/i);
      const code = codeMatch ? codeMatch[1].trim() : fileName;

      const title = extractDocTitleFromMarkdown(markdown, fileName);

      const nodes = parseNodesFromMarkdown(markdown, docNumericId);
      nodes.forEach(n => documentNodesFlat.push(n));

      documents.push({
        id: docNumericId,
        slug: docSlug,
        code: code,
        title: title,
        docType: docType,
        issuer: docType === 'Luật' ? 'Quốc hội' : (docType === 'Nghị định' ? 'Chính phủ' : 'Bộ Xây dựng'),
        issueDate: '2024-01-01',
        effectiveDate: '2024-01-01',
        status: 'active',
        categoryIds: categoryIds,
        createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
        markdown: markdown
      });

      const previewNodes = nodes.slice(0, 3).map(n => `[${n.nodeType}|${n.fullRef}=${n.num}]`).join(',');
      console.log(`[${String(i+1).padStart(3,' ')}/${mdFiles.length}] ${code.padEnd(18,' ')} | ${docType.padEnd(9,' ')} | title="${title.slice(0,52).padEnd(52,' ')}" | nodes=${nodes.length} | sample=${previewNodes}`);
    } catch (err) {
      console.error(`Lỗi đọc file ${filePath}:`, err.message);
    }
  }

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const backupShape = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appName: 'LegalLibraryApp',
    rebuiltFrom: 'DATA_MARKDOWN/*.md',
    data: {
      categories: STANDARD_CATEGORIES,
      documents: documents,
      document_nodes: documentNodesFlat,
      legal_relations: [],
      notes_bookmarks: []
    }
  };

  // Xuất BẢN CHÍNH theo đúng format initDB mong đợi (PRELOADED_LEGAL_DATA + .data)
  // + backup legacy name PRELOADED_DATA đề phòng
  const fileOutput =
`// Auto-generated: rebuild_db_from_markdown.js rebuild lúc ${new Date().toISOString()}
// Dữ liệu: ${documents.length} văn bản / ${documentNodesFlat.length} nodes (${STANDARD_CATEGORIES.length} danh mục)
// FORMAT: backup shape khớp importFullDatabase — db.js line 229: window.PRELOADED_LEGAL_DATA.data
window.PRELOADED_LEGAL_DATA = ${JSON.stringify(backupShape, null, 2)};
// Legacy name (backward compatible cho các phiên bản cũ nếu có)
window.PRELOADED_DATA = window.PRELOADED_LEGAL_DATA.data.documents.map(d => ({ ...d, nodes: [] }));
`;
  fs.writeFileSync(OUTPUT_FILE, fileOutput, 'utf-8');

  console.log(`\n✅ Hoàn tất!`);
  console.log(`   - Documents       : ${documents.length}`);
  console.log(`   - Document nodes  : ${documentNodesFlat.length}`);
  console.log(`   - Categories      : ${STANDARD_CATEGORIES.length}`);
  console.log(`   - File output     : ${OUTPUT_FILE} (${(fs.statSync(OUTPUT_FILE).size/1024/1024).toFixed(2)} MB)`);
}

run();