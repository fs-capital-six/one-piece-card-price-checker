const fs = require('fs');
const sharp = require('sharp');

const HORIZONTAL_PADDING = 12;
const VERTICAL_PADDING = 10;
const LINE_HEIGHT_RATIO = 1.35;
const CHAR_WIDTH_RATIO = 0.62;

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildCodeLine({ rowNumber, cardCode }) {
  const number = Number(rowNumber) > 0 ? Number(rowNumber) : 1;
  return `${number}. ${String(cardCode || '').trim()}`;
}

function buildLabelText({ rowNumber, cardCode, priceFormatted }) {
  const codeLine = buildCodeLine({ rowNumber, cardCode });
  if (priceFormatted) return `${codeLine}\n${priceFormatted}`;
  return codeLine;
}

function computeFontSizeFromWidth(width) {
  const size = Math.round(width * 0.055);
  return Math.max(11, Math.min(22, size));
}

function estimateTextWidth(text, fontSize) {
  return String(text).length * fontSize * CHAR_WIDTH_RATIO;
}

function buildTspan(text, { fontSize, availableWidth, dy, x = '50%' }) {
  const escaped = escapeXml(text);
  const estimated = estimateTextWidth(text, fontSize);

  if (estimated <= availableWidth) {
    return `<tspan x="${x}" dy="${dy}">${escaped}</tspan>`;
  }

  return `<tspan x="${x}" dy="${dy}" textLength="${availableWidth}" lengthAdjust="spacingAndGlyphs">${escaped}</tspan>`;
}

function computeLabelLayout(width, { rowNumber, cardCode, priceFormatted }) {
  const codeLine = buildCodeLine({ rowNumber, cardCode });
  const price = String(priceFormatted || '').trim();
  const hasPrice = Boolean(price);
  const fontSize = computeFontSizeFromWidth(width);
  const lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO);
  const availableWidth = Math.max(width - HORIZONTAL_PADDING * 2, 40);
  const lineCount = hasPrice ? 2 : 1;
  const labelHeight = VERTICAL_PADDING * 2 + lineHeight * lineCount;

  return {
    fontSize,
    lineHeight,
    labelHeight,
    verticalPadding: VERTICAL_PADDING,
    availableWidth,
    hasPrice,
    codeLine,
    price,
  };
}

function buildLabelSvg(width, layout) {
  const {
    fontSize,
    lineHeight,
    labelHeight,
    verticalPadding,
    availableWidth,
    hasPrice,
    codeLine,
    price,
  } = layout;
  const firstBaseline = verticalPadding + fontSize;

  const codeTspan = buildTspan(codeLine, {
    fontSize,
    availableWidth,
    dy: 0,
  });

  const priceTspan = hasPrice
    ? buildTspan(price, {
        fontSize,
        availableWidth,
        dy: lineHeight,
      })
    : '';

  return `
    <svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${labelHeight}" fill="#ffffff"/>
      <text
        x="50%"
        y="${firstBaseline}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#111111"
      >
        ${codeTspan}
        ${priceTspan}
      </text>
    </svg>
  `;
}

async function labelPhotoBuffer(imageBuffer, { rowNumber, cardCode, priceFormatted }) {
  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const width = meta.width || 800;
  const layout = computeLabelLayout(width, { rowNumber, cardCode, priceFormatted });
  const svg = buildLabelSvg(width, layout);

  return image
    .extend({
      bottom: layout.labelHeight,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .composite([{ input: Buffer.from(svg), top: meta.height, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function labelPhotoFromFile(filePath, options) {
  const buffer = fs.readFileSync(filePath);
  return labelPhotoBuffer(buffer, options);
}

module.exports = {
  labelPhotoBuffer,
  labelPhotoFromFile,
  buildLabelText,
  computeLabelLayout,
  computeFontSizeFromWidth,
};
