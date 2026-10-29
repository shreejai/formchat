import { describe, expect, it } from "vitest";
import { escapeHtml, paragraphHtmlToText, toParagraphHtml } from "./html";

describe("escapeHtml", () => {
  it("escapes every markup character", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("toParagraphHtml", () => {
  it("wraps a single paragraph", () => {
    expect(toParagraphHtml("2 BHK flat in Dharampeth.")).toBe("<p>2 BHK flat in Dharampeth.</p>");
  });

  it("splits on blank lines and keeps single newlines as <br>", () => {
    expect(toParagraphHtml("Line one\nline two\n\n\n  Second para  ")).toBe(
      "<p>Line one<br>line two</p><p>Second para</p>",
    );
  });

  it("normalises Windows line endings", () => {
    expect(toParagraphHtml("a\r\n\r\nb\r\nc")).toBe("<p>a</p><p>b<br>c</p>");
  });

  it("never lets a script tag through", () => {
    const html = toParagraphHtml(`Nice flat <script>alert("x")</script>\n\n<img src=x onerror=alert(1)>`);
    expect(html).not.toMatch(/<script|<img/i);
    expect(html).toBe(
      "<p>Nice flat &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>" +
        "<p>&lt;img src=x onerror=alert(1)&gt;</p>",
    );
  });

  it("escapes entities the user typed, so they show literally", () => {
    expect(toParagraphHtml("R&amp;D park &lt;br&gt;")).toBe("<p>R&amp;amp;D park &amp;lt;br&amp;gt;</p>");
  });
});

describe("paragraphHtmlToText", () => {
  const cases = [
    "2 BHK flat",
    "Line one\nline two\n\nSecond para",
    `Tricky <script>alert("x")</script> & 'quotes'`,
    "R&amp;D park <br> &lt;p&gt;",
  ];

  it.each(cases)("round-trips %j", (text) => {
    expect(paragraphHtmlToText(toParagraphHtml(text))).toBe(text);
  });
});
