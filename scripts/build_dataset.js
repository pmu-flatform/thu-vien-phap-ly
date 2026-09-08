/**
 * Batch Data Ingestion Script for Node.js
 * Powered by Modular Strategy Parser (LawParser, DecreeCircularParser, QCVNParser, TCVNParser)
 */

const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

const DATA_DIR = path.join(__dirname, '..', 'DATA');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'preloaded_data.json');
const JS_OUTPUT_FILE = path.join(__dirname, '..', 'data', 'preloaded_data.js');

// Ensure output dir exists
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
}

// Default Categories
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

function getAllDocxFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllDocxFiles(filePath, fileList);
    } else if (file.endsWith('.docx') && !file.startsWith('~$')) {
      const lower = file.toLowerCase();
      if (lower.includes('dinh muc') || lower.includes('định mức') || lower.includes('du toan') || lower.includes('dự toán') || lower.includes('phu luc vi')) {
        console.log(`[EXCLUDED NORM FILE]: ${file}`);
        continue;
      }
      fileList.push(filePath);
    }
  }
  return fileList;
}

// -------------------------------------------------------------
// STRATEGY 1: LAW PARSER
// -------------------------------------------------------------
const LawParser = {
  name: 'LawParser',

  extractMetadata(lines, fullText, filename) {
    const codeMatch = fullText.match(/(?:Luật\s+số|Số)\s*[:\.]?\s*([0-9]+\/[0-9]{4}\/QH[0-9]+)/i) ||
                      fullText.match(/\b([0-9]+\/[0-9]{4}\/QH[0-9]+)\b/i) ||
                      filename.match(/([0-9]+[\_\/][0-9]{4}[\_\/]QH[0-9]+)/i);

    let title = '';
    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      if (/^(LUẬT|BỘ LUẬT|NGHỊ QUYẾT)\b/i.test(lines[i])) {
        title = lines[i];
        if (lines[i + 1] && lines[i + 1].length > 4 && !/^(Chương|Điều|Căn cứ|Quốc hội)/i.test(lines[i + 1])) {
          title += ' ' + lines[++i];
        }
        break;
      }
    }

    const dateMatch = fullText.match(/(?:ngày|ngày\s+tháng)\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);

    return {
      code: codeMatch ? codeMatch[1].replace(/_/g, '/') : filename.replace(/\.[^/.]+$/, ''),
      title: title || filename.replace(/\.[^/.]+$/, ''),
      docType: 'Luật',
      issuer: 'Quốc hội',
      issueDate: dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : '',
      effectiveDate: ''
    };
  },

  extractNodes(lines) {
    const nodes = [];
    let currentOrder = 1;
    let preamble = [];
    let isInPreamble = true;
    let currentArticle = null;

    const chapterRegex = /^(CHƯƠNG|PHẦN)\s+([IVXLCDM\d]+)[\.\:\-\s]*(.*)$/i;
    const sectionRegex = /^MỤC\s+(\d+)[\.\:\-\s]*(.*)$/i;
    const articleRegex = /^Điều\s+(\d+[a-z]?)[\.\:\-\s]*(.*)$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const chapMatch = line.match(chapterRegex);
      if (chapMatch) {
        if (isInPreamble && preamble.length > 0) {
          nodes.push({
            nodeType: 'preamble',
            num: '',
            title: 'Căn cứ ban hành',
            content: preamble.join('\n'),
            order: currentOrder++,
            fullRef: 'Căn cứ'
          });
          preamble = [];
          isInPreamble = false;
        }
        if (currentArticle) {
          nodes.push(currentArticle);
          currentArticle = null;
        }

        const typeStr = chapMatch[1].toUpperCase();
        const numStr = chapMatch[2].trim();
        const titleStr = chapMatch[3] || (lines[i + 1] && !lines[i + 1].startsWith('Điều') ? lines[++i] : '');

        nodes.push({
          nodeType: 'chapter',
          num: numStr,
          title: titleStr || `${typeStr} ${numStr}`,
          content: `${typeStr} ${numStr}: ${titleStr}`,
          order: currentOrder++,
          fullRef: `${typeStr} ${numStr}`
        });
        continue;
      }

      const secMatch = line.match(sectionRegex);
      if (secMatch) {
        if (currentArticle) {
          nodes.push(currentArticle);
          currentArticle = null;
        }
        nodes.push({
          nodeType: 'section',
          num: secMatch[1],
          title: secMatch[2] || `Mục ${secMatch[1]}`,
          content: line,
          order: currentOrder++,
          fullRef: `Mục ${secMatch[1]}`
        });
        continue;
      }

      const artMatch = line.match(articleRegex);
      if (artMatch) {
        if (isInPreamble && preamble.length > 0) {
          nodes.push({
            nodeType: 'preamble',
            num: '',
            title: 'Căn cứ ban hành',
            content: preamble.join('\n'),
            order: currentOrder++,
            fullRef: 'Căn cứ'
          });
          preamble = [];
          isInPreamble = false;
        }
        if (currentArticle) {
          nodes.push(currentArticle);
        }

        const artNum = artMatch[1];
        let artTitle = artMatch[2];
        if (!artTitle && lines[i + 1] && !lines[i + 1].startsWith('Điều') && !lines[i + 1].startsWith('1.')) {
          artTitle = lines[++i];
        }

        currentArticle = {
          nodeType: 'article',
          num: artNum,
          title: artTitle || `Điều ${artNum}`,
          contentLines: [line],
          order: currentOrder++,
          fullRef: `Điều ${artNum}`
        };
        continue;
      }

      if (isInPreamble) {
        preamble.push(line);
      } else if (currentArticle) {
        currentArticle.contentLines.push(line);
      } else {
        preamble.push(line);
      }
    }

    if (isInPreamble && preamble.length > 0) {
      nodes.push({
        nodeType: 'preamble',
        num: '',
        title: 'Căn cứ ban hành',
        content: preamble.join('\n'),
        order: currentOrder++,
        fullRef: 'Căn cứ'
      });
    }
    if (currentArticle) {
      nodes.push(currentArticle);
    }

    nodes.forEach(n => {
      if (n.contentLines) {
        n.content = n.contentLines.join('\n');
        delete n.contentLines;
      }
    });

    return nodes;
  }
};

// -------------------------------------------------------------
// STRATEGY 2: DECREE & CIRCULAR PARSER
// -------------------------------------------------------------
const DecreeCircularParser = {
  name: 'DecreeCircularParser',

  extractMetadata(lines, fullText, filename, filePath = '') {
    const normPath = (filePath || '').replace(/\\/g, '/');
    const isDecree = normPath.includes('/Nghi_Dinh/') || filename.toLowerCase().startsWith('nd');
    const isCircular = normPath.includes('/Thong_tu/') || filename.toLowerCase().startsWith('tt');

    let docType = isDecree ? 'Nghị định' : (isCircular ? 'Thông tư' : 'Quyết định');
    let issuer = isDecree ? 'Chính phủ' : 'Bộ ngành';

    if (filename.includes('BXD') || fullText.includes('Bộ Xây dựng')) issuer = 'Bộ Xây dựng';
    else if (filename.includes('BTC') || fullText.includes('Bộ Tài chính')) issuer = 'Bộ Tài chính';
    else if (filename.includes('BCA') || fullText.includes('Bộ Công an')) issuer = 'Bộ Công an';
    else if (filename.includes('BNNMT') || fullText.includes('Bộ Tài nguyên và Môi trường')) issuer = 'Bộ TN&MT';

    let code = '';
    if (isDecree) {
      const m = filename.match(/(?:ND[-_]?)?(\d+[\_\/]\d{4}[\_\/]NĐ-CP|\d+[\_\/]\d{4}[\_\/]ND-CP|\d+[\_\/]\d{4}[\_\/]ND|\d+[\_\/]\d{4})/i) ||
                fullText.match(/(?:Số|Số hiệu)\s*[:\.]?\s*(\d+\/\d{4}\/NĐ-CP)/i);
      if (m) code = m[1].replace(/_/g, '/').replace(/\/ND$/i, '/NĐ-CP').replace(/\/ND-CP$/i, '/NĐ-CP');
      if (code && !code.includes('NĐ-CP') && !code.includes('ND')) code += '/NĐ-CP';
    } else if (isCircular) {
      const m = filename.match(/(?:TT[-_]?)?(\d+[\_\/]\d{4}[\_\/]TT-[A-Z]+|\d+[\_\/]VBHN-[A-Z]+|\d+[\_\/]\d{4}[\_\/]TT)/i) ||
                fullText.match(/(?:Số|Số hiệu)\s*[:\.]?\s*(\d+\/\d{4}\/TT-[A-Z]+|\d+\/VBHN-[A-Z]+)/i);
      if (m) code = m[1].replace(/_/g, '/');
    }

    if (!code) {
      const generalCode = fullText.match(/(?:Số|Số hiệu)\s*[:\.]?\s*([0-9]+\/[0-9]{4}\/[A-Z0-9\-\_]+)/i);
      code = generalCode ? generalCode[1].replace(/_/g, '/') : filename.replace(/\.[^/.]+$/, '');
    }

    let title = '';
    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      if (/^(NGHỊ ĐỊNH|THÔNG TƯ|QUYẾT ĐỊNH|VĂN BẢN HỢP NHẤT)\b/i.test(lines[i])) {
        title = lines[i];
        if (lines[i + 1] && lines[i + 1].length > 4 && !/^(Chương|Điều|Căn cứ|Chính phủ|Bộ)/i.test(lines[i + 1])) {
          title += ' - ' + lines[++i];
        }
        break;
      }
    }

    const dateMatch = fullText.match(/(?:ngày|ngày\s+tháng)\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);

    return {
      code: code || filename.replace(/\.[^/.]+$/, ''),
      title: title || filename.replace(/\.[^/.]+$/, ''),
      docType,
      issuer,
      issueDate: dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : '',
      effectiveDate: ''
    };
  },

  extractNodes(lines) {
    return LawParser.extractNodes(lines);
  }
};

// -------------------------------------------------------------
// STRATEGY 3: QCVN & TCVN PARSER
// -------------------------------------------------------------
const QCVNTCVNParser = {
  name: 'QCVNTCVNParser',

  extractMetadata(lines, fullText, filename) {
    const isQCVN = filename.toUpperCase().includes('QCVN') || fullText.substring(0, 500).toUpperCase().includes('QCVN');
    const codeMatch = fullText.match(/\b(QCVN\s*[0-9]+(?::[0-9]{4})?(?:\/[A-Z0-9\-]+)?)\b/i) ||
                      fullText.match(/\b(TCVN\s*[0-9]+(?::[0-9]{4})?)\b/i) ||
                      filename.match(/(QCVN\s*[0-9]+[\_\:][0-9]{4}[\_\/][A-Z0-9\-]+)/i) ||
                      filename.match(/(TCVN\s*[0-9]+(?::[0-9]{4})?)/i);

    let title = '';
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      if (/^QUY CHUẨN KỸ THUẬT/i.test(lines[i]) || /^TIÊU CHUẨN QUỐC GIA/i.test(lines[i]) || /^QCVN/i.test(lines[i]) || /^TCVN/i.test(lines[i])) {
        title = lines[i];
        if (lines[i + 1] && lines[i + 1].length > 5 && !/^(Mục lục|1\.|Lời nói đầu)/i.test(lines[i + 1])) {
          title += ' - ' + lines[++i];
        }
        break;
      }
    }

    const docType = isQCVN ? 'QCVN' : 'TCVN';
    const issuer = isQCVN ? (filename.includes('BCA') ? 'Bộ Công an' : (filename.includes('BXD') ? 'Bộ Xây dựng' : 'Bộ KH&CN')) : 'Bộ KH&CN';

    return {
      code: codeMatch ? codeMatch[1].replace(/_/g, '/').replace(/\s*:\s*/g, ':') : filename.replace(/\.[^/.]+$/, ''),
      title: title || filename.replace(/\.[^/.]+$/, ''),
      docType,
      issuer,
      issueDate: '',
      effectiveDate: ''
    };
  },

  extractNodes(lines) {
    const nodes = [];
    let currentOrder = 1;
    let preamble = [];
    let currentArticle = null;
    let inToc = false;
    let isInPreamble = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (/^MỤC LỤC/i.test(line) || /^TABLE OF CONTENTS/i.test(line)) {
        inToc = true;
        continue;
      }
      if (inToc) {
        if (line.includes('.....') || line.match(/\t\s*\d+$/)) continue;
        if (/^LỜI NÓI ĐẦU/i.test(line) || /^1[\.\s]+QUY ĐỊNH CHUNG/i.test(line) || /^1[\.\s]+QUY ĐỊNH/i.test(line)) {
          inToc = false;
        } else {
          continue;
        }
      }

      const partMatch = line.match(/^(\d+)[\.\s]+([A-ZÀ-Ỹ\s]{3,})$/) ||
                        line.match(/^(PHẦN|CHƯƠNG|PHỤ LỤC)\s+([A-Z\d]+)[\.\:\-\s]*(.*)$/i);

      if (partMatch) {
        if (isInPreamble && preamble.length > 0) {
          nodes.push({
            nodeType: 'preamble',
            num: '',
            title: 'Lời nói đầu / Giới thiệu',
            content: preamble.join('\n'),
            order: currentOrder++,
            fullRef: 'Lời nói đầu'
          });
          preamble = [];
          isInPreamble = false;
        }
        if (currentArticle) {
          nodes.push(currentArticle);
          currentArticle = null;
        }

        const partNum = partMatch[1] || partMatch[2];
        const partTitle = partMatch[2] || partMatch[3] || line;

        nodes.push({
          nodeType: 'chapter',
          num: partNum,
          title: partTitle,
          content: line,
          order: currentOrder++,
          fullRef: isNaN(partNum) ? `${partMatch[1]} ${partNum}` : `Phần ${partNum}`
        });
        continue;
      }

      const subclauseMatch = line.match(/^(\d+\.\d+(?:\.\d+)?)\s*[\.\:\-\s]+(.*)$/) ||
                             line.match(/^Điều\s+(\d+[a-z]?)[\.\:\-\s]*(.*)$/i);

      if (subclauseMatch) {
        if (isInPreamble && preamble.length > 0) {
          nodes.push({
            nodeType: 'preamble',
            num: '',
            title: 'Lời nói đầu / Giới thiệu',
            content: preamble.join('\n'),
            order: currentOrder++,
            fullRef: 'Lời nói đầu'
          });
          preamble = [];
          isInPreamble = false;
        }
        if (currentArticle) {
          nodes.push(currentArticle);
        }

        const num = subclauseMatch[1];
        const title = subclauseMatch[2] || (line.startsWith('Điều') ? `Điều ${num}` : `Mục ${num}`);

        currentArticle = {
          nodeType: 'article',
          num: num,
          title: title,
          contentLines: [line],
          order: currentOrder++,
          fullRef: line.startsWith('Điều') ? `Điều ${num}` : `Mục ${num}`
        };
        continue;
      }

      if (isInPreamble) {
        preamble.push(line);
      } else if (currentArticle) {
        currentArticle.contentLines.push(line);
      } else {
        preamble.push(line);
      }
    }

    if (isInPreamble && preamble.length > 0) {
      nodes.push({
        nodeType: 'preamble',
        num: '',
        title: 'Lời nói đầu',
        content: preamble.join('\n'),
        order: currentOrder++,
        fullRef: 'Lời nói đầu'
      });
    }
    if (currentArticle) {
      nodes.push(currentArticle);
    }

    if (nodes.filter(n => n.nodeType === 'article').length === 0) {
      const allLines = preamble.length > 0 ? preamble : lines;
      const chunkSize = 25;
      for (let c = 0; c < allLines.length; c += chunkSize) {
        const chunk = allLines.slice(c, c + chunkSize);
        nodes.push({
          nodeType: 'article',
          num: String(Math.floor(c / chunkSize) + 1),
          title: chunk[0]?.substring(0, 60) || `Quy định phần ${Math.floor(c / chunkSize) + 1}`,
          content: chunk.join('\n'),
          order: currentOrder++,
          fullRef: `Mục ${Math.floor(c / chunkSize) + 1}`
        });
      }
    }

    nodes.forEach(n => {
      if (n.contentLines) {
        n.content = n.contentLines.join('\n');
        delete n.contentLines;
      }
    });

    return nodes;
  }
};

function getParserStrategy(filePath = '', filename = '', rawText = '') {
  const normPath = filePath.replace(/\\/g, '/');
  if (normPath.includes('/Luat/')) return LawParser;
  if (normPath.includes('/Nghi_Dinh/') || normPath.includes('/Thong_tu/')) return DecreeCircularParser;
  if (normPath.includes('/QCVN/') || normPath.includes('/TCVN/')) return QCVNTCVNParser;

  const upperText = (rawText.substring(0, 500) + ' ' + filename).toUpperCase();
  if (upperText.includes('QCVN') || upperText.includes('QUY CHUẨN')) return QCVNTCVNParser;
  if (upperText.includes('TCVN') || upperText.includes('TIÊU CHUẨN')) return QCVNTCVNParser;
  if (upperText.includes('QUỐC HỘI BAN HÀNH LUẬT')) return LawParser;
  return DecreeCircularParser;
}

function classifyCategories(docType, title, fullPath) {
  const normPath = fullPath.replace(/\\/g, '/');
  const lowerTitle = (title || '').toLowerCase();
  const categories = [];

  if (normPath.includes('/Luat/') || docType === 'Luật') {
    categories.push(1);
  } else if (normPath.includes('/Nghi_Dinh/') || docType === 'Nghị định') {
    categories.push(2);
  } else if (normPath.includes('/Thong_tu/') || docType === 'Thông tư') {
    categories.push(3);
  } else if (normPath.includes('/QCVN/') || docType === 'QCVN' || lowerTitle.includes('quy chuẩn kỹ thuật')) {
    categories.push(5);
  } else if (normPath.includes('/TCVN/') || docType === 'TCVN' || lowerTitle.includes('tiêu chuẩn quốc gia')) {
    categories.push(6);
  } else {
    categories.push(4);
  }

  if (lowerTitle.includes('môi trường') || lowerTitle.includes('an toàn lao động') || lowerTitle.includes('vệ sinh lao động')) {
    categories.push(8);
  }
  if (lowerTitle.includes('pccc') || lowerTitle.includes('phòng cháy') || lowerTitle.includes('chữa cháy') || lowerTitle.includes('cứu nạn') || lowerTitle.includes('an toàn cháy')) {
    categories.push(9);
  }
  if (lowerTitle.includes('đấu thầu') || lowerTitle.includes('dự án') || lowerTitle.includes('xây dựng') || lowerTitle.includes('hợp đồng') || lowerTitle.includes('quy hoạch') || lowerTitle.includes('đất đai') || lowerTitle.includes('đầu tư')) {
    categories.push(10);
  }

  return [...new Set(categories)];
}

function extractRelations(text, selfDocCode = '') {
  const relations = [];
  const relationMap = new Map();
  const docRegex = /\b(\d+[\/\-]\d{4}[\/\-](?:QH\d+|NĐ-CP|TT-[A-Z]+|QĐ-[A-Z]+|UBND|[A-Z0-9\-]+)|QCVN\s*[0-9]+:[0-9]{4}\/[A-Z0-9\-]+|TCVN\s*[0-9]+(?::[0-9]{4})?)\b/gi;
  let match;

  while ((match = docRegex.exec(text)) !== null) {
    const targetCode = match[1].replace(/\s+/g, ' ').trim();
    if (targetCode.toLowerCase() === (selfDocCode || '').toLowerCase()) continue;

    const snippetStart = Math.max(0, match.index - 80);
    const snippetEnd = Math.min(text.length, match.index + match[0].length + 80);
    const snippet = text.substring(snippetStart, snippetEnd).toLowerCase();

    let relationType = 'references';
    if (snippet.includes('sửa đổi') || snippet.includes('bổ sung') || snippet.includes('bãi bỏ')) {
      relationType = 'amends';
    } else if (snippet.includes('quy định chi tiết') || snippet.includes('hướng dẫn thi hành')) {
      relationType = 'details';
    }

    if (!relationMap.has(targetCode)) {
      relationMap.set(targetCode, {
        targetDocCode: targetCode,
        targetArticle: '',
        relationType
      });
    }
  }

  return Array.from(relationMap.values());
}

async function processAll() {
  console.log(`Scanning DATA folder: ${DATA_DIR}...`);
  const files = getAllDocxFiles(DATA_DIR);
  console.log(`Found ${files.length} .docx files to parse.`);

  const documents = [];
  const document_nodes = [];
  const legal_relations = [];

  let currentDocId = 1;
  let currentNodeId = 1;
  let currentRelId = 1;

  const seenCodes = new Map();

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const filename = path.basename(file);
    try {
      const buffer = fs.readFileSync(file);
      const res = await mammoth.extractRawText({ buffer });
      const rawText = res.value || '';
      const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const fullText = lines.join('\n');

      const strategy = getParserStrategy(file, filename, fullText);
      const meta = strategy.extractMetadata(lines, fullText, filename, file);
      const nodes = strategy.extractNodes(lines);
      const relations = extractRelations(fullText, meta.code);

      let finalCode = meta.code;
      if (seenCodes.has(finalCode)) {
        const count = seenCodes.get(finalCode) + 1;
        seenCodes.set(finalCode, count);
        if (filename.includes('SD') || filename.includes('sua_doi') || filename.includes('su doi')) {
          finalCode = `${finalCode} (SĐ)`;
        } else if (filename.match(/_(\d+)\.docx$/)) {
          const part = filename.match(/_(\d+)\.docx$/)[1];
          finalCode = `${finalCode} (Phần ${part})`;
        } else {
          finalCode = `${finalCode} [${count}]`;
        }
      } else {
        seenCodes.set(finalCode, 1);
      }

      const docId = currentDocId++;
      const docEntry = {
        id: docId,
        code: finalCode,
        title: meta.title,
        docType: meta.docType,
        issuer: meta.issuer,
        issueDate: meta.issueDate || '2024-01-01',
        effectiveDate: meta.effectiveDate || meta.issueDate || '2024-01-01',
        status: filename.includes('SD') || filename.includes('sua_doi') ? 'amended' : 'active',
        categoryIds: classifyCategories(meta.docType, meta.title, file),
        createdAt: new Date().toISOString(),
        metadata: {
          parserStrategy: strategy.name,
          originalFile: path.relative(DATA_DIR, file),
          totalArticles: nodes.filter(n => n.nodeType === 'article').length
        }
      };
      documents.push(docEntry);

      nodes.forEach(n => {
        document_nodes.push({
          id: currentNodeId++,
          docId: docId,
          nodeType: n.nodeType,
          num: n.num,
          title: n.title,
          content: n.content || '',
          order: n.order,
          fullRef: n.fullRef
        });
      });

      relations.forEach(r => {
        legal_relations.push({
          id: currentRelId++,
          sourceDocId: docId,
          targetDocCode: r.targetDocCode,
          targetArticle: r.targetArticle,
          relationType: r.relationType
        });
      });

      console.log(`[${idx + 1}/${files.length}] [${strategy.name}] [${meta.docType}] ${finalCode} -> ${nodes.length} nodes`);
    } catch (err) {
      console.error(`Error parsing ${filename}:`, err.message);
    }
  }

  const exportPayload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appName: 'LegalLibraryApp',
    data: {
      categories: PRE_SEEDED_CATEGORIES,
      documents,
      document_nodes,
      legal_relations,
      notes_bookmarks: []
    }
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  fs.writeFileSync(OUTPUT_FILE, jsonStr, 'utf8');
  fs.writeFileSync(JS_OUTPUT_FILE, `window.PRELOADED_LEGAL_DATA = ${jsonStr};`, 'utf8');

  console.log(`\n🎉 SUCCESS! Generated ${OUTPUT_FILE} and ${JS_OUTPUT_FILE}`);
  console.log(`Total Documents: ${documents.length}`);
  console.log(`Total Nodes: ${document_nodes.length}`);
  console.log(`Total Relations: ${legal_relations.length}`);
}

processAll().catch(console.error);
