#!/usr/bin/env node
/**
 * Patches @solana/wallet-standard-wallet-adapter-react to prefer legacy adapters
 * (PhantomWalletAdapter, SolflareWalletAdapter) over StandardWalletAdapter.
 * Fixes Phantom "WalletConnectionError: Unexpected error" when StandardWalletAdapter fails.
 */
const fs = require('fs');
const path = require('path');

const OLD_ESM = `    return useMemo(() => [
        ...standardAdapters,
        ...adapters.filter(({ name }) => {
            if (standardAdapters.some((standardAdapter) => standardAdapter.name === name)) {
                if (!warnings.has(name)) {
                    warnings.add(name);
                    console.warn(\`\${name} was registered as a Standard Wallet. The Wallet Adapter for \${name} can be removed from your app.\`);
                }
                return false;
            }
            return true;
        }),
    ], [standardAdapters, adapters, warnings]);`;

const NEW_ESM = `    // Prefer legacy adapters over standard: put our adapters first, exclude standard
    // adapters that duplicate our names. Fixes Phantom "Unexpected error" when
    // StandardWalletAdapter fails (e.g. in Next.js / certain environments).
    return useMemo(() => [
        ...adapters,
        ...standardAdapters.filter((standardAdapter) => {
            if (adapters.some((a) => a.name === standardAdapter.name)) {
                if (!warnings.has(standardAdapter.name)) {
                    warnings.add(standardAdapter.name);
                    console.warn(\`\${standardAdapter.name}: using legacy adapter (StandardWalletAdapter bypassed for compatibility)\`);
                }
                return false;
            }
            return true;
        }),
    ], [standardAdapters, adapters, warnings]);`;

const OLD_CJS = `    return (0, react_1.useMemo)(() => [
        ...standardAdapters,
        ...adapters.filter(({ name }) => {
            if (standardAdapters.some((standardAdapter) => standardAdapter.name === name)) {
                if (!warnings.has(name)) {
                    warnings.add(name);
                    console.warn(\`\${name} was registered as a Standard Wallet. The Wallet Adapter for \${name} can be removed from your app.\`);
                }
                return false;
            }
            return true;
        }),
    ], [standardAdapters, adapters, warnings]);`;

const NEW_CJS = `    // Prefer legacy adapters over standard: put our adapters first, exclude standard
    // adapters that duplicate our names. Fixes Phantom "Unexpected error" when
    // StandardWalletAdapter fails (e.g. in Next.js / certain environments).
    return (0, react_1.useMemo)(() => [
        ...adapters,
        ...standardAdapters.filter((standardAdapter) => {
            if (adapters.some((a) => a.name === standardAdapter.name)) {
                if (!warnings.has(standardAdapter.name)) {
                    warnings.add(standardAdapter.name);
                    console.warn(\`\${standardAdapter.name}: using legacy adapter (StandardWalletAdapter bypassed for compatibility)\`);
                }
                return false;
            }
            return true;
        }),
    ], [standardAdapters, adapters, warnings]);`;

function findAndPatch(root) {
  const dir = path.join(root, 'node_modules', '@solana', 'wallet-standard-wallet-adapter-react');
  if (fs.existsSync(dir)) {
    patchDir(dir);
  }
  // pnpm: patch all instances in .pnpm store
  const pnpmGlob = path.join(root, 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmGlob)) {
    const entries = fs.readdirSync(pnpmGlob);
    for (const e of entries) {
      if (e.startsWith('@solana+wallet-standard-wallet-adapter-react@')) {
        const pkg = path.join(pnpmGlob, e, 'node_modules', '@solana', 'wallet-standard-wallet-adapter-react');
        if (fs.existsSync(pkg)) {
          patchDir(pkg);
        }
      }
    }
  }
}

function patchDir(dir) {
  const esmPath = path.join(dir, 'lib', 'esm', 'useStandardWalletAdapters.js');
  const cjsPath = path.join(dir, 'lib', 'cjs', 'useStandardWalletAdapters.js');

  for (const [filePath, oldContent, newContent] of [
    [esmPath, OLD_ESM, NEW_ESM],
    [cjsPath, OLD_CJS, NEW_CJS],
  ]) {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('...standardAdapters,') && content.includes('...adapters.filter')) {
        content = content.replace(oldContent, newContent);
        fs.writeFileSync(filePath, content);
        console.log('[patch-wallet-adapter] Patched:', filePath);
      } else if (content.includes('...adapters,') && content.includes('...standardAdapters.filter')) {
        console.log('[patch-wallet-adapter] Already patched:', filePath);
      }
    }
  }
}

findAndPatch(process.cwd());
