function cleanCaption(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { cleanCaption };
