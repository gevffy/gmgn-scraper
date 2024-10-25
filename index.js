require('dotenv').config();
const puppeteer = require('puppeteer');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const TwoCaptcha = require("@2captcha/captcha-solver")
const solver = new TwoCaptcha.Solver(process.env.TWO_CAPTCHA_API_KEY)
let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0';

async function initInst() {
  const browser = await puppeteer.launch({
    headless: true, // when debugger set to false
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--user-agent=${userAgent}`,
    ],
  });
  const page = await browser.newPage();
  const preloadFile = readFileSync(path.join(__dirname, './inject.js'), 'utf8');
  await page.evaluateOnNewDocument(preloadFile);
  // Here we intercept the console messages to catch the message logged by inject.js script
  page.on('console', async (msg) => {
    const txt = msg.text()
    if (txt.includes('intercepted-params:')) {
      const params = JSON.parse(txt.replace('intercepted-params:', ''))
      console.log(params)
      try {
        console.log(`Solving the captcha...`)
        const res = await solver.cloudflareTurnstile(params)
        console.log(`Solved the captcha ${res.id}`)
        console.log(res)
        userAgent = res.userAgent
        await page.evaluate((token) => {
          cfCallback(token)
        }, res.data)
      } catch (e) {
        console.log(e.err)
        return process.exit()
      }
    } else {
      return;
    }
  })
  await page.goto('https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/24h?orderby=volume&direction=desc', {
    waitUntil: 'domcontentloaded'
  });
  let tokenIndex = 0;
  let tokens = []
  // {
  //   address: [token, token, token]
  // }
  const addressWithToken = {}
  page.on('response', async (response) => {
    try {
      if (response.status() === 200) {
        const url = response.url();
        if (url.includes('gmgn.ai/defi/quotation/v1/rank/sol/swaps/')) {
          const data = await response.json();
          // save data to local, the path is scraper/data
          writeFileSync(path.join(__dirname, 'data', 'gmgn.json'), JSON.stringify(data, null, 2));
          tokenIndex = 0;
          tokens = data.data.rank.map(item => item.address)
          if (tokens.length > 0) {
            startGetTokenHoderDetails(tokenIndex);
          }
        } else if (url.includes('gmgn.ai/defi/quotation/v1/tokens/top_traders/sol/')) {
          // get token address from url
          const url = new URL(response.url());
          const token = url.pathname.split('/').pop();
          const data = await response.json();
          // save data to local, the path is scraper/data
          writeFileSync(path.join(__dirname, 'data', `${token}.json`), JSON.stringify(data, null, 2));
          data.data.forEach(holder => {
            if (holder.address in addressWithToken) {
              addressWithToken[holder.address].push(token)
            } else {
              addressWithToken[holder.address] = [token]
            }
          })
          tokenIndex++;
          console.log(`Token ${token} is done, next token is ${tokens[tokenIndex]}`, tokenIndex, tokens.length)
          if (tokenIndex < tokens.length) {
            startGetTokenHoderDetails(tokenIndex);
          } else {
            console.log('All tokens are done')
            // calculate top traders address
            let keyValuePairs = [];
            for (let key in addressWithToken) {
              keyValuePairs.push([key, addressWithToken[key].length]);
            }
            keyValuePairs.sort((a, b) => b[1] - a[1]);
            const sortedKeys = keyValuePairs.map((pair) => pair[0]);
            console.log(sortedKeys)
            writeFileSync(path.join(__dirname, 'data', `result.json`), JSON.stringify(addressWithToken, null, 2));
          }
        }
      }
    } catch (e) {
      console.error(e.message)
    }
  });
  function startGetTokenHoderDetails(index) {
    const token = tokens[index];
    if (!token) {
      return;
    }
    page.goto(`https://gmgn.ai/defi/quotation/v1/tokens/top_traders/sol/${tokens[index]}?orderby=profit&direction=desc`, {
      waitUntil: 'domcontentloaded'
    });
  }
}
// TODO job?
initInst()
