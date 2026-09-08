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
function parseNodesFromMarkdown(mdText, docNumericId) {
  const lines = mdText.split('\n');
  const nodes = [];
  let currentNode = null;

  const chuongRegex = /^(#{1,3}\s+|\*\*)?(Chương\s+[IVXLCDM\d]+|PHẦN\s+[IVXLCDM\d]+[\.\:]?)\s*([^\*\n]*)(?:\*\*)?/i;
  const dieuRegex = /^(#{1,4}\s+|\*\*)?(Điều\s+\d+[\.\:]?|Mục\s+\d+[\.\:]?|\d+\.)\s*([^\*\n]+)(?:\*\*)?/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const chuongMatch = line.match(chuongRegex);
    const dieuMatch = line.match(dieuRegex);

    if (chuongMatch) {
      if (currentNode) nodes.push(currentNode);
      currentNode = {
        id: `node_${docNumericId}_chuong_${nodes.length + 1}`,
        level: 'chuong',
        number: chuongMatch[2].trim(),
        title: chuongMatch[3] ? chuongMatch[3].trim() : '',
        content: ''
      };
    } else if (dieuMatch) {
      if (currentNode) nodes.push(currentNode);
      let nodeNumber = dieuMatch[2].trim().replace(/\.$/, '');
      let nodeTitle = (dieuMatch[3] || '').trim();
      currentNode = {
        id: `node_${docNumericId}_dieu_${nodes.length + 1}`,
        level: 'dieu',
        number: nodeNumber,       // Sẽ lưu "1", "2", hoặc "Điều 1"
        title: nodeTitle,         // Sẽ lưu nguyên vẹn "Nguyên tắc chung", "Nền móng..."
        content: rawLine + '\n'
      };
    } else if (currentNode) {
      currentNode.content += rawLine + '\n';
    }
  }
  if (currentNode) nodes.push(currentNode);
  return nodes;
}

function run() {
  console.log(`Đang quét thư mục: ${MD_DIR}...`);
  const mdFiles = scanAllMarkdown(MD_DIR);
  console.log(`Tổng số file .md tìm thấy: ${mdFiles.length}\n`);

  if (mdFiles.length === 0) {
    console.error(`Không tìm thấy file .md nào trong ${MD_DIR}`);
    return;
  }

  const documents = [];

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
    const categories = ['Quản lý dự án', subFolder];

    try {
      const markdown = fs.readFileSync(filePath, 'utf-8');
      
      // Sử dụng ID số nguyên (1, 2, 3...) cho khóa chính IndexedDB
      const docNumericId = i + 1;
      const docSlug = 'doc_' + fileName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const codeMatch = (markdown.slice(0, 1500) + ' ' + fileName).match(/([0-9]+\/[0-9]+\/[A-Z0-9\-]+|QCVN\s*[0-9\:\/\-]+[A-Z0-9\/]*|TCVN\s*[0-9\:\/\-]+)/i);
      const code = codeMatch ? codeMatch[1].trim() : fileName;

      const firstLine = markdown.split('\n').map(l => l.trim()).find(l => l.length > 0) || fileName;
      const title = firstLine.replace(/^[#*\s]+|[#*\s]+$/g, '');

      const nodes = parseNodesFromMarkdown(markdown, docNumericId);

      documents.push({
        id: docNumericId,             // Khóa chính dạng số nguyên
        slug: docSlug,
        code: code,
        title: title,
        docType: docType,
        issuer: docType === 'Luật' ? 'Quốc hội' : (docType === 'Nghị định' ? 'Chính phủ' : 'Bộ Xây dựng'),
        issueDate: '2024-01-01',
        effectiveDate: '2024-01-01',
        status: 'active',
        categories: categories,
        nodes: nodes,
        markdown: markdown
      });

      console.log(`[${i + 1}/${mdFiles.length}] Đã đóng gói: ${fileName} (${docType})`);
    } catch (err) {
      console.error(`Lỗi đọc file ${filePath}:`, err.message);
    }
  }

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const fileOutput = `// CSDL nạp sẵn từ 160 file Markdown\nwindow.PRELOADED_DATA = ${JSON.stringify(documents, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_FILE, fileOutput, 'utf-8');

  console.log(`\n Hoàn tất! Đã xuất đầy đủ ${documents.length} văn bản vào: ${OUTPUT_FILE}`);
}

run();