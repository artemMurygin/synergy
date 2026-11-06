import { defineManifest } from '@crxjs/vite-plugin'
import packageJson from './package.json' with { type: 'json' }

// Fixed public key pins the extension ID (facoikcjgloanpnjokljdemgipikeoho); add chrome-extension://facoikcjgloanpnjokljdemgipikeoho to backend AUTH_ALLOWED_ORIGINS.
const EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsIAzli/2VZqLiO0egww4mGzM8bV4pGHT3wZ9l2xfzpuenPFybvjNdUiSMM0EpNTHwhC8HAFYvSUjtGIH1NkjnghJMi7WzoXFveVb/rrAoMMZK/gco+wznXrk3T3+804swiZEQ6nk2GDiHF+Ah1H3ZReArCUivJOqUSWQlHyRSXL9OuoCOalZyM3c6/nDQZfEY1OHcktTARPyKdxHaukyfEU78aexU7yLdMOccZ/A3+gHN9seOGy0dR7ES3LXFgvopbZKLJanOcRCBGuc6oWrQ/3v71uVSK/rQaMGRIUGsxga85dJTTLDNNFD364YDtd88GlYefS1l5UJlvdvLNGPhQIDAQAB'

export default defineManifest({
  manifest_version: 3,
  key: EXTENSION_PUBLIC_KEY,
  name: 'Manager Helper',
  description: packageJson.description,
  version: packageJson.version,
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },
  action: {
    default_title: 'Manager Helper',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'sidePanel'],
  host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
  optional_host_permissions: ['https://*/*', 'http://*/*'],
})
