/** Explicit process capability for native-path Electron e2e seams. Never infer this from build,
 * package, URL, or NODE_ENV state: normal development and packaged renderers must not receive it. */
export const ELECTRON_E2E_ENABLED = process.env.GOLDBOX_ELECTRON_E2E === '1';
