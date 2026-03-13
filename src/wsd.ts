/**
 * WebSequenceDiagrams (WSD) support.
 *
 * Encodes diagram text using LZ77 compression + URL-safe Base64 encoding,
 * then builds a URL to the WSD server's image-rendering endpoint.
 *
 * Reference: https://www.websequencediagrams.com
 */

const BASE64_TABLE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

class BitWriter {
  private str = '';
  private partial = 0;
  private partialSize = 0;

  addBits(bits: number, size: number): void {
    this.partial = (this.partial << size) | bits;
    this.partialSize += size;
    while (this.partialSize >= 6) {
      this.str += BASE64_TABLE.charAt(
        (this.partial >> (this.partialSize - 6)) & 0x3f,
      );
      this.partialSize -= 6;
    }
  }

  finish(): string {
    if (this.partialSize) {
      this.str += BASE64_TABLE.charAt(
        (this.partial << (6 - this.partialSize)) & 0x3f,
      );
      this.partialSize = 0;
      this.partial = 0;
    }
    return this.str;
  }
}

function encodeBase64(str: string): string {
  const writer = new BitWriter();
  for (let n = 0; n < str.length; n++) {
    writer.addBits(str.charCodeAt(n), 8);
  }
  return writer.finish();
}

function encodeUtf8(input: string): string {
  const normalized = input.replace(/\r\n/g, '\n');
  let utftext = '';

  for (let n = 0; n < normalized.length; n++) {
    const c = normalized.charCodeAt(n);

    if (c < 128) {
      utftext += String.fromCharCode(c);
    } else if (c > 127 && c < 2048) {
      utftext += String.fromCharCode((c >> 6) | 192);
      utftext += String.fromCharCode((c & 63) | 128);
    } else {
      utftext += String.fromCharCode((c >> 12) | 224);
      utftext += String.fromCharCode(((c >> 6) & 63) | 128);
      utftext += String.fromCharCode((c & 63) | 128);
    }
  }

  return utftext;
}

function encodeNumber(num: number): string {
  if (num >= 0x3fff) {
    return (
      String.fromCharCode(0x80 | ((num >> 14) & 0x7f)) +
      String.fromCharCode(0x80 | ((num >> 7) & 0x7f)) +
      String.fromCharCode(num & 0x7f)
    );
  } else if (num >= 0x7f) {
    return (
      String.fromCharCode(0x80 | ((num >> 7) & 0x7f)) +
      String.fromCharCode(num & 0x7f)
    );
  } else {
    return String.fromCharCode(num);
  }
}

function encodeLz77(input: string): string {
  const MinStringLength = 4;
  let output = '';
  let pos = 0;
  const hash: { [key: string]: number[] } = {};

  const lastPos = input.length - MinStringLength;

  for (let i = MinStringLength; i < input.length; i++) {
    const subs = input.substr(i - MinStringLength, MinStringLength);
    if (hash[subs] === undefined) {
      hash[subs] = [];
    }
    hash[subs].push(i - MinStringLength);
  }

  while (pos < lastPos) {
    let matchLength = MinStringLength;
    let foundMatch = false;
    const bestMatch = { distance: 0, length: 0 };
    const prefix = input.substr(pos, MinStringLength);
    const matches = hash[prefix];

    if (matches !== undefined) {
      for (let i = 0; i < matches.length; i++) {
        const searchStart = matches[i];
        if (searchStart + matchLength >= pos) {
          break;
        }

        while (searchStart + matchLength < pos) {
          const isValidMatch =
            input.substr(searchStart, matchLength) ===
            input.substr(pos, matchLength);
          if (isValidMatch) {
            const realMatchLength = matchLength;
            matchLength++;
            if (foundMatch && realMatchLength > bestMatch.length) {
              bestMatch.distance = pos - searchStart - realMatchLength;
              bestMatch.length = realMatchLength;
            }
            foundMatch = true;
          } else {
            break;
          }
        }
      }
    }

    if (bestMatch.length) {
      output +=
        String.fromCharCode(0) +
        encodeNumber(bestMatch.distance) +
        encodeNumber(bestMatch.length);
      pos += bestMatch.length;
    } else {
      if (input.charCodeAt(pos) !== 0) {
        output += input.charAt(pos);
      } else {
        output += String.fromCharCode(0) + String.fromCharCode(0);
      }
      pos++;
    }
  }

  return output + input.slice(pos).replace(/\0/g, '\0\0');
}

/**
 * Encode diagram text into the compressed `lz` parameter
 * used by websequencediagrams.com.
 */
export function encodeWsdText(text: string): string {
  return encodeBase64(encodeLz77(encodeUtf8(text)));
}

/**
 * Build the full image URL for a WSD diagram.
 *
 * @param text     Raw diagram source
 * @param server   WSD server base URL (no trailing slash)
 * @param style    Optional diagram style (e.g. "default", "modern-blue", "napkin")
 * @param apiKey   Optional API key for premium styles
 */
export function buildWsdImageUrl(
  text: string,
  server: string,
  style?: string,
  apiKey?: string,
): string {
  const encoded = encodeWsdText(text);
  let url = `${server}/cgi-bin/cdraw?lz=${encoded}`;
  if (style) {
    url += `&s=${style}`;
  }
  if (apiKey) {
    url += `&apikey=${apiKey}`;
  }
  return url;
}

/**
 * Decode common HTML entities back to their literal characters.
 */
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Post-process rendered HTML: find `wsd` code blocks and replace them
 * with `<img>` tags pointing at the WSD server.
 *
 * The crossnote engine emits unrecognised fenced blocks as:
 *   <pre ... data-role="codeBlock" data-info="wsd" ...>content</pre>
 *
 * This function converts each one to a rendered diagram image.
 */
export function processWsdBlocks(
  html: string,
  server: string,
  apiKey?: string,
): string {
  // Match <pre> elements whose data-info attribute starts with "wsd"
  const pattern =
    /<pre\b[^>]*?\bdata-info="wsd(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/pre>/gi;

  return html.replace(pattern, (_match, content: string) => {
    // Strip HTML tags (e.g. Prism.js syntax-highlight spans) to recover raw text
    const rawText = decodeHtmlEntities(content.replace(/<[^>]*>/g, '')).trim();
    if (!rawText) {
      return '<div class="wsd-diagram"><em>Empty WSD diagram</em></div>';
    }

    const imgUrl = buildWsdImageUrl(rawText, server, 'rose', apiKey);
    return `<div class="wsd-diagram"><img src="${imgUrl}" alt="Sequence Diagram"></div>`;
  });
}
