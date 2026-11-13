import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const menus = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/menus' }),
  schema: z.object({
    title: z.string(),
    items: z.array(z.object({ label: z.string(), href: z.string() })),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    description: z.string().optional(),
    draft: z.boolean().optional().default(false),
    slug: z.string().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { menus, blog, pages };
