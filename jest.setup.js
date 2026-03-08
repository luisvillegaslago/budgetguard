import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'node:util';

// Polyfill for jose/next-auth in jsdom environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
