import React from 'react';
import Module from 'node:module';

(globalThis as { React?: typeof React }).React = React;

const extensions = (Module as unknown as { _extensions: Record<string, (mod: NodeModule, filename: string) => void> })
  ._extensions;
extensions['.css'] = (mod, filename) => {
  (mod as unknown as { _compile: (source: string, file: string) => void })._compile(
    'module.exports = {};',
    filename
  );
};
