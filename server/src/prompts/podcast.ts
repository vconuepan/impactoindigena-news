export interface StoryForPodcast {
  category: string
  title: string
  summary: string
  publisher: string
  relevanceReasons: string
  antifactors: string
}

export function buildPodcastPrompt(stories: StoryForPodcast[]): string {
  let query = ''

  for (const story of stories) {
    query += '\n\n<STORY>'
      + `\nCategory: ${story.category}`
      + `\nTitle: ${story.title}`
      + `\nSummary of original article: ${story.summary}`
      + `\nPublisher of original article: ${story.publisher}`
      + `\nRelevance of the article\n- ${story.relevanceReasons.replace(/\n/g, '\n- ')}`
      + `\nLimiting factors for the relevance\n- ${story.antifactors.replace(/\n/g, '\n- ')}`
      + '</STORY>'
  }

  query += `\n\nWrite with the expertise of a journalist, editor, and podcast host. Your job is to turn summaries and relevance analyses of news stories into a cohesive script for a news podcast that is engaging and easy to follow.
Please write a script with the following elements:

- Intro
-- Welcome the listeners to the 'Voces Indígenas Podcast'.
-- Explain that Voces Indígenas evaluated hundreds of stories this week on how relevant they are for indigenous peoples. The podcast highlights the most relevant ones.
-- Introduce yourself in a light-hearted way as an AI-generated voice.

- Sections (one for each category). In each section:
-- Transition to the new category.
-- For each story within the category:
--- Adjust the summary of the original story to this podcast format. Mention who published the original article.
--- Adjust the relevance analysis for the story to this podcast format.

- Outro
-- Mention that Voces Indígenas is still in a prototype phase and that we're eager to receive feedback.
-- Thank the listeners for listening.

Make sure to include all the <STORIES> mentioned above.

Strike a tone that is professional, but less formal than traditional news shows. The podcast should be engaging and easy to follow. Keep sentences short, with 12 words as the maximum length. Also, keep the language simple. In particular, avoid academic terminology.

Remember that the script will be read out loud, word by word, by a text-to-voice service that cannot distinguish between content and other parts of the script like section markers. Only include in the response what you want the AI-generated voice to read.
`

  return query
}
