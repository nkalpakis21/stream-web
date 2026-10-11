import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtistFace } from '../components/artists/ArtistFace';
import { artistHeroFaceSources, failFaceSrc } from '../lib/images/artistFace';

const LOCKED = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/look.jpg?alt=media';
const AVATAR = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/avatar.jpg?alt=media';
const COVER = 'https://cdn.example/covers/leg.jpg';
const THUMB = 'https://cdn.example/covers/thumb.jpg';
const ALBUM = 'https://cdn.example/covers/album.jpg';

const coverSong = {
  coverPosterUrl: COVER,
  albumCoverThumbnail: THUMB,
  albumCoverPath: ALBUM,
  isPublic: true,
};

function faceHtml(sources: string[], name = 'L.E.G') {
  return renderToStaticMarkup(
    createElement(ArtistFace, { name, sources, size: 'hero' })
  );
}

describe('artist hero face', () => {
  it('uses the current-version avatar, then the artist avatar', () => {
    const locked = artistHeroFaceSources({
      lockedLookUrl: LOCKED,
      avatarURL: AVATAR,
      song: coverSong,
    });
    assert.equal(locked[0], LOCKED);

    const avatar = artistHeroFaceSources({
      lockedLookUrl: null,
      avatarURL: AVATAR,
      song: coverSong,
    });
    assert.equal(avatar[0], AVATAR);

    const html = faceHtml(avatar);
    assert.ok(html.includes(`src="${AVATAR}"`));
    assert.match(html, /#14141C/);
    assert.doesNotMatch(html, /artist-index-face-initials/);
    assert.equal(locked[1], AVATAR);
    assert.ok(locked.includes(COVER));
  });

  it('uses the latest public song cover when the artist has no avatar', () => {
    const sources = artistHeroFaceSources({
      lockedLookUrl: null,
      avatarURL: null,
      song: coverSong,
    });
    assert.deepEqual(sources, [THUMB, COVER, ALBUM]);
    const html = faceHtml(sources, 'Gunna');
    assert.ok(html.includes(`src="${THUMB}"`));
    assert.match(html, /#14141C/);
    assert.match(html, /artist-face-hero/);
    assert.doesNotMatch(html, /artist-index-face-initials/);
    assert.doesNotMatch(html, />GU</);
    assert.doesNotMatch(html, /crossorigin/i);
    assert.doesNotMatch(html, /referrerpolicy/i);

    const row = renderToStaticMarkup(
      createElement(ArtistFace, { name: 'Gunna', sources, size: 'card' })
    );
    assert.match(row, /artist-face-card/);
    assert.match(row, /artist-index-face-initials/);
    assert.ok(row.includes(`src="${THUMB}"`));
  });

  it('walks thumbnail, full cover, then the next song', () => {
    const nextThumb = 'https://cdn.example/covers/next-thumb.jpg';
    const nextCover = 'https://cdn.example/covers/next-full.jpg';
    const sources = artistHeroFaceSources({
      lockedLookUrl: null,
      avatarURL: null,
      songs: [
        coverSong,
        {
          isPublic: true,
          albumCoverThumbnail: nextThumb,
          coverPosterUrl: nextCover,
          albumCoverPath: null,
        },
      ],
    });
    assert.deepEqual(sources, [THUMB, COVER, ALBUM, nextThumb, nextCover]);
  });

  it('shows the second candidate when the first fails, and initials only after every candidate fails', () => {
    const missing = 'https://cdn.example/missing.jpg';
    const ok = 'https://cdn.example/ok.jpg';
    const afterFirst = failFaceSrc([missing, ok], [], missing, null);
    assert.equal(afterFirst.src, ok);
    assert.deepEqual(afterFirst.failed, [missing]);
    const shown = faceHtml(afterFirst.src ? [afterFirst.src] : [], 'Gunna');
    assert.ok(shown.includes(`src="${ok}"`));
    assert.doesNotMatch(shown, /artist-index-face-initials/);
    assert.doesNotMatch(shown, />GU</);

    const stayed = failFaceSrc([missing, ok], [], missing, missing);
    assert.equal(stayed.src, missing);

    const afterBoth = failFaceSrc([missing, ok], afterFirst.failed, ok, null);
    assert.equal(afterBoth.src, null);
    const initials = faceHtml([]);
    assert.match(initials, /artist-index-face-initials/);
    assert.doesNotMatch(initials, /<img/);
  });

  it('paints initials when there is no avatar and no cover', () => {
    const sources = artistHeroFaceSources({
      lockedLookUrl: '  ',
      avatarURL: null,
      song: {
        coverPosterUrl: null,
        albumCoverThumbnail: '',
        albumCoverPath: null,
      },
    });
    assert.deepEqual(sources, []);
    const html = faceHtml(sources, 'L.E.G');
    assert.match(html, /artist-face-hero/);
    assert.match(html, /#14141C/);
    assert.match(html, /artist-index-face-initials/);
    assert.match(html, />L\.</);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /CoverPlaceholder|bg-muted/);
  });

  it('advances an image that already failed before hydration, then initials', async () => {
    const restore = installFaceDom();
    const seen: string[] = [];
    faceSrcLog = seen;
    const host = document.createElement('div');
    document.body.appendChild(host);
    let root: Root | null = null;
    try {
      root = createRoot(host);
      root.render(
        createElement(ArtistFace, {
          name: 'Gunna',
          sources: [THUMB, COVER],
          size: 'hero',
        })
      );
      await new Promise(resolve => setTimeout(resolve, 30));
      const text = host.textContent || '';
      assert.match(text, /GU/);
      assert.equal(host.querySelector('img'), null);
      assert.deepEqual(
        seen.filter((url, index) => seen.indexOf(url) === index),
        [THUMB, COVER]
      );
    } finally {
      root?.unmount();
      restore();
    }
  });

  it('keeps a candidate that already has pixels', async () => {
    const restore = installFaceDom();
    faceSrcLog = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    let root: Root | null = null;
    try {
      root = createRoot(host);
      root.render(
        createElement(ArtistFace, {
          name: 'Gunna',
          sources: ['https://cdn.example/ok.jpg', COVER],
          size: 'hero',
        })
      );
      await new Promise(resolve => setTimeout(resolve, 30));
      const img = host.querySelector('img');
      assert.equal(img?.getAttribute('src'), 'https://cdn.example/ok.jpg');
      assert.equal(img?.naturalWidth, 256);
      assert.equal(host.querySelector('.artist-index-face-initials'), null);
    } finally {
      root?.unmount();
      restore();
    }
  });
});

let faceSrcLog: string[] = [];

function installFaceDom(): () => void {
  class Style {
    setProperty(name: string, value: string) {
      (this as unknown as Record<string, string>)[name] = value;
    }
  }

  class Node {
    nodeType: number;
    nodeName: string;
    childNodes: Node[] = [];
    parentNode: Node | null = null;
    ownerDocument: DocumentNode | null = null;
    style = new Style();
    attributes = new Map<string, string>();
    className = '';
    private textValue = '';
    namespaceURI = 'http://www.w3.org/1999/xhtml';
    complete = false;
    naturalWidth = 0;

    constructor(nodeType: number, nodeName: string) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
    }

    get tagName() {
      return this.nodeName;
    }

    get firstChild() {
      return this.childNodes[0] ?? null;
    }

    get nextSibling(): Node | null {
      if (!this.parentNode) return null;
      const index = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[index + 1] ?? null;
    }

    appendChild(child: Node) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      this.childNodes.push(child);
      return child;
    }

    insertBefore(child: Node, ref: Node | null) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      const index = ref ? this.childNodes.indexOf(ref) : -1;
      this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
      return child;
    }

    removeChild(child: Node) {
      const index = this.childNodes.indexOf(child);
      if (index >= 0) this.childNodes.splice(index, 1);
      child.parentNode = null;
      return child;
    }

    contains(node: Node | null) {
      let current = node;
      while (current) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    }

    addEventListener() {}
    removeEventListener() {}

    setAttribute(name: string, value: string) {
      this.attributes.set(name, String(value));
      if (name === 'class') this.className = String(value);
      if (name === 'src') this.assignSrc(String(value));
    }

    getAttribute(name: string) {
      if (name === 'src' && this.attributes.has('src')) return this.attributes.get('src') ?? null;
      return this.attributes.has(name) ? this.attributes.get(name)! : null;
    }

    removeAttribute(name: string) {
      this.attributes.delete(name);
    }

    set src(value: string) {
      this.setAttribute('src', value);
    }

    get src() {
      return this.getAttribute('src') ?? '';
    }

    set textContent(value: string) {
      this.textValue = String(value);
      this.childNodes = [];
    }

    get textContent() {
      if (this.nodeType === 3) return this.textValue;
      if (this.childNodes.length === 0) return this.textValue;
      return this.childNodes.map(child => child.textContent).join('');
    }

    assignSrc(value: string) {
      if (this.nodeName !== 'IMG') return;
      if (!value) {
        this.complete = false;
        this.naturalWidth = 0;
        return;
      }
      faceSrcLog.push(value);
      if (value.includes('/ok.jpg')) {
        this.complete = true;
        this.naturalWidth = 256;
        return;
      }
      // Already failed: the load finished with no pixels before React subscribed.
      this.complete = true;
      this.naturalWidth = 0;
    }

    querySelector(selector: string): Node | null {
      const all = this.querySelectorAll(selector);
      return all[0] ?? null;
    }

    querySelectorAll(selector: string): Node[] {
      const out: Node[] = [];
      const walk = (node: Node) => {
        if (matches(node, selector)) out.push(node);
        node.childNodes.forEach(walk);
      };
      this.childNodes.forEach(walk);
      return out;
    }
  }

  class DocumentNode extends Node {
    body: Node;
    documentElement: Node;
    defaultView: Record<string, unknown>;

    constructor() {
      super(9, '#document');
      this.ownerDocument = this;
      this.documentElement = new Node(1, 'HTML');
      this.documentElement.ownerDocument = this;
      this.body = new Node(1, 'BODY');
      this.body.ownerDocument = this;
      this.documentElement.appendChild(this.body);
      this.defaultView = {};
    }

    createElement(name: string) {
      const node = new Node(1, name.toUpperCase());
      node.ownerDocument = this;
      return node;
    }

    createTextNode(text: string) {
      const node = new Node(3, '#text');
      node.ownerDocument = this;
      node.textContent = text;
      return node;
    }

    querySelector(selector: string) {
      return this.documentElement.querySelector(selector);
    }

    querySelectorAll(selector: string) {
      return this.documentElement.querySelectorAll(selector);
    }
  }

  function matches(node: Node, selector: string) {
    if (selector === 'img') return node.nodeName === 'IMG';
    if (selector.startsWith('.')) {
      return node.className.split(/\s+/).includes(selector.slice(1));
    }
    return false;
  }

  const doc = new DocumentNode();
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    IS_REACT_ACT_ENVIRONMENT: (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT,
  };
  const view = {
    document: doc,
    HTMLElement: Node,
    Element: Node,
    Node,
    HTMLIFrameElement: class HTMLIFrameElement {},
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    queueMicrotask: globalThis.queueMicrotask.bind(globalThis),
    requestAnimationFrame: (cb: FrameRequestCallback) => globalThis.setTimeout(() => cb(0), 0),
    cancelAnimationFrame: (id: number) => globalThis.clearTimeout(id),
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  doc.defaultView = view;
  Object.assign(globalThis, {
    document: doc,
    window: view,
    HTMLElement: Node,
    Element: Node,
    Node,
  });

  return () => {
    Object.assign(globalThis, previous);
    faceSrcLog = [];
  };
}
