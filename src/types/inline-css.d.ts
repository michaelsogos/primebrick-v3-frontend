declare module 'inline-css' {
  function inlineCss(html: string, options?: Record<string, unknown>): Promise<string>;
  export default inlineCss;
}
