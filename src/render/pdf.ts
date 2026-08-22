import puppeteer from 'puppeteer-core'

/**
 * Chrome does not implement CSS `position: running()`, so page numbers come
 * from Puppeteer's own footer template rather than the stylesheet.
 */
const footerTemplate = `
  <div style="color:#6b7280; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:7pt; margin:0 0.6in; text-align:right; width:100%;">
    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>
`

export async function renderPdf(html: string, outPath: string): Promise<void> {
  const browser = await puppeteer.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(html)
    await page.pdf({
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate,
      printBackground: true,
      preferCSSPageSize: true,
      path: outPath,
    })
  } finally {
    await browser.close()
  }
}
