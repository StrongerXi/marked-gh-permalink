import hljs from 'highlight.js/lib/common';


/// Parse `permalink` and return the relevant components or null.
function parsePermalink(permalink) {
  // Source: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-a-permanent-link-to-a-code-snippet#linking-to-markdown
  const regex = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.*)\.(.*)#L(\d+)-L(\d+)$/;
  const match = permalink.match(regex);

  // Bundle up parsed results.
  if (match) {
    const [/*permalink*/, owner, repo, commit, pathPrefix, languageSuffix, lineFrom, lineTo] = match;
    const path = pathPrefix + "." + languageSuffix;
    const codeLink = permalink;
    const commitLink = `https://github.com/${owner}/${repo}/commit/${commit}`;
    return {
      owner,
      repo,
      commit,
      path,
      codeLink,
      commitLink,
      languageSuffix,
      lineFrom: parseInt(lineFrom, 10),
      lineTo: parseInt(lineTo, 10),
    };
  }
  return null;
}


// The following is mostly mimicking GitHub css for rendering code snippet.
// Write once, never live again.
const outermostBlockCss = {
  // Nice thin border with round corners.
  "border-color": "#d0d7de",
  "border-radius": "6px",
  "border-style": "solid",
  "border-width": "1px",

  // Without this, the child will overflow the round corner, making the corner
  // look "cut off".
  "overflow": "hidden",
}

const headerBlockCss = {
  // Header has a different color
  "background-color": "#f6f8fa",

  // Another border to separate header and code
  "border-bottom": "1px solid #d0d7de",

  // Pad header content from border
  "padding": "8px 16px",

  // Somewhat random font size...
  "font-size": "14px",
}

const fileLinkCss = {
  // Make sure link fits tightly with surroundin gstuff.
  "margin": "0px !important",
  "padding": "0px !important",

  // Font and color.
  "font-weight": "600",
  "font-family": '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
  "color": "#0969da",

  // Always underlined like what GitHub does.
  "text-decoration": "underline",
}

const commitLinkOuterBlockCss = {
  // Make sure link fits tightly with surroundin stuff.
  "margin": "0px !important",
  "padding": "0px !important",

  // Color of meta info message.
  "color": "#636c76",
}

const commitLinkCss = {
  // Font and color.
  "font-size": "90%",
  "color": "#1f2328",

  // Always underlined like what GitHub does.
  "text-decoration": "underline",
}

const codeOuterBlockCss = {
  // Make sure code fits tightly with surroundin stuff.
  "margin": "0px !important",
  "padding": "0px !important",
}

const codeBlockCss = {
  // White background.
  "background-color": "#ffffff",

  // Space between code and left/right border.
  "padding": "0px 16px",

  // These make the block scrollable.
  "display": "block",
  "overflow": "auto",
  "max-height": "300px",
}


// Convert one of the above css dictionaries to a style string, example use:
// `style="${cssToStyleStr(cssDict)}"`
function cssToStyleStr(cssDict) {
  let str = "";
  for (const [key, val] of Object.entries(cssDict)) {
    str += key + ": " + val + "; ";
  }
  return str;
}


// The extension builder.
function extension(apiToken, options = {}) {
  const name = 'display-gh-permalink'

  // Return the extension object.
  return {
    name,

    // Block-level or inline-level tokenizer.
    level: 'inline',                                  

    // try to tokenize the text
    tokenizer(src, tokens) {                         
      const config = parsePermalink(src);
      if (config) {
        return {
          type: name,                           
          raw: src,  // Text to consume from the source
          config, // Additional custom properties
        };
      }
    },

    // This will be manually registered used as a hook to process the token
    // before render. See where its referenced.
    async walkTokens(token) {
      // Nothing to process if our tokenizer didn't match.
      if (!('config' in token))
        return;
      token.dataFetched = false;
      const config = token.config;

      // Query GitHub for file content
      const options = {
        headers: {
          Authorization: `Bearer ${apiToken}`
        },
        cache: "force-cache", // save rate limit
      };
      const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}?ref=${config.commit}`;
      const res = await fetch(url, options);
      // Short circuit on error.
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      const whoeFileContent = atob(json.content);

      // Slice out the liens we want, note that line number in GH starts from 1,
      // TODO perf concern?
      const lines = whoeFileContent.split("\n");
      const slicedLines = lines.slice(config.lineFrom - 1, config.lineTo);
      const code = slicedLines.join("\n");

      // Add extra attribute to token
      token.code = code;
      token.dataFetched = true;
    },

    // Render the token.
    renderer(token) {
      // If we failed to fetch file content from GitHub, render as a link.
      if (!token.dataFetched) {
        return `<a href="${token.raw}">${token.raw}</a>`
      }

      // Render, small part of this code is duplicated over
      // https://github.com/markedjs/marked/blob/91ee15b2d43da92f751165c88d1a78ebc3b99114/src/Renderer.ts#L17-L33
      const config = token.config;
      const code = token.code.replace(/\n$/, '') + '\n'; // something to do with line break at last line
      // Syntax highlighting for code snippet. Unfortunately we can't use syntax
      // highlighting via Marked's extensions because (1). we get the code
      // snippet string after the `walkTokens` post-tokenization-processing, and
      // (2). the extension needs to start from lexing the individual tokens in
      // the code snippet. Marked's pipeline doesn't seem to be designed for
      // this.
      let syntaxHighlightedCode = code;
      try { 
        syntaxHighlightedCode = hljs.highlight(code, {language: config.languageSuffix}).value
      } catch (error) {
        console.warn("Error when syntax highlighting code: " + error);
      }

      // Add css attributes to make the code block scrollable and more like the
      // GitHub code snippet display.
      let htmlBlock = "";
      // Outermost block
      htmlBlock += `<div style="${cssToStyleStr(outermostBlockCss)}">`;
      {
        // header
        htmlBlock += `<div style="${cssToStyleStr(headerBlockCss)}">`;

        // file link (must use `'` due to font family quotes)
        htmlBlock += `<a style='${cssToStyleStr(fileLinkCss)}' href=${config.codeLink}>${config.path}</a>`;

        // meta info and commit link
        htmlBlock += `<p style="${cssToStyleStr(commitLinkOuterBlockCss)}">`
        htmlBlock += `Lines ${config.lineFrom} to ${config.lineTo} in `
        htmlBlock += `<a data-pjax="true" style="${cssToStyleStr(commitLinkCss)}" href="${config.commitLink}">`
        htmlBlock += `${config.commit.slice(0, 6)}</a></p></div>`


        // code block
        htmlBlock += `<pre style="${cssToStyleStr(codeOuterBlockCss)}">`;
        htmlBlock += `<code style="${cssToStyleStr(codeBlockCss)}">`;
      }
      // Add code and close tags.
      htmlBlock += `${syntaxHighlightedCode}</code></pre></div>\n`;
      return htmlBlock;
    },
  };
}


export default function(apiToken, options = {}) {
  const myExtension = extension(apiToken);
  return {
    extensions: [myExtension],
    // Tell marked we have some async processing to do before rendering.
    async: true,
    walkTokens: myExtension.walkTokens,
  };
}
