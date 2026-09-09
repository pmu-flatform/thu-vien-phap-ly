/**
 * Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật
 * Multi-Strategy Modular Parser Architecture
 * 
 * Each document archetype has its own dedicated parser:
 * 1. LawParser: Luật, Bộ Luật, Nghị quyết Quốc hội (Chương -> Mục -> Điều -> Khoản -> Điểm)
 * 2. DecreeCircularParser: Nghị định, Quyết định, Thông tư (Căn cứ -> Chương -> Điều -> Khoản -> Điểm + SĐ/BS)
 * 3. QCVNParser: Quy chuẩn kỹ thuật quốc gia (Lời nói đầu -> Phần 1/2/3/4 -> Mục 1.1/2.1.1 -> Phụ lục A/B -> Bảng)
 * 4. TCVNParser: Tiêu chuẩn quốc gia (Lời nói đầu -> 1. Phạm vi -> 2. Viện dẫn -> 3. Thuật ngữ -> 4. Kỹ thuật -> 5. Thử nghiệm -> Phụ lục)
 * 5. GeneralFallbackParser: Văn bản tự do, chỉ thị, công văn
 */

// ============================================================================
// 1. LAW PARSER (Luật, Bộ Luật, Nghị quyết Quốc hội)
// ============================================================================
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

      // 1. Chapter / Part
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

      // 2. Section (Mục)
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

      // 3. Article (Điều)
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

// ============================================================================
// 2. DECREE & CIRCULAR PARSER (Nghị định, Quyết định, Thông tư)
// ============================================================================
const DecreeCircularParser = {
  name: 'DecreeCircularParser',

  extractMetadata(lines, fullText, filename) {
    const isDecree = /Nghị định/i.test(fullText.substring(0, 500)) || /NĐ-CP/i.test(filename);
    const isCircular = /Thông tư/i.test(fullText.substring(0, 500)) || /TT-/i.test(filename);

    const codeMatch = fullText.match(/(?:Số|Số hiệu)\s*[:\.]?\s*([0-9]+\/[0-9]{4}\/(?:NĐ-CP|TT-[A-Z]+|QĐ-[A-Z]+|VBHN-[A-Z]+))/i) ||
                      fullText.match(/\b([0-9]+\/[0-9]{4}\/(?:NĐ-CP|TT-[A-Z]+|QĐ-[A-Z]+|VBHN-[A-Z]+))\b/i) ||
                      fullText.match(/\b([0-9]+\/VBHN-[A-Z]+)\b/i) ||
                      filename.match(/([0-9]+[\_\/][0-9]{4}[\_\/](?:NĐ-CP|TT-[A-Z]+|QĐ-[A-Z]+|NĐ|TT))/i);

    let docType = isDecree ? 'Nghị định' : (isCircular ? 'Thông tư' : 'Quyết định');
    let issuer = isDecree ? 'Chính phủ' : 'Bộ ngành';

    if (filename.includes('BXD') || fullText.includes('Bộ Xây dựng')) issuer = 'Bộ Xây dựng';
    else if (filename.includes('BTC') || fullText.includes('Bộ Tài chính')) issuer = 'Bộ Tài chính';
    else if (filename.includes('BCA') || fullText.includes('Bộ Công an')) issuer = 'Bộ Công an';
    else if (filename.includes('BNNMT') || fullText.includes('Bộ Tài nguyên và Môi trường')) issuer = 'Bộ TN&MT';

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
      code: codeMatch ? codeMatch[1].replace(/_/g, '/') : filename.replace(/\.[^/.]+$/, ''),
      title: title || filename.replace(/\.[^/.]+$/, ''),
      docType,
      issuer,
      issueDate: dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : '',
      effectiveDate: ''
    };
  },

  extractNodes(lines) {
    // Uses Law-like structure: Chapter -> Article -> Clause -> Point
    return LawParser.extractNodes(lines);
  }
};

// ============================================================================
// 3. QCVN PARSER (Quy chuẩn Kỹ thuật Quốc gia)
// ============================================================================
const QCVNParser = {
  name: 'QCVNParser',

  extractMetadata(lines, fullText, filename) {
    const codeMatch = fullText.match(/\b(QCVN\s*[0-9]+(?::[0-9]{4})?(?:\/[A-Z0-9\-]+)?)\b/i) ||
                      filename.match(/(QCVN\s*[0-9]+[\_\:][0-9]{4}[\_\/][A-Z0-9\-]+)/i) ||
                      filename.match(/(QCVN\s*[0-9]+[\_\/][0-9]{4})/i);

    let title = '';
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      if (/^QUY CHUẨN KỸ THUẬT/i.test(lines[i]) || /^QCVN/i.test(lines[i])) {
        title = lines[i];
        if (lines[i + 1] && lines[i + 1].length > 5 && !/^(Mục lục|1\.|Lời nói đầu)/i.test(lines[i + 1])) {
          title += ' - ' + lines[++i];
        }
        break;
      }
    }

    const issuer = filename.includes('BCA') ? 'Bộ Công an' : (filename.includes('BXD') ? 'Bộ Xây dựng' : 'Bộ KH&CN');

    return {
      code: codeMatch ? codeMatch[1].replace(/_/g, '/').replace(/\s*:\s*/g, ':') : filename.replace(/\.[^/.]+$/, ''),
      title: title || filename.replace(/\.[^/.]+$/, ''),
      docType: 'QCVN',
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

      // Filter TOC
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

      // Check Major Part / Chapter / Appendix
      // e.g. "1 QUY ĐỊNH CHUNG", "2 QUY ĐỊNH KỸ THUẬT", "PHỤ LỤC A (quy định)"
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

      // Check Technical Clause / Subclause (e.g. "1.1 Phạm vi điều chỉnh", "2.1.3 Yêu cầu chống cháy", "Điều 1")
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

    // Fallback: If no subclause detected, break into paragraph chunks
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

// ============================================================================
// 4. TCVN PARSER (Tiêu chuẩn Quốc gia)
// ============================================================================
const TCVNParser = {
  name: 'TCVNParser',

  extractMetadata(lines, fullText, filename) {
    const codeMatch = fullText.match(/\b(TCVN\s*[0-9]+(?::[0-9]{4})?)\b/i) ||
                      filename.match(/(TCVN\s*[0-9]+(?::[0-9]{4})?)/i) ||
                      filename.match(/(TCVN[0-9]+[\_\:][0-9]{4})/i);

    let title = '';
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      if (/^TIÊU CHUẨN QUỐC GIA/i.test(lines[i]) || /^TCVN/i.test(lines[i])) {
        title = lines[i];
        if (lines[i + 1] && lines[i + 1].length > 5 && !/^(Mục lục|1\.|Lời nói đầu)/i.test(lines[i + 1])) {
          title += ' - ' + lines[++i];
        }
        break;
      }
    }

    return {
      code: codeMatch ? codeMatch[1].replace(/_/g, ':').replace(/\s*:\s*/g, ':') : filename.replace(/\.[^/.]+$/, ''),
      title: title || filename.replace(/\.[^/.]+$/, ''),
      docType: 'TCVN',
      issuer: 'Bộ KH&CN',
      issueDate: '',
      effectiveDate: ''
    };
  },

  extractNodes(lines) {
    // TCVN follows standard ISO-like numbered sections:
    // 1. Phạm vi áp dụng, 2. Tài liệu viện dẫn, 3. Thuật ngữ và định nghĩa, 4. Yêu cầu kỹ thuật, Phụ lục A...
    return QCVNParser.extractNodes(lines);
  }
};

// ============================================================================
// 5. PARSER FACTORY & REGISTRY (Selects the right parser for each file)
// ============================================================================
const LegalParserFactory = {
  getParser(filename = '', rawText = '') {
    const upperText = (rawText.substring(0, 1000) + ' ' + filename).toUpperCase();

    if (upperText.includes('QCVN') || upperText.includes('QUY CHUẨN KỸ THUẬT')) {
      return QCVNParser;
    }
    if (upperText.includes('TCVN') || upperText.includes('TIÊU CHUẨN QUỐC GIA')) {
      return TCVNParser;
    }
    if (upperText.includes('/QH') || upperText.includes('LUẬT SỐ') || upperText.includes('QUỐC HỘI BAN HÀNH LUẬT')) {
      return LawParser;
    }
    if (upperText.includes('NGHỊ ĐỊNH') || upperText.includes('NĐ-CP') || upperText.includes('THÔNG TƯ') || upperText.includes('TT-') || upperText.includes('QUYẾT ĐỊNH')) {
      return DecreeCircularParser;
    }

    // Default to Decree/Circular Parser
    return DecreeCircularParser;
  }
};

// ============================================================================
// MAIN LegalParser INTERFACE
// ============================================================================
const LegalParser = {
  LawParser,
  DecreeCircularParser,
  QCVNParser,
  TCVNParser,
  LegalParserFactory,

  async parseFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'docx') {
      if (typeof mammoth === 'undefined') throw new Error('Thư viện mammoth.js chưa được tải!');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return this.processDocumentText(result.value, file.name);
    } else if (extension === 'html' || extension === 'htm') {
      const text = await file.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      return this.processDocumentText(doc.body.innerText || doc.body.textContent || '', file.name);
    } else if (extension === 'txt') {
      return this.processDocumentText(await file.text(), file.name);
    } else {
      throw new Error(`Định dạng .${extension} không được hỗ trợ`);
    }
  },

  processDocumentText(rawText, filename = '') {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const fullText = lines.join('\n');

    // 1. Select specialized parser
    const strategy = LegalParserFactory.getParser(filename, fullText);

    // 2. Extract Metadata & Nodes using chosen strategy
    const metadata = strategy.extractMetadata(lines, fullText, filename);
    const nodes = strategy.extractNodes(lines);

    // 3. Extract Legal Relations
    const relations = this.extractRelations(fullText, metadata.code);

    const articleCount = nodes.filter(n => n.nodeType === 'article').length;

    return {
      doc: {
        code: metadata.code || 'CHƯA-RÕ-SỐ-HIỆU',
        title: metadata.title || filename.replace(/\.[^/.]+$/, ""),
        docType: metadata.docType || 'Văn bản khác',
        issuer: metadata.issuer || 'Đang cập nhật',
        issueDate: metadata.issueDate || '',
        effectiveDate: metadata.effectiveDate || metadata.issueDate || '',
        status: 'active',
        categoryIds: this.guessCategories(metadata.docType, metadata.title),
        metadata: {
          parserStrategy: strategy.name,
          totalArticles: articleCount,
          originalFilename: filename
        }
      },
      nodes,
      relations
    };
  },

  guessCategories(docType, title) {
    const lowerTitle = (title || '').toLowerCase();
    const categories = [];

    if (docType === 'Luật') categories.push(1);
    else if (docType === 'Nghị định') categories.push(2);
    else if (docType === 'Thông tư') categories.push(3);
    else if (docType === 'QCVN' || lowerTitle.includes('quy chuẩn kỹ thuật')) categories.push(5);
    else if (docType === 'TCVN' || lowerTitle.includes('tiêu chuẩn quốc gia')) categories.push(6);
    else categories.push(4);

    if (lowerTitle.includes('môi trường') || lowerTitle.includes('an toàn lao động')) categories.push(8);
    if (lowerTitle.includes('pccc') || lowerTitle.includes('phòng cháy') || lowerTitle.includes('chữa cháy') || lowerTitle.includes('cứu nạn') || lowerTitle.includes('an toàn cháy')) categories.push(9);
    if (lowerTitle.includes('đấu thầu') || lowerTitle.includes('xây dựng') || lowerTitle.includes('dự án') || lowerTitle.includes('hợp đồng') || lowerTitle.includes('quy hoạch') || lowerTitle.includes('đất đai') || lowerTitle.includes('đầu tư')) categories.push(10);

    return [...new Set(categories)];
  },

  extractRelations(text, selfDocCode = '') {
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
  },

  autoLinkLegalText(rawText, currentDocCode = '') {
    if (!rawText) return '';

    let escaped = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const alreadyWrapped = new Set();
    const _maskStore = [];
    const _M_O = '\x00A\x01';
    const _M_C = '\x02Z\x03';
    const _RX_A_TAG = /<a\s[^>]*class=["'][^"']*legal-ref[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
    const _validDocCode = /^(?:\d{2,5}[\/\-]\d{4}[\/\-](?:QH\d+|NĐ\-CP|TT[\-A-Z0-9]+|QĐ[\-A-Z0-9]+|UBND[\-A-Z0-9]+|VBHN[\-A-Z0-9]+|[A-Z0-9\-]+)|QCVN\s*[0-9]+:[0-9]{4}(?:\/[A-Z0-9\-]+)?|TCVN\s*[0-9]+(?::[0-9]{4})?)$/i;
    function _mask(str) {
      return str.replace(_RX_A_TAG, m => {
        _maskStore.push(m);
        return `${_M_O}${_maskStore.length - 1}${_M_C}`;
      });
    }
    function _unmask(str) {
      if (!_maskStore.length) return str;
      let out = str;
      let prev = null;
      let safety = 0;
      while (out !== prev) {
        prev = out;
        out = out.replace(new RegExp(`${_M_O.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\d+)${_M_C.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'g'), (_m, i) => _maskStore[+i] || '');
        if (++safety > 5) break;
      }
      return out;
    }

    function wrapMatch(fullMatch, opts = {}) {
      if (/<a\s+class=["']legal-ref/i.test(fullMatch)) return fullMatch;
      if (fullMatch.includes(_M_O) || fullMatch.includes(_M_C)) return fullMatch;
      const strip = v => String(v || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, '').replace(new RegExp(_M_O + '\\d+' + _M_C, 'g'), '').trim();
      const esc = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      let { targetDoc = '', article = '', clause = '', point = '', section = '', kind = 'ref' } = opts;
      targetDoc = strip(targetDoc);
      article = strip(article);
      clause = strip(clause);
      point = strip(point);
      section = strip(section);
      if (targetDoc && !_validDocCode.test(targetDoc)) {
        if (/^\d{1,4}$/.test(targetDoc)) targetDoc = '';
      }
      if (article) {
        article = article.replace(/^[ĐđD]iều\s+/i, '').replace(/[^\da-zđ]/gi, '').substring(0, 12);
      }
      if (clause) {
        clause = clause.replace(/^[Kk]hoản\s+/i, '').replace(/[^\da-zđ]/gi, '').substring(0, 12);
      }
      const k = `${kind}|${targetDoc}|${article}|${clause}|${point}|${section}`;
      if (alreadyWrapped.has(k)) return fullMatch;
      alreadyWrapped.add(k);
      const parts = [];
      if (targetDoc) parts.push(`data-target-doc="${esc(targetDoc)}"`);
      if (article) parts.push(`data-article="${esc(article)}"`);
      if (clause) parts.push(`data-clause="${esc(clause)}"`);
      if (point) parts.push(`data-point="${esc(point)}"`);
      if (section) parts.push(`data-section="${esc(section)}"`);
      const title = `Tra cứu ${fullMatch}`;
      return `<a class="legal-ref inline-flex items-center gap-0.5 font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline underline-offset-2 decoration-dotted cursor-pointer bg-blue-50 dark:bg-blue-500/5 px-1 rounded border border-blue-200/60 dark:border-transparent transition" ${parts.join(' ')} title="${esc(title)}">${fullMatch}</a>`;
    }

    const _RX_CODE_SUF_L1 = '(?:QH\\d+|NĐ\\-CP|TT[\\-A-Z0-9]+|QĐ[\\-A-Z0-9]+|UBND[\\-A-Z0-9]+|VBHN[\\-A-Z0-9]+|QCVN|TCVN|[A-Z0-9\\-]+)';
    const _RX_CODE_SUF    = '(?:QH\\d+|NĐ\\-CP|TT[\\-A-Z0-9]+|QĐ[\\-A-Z0-9]+|UBND[\\-A-Z0-9]+|VBHN[\\-A-Z0-9]+|[A-Z0-9\\-]+)';
    const _RX_DOCNUM_L1   = `([0-9]+(?:[\\/\\-][0-9]+(?:[\\/\\-]${_RX_CODE_SUF_L1})?)?|QCVN\\s*[0-9]+:[0-9]{4}(?:\\/[A-Z0-9\\-]+)?|TCVN\\s*[0-9]+(?::[0-9]{4})?)`;
    const _RX_DOCNUM      = `([0-9]+(?:[\\/\\-][0-9]+(?:[\\/\\-]${_RX_CODE_SUF})?)?|QCVN\\s*[0-9]+:[0-9]{4}(?:\\/[A-Z0-9\\-]+)?|TCVN\\s*[0-9]+(?::[0-9]{4})?)`;
    const _RX_NAME_OPT    = '(\\s+(?![Ss]ố\\b|[0-9])[A-Za-zÀ-Ỹà-ỹ\\s]{1,60}?)?';

    // =========================================================================
    // LỚP 1 — FULL CÂU UYỂN NGHIỆM — ĐÃ VÔ HIỆU HÓA
    // Lý do: L1 gộp nhiều clause/điều khác VB (cùng VB + VB khác) thành 1 anchor DUY NHẤT
    // → data-target-doc = VB cuối cùng, data-art/clause RỖNG → link cùng VB bị nhầm sang VB khác.
    // Thay thế: L3A (VB bắt buộc) + L3 (VB optional) parse TỪNG CỤM clause+article+[VB] riêng biệt 1:1.
    // =========================================================================
    const COMPOUND_L1_DISABLED = true;

    // Negative lookahead postfix: chỉ chấp nhận 1 ký tự hậu tố a-zđ (Điều 1a, Khoản 2b...) NẾU sau đó KHÔNG còn chữ cái nào (tránh ăn "50v" từ "50và", "51L" từ "51Luật")
    const _NUM_POSTFIX = '(?:[a-zđ](?![A-Za-zÀ-ỹ]))';

    // =========================================================================
    // LỚP 3A — UYỀN NGHIỆM CLAUSE + ĐIỀU + VB BẮT BUỘC (ƯU TIÊN CAO NHẤT, 0 whitespace tolerant)
    // Chạy TRƯỚC L2 standalone VB → đảm bảo VB khi đi kèm Điều/Khoản luôn được gộp chung 1 anchor.
    // =========================================================================
    const L3A_SRC =
      '(?:(Điểm\\s+([a-zđ])(?:\\.\\d+)?)\\s*[,và\\+\\s]*)?' +
      '(?:(?:[Kk]hoản\\s+(\\d+' + _NUM_POSTFIX + '?)(?:\\s*[,và\\+]\\s*[Kk]hoản\\s+\\d+' + _NUM_POSTFIX + '?)*)\\s*[,và]?\\s*)?' +
      '([ĐđD]iều\\s+(\\d+' + _NUM_POSTFIX + '?)(?:\\s*[,và\\+]\\s*(?![Kk]hoản\\b|Điểm\\b)[ĐđD]iều\\s+\\d+' + _NUM_POSTFIX + '?)*)' +
      '(?:\\s*(?:và|,|của|theo|tại|trong)\\s*|\\s*)' +
      '(Luật|Bộ\\s*Luật|Nghị\\s*định|Thông\\s*tư|Quyết\\s*định|Quy\\s*chuẩn|Tiêu\\s*chuẩn)' +
      _RX_NAME_OPT +
      '\\s*(?:số\\s+)?' +
      _RX_DOCNUM;
    const deepLinkVbRequiredRegex = new RegExp(L3A_SRC, 'gi');

    escaped = escaped.replace(deepLinkVbRequiredRegex, (fullMatch, pointPart, pointChar, clauseNumPart, articlePart, artNumStr, docTypePart, docNumWordPart, docNumPart) => {
      if (!articlePart && !clauseNumPart && !pointPart) return fullMatch;
      const artNum = artNumStr || '';
      const clauseNum = (clauseNumPart || '').toString();
      const pChar = (pointChar || '').toString();
      const targetDoc = docNumPart ? String(docNumPart).replace(/^số\s+/i, '').trim() : '';
      return wrapMatch(fullMatch, { targetDoc, article: artNum, clause: clauseNum, point: pChar, kind: 'deep-vb' });
    });
    escaped = _mask(escaped);

    // =========================================================================
    // LỚP 2 — VĂN BẢN ĐỘC LẬP CÓ LOẠI + SỐ HIỆU (Ưu tiên 3, SAU L3A)
    // =========================================================================
    const L2_SRC =
      '(Luật|Bộ\\s*Luật|Nghị\\s*định|Nghị\\s*quyết|Thông\\s*tư|Quyết\\s*định|Quy\\s*chuẩn\\s*kỹ\\s*thuật|Tiêu\\s*chuẩn\\s*quốc\\s*gia|Pháp\\s*lệnh|Quy\\s*định)' +
      _RX_NAME_OPT +
      '\\s*(?:số\\s+)?' +
      _RX_DOCNUM;
    const docTypeStandaloneRegex = new RegExp(L2_SRC, 'gi');

    escaped = escaped.replace(docTypeStandaloneRegex, (fullMatch, docType, numWord, docNum) => {
      const targetDoc = docNum ? String(docNum).replace(/^số\s+/i, '').trim() : '';
      if (!targetDoc) return fullMatch;
      const docTypeLC = (docType || '').toLowerCase().replace(/\s+/g, '');
      if (docTypeLC === 'quyđịnh') {
        if (/^\s*quy\s*định\s+(?:tại|theo)\b/i.test(fullMatch) || /\b(?:khoản|điều|mục|chương)\s*\d/i.test(fullMatch)) {
          return fullMatch;
        }
      }
      return wrapMatch(fullMatch, { targetDoc, article: '', kind: 'doc-standalone' });
    });
    escaped = _mask(escaped);

    // =========================================================================
    // LỚP 3 — NỔI CẤP BÊN TRONG (Điểm + Khoản + Điều + [VB OPTIONAL])
    // Sau L3A (VB Bắt buộc) + L2 (VB standalone) đã mask toàn bộ. L3 xử lý các phần CÙNG VĂN BẢN (VB trống / tham chiếu nội bộ)
    // =========================================================================
    const L3_SRC =
      '(?:(Điểm\\s+([a-zđ])(?:\\.\\d+)?)\\s*[,và\\+\\s]*)?' +
      '(?:(?:[Kk]hoản\\s+(\\d+' + _NUM_POSTFIX + '?)(?:\\s*[,và\\+]\\s*[Kk]hoản\\s+\\d+' + _NUM_POSTFIX + '?)*)\\s*[,và]?\\s*)?' +
      '([ĐđD]iều\\s+(\\d+' + _NUM_POSTFIX + '?)(?:\\s*[,và\\+]\\s*(?![Kk]hoản\\b|Điểm\\b)[ĐđD]iều\\s+\\d+' + _NUM_POSTFIX + '?)*)' +
      '(?:\\s*(?:và|,|của|theo|tại|trong)\\s*|\\s+)?' +
      '(?:' +
        '(Luật|Bộ\\s*Luật|Nghị\\s*định|Thông\\s*tư|Quyết\\s*định|Quy\\s*chuẩn|Tiêu\\s*chuẩn)' +
        _RX_NAME_OPT +
        '\\s*(?:số\\s+)?' +
        _RX_DOCNUM +
      ')?';
    const deepLinkRegex = new RegExp(L3_SRC, 'gi');

    escaped = escaped.replace(deepLinkRegex, (fullMatch, pointPart, pointChar, clauseNumPart, articlePart, artNumStr, docTypePart, docNumWordPart, docNumPart) => {
      if (!articlePart && !clauseNumPart && !pointPart) return fullMatch;
      const artNum = artNumStr || '';
      const clauseNum = (clauseNumPart || '').toString();
      const pChar = (pointChar || '').toString();
      const targetDoc = docNumPart ? String(docNumPart).replace(/^số\s+/i, '').trim() : '';
      return wrapMatch(fullMatch, { targetDoc, article: artNum, clause: clauseNum, point: pChar, kind: 'deep' });
    });
    escaped = _mask(escaped);

    // =========================================================================
    // LỚP 4 — STANDALONE CODE NHƯNG KHÔNG CÓ DOC TYPE
    // =========================================================================
    const L4_SRC =
      '(?<![A-Z0-9À-Ỹ])' +
      '(\\d{2,5}[\\/\\-]\\d{4}[\\/\\-]' + _RX_CODE_SUF +
      '|QCVN\\s*[0-9]+:[0-9]{4}(?:\\/[A-Z0-9\\-]+)?' +
      '|TCVN\\s*[0-9]+(?::[0-9]{4})?)' +
      '(?![A-Z0-9À-Ỹ_\\-])';
    const standaloneDocRegex = new RegExp(L4_SRC, 'gi');

    escaped = escaped.replace(standaloneDocRegex, (fullMatch, docCode) => {
      if (!docCode) return fullMatch;
      return wrapMatch(fullMatch, { targetDoc: docCode, article: '', kind: 'code' });
    });

    return _unmask(escaped);
  }
};

window.LegalParser = LegalParser;
