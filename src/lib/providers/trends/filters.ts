/** Shared safety filter for trend titles from any source (adult content is never surfaced to creators). */
export const SENSITIVE_TITLE = /(xxx|xnxx|xvideos|xhamster|pornhub|redtube|youporn|brazzers|porn|sex|nude|naked|onlyfans|erotic|hentai|escort|camgirl)/i;

export function isSafeTitle(title: string): boolean {
  return !SENSITIVE_TITLE.test(title);
}

/**
 * News about violence or tragedy needs human judgment before a creator makes content
 * about it, so raw trend lists hide these titles (they stay available to admins).
 * Sports terms that contain these words ("Kerala Blasters", "death overs", "dead rubber",
 * "attacking midfielder", "shooting drills") are not events.
 */
export const SENSITIVE_EVENT =
  /(bomb|blast(?!ers)|murder|killed|kill|death(?! overs?| bowl)|dead(?! rubber| ball)|dies|died|rape|attack(?!ing|ers?\b)|terror|accident|crash|suicide|shooting(?! drills?| practice| range)|riot|stampede|हत्या|मौत|मृत्यु|बम|धमाका|हमला|हादसा|आत्महत्या|बलात्कार|दंगा|ബോംബ്|బాంబు|ಬಾಂಬ್)/i;

export function needsReview(title: string): boolean {
  return SENSITIVE_EVENT.test(title);
}
