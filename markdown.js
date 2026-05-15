// Markdown rendering with #hashtag linkification.
// Depends on window.marked and window.DOMPurify (vendored UMD).

const { marked } = window;
const DOMPurify = window.DOMPurify;

marked.setOptions({ gfm: false, breaks: true });

// Fresh regex per call — global regexes carry `lastIndex` state across exec() calls.
function tagRe() { return /(^|\s)#([\p{L}\d_-]+)/gu; }

export function extractTags(text) {
  if (!text) return [];
  const set = new Set();
  const re = tagRe();
  let m;
  while ((m = re.exec(text)) !== null) set.add(m[2].toLowerCase());
  return [...set];
}

function linkifyTags(md) {
  return md.replace(tagRe(),
    (_, lead, tag) => `${lead}<a href="#" data-tag="${tag.toLowerCase()}" class="hashtag">#${tag}</a>`);
}

export function render(md) {
  if (!md) return '';
  const tagged = linkifyTags(md);
  const html = marked.parse(tagged);
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-tag', 'target', 'rel'],
    ADD_TAGS: ['mark'],
  });
}

// Highlights all case-insensitive occurrences of `needle` inside the rendered
// HTML, wrapping them in <mark>. Operates on text nodes only so it does not
// damage tags / attributes.
export function highlight(html, needle) {
  if (!needle) return html;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  const targets = [];
  let n;
  while ((n = walker.nextNode())) {
    if (n.parentNode.nodeName === 'CODE' || n.parentNode.nodeName === 'PRE') continue;
    if (re.test(n.nodeValue)) { re.lastIndex = 0; targets.push(n); }
  }
  for (const node of targets) {
    const span = document.createElement('span');
    span.innerHTML = node.nodeValue.replace(re, m => `<mark>${m}</mark>`);
    node.replaceWith(...span.childNodes);
  }
  return wrapper.innerHTML;
}
