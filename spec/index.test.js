import { marked } from 'marked';
import markedGhPermalink from '../src/index.js';

// Can't test much without an access token, so just making sure the extension
// won't break existing stuff or abort on bad access token/page.
describe('marked-gh-permalink', () => {
  beforeEach(() => {
    marked.setOptions(marked.getDefaults());
  });

  test('no permalink', async() => {
    marked.use(markedGhPermalink('bad token'));
    const text = 'example markdown';
    await expect(marked(`${text}`)).resolves.toBe(`<p>${text}</p>\n`);
  });

  test('bad commit in permalink', async() => {
    marked.use(markedGhPermalink('bad token'));
    const link = 'https://github.com/markedjs/marked/blob/bad-commit-123/src/Renderer.ts#L17-L33';
    await expect(marked(link)).resolves.toBe(`<p><a href="${link}">${link}</a></p>\n`);
  });

  test('bad token', async() => {
    marked.use(markedGhPermalink('bad token'));
    const link = 'https://github.com/markedjs/marked/blob/91ee15b2d43da92f751165c88d1a78ebc3b99114/src/Renderer.ts#L17-L33';
    await expect(marked(link)).resolves.toBe(`<p><a href="${link}">${link}</a></p>\n`);
  });
});
