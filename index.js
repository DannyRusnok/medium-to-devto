import Parser from 'rss-parser';
import { Client } from '@notionhq/client';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import fetch from 'node-fetch';

const parser = new Parser();
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

// Configure turndown to handle code blocks well
turndown.addRule('codeBlock', {
  filter: ['pre'],
  replacement: (content, node) => {
    const code = node.querySelector('code');
    const lang = code?.className?.replace('language-', '') || '';
    return `\n\`\`\`${lang}\n${code?.textContent || content}\n\`\`\`\n`;
  }
});

const MEDIUM_RSS = `https://medium.com/feed/@${process.env.MEDIUM_USERNAME}`;
const DEVTO_API = 'https://dev.to/api/articles';
const NOTION_DB_ID = process.env.NOTION_DATABASE_ID;
const NTFY_TOPIC = process.env.NTFY_TOPIC;

async function getPublishedArticlesFromNotion() {
  const response = await notion.databases.query({
    database_id: NOTION_DB_ID,
  });

  return new Set(
    response.results.map(page => page.properties['Medium URL']?.url).filter(Boolean)
  );
}

async function saveArticleToNotion({ title, mediumUrl, devtoUrl, publishedAt }) {
  await notion.pages.create({
    parent: { database_id: NOTION_DB_ID },
    properties: {
      'Name': {
        title: [{ text: { content: title } }]
      },
      'Medium URL': {
        url: mediumUrl
      },
      'Dev.to URL': {
        url: devtoUrl
      },
      'Published At': {
        date: { start: publishedAt }
      },
      'Status': {
        select: { name: 'Published' }
      }
    }
  });
}

async function fetchArticleContent(url) {
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, footer, .metabar, .u-marginBottom10').remove();

  // Get the article body
  const articleBody = $('article').html() || $('section').first().html() || $('body').html();
  return articleBody;
}

async function convertToMarkdown(html, canonicalUrl) {
  // Add canonical URL note at top
  const markdown = turndown.turndown(html);

  // Clean up excessive newlines
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function publishToDevTo({ title, markdown, canonicalUrl, tags }) {
  const body = {
    article: {
      title,
      body_markdown: markdown,
      published: true,
      canonical_url: canonicalUrl,
      tags: tags.slice(0, 4), // dev.to allows max 4 tags
    }
  };

  const response = await fetch(DEVTO_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.DEVTO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Dev.to API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

async function sendNotification({ title, devtoUrl, mediumUrl }) {
  if (!NTFY_TOPIC) return;

  await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: {
      'Title': '✅ Nový článek na dev.to',
      'Tags': 'newspaper',
      'Click': devtoUrl,
    },
    body: `"${title}" byl publikován na dev.to\n\nDev.to: ${devtoUrl}\nMedium: ${mediumUrl}`,
  });
}

function extractTagsFromMediumItem(item) {
  // Medium RSS includes categories as tags
  const categories = item.categories || [];
  return categories.map(c => c.toLowerCase().replace(/\s+/g, '')).slice(0, 4);
}

async function run() {
  console.log(`[${new Date().toISOString()}] Starting Medium → dev.to sync...`);

  try {
    // 1. Fetch Medium RSS
    const feed = await parser.parseURL(MEDIUM_RSS);
    console.log(`Found ${feed.items.length} articles in RSS feed`);

    // 2. Get already published articles from Notion
    const publishedUrls = await getPublishedArticlesFromNotion();
    console.log(`${publishedUrls.size} articles already in Notion DB`);

    // 3. Find new articles
    const newArticles = feed.items.filter(item => !publishedUrls.has(item.link));
    console.log(`${newArticles.length} new articles to process`);

    if (newArticles.length === 0) {
      console.log('Nothing to do. Exiting.');
      return;
    }

    // 4. Process each new article
    for (const item of newArticles) {
      console.log(`Processing: "${item.title}"`);

      try {
        // Fetch full article HTML
        const html = await fetchArticleContent(item.link);

        // Convert to markdown
        const markdown = await convertToMarkdown(html, item.link);

        // Extract tags
        const tags = extractTagsFromMediumItem(item);

        // Publish to dev.to
        const devtoArticle = await publishToDevTo({
          title: item.title,
          markdown,
          canonicalUrl: item.link,
          tags,
        });

        console.log(`✅ Published to dev.to: ${devtoArticle.url}`);

        // Save to Notion
        await saveArticleToNotion({
          title: item.title,
          mediumUrl: item.link,
          devtoUrl: devtoArticle.url,
          publishedAt: new Date(item.pubDate).toISOString().split('T')[0],
        });

        console.log(`✅ Saved to Notion`);

        // Send push notification
        await sendNotification({
          title: item.title,
          devtoUrl: devtoArticle.url,
          mediumUrl: item.link,
        });

        console.log(`✅ Push notification sent`);

      } catch (err) {
        console.error(`❌ Error processing "${item.title}":`, err.message);

        // Send error notification
        if (NTFY_TOPIC) {
          await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            headers: {
              'Title': '❌ Chyba při autopublishi',
              'Tags': 'warning',
            },
            body: `Nepodařilo se publikovat "${item.title}"\n\nChyba: ${err.message}`,
          });
        }
      }
    }

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] Sync complete.`);
}

run();
