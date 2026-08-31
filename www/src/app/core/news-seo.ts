import type { NewsFeeds, NewsItem } from './news.service';

const MAX_META_LEN = 155;
const MAX_HEADLINE_LEN = 110;

function plainText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function allItems(feeds: NewsFeeds): NewsItem[] {
  return [...(feeds.itc_x.items ?? []), ...(feeds.itc_linkedin.items ?? [])].sort((a, b) => {
    const ta = a.published_at ? Date.parse(a.published_at) : 0;
    const tb = b.published_at ? Date.parse(b.published_at) : 0;
    return tb - ta;
  });
}

/** Meta description from the latest posts (single listing page). */
export function newsListingDescription(feeds: NewsFeeds, fallback: string): string {
  const snippets = allItems(feeds)
    .slice(0, 4)
    .map((item) => plainText(item.text))
    .filter((text) => text.length > 0);
  if (snippets.length === 0) {
    return fallback;
  }
  return truncate(snippets.join(' · '), MAX_META_LEN);
}

export function archiveWeekDescription(weekId: string, feeds: NewsFeeds, fallback: string): string {
  const prefix = `Interchouette news archive ${weekId}.`;
  const body = newsListingDescription(feeds, '');
  if (!body) {
    return truncate(`${prefix} ${fallback}`, MAX_META_LEN);
  }
  return truncate(`${prefix} ${body}`, MAX_META_LEN);
}

export function newsListingJsonLd(
  feeds: NewsFeeds,
  pageUrl: string,
  listName: string,
): Record<string, unknown> {
  const items = allItems(feeds);
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    url: pageUrl,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: postingSchema(item),
    })),
  };
}

function postingSchema(item: NewsItem): Record<string, unknown> {
  const text = plainText(item.text);
  return {
    '@type': 'SocialMediaPosting',
    headline: truncate(text || item.id, MAX_HEADLINE_LEN),
    articleBody: text || undefined,
    url: item.url,
    datePublished: item.published_at ?? undefined,
    author: {
      '@type': 'Organization',
      name: 'Interchouette ITC',
      url: 'https://interchouette.net/',
    },
  };
}
