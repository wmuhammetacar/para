import PDFDocument from 'pdfkit';

const THEME = {
  pageBgLine: '#e2e8f0',
  brandDark: '#0f172a',
  brandPrimary: '#1d4ed8',
  brandSoft: '#dbeafe',
  textMain: '#0f172a',
  textMuted: '#64748b',
  textSoft: '#475569',
  cardBg: '#f8fafc',
  cardBorder: '#dbe2ee',
  tableHeaderBg: '#eff6ff',
  tableHeaderBorder: '#bfdbfe',
  tableRowEven: '#f8fbff',
  tableRowOdd: '#ffffff',
  totalBg: '#eff6ff',
  totalBorder: '#bfdbfe'
};

function formatCurrency(value) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY'
  }).format(Number(value) || 0);
}

function sanitizeFilename(value) {
  const fallback = 'belge';
  const raw = String(value || '').replace(/[\r\n"]/g, '').trim();
  if (!raw) {
    return fallback;
  }

  const safe = raw
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 80);

  return safe || fallback;
}

function normalizeItems(items = []) {
  return items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price ?? item.unitPrice) || 0;
    const lineTotal = Number(item.total ?? quantity * unitPrice) || 0;

    return {
      name: item.name || '-',
      quantity,
      unitPrice,
      lineTotal
    };
  });
}

function formatPaymentStatus(status) {
  if (status === 'paid') {
    return 'Tahsil Edildi';
  }

  return 'Beklemede';
}

function buildCompanyContactLine(payload) {
  const parts = [];

  if (payload.companyPhone) {
    parts.push(`Tel: ${payload.companyPhone}`);
  }
  if (payload.companyEmail) {
    parts.push(`E-posta: ${payload.companyEmail}`);
  }
  if (payload.companyAddress) {
    parts.push(payload.companyAddress);
  }

  return parts.join(' | ');
}

function drawRoundedCard(doc, x, y, width, height, fillColor, strokeColor, radius = 10) {
  doc.save();
  doc
    .fillColor(fillColor)
    .strokeColor(strokeColor)
    .lineWidth(1)
    .roundedRect(x, y, width, height, radius)
    .fillAndStroke();
  doc.restore();
}

function getContentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function drawPageTopAccent(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.page.margins.top - 18;

  doc.save();
  doc
    .strokeColor(THEME.pageBgLine)
    .lineWidth(1)
    .moveTo(left, y)
    .lineTo(right, y)
    .stroke();
  doc.restore();
}

function drawMainHeader(doc, payload) {
  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  const width = getContentWidth(doc);
  const headerHeight = 116;
  const infoWidth = 194;

  drawRoundedCard(doc, left, top, width, headerHeight, THEME.brandDark, '#0b1220', 12);
  drawRoundedCard(doc, left + width - infoWidth - 16, top + 14, infoWidth, 88, '#1e293b', '#334155', 10);

  doc.save();
  doc.fillColor(THEME.brandPrimary).roundedRect(left + 18, top + 18, 8, 80, 4).fill();
  doc.restore();

  doc
    .fontSize(25)
    .fillColor('#ffffff')
    .text(payload.companyName || 'Teklifim', left + 36, top + 20, {
      width: width - infoWidth - 70
    });
  doc
    .fontSize(10)
    .fillColor('#cbd5e1')
    .text('Teklif ve Fatura Yonetim Platformu', left + 36, top + 52, {
      width: width - infoWidth - 70
    });

  const contactLine = buildCompanyContactLine(payload);
  if (contactLine) {
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(contactLine, left + 36, top + 64, {
        width: width - infoWidth - 70
      });
  }

  drawRoundedCard(doc, left + 36, top + 70, 116, 24, '#1d4ed8', '#2563eb', 12);
  doc
    .fontSize(9)
    .fillColor('#dbeafe')
    .text(`${String(payload.documentType).toUpperCase()} BELGESI`, left + 46, top + 78, {
      width: 96,
      align: 'center'
    });

  const infoX = left + width - infoWidth - 2;
  doc.fontSize(9).fillColor('#94a3b8').text('Belge No', infoX, top + 22, { width: infoWidth - 30 });
  doc.fontSize(12).fillColor('#ffffff').text(payload.documentNumber || '-', infoX, top + 35, {
    width: infoWidth - 30
  });
  doc.fontSize(9).fillColor('#94a3b8').text('Belge Tarihi', infoX, top + 58, { width: infoWidth - 30 });
  doc.fontSize(11).fillColor('#ffffff').text(payload.date || '-', infoX, top + 71, {
    width: infoWidth - 30
  });

  return top + headerHeight + 16;
}

function drawInfoCards(doc, payload, startY) {
  const left = doc.page.margins.left;
  const contentWidth = getContentWidth(doc);
  const leftCardWidth = Math.floor(contentWidth * 0.62);
  const rightCardWidth = contentWidth - leftCardWidth - 12;
  const cardHeight = 132;

  drawRoundedCard(doc, left, startY, leftCardWidth, cardHeight, THEME.cardBg, THEME.cardBorder);
  drawRoundedCard(
    doc,
    left + leftCardWidth + 12,
    startY,
    rightCardWidth,
    cardHeight,
    THEME.cardBg,
    THEME.cardBorder
  );

  doc.fontSize(11).fillColor(THEME.textMain).text('Musteri Bilgileri', left + 14, startY + 14);
  doc.fontSize(10).fillColor(THEME.textSoft).text(`Ad: ${payload.customer.name || '-'}`, left + 14, startY + 35);
  doc.text(`Telefon: ${payload.customer.phone || '-'}`, left + 14, startY + 52);
  doc.text(`E-posta: ${payload.customer.email || '-'}`, left + 14, startY + 69);
  doc.text(`Adres: ${payload.customer.address || '-'}`, left + 14, startY + 86, {
    width: leftCardWidth - 28
  });

  const rightX = left + leftCardWidth + 26;
  doc.fontSize(11).fillColor(THEME.textMain).text('Belge Bilgileri', rightX, startY + 14);
  doc.fontSize(10).fillColor(THEME.textSoft).text(`Belge Tipi: ${payload.documentType}`, rightX, startY + 35);
  doc.text(`Belge No: ${payload.documentNumber || '-'}`, rightX, startY + 52, {
    width: rightCardWidth - 28
  });
  doc.text(`Belge Tarihi: ${payload.date || '-'}`, rightX, startY + 69, {
    width: rightCardWidth - 28
  });
  doc.text(`Vade Tarihi: ${payload.dueDate || payload.date || '-'}`, rightX, startY + 84, {
    width: rightCardWidth - 28
  });
  doc.text(`Odeme Durumu: ${formatPaymentStatus(payload.paymentStatus)}`, rightX, startY + 99, {
    width: rightCardWidth - 28
  });
  doc.text(`Tahsil Tarihi: ${payload.paidAt || '-'}`, rightX, startY + 114, {
    width: rightCardWidth - 28
  });
  doc
    .fontSize(8)
    .fillColor(THEME.textMuted)
    .text('Teklifim sistemi tarafindan otomatik uretilmistir.', rightX, startY + 123, {
      width: rightCardWidth - 28
    });

  return startY + cardHeight + 18;
}

function getTableColumns(doc) {
  const left = doc.page.margins.left;
  const width = getContentWidth(doc);
  const noWidth = 34;
  const quantityWidth = 64;
  const unitPriceWidth = 108;
  const lineTotalWidth = 108;
  const nameWidth = width - noWidth - quantityWidth - unitPriceWidth - lineTotalWidth;

  const noX = left;
  const nameX = noX + noWidth;
  const quantityX = nameX + nameWidth;
  const unitPriceX = quantityX + quantityWidth;
  const lineTotalX = unitPriceX + unitPriceWidth;

  return {
    left,
    width,
    noX,
    nameX,
    quantityX,
    unitPriceX,
    lineTotalX,
    noWidth,
    nameWidth,
    quantityWidth,
    unitPriceWidth,
    lineTotalWidth
  };
}

function drawTableHeader(doc, y, columns) {
  drawRoundedCard(
    doc,
    columns.left,
    y,
    columns.width,
    30,
    THEME.tableHeaderBg,
    THEME.tableHeaderBorder,
    8
  );

  doc.fontSize(10).fillColor('#334155');
  doc.text('#', columns.noX + 8, y + 10, {
    width: columns.noWidth - 12
  });
  doc.text('Urun / Hizmet', columns.nameX + 8, y + 10, {
    width: columns.nameWidth - 12
  });
  doc.text('Miktar', columns.quantityX + 4, y + 10, {
    width: columns.quantityWidth - 8,
    align: 'right'
  });
  doc.text('Birim Fiyat', columns.unitPriceX + 4, y + 10, {
    width: columns.unitPriceWidth - 8,
    align: 'right'
  });
  doc.text('Toplam', columns.lineTotalX + 4, y + 10, {
    width: columns.lineTotalWidth - 8,
    align: 'right'
  });

  return y + 36;
}

function drawContinuationHeader(doc, payload) {
  const left = doc.page.margins.left;
  const y = doc.page.margins.top;
  const width = getContentWidth(doc);

  drawPageTopAccent(doc);

  doc.fontSize(11).fillColor(THEME.brandPrimary).text(`${payload.documentType} - ${payload.documentNumber}`, left, y);
  doc.fontSize(9).fillColor(THEME.textMuted).text(payload.companyName || 'Teklifim', left + width - 170, y, {
    width: 170,
    align: 'right'
  });

  return y + 18;
}

function drawTableRow(doc, y, columns, item, index) {
  const baseNameHeight = doc.heightOfString(item.name, {
    width: columns.nameWidth - 12,
    align: 'left'
  });
  const rowHeight = Math.max(28, Math.ceil(baseNameHeight) + 12);

  drawRoundedCard(
    doc,
    columns.left,
    y,
    columns.width,
    rowHeight,
    index % 2 === 0 ? THEME.tableRowOdd : THEME.tableRowEven,
    '#e2e8f0',
    4
  );

  const textY = y + 8;

  doc.fontSize(9).fillColor(THEME.textMuted).text(String(index + 1), columns.noX + 8, textY, {
    width: columns.noWidth - 12
  });
  doc.fontSize(10).fillColor(THEME.textMain).text(item.name, columns.nameX + 8, textY, {
    width: columns.nameWidth - 12
  });
  doc.fontSize(10).fillColor(THEME.textSoft).text(String(item.quantity), columns.quantityX + 4, textY, {
    width: columns.quantityWidth - 8,
    align: 'right'
  });
  doc.text(formatCurrency(item.unitPrice), columns.unitPriceX + 4, textY, {
    width: columns.unitPriceWidth - 8,
    align: 'right'
  });
  doc.fontSize(10).fillColor(THEME.textMain).text(formatCurrency(item.lineTotal), columns.lineTotalX + 4, textY, {
    width: columns.lineTotalWidth - 8,
    align: 'right'
  });

  return rowHeight + 4;
}

function drawTotalCard(doc, y, payload) {
  const summaryWidth = 248;
  const summaryHeight = 86;
  const x = doc.page.width - doc.page.margins.right - summaryWidth;

  drawRoundedCard(doc, x, y, summaryWidth, summaryHeight, THEME.totalBg, THEME.totalBorder, 10);

  doc.fontSize(10).fillColor('#334155').text('Genel Toplam', x + 14, y + 16, {
    width: summaryWidth - 28
  });
  doc.fontSize(18).fillColor('#1e3a8a').text(formatCurrency(payload.total), x + 14, y + 36, {
    width: summaryWidth - 28,
    align: 'right'
  });
}

function drawFooterNote(doc, payload) {
  const left = doc.page.margins.left;
  const width = getContentWidth(doc);
  const y = doc.page.height - doc.page.margins.bottom + 10;

  doc.save();
  doc
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .moveTo(left, y - 6)
    .lineTo(left + width, y - 6)
    .stroke();
  doc.restore();

  const footerLeft = payload.companyTaxNumber
    ? `${payload.companyName} | VKN/TCKN: ${payload.companyTaxNumber}`
    : `${payload.companyName} | teklifim`;
  doc.fontSize(8).fillColor('#94a3b8').text(footerLeft, left, y, {
    width,
    align: 'left'
  });
  doc.fontSize(8).fillColor('#94a3b8').text(`Sistem tarafindan otomatik uretilmistir. (${payload.generatedAt})`, left, y, {
    width,
    align: 'right'
  });
}

export function writeDocumentPdf(res, payload) {
  const safePayload = {
    companyName: payload.companyName || 'Teklifim',
    companyEmail: payload.companyEmail || process.env.COMPANY_EMAIL || '',
    companyPhone: payload.companyPhone || process.env.COMPANY_PHONE || '',
    companyAddress: payload.companyAddress || process.env.COMPANY_ADDRESS || '',
    companyTaxNumber: payload.companyTaxNumber || process.env.COMPANY_TAX_NUMBER || '',
    documentType: payload.documentType || 'Belge',
    documentNumber: payload.documentNumber || '-',
    date: payload.date || '-',
    customer: {
      name: payload.customer?.name || '-',
      phone: payload.customer?.phone || '-',
      email: payload.customer?.email || '-',
      address: payload.customer?.address || '-'
    },
    dueDate: payload.dueDate || payload.date || '-',
    paymentStatus: payload.paymentStatus || 'pending',
    paidAt: payload.paidAt || null,
    generatedAt: new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date()),
    total: Number(payload.total) || 0,
    items: normalizeItems(payload.items)
  };

  const doc = new PDFDocument({ size: 'A4', margin: 44 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFilename(safePayload.documentNumber || safePayload.documentType)}.pdf"`
  );

  doc.info = {
    ...doc.info,
    Title: `${safePayload.documentType} - ${safePayload.documentNumber}`,
    Author: safePayload.companyName,
    Subject: `${safePayload.documentType} Belgesi`,
    Keywords: 'teklif, fatura, tahsilat, teklifim'
  };

  doc.pipe(res);

  drawPageTopAccent(doc);
  let y = drawMainHeader(doc, safePayload);
  y = drawInfoCards(doc, safePayload, y);

  let columns = getTableColumns(doc);
  y = drawTableHeader(doc, y, columns);

  if (!safePayload.items.length) {
    drawRoundedCard(doc, columns.left, y, columns.width, 34, '#ffffff', '#e2e8f0', 4);
    doc.fontSize(10).fillColor(THEME.textMuted).text('Kalem bulunamadi.', columns.left + 12, y + 12);
    y += 40;
  }

  for (let index = 0; index < safePayload.items.length; index += 1) {
    const item = safePayload.items[index];
    const predictedHeight =
      Math.max(
        28,
        Math.ceil(
          doc.heightOfString(item.name, {
            width: columns.nameWidth - 12,
            align: 'left'
          })
        ) + 12
      ) + 4;
    const pageLimit = doc.page.height - doc.page.margins.bottom - 120;

    if (y + predictedHeight > pageLimit) {
      doc.addPage();
      y = drawContinuationHeader(doc, safePayload);
      columns = getTableColumns(doc);
      y = drawTableHeader(doc, y, columns);
    }

    y += drawTableRow(doc, y, columns, item, index);
  }

  const totalCardHeight = 86;
  const totalStartY = y + 16;
  const pageLimit = doc.page.height - doc.page.margins.bottom - totalCardHeight - 20;

  if (totalStartY > pageLimit) {
    doc.addPage();
    y = drawContinuationHeader(doc, safePayload);
  }

  const finalY = Math.max(y + 16, doc.page.margins.top + 24);
  drawTotalCard(doc, finalY, safePayload);
  drawFooterNote(doc, safePayload);

  doc.end();
}
