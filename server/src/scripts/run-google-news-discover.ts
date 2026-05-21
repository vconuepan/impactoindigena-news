import 'dotenv/config'
import { runGoogleNewsDiscover } from '../jobs/googleNewsDiscover.js'

console.log('Starting Google News discovery...\n')
await runGoogleNewsDiscover()
console.log('\nDone.')
process.exit(0)
