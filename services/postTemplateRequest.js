const fs = require('fs');
const { generatePostFromCsv } = require('./postTemplate');

function readPostTemplateInput(req) {
  const csvFile = req.files?.csv?.[0];
  if (!csvFile) {
    throw new Error('File CSV wajib diunggah');
  }

  const csvText = fs.readFileSync(csvFile.path, 'utf8');
  const photoFiles = req.files?.photos || [];
  const title = typeof req.body.title === 'string' ? req.body.title : '';
  const footer = typeof req.body.footer === 'string' ? req.body.footer : '';

  return {
    csvText,
    photoFiles,
    title,
    footer,
    uploaded: [...(req.files?.csv || []), ...photoFiles],
  };
}

function processPostTemplate(req) {
  const input = readPostTemplateInput(req);
  const result = generatePostFromCsv(input);
  return { ...input, result };
}

module.exports = { readPostTemplateInput, processPostTemplate };
