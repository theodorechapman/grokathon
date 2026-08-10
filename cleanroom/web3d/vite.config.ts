import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so dist/ works from any static server or file path.
  base: './',
  server: {
    fs: {
      // The app imports the bench and controller model from ../web and ../src.
      allow: ['..'],
    },
  },
});
