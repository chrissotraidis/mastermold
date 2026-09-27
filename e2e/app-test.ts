import { test as base, expect } from "@playwright/test";

/**
 * page.goto that also waits for React's streamed content to be swapped in.
 * Until then the page exists twice (one copy in a hidden div#S:n), and strict
 * locators like getByText can match both.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.waitForFunction(() => !document.querySelector('[id^="S:"][hidden]'));
      return response;
    };
    await use(page);
  },
});

export { expect };
