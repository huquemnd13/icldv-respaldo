const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://example.com');
    const title = await page.title();
    console.log(`Title of the page is: ${title}`);
    await browser.close();
})();
