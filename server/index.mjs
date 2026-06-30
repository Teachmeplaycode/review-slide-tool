import { createApp } from './app.mjs'
import { getDefaultDbPath } from './db.mjs'

const port = Number(process.env.VOCAB_API_PORT ?? 5174)
const app = createApp()

app.listen(port, () => {
  console.log(`Vocabulary API listening on http://127.0.0.1:${port}`)
  console.log(`SQLite database: ${getDefaultDbPath()}`)
})
