import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.join(here, '..')
const skinsDir = path.join(desktopRoot, 'resources', 'skins')
const outDir = path.join(desktopRoot, 'src', 'assets', 'skins', 'thumbs')
const htmlPath = path.join(here, 'render-default-skin-thumbs.html')

const SKINS = [
  ['steve', 'wide'],
  ['alex', 'slim'],
  ['ari', 'wide'],
  ['efe', 'wide'],
  ['kai', 'wide'],
  ['makena', 'slim'],
  ['noor', 'slim'],
  ['sunny', 'wide'],
  ['zuri', 'wide'],
]

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 160,
    height: 200,
    webPreferences: {
      offscreen: true,
    },
  })
  await win.loadFile(htmlPath)
  const jobs = SKINS.map(([id, model]) => ({
    id,
    model,
    url: pathToFileURL(path.join(skinsDir, `${id}.png`)).href,
  }))
  const results = await win.webContents.executeJavaScript(
    `window.renderDefaultThumbs(${JSON.stringify(jobs)})`,
  )
  fs.mkdirSync(outDir, { recursive: true })
  for (const item of results) {
    if (!item?.id || !item?.dataUrl) {
      throw new Error(`Thumb failed: ${JSON.stringify(item)}`)
    }
    const comma = String(item.dataUrl).indexOf(',')
    const b64 = String(item.dataUrl).slice(comma + 1)
    const ext = String(item.dataUrl).startsWith('data:image/webp') ? 'webp' : 'png'
    const file = path.join(outDir, `${item.id}.${ext}`)
    fs.writeFileSync(file, Buffer.from(b64, 'base64'))
    console.log(`wrote ${path.relative(desktopRoot, file)} (${fs.statSync(file).size} bytes)`)
  }
  app.quit()
})
