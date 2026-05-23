/**
 * reject-non-indigenous.ts
 *
 * Finds stories in `analyzed` or `selected` state that have no explicit
 * mention of indigenous peoples in their title, summary, or relevanceSummary,
 * then sets their status to `rejected`.
 *
 * Run with:
 *   npx tsx --env-file=.env src/scripts/reject-non-indigenous.ts
 *
 * Pass --dry-run to preview without making changes.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const DRY_RUN = process.argv.includes('--dry-run')
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

// Keywords that signal an explicit indigenous connection.
// Includes both generic terms and specific peoples' names.
const INDIGENOUS_KEYWORDS = [
  // Generic terms (Spanish)
  'indígena', 'indigena', 'indígenas', 'indigenas',
  'pueblo originario', 'pueblos originarios',
  'comunidad originaria', 'comunidades originarias',
  'comunidad nativa', 'comunidades nativas',
  'pueblo nativo', 'pueblos nativos',
  'nación originaria', 'naciones originarias',
  'primera nación', 'primeras naciones',
  'etnias originarias', 'etnia originaria',
  'territorio indígena', 'territorios indígenas',
  'tierra indígena', 'tierras indígenas',
  'reserva indígena', 'resguardo indígena',
  'cosmovisión indígena', 'cosmovisión',
  'saberes ancestrales', 'conocimientos ancestrales',
  'territorios ancestrales', 'territorio ancestral',
  'auto-determinación', 'autodeterminación',
  'etnias', 'etnia',
  'tribu', 'tribal',

  // Generic terms (English)
  'first nation', 'first nations',
  'aboriginal', 'aborigen',
  'native american', 'native peoples',
  'indigenous peoples', 'indigenous communities',
  'tribal nation', 'tribal community',

  // Americas — Andes & Cono Sur
  'mapuche', 'mapuches',
  'quechua', 'kichwa', 'quichua',
  'aymara', 'aimarás',
  'guaraní', 'guarani',
  'atacameño', 'atacamenos', 'atacamena',
  'rapanui', 'rapa nui',
  'diaguita',
  'colla',
  'kawésqar',
  'selknam', 'ona',
  'yagán', 'yagan',
  'ayoreo',
  'toba', 'qom',
  'wichí',
  'huarpe',

  // Americas — Amazonia & Brasil
  'yanomami',
  'kayapó', 'kayapo',
  'munduruku', 'mundurucú',
  'waorani',
  'juruna', 'yudjá',
  'arara',
  'munduruku',
  'macuxi',
  'tikuna',
  'sateré-mawé',
  'pataxó',
  'krenak',
  'xavante',
  'terena',

  // Americas — Andes Centro & Norte
  'nasa', 'páez',
  'arhuaco', 'iku',
  'wayuu', 'wayú',
  'awajún', 'awajun', 'aguaruna',
  'wampis',
  'shuar',
  'achuar',
  'kichwa amazónico',
  'sarayaku',

  // Americas — Centroamérica & México
  'maya', 'mayas',
  'náhuatl', 'nahuatl',
  'azteca',
  'mixteco', 'zapoteco',
  'tzeltal', 'tzotzil',
  'mam', 'kaqchikel', 'q\'eqchi',
  'lenca', 'miskito', 'miskitu',
  'guna', 'kuna',
  'emberá', 'embera',
  'ngäbe', 'ngabe',

  // Norte América — Estados Unidos & Canadá
  'navajo', 'diné',
  'sioux', 'lakota', 'dakota',
  'cherokee',
  'apache',
  'comanche',
  'ojibwe', 'ojibwa', 'anishinaabe',
  'cree',
  'blackfoot', 'blackfeet',
  'mohawk', 'haudenosaunee',
  'seneca',
  'oneida', 'onondaga',
  'iroquois',
  'makah',
  'wabanaki',
  'penobscot',
  'tsuut\'ina', 'tsuu t\'ina',
  'stó:lō',
  'haida',
  'tlingit',
  'gitxsan',
  'wet\'suwet\'en', 'wetsuweten',
  'nisga\'a',
  'sḵwx̱wú7mesh', 'squamish',
  'musqueam',
  'samson cree',
  'nuxalk',
  'maskwacis',
  'dene',
  'fsin',
  'kitselas',
  'métis',

  // Norte América — Alaska & Ártico
  'inuit', 'inuk', 'inupiaq', 'iñupiat', 'inupiat',
  'yupik', 'yu\'pik',
  'aleut', 'unangan',
  'athabascan', 'atapasca',
  'nuiqsut',
  'pribilof',
  'makah',
  'tlingit',

  // Asia — Sur & Sureste
  'limbu',
  'tharu',
  'rai',
  'tamang',
  'sherpa', 'sherpas',
  'orang asli',
  'manggarai',
  'dayak',
  'toraja',
  'mentawai',
  'papúa', 'papua', 'west papua', 'west papuano',
  'wiyagar',
  'maluku',
  'moro',

  // Asia — Tibet & China
  'tibetano', 'tibetana', 'tibetanos', 'tibetanas',
  'tibetan', 'tibet',
  'uyghur', 'uigur',
  'mongolian', 'mongol',

  // Asia — Sur (India)
  'adivasi', 'adivasis',
  'gondi', 'gond',
  'naga', 'nagaland',
  'mizo',
  'bodo',
  'mundari',
  'santhali',
  'nicobar', 'nicobarese',

  // África
  'san', 'bushman', 'bosquimanos',
  'twa', 'batwa',
  'baka', 'ba\'aka', 'bayaka',
  'maasai', 'masai',
  'ogiek',
  'nso',
  'bereber', 'amazigh',
  'tuareg',

  // Pacífico & Oceanía
  'māori', 'maori',
  'aboriginal australian', 'aborigen australiano',
  'torres strait', 'yolŋu', 'yolngu',
  'warlpiri',
  'wiimpatja',
  'martu',
  'anangu',
  'arrernte',
  'pitjantjatjara',
  'kanak',
  'fijian', 'fiyiano',
  'rotuma', 'rotumana',
  'hawaiian', 'hawaiiano',
  'chamorro',
  'wespac',

  // Europa
  'sami', 'sámi', 'saami',
  'lapón', 'lapon',

  // Oriente Medio & Asia Central
  'kurdo', 'kurda', 'kurdos', 'kurdas', 'kurdish',
  'beduino', 'bedouin',
  'amazigh',
]

function hasIndigenousKeyword(text: string | null | undefined): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return INDIGENOUS_KEYWORDS.some((kw) => lower.includes(kw))
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '⚠️  LIVE RUN — stories will be rejected\n')

  const stories = await prisma.story.findMany({
    where: { status: { in: ['analyzed', 'selected', 'published'] } },
    select: {
      id: true,
      status: true,
      relevance: true,
      sourceTitle: true,
      title: true,
      summary: true,
      relevanceSummary: true,
      relevanceReasons: true,
      antifactors: true,
      relevanceCalculation: true,
    },
    orderBy: { relevance: 'desc' },
  })

  console.log(`Found ${stories.length} stories in analyzed/selected state\n`)

  const toReject: typeof stories = []
  const safe: typeof stories = []

  for (const story of stories) {
    const fields = [
      story.title,
      story.sourceTitle,
      story.summary,
      story.relevanceSummary,
      story.relevanceReasons,
      story.antifactors,
      story.relevanceCalculation,
    ]
    if (fields.some(hasIndigenousKeyword)) {
      safe.push(story)
    } else {
      toReject.push(story)
    }
  }

  console.log(`✅ Safe (mention indigenous peoples): ${safe.length}`)
  console.log(`❌ To reject (no indigenous mention found): ${toReject.length}\n`)

  if (toReject.length === 0) {
    console.log('Nothing to reject. All stories mention indigenous peoples explicitly.')
    return
  }

  console.log('Stories to be rejected:')
  for (const s of toReject) {
    console.log(`  [${s.status}] rating=${s.relevance ?? '—'} | ${s.title ?? s.sourceTitle}`)
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run without --dry-run to apply changes.')
    return
  }

  console.log('\nRejecting...')
  const ids = toReject.map((s) => s.id)
  const result = await prisma.story.updateMany({
    where: { id: { in: ids } },
    data: { status: 'rejected' },
  })

  console.log(`\n✅ Done. ${result.count} stories set to rejected.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
