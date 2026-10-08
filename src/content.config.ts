import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const postSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  minutes: z.number(),
  tag: z.string(),
});

// English posts in src/content/blog, Persian translations with the same file names in src/content/blog-fa.
const blog = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/blog' }), schema: postSchema });
const blogFa = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/blog-fa' }), schema: postSchema });

export const collections = { blog, blogFa };
