declare module 'inline-css' {
  function inlineCss(html: string, options?: any): Promise<string>;
  export default inlineCss;
}
