const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const UNESCAPES: Record<string, string> = Object.fromEntries(
  Object.entries(ESCAPES).map(([char, entity]) => [entity, char]),
);

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * The user's own text as HTML: escaped, one `<p>` per paragraph (blank-line separated),
 * single newlines as `<br>`. Nothing in the input can become markup.
 */
export function toParagraphHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Reverses toParagraphHtml, for showing the description as text and prefilling an edit. */
export function paragraphHtmlToText(html: string): string {
  return html
    .replace(/^<p>|<\/p>$/g, "")
    .split("</p><p>")
    .map((paragraph) =>
      paragraph
        .replace(/<br>/g, "\n")
        .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => UNESCAPES[entity]),
    )
    .join("\n\n");
}
